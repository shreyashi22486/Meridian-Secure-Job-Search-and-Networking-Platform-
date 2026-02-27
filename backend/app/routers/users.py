"""
Users router — profile management.

Endpoints:
- GET /me: current user profile (now includes education, experience, skills)
- PUT /me: update basic profile fields (name, headline, location, bio)
- PUT /me/password: change password (requires re-authentication)
- GET /{id}: view user (recruiter/admin only)
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserProfile, UpdateProfileRequest
from app.schemas.profile import EducationItem, ExperienceItem, SkillItem
from app.schemas.auth import ChangePasswordRequest
from app.security.password import (
    hash_password, verify_password, validate_password_strength,
    PasswordValidationError,
)
from app.security.totp import verify_totp
from app.dependencies import get_current_user, require_recruiter_or_admin
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/users", tags=["Users"])


def build_profile(user: User) -> UserProfile:
    """Build a full UserProfile response from an ORM User object."""
    avatar_url = "/api/users/me/avatar" if user.avatar_filename else None
    return UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        headline=user.headline,
        location=user.location,
        bio=user.bio,
        avatar_url=avatar_url,
        role=user.role.value,
        is_totp_enabled=user.is_totp_enabled,
        created_at=user.created_at,
        education=[EducationItem.from_orm_with_str_id(e) for e in user.education],
        experience=[ExperienceItem.from_orm_with_str_id(e) for e in user.experience],
        skills=[SkillItem.from_orm_with_str_id(s) for s in user.skills],
    )


def build_profile_for_user(user: User, viewer_id: str) -> UserProfile:
    """Build profile for viewing another user — avatar URL uses their ID."""
    avatar_url = f"/api/users/{user.id}/avatar" if user.avatar_filename else None
    return UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        headline=user.headline,
        location=user.location,
        bio=user.bio,
        avatar_url=avatar_url,
        role=user.role.value,
        is_totp_enabled=user.is_totp_enabled,
        created_at=user.created_at,
        education=[EducationItem.from_orm_with_str_id(e) for e in user.education],
        experience=[ExperienceItem.from_orm_with_str_id(e) for e in user.experience],
        skills=[SkillItem.from_orm_with_str_id(s) for s in user.skills],
    )


@router.get("/me", response_model=UserProfile)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Get the current user's full profile including education, experience, skills."""
    return build_profile(current_user)


@router.put("/me", response_model=UserProfile)
async def update_profile(
    data: UpdateProfileRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update basic profile fields. All inputs are sanitized by schema validators.
    Only provided fields are updated (partial update).
    """
    update_data = data.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)

    log_audit(db, "profile_updated", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"fields": list(update_data.keys())})

    return build_profile(current_user)


@router.put("/me/password")
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change password with re-authentication.

    Security:
    - Requires current password (even with valid session)
    - If 2FA enabled, also requires TOTP code
    - Validates new password strength
    - Revokes all OTHER sessions (force re-login)
    """
    client_ip = get_client_ip(request)

    # Re-authenticate: verify current password
    if not verify_password(data.current_password, current_user.hashed_password):
        log_audit(db, "password_change_failed", user_id=current_user.id,
                  ip_address=client_ip, details={"reason": "wrong_current_password"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Re-authenticate: verify TOTP if enabled
    if current_user.is_totp_enabled:
        if not data.totp_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP code is required for this action",
            )
        if not verify_totp(current_user.totp_secret, data.totp_code,
                          str(current_user.id), db):
            log_audit(db, "password_change_failed", user_id=current_user.id,
                      ip_address=client_ip, details={"reason": "invalid_totp"})
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid TOTP code",
            )

    # Validate new password
    try:
        validate_password_strength(data.new_password)
    except PasswordValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )

    # Update password
    current_user.hashed_password = hash_password(data.new_password)
    db.commit()

    # Revoke all other sessions (security: force re-login everywhere else)
    from app.models.session import Session
    access_token = request.cookies.get("access_token")
    if access_token:
        from app.security.jwt import decode_token, TokenError
        try:
            payload = decode_token(access_token)
            current_session_id = payload.get("sid")
            db.query(Session).filter(
                Session.user_id == current_user.id,
                Session.id != current_session_id,
                Session.is_revoked.is_(False),
            ).update({"is_revoked": True})
            db.commit()
        except TokenError:
            pass

    log_audit(db, "password_changed", user_id=current_user.id,
              ip_address=client_ip)

    return {"message": "Password changed successfully. Other sessions have been revoked."}


@router.get("/{user_id}", response_model=UserProfile)
async def get_user_profile(
    user_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_recruiter_or_admin),
):
    """
    View another user's full profile. Restricted to recruiters and admins.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return build_profile_for_user(user, str(current_user.id))
