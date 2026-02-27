"""
Admin router — user management and audit logs.

All endpoints require admin role via dependency injection.

Security features:
- Cannot self-promote (privilege escalation prevention)
- All actions are audit-logged
- Pagination on listings
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from typing import Optional

from app.database import get_db
from app.models.user import User, UserRole
from app.models.audit_log import AuditLog
from app.schemas.user import UserListItem
from app.dependencies import require_admin
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 50,
    role: Optional[str] = None,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all users (admin only). Supports pagination and role filter."""
    query = db.query(User)

    if role:
        try:
            role_enum = UserRole(role)
            query = query.filter(User.role == role_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {role}. Must be one of: user, recruiter, admin",
            )

    total = query.count()
    users = query.offset(skip).limit(min(limit, 100)).all()

    return {
        "users": [
            UserListItem(
                id=str(u.id),
                email=u.email,
                full_name=u.full_name,
                role=u.role.value,
                is_suspended=u.is_suspended,
                is_totp_enabled=u.is_totp_enabled,
                created_at=u.created_at,
            ).model_dump()
            for u in users
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.put("/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    role: str,
    request: Request,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Change a user's role.

    Security:
    - Admin cannot change their own role (prevents accidental self-demotion)
    - Validates target role exists
    - Audit-logged
    """
    # Prevent self-modification
    if str(admin.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    # Validate role
    try:
        new_role = UserRole(role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {role}. Must be one of: user, recruiter, admin",
        )

    # Find target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    old_role = target_user.role.value
    target_user.role = new_role
    db.commit()

    log_audit(db, "role_changed", user_id=admin.id,
              ip_address=get_client_ip(request),
              details={
                  "target_user": user_id,
                  "old_role": old_role,
                  "new_role": role,
              })

    return {
        "message": f"User role changed from {old_role} to {role}",
        "user_id": user_id,
    }


@router.put("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Toggle user suspension status.
    Suspended users cannot log in or use the API.
    """
    # Prevent self-suspension
    if str(admin.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot suspend yourself",
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Toggle suspension
    target_user.is_suspended = not target_user.is_suspended
    db.commit()

    action = "suspended" if target_user.is_suspended else "unsuspended"

    # Revoke all sessions if suspending
    if target_user.is_suspended:
        from app.models.session import Session
        db.query(Session).filter(
            Session.user_id == target_user.id,
            Session.is_revoked.is_(False),
        ).update({"is_revoked": True})
        db.commit()

    log_audit(db, f"user_{action}", user_id=admin.id,
              ip_address=get_client_ip(request),
              details={"target_user": user_id})

    return {
        "message": f"User has been {action}",
        "user_id": user_id,
        "is_suspended": target_user.is_suspended,
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Delete a user account and all associated data.
    Cascade deletes resumes, sessions, and used OTPs.
    """
    # Prevent self-deletion
    if str(admin.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Delete associated resume files from disk
    from app.models.resume import Resume
    import os
    resumes = db.query(Resume).filter(Resume.user_id == user_id).all()
    for resume in resumes:
        try:
            if os.path.exists(resume.file_path):
                os.remove(resume.file_path)
        except OSError:
            pass

    email = target_user.email
    db.delete(target_user)
    db.commit()

    log_audit(db, "user_deleted", user_id=admin.id,
              ip_address=get_client_ip(request),
              details={"deleted_user_email": email, "deleted_user_id": user_id})

    return {"message": "User and all associated data deleted"}


@router.get("/audit-logs")
async def get_audit_logs(
    skip: int = 0,
    limit: int = 50,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    View audit logs with optional filters.
    Returns most recent entries first.
    """
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(min(limit, 100)).all()

    return {
        "logs": [
            {
                "id": log.id,
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "ip_address": log.ip_address,
                "details": log.details,
                "created_at": log.created_at.isoformat() + "Z",
            }
            for log in logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }
