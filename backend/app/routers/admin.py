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
    otp_code: str = None,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Delete a user account and all associated data.
    Requires OTP verification if admin has 2FA enabled.
    Cascade deletes resumes, sessions, and used OTPs.
    """
    # OTP verification required (high-risk action)
    if not admin.is_totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Two-factor authentication must be enabled before deleting users",
        )
    if not otp_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OTP verification required for user deletion",
        )
    from app.security.totp import verify_totp
    if not verify_totp(admin.totp_secret, otp_code, str(admin.id), db):
        log_audit(db, "admin_delete_otp_failed", user_id=admin.id,
                  ip_address=get_client_ip(request),
                  details={"target_user": user_id})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid OTP code",
        )

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
    Returns most recent entries first, including hash chain fields.
    """
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(min(limit, 100)).all()

    # ── Resolve user UUIDs → emails ──
    import re
    _UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

    # Collect every UUID-like string from user_id + details values
    all_uuids: set[str] = set()
    for log in logs:
        if log.user_id:
            all_uuids.add(str(log.user_id))
        if log.details and isinstance(log.details, dict):
            for v in log.details.values():
                if isinstance(v, str) and _UUID_RE.match(v):
                    all_uuids.add(v)

    # Batch-query emails for all collected UUIDs
    email_map: dict[str, str] = {}
    if all_uuids:
        rows = db.query(User.id, User.email).filter(User.id.in_(list(all_uuids))).all()
        email_map = {str(r.id): r.email for r in rows}

    def _enrich_details(details: dict | None) -> dict | None:
        """Replace UUID values in details with 'email (uuid)' where resolvable."""
        if not details or not isinstance(details, dict):
            return details
        enriched = {}
        for k, v in details.items():
            if isinstance(v, str) and _UUID_RE.match(v) and v in email_map:
                enriched[k] = f"{email_map[v]}"
            else:
                enriched[k] = v
        return enriched

    return {
        "logs": [
            {
                "id": log.id,
                "user_id": email_map.get(str(log.user_id), str(log.user_id)) if log.user_id else None,
                "action": log.action,
                "ip_address": log.ip_address,
                "details": _enrich_details(log.details),
                "created_at": log.created_at.isoformat() + "Z",
                "prev_hash": log.prev_hash,
                "entry_hash": log.entry_hash,
                "signature": log.signature[:16] + "..." if log.signature else None,
            }
            for log in logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/audit-logs/verify")
async def verify_audit_log_integrity(
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Verify the integrity of the entire audit log chain.

    Walks from entry #1 to the latest, re-computing hashes and verifying:
    1. Each entry's hash matches its content
    2. Each entry's prev_hash matches the previous entry's entry_hash
    3. Each PKI signature is valid
    """
    from app.utils import _compute_entry_hash, _format_ts
    from app.security.pki import verify_signature

    logs = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    total = len(logs)

    if total == 0:
        return {"valid": True, "total_entries": 0, "broken_at": None, "message": "No audit logs to verify"}

    prev_hash = "0" * 64
    broken_at = None

    for log in logs:
        # Skip entries without hash chain (should not exist after backfill)
        if not log.entry_hash:
            prev_hash = "0" * 64
            continue

        # Check prev_hash linkage
        if log.prev_hash != prev_hash:
            broken_at = log.id
            break

        # Re-compute the hash using consistent timestamp format
        expected_hash = _compute_entry_hash(
            action=log.action,
            user_id=str(log.user_id) if log.user_id else "",
            ip_address=log.ip_address or "",
            timestamp=_format_ts(log.created_at),
            details=log.details or {},
            prev_hash=log.prev_hash,
        )

        if log.entry_hash != expected_hash:
            broken_at = log.id
            break

        # Verify PKI signature
        if log.signature:
            if not verify_signature(log.entry_hash.encode("utf-8"), log.signature):
                broken_at = log.id
                break

        prev_hash = log.entry_hash

    return {
        "valid": broken_at is None,
        "total_entries": total,
        "broken_at": broken_at,
        "message": "Chain integrity verified" if broken_at is None else f"Tamper detected at entry #{broken_at}",
    }
