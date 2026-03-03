"""
Users router — profile management + privacy + viewers.

Endpoints:
- GET  /search: search users by name/email
- GET  /me: current user profile
- PUT  /me: update profile
- GET  /me/privacy: get privacy settings
- PUT  /me/privacy: update privacy settings
- GET  /me/viewers: profile view count + recent viewers
- PUT  /me/password: change password
- GET  /{id}: view another user's profile (privacy-filtered)
"""

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_, and_, func

from app.database import get_db
from app.models.user import User
from app.models.connection import Connection, ConnectionStatus
from app.models.profile_view import ProfileView
from app.schemas.user import (
    UserProfile, UpdateProfileRequest,
    PrivacyResponse, UpdatePrivacyRequest,
    ProfileViewerItem, ViewersResponse, PublicUserProfile,
)
from app.schemas.profile import EducationItem, ExperienceItem, SkillItem
from app.schemas.auth import ChangePasswordRequest
from app.security.password import (
    hash_password, verify_password, validate_password_strength,
    PasswordValidationError,
)
from app.security.totp import verify_totp
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/users", tags=["Users"])


# ─── Helpers ────────────────────────────────────────────────────────────

DEFAULT_PRIVACY = {
    "headline": "public",
    "location": "public",
    "bio": "public",
    "education": "public",
    "experience": "connections_only",
    "skills": "public",
    "email": "connections_only",
}


def _get_privacy(user: User) -> dict:
    """Return privacy settings, falling back to defaults for missing keys."""
    ps = user.privacy_settings or {}
    return {k: ps.get(k, DEFAULT_PRIVACY.get(k, "public")) for k in DEFAULT_PRIVACY}


def _are_connected(db: DBSession, user1_id, user2_id) -> bool:
    """Check if two users are connected (accepted)."""
    return db.query(Connection).filter(
        or_(
            and_(Connection.sender_id == user1_id, Connection.receiver_id == user2_id),
            and_(Connection.sender_id == user2_id, Connection.receiver_id == user1_id),
        ),
        Connection.status == ConnectionStatus.ACCEPTED,
    ).first() is not None


def _connection_status(db: DBSession, user1_id, user2_id) -> str:
    """Get connection status between two users."""
    conn = db.query(Connection).filter(
        or_(
            and_(Connection.sender_id == user1_id, Connection.receiver_id == user2_id),
            and_(Connection.sender_id == user2_id, Connection.receiver_id == user1_id),
        )
    ).first()
    if not conn:
        return "none"
    return conn.status.value


def build_profile(user: User) -> UserProfile:
    """Build a full UserProfile response for the current user (no privacy filter)."""
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


def build_public_profile(user: User, viewer: User, is_connected: bool, conn_status: str) -> PublicUserProfile:
    """
    Build a privacy-filtered profile for another user.
    Fields are hidden based on privacy settings + connection status.
    """
    privacy = _get_privacy(user)
    avatar_url = f"/api/users/{user.id}/avatar" if user.avatar_filename else None

    def visible(field_name: str) -> bool:
        level = privacy.get(field_name, "public")
        if level == "public":
            return True
        if level == "connections_only" and is_connected:
            return True
        if viewer.role.value == "admin":
            return True
        return False

    # Track which fields are hidden for the frontend
    hidden_fields = {k: v for k, v in privacy.items() if not visible(k)}

    return PublicUserProfile(
        id=str(user.id),
        full_name=user.full_name,
        headline=user.headline if visible("headline") else None,
        location=user.location if visible("location") else None,
        bio=user.bio if visible("bio") else None,
        avatar_url=avatar_url,
        role=user.role.value,
        created_at=user.created_at,
        email=user.email if visible("email") else None,
        education=[EducationItem.from_orm_with_str_id(e) for e in user.education] if visible("education") else None,
        experience=[ExperienceItem.from_orm_with_str_id(e) for e in user.experience] if visible("experience") else None,
        skills=[SkillItem.from_orm_with_str_id(s) for s in user.skills] if visible("skills") else None,
        connection_status=conn_status,
        privacy=hidden_fields if hidden_fields else None,
    )


# ─── Endpoints ──────────────────────────────────────────────────────────


@router.get("/search")
async def search_users(
    q: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search users by name or email (for messaging, connections, etc.)."""
    if len(q) < 2:
        return {"users": []}
    users = db.query(User).filter(
        or_(
            User.full_name.ilike(f"%{q}%"),
            User.email.ilike(f"%{q}%"),
        ),
        User.id != current_user.id,
    ).limit(10).all()
    return {"users": [
        {
            "id": str(u.id),
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role.value,
            "avatar_url": f"/api/users/{u.id}/avatar" if u.avatar_filename else None,
        }
        for u in users
    ]}


@router.get("/me", response_model=UserProfile)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Get the current user's full profile."""
    return build_profile(current_user)


@router.put("/me", response_model=UserProfile)
async def update_profile(
    data: UpdateProfileRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update basic profile fields. Partial update."""
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)

    log_audit(db, "profile_updated", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"fields": list(update_data.keys())})

    return build_profile(current_user)


# ─── Privacy Endpoints ──────────────────────────────────────────────────


@router.get("/me/privacy", response_model=PrivacyResponse)
async def get_privacy(
    current_user: User = Depends(get_current_user),
):
    """Get current privacy settings."""
    return PrivacyResponse(
        privacy_settings=_get_privacy(current_user),
        show_profile_views=current_user.show_profile_views
        if current_user.show_profile_views is not None else True,
    )


@router.put("/me/privacy", response_model=PrivacyResponse)
async def update_privacy(
    data: UpdatePrivacyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update privacy settings."""
    if data.privacy_settings:
        current_user.privacy_settings = data.privacy_settings.model_dump()

    if data.show_profile_views is not None:
        current_user.show_profile_views = data.show_profile_views

    db.commit()
    db.refresh(current_user)

    log_audit(db, "privacy_updated", user_id=current_user.id,
              ip_address=get_client_ip(request))

    return PrivacyResponse(
        privacy_settings=_get_privacy(current_user),
        show_profile_views=current_user.show_profile_views,
    )


# ─── Profile Viewers ────────────────────────────────────────────────────


@router.get("/me/viewers", response_model=ViewersResponse)
async def get_my_viewers(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get profile view count and recent viewers.
    Privacy rule: If you opt-out of appearing in others' recent viewers,
    you cannot see your own recent viewers list.
    """
    total = db.query(func.count(ProfileView.id)).filter(
        ProfileView.viewed_user_id == current_user.id,
    ).scalar()

    # If user opted out, they can't see "who" viewed them
    if not current_user.show_profile_views:
        return ViewersResponse(total_views=total or 0, recent_viewers=[], is_enabled=False)

    recent = db.query(ProfileView).filter(
        ProfileView.viewed_user_id == current_user.id,
    ).order_by(ProfileView.viewed_at.desc()).limit(20).all()

    viewers = []
    seen_ids = set()
    for pv in recent:
        if str(pv.viewer_id) in seen_ids:
            continue
        seen_ids.add(str(pv.viewer_id))
        viewer = pv.viewer
        if not viewer:
            continue
        # Respect individual viewer's opt-out
        if not viewer.show_profile_views:
            continue
        viewers.append(ProfileViewerItem(
            id=str(viewer.id),
            full_name=viewer.full_name,
            headline=viewer.headline,
            avatar_url=f"/api/users/{viewer.id}/avatar" if viewer.avatar_filename else None,
            viewed_at=pv.viewed_at,
        ))

    return ViewersResponse(total_views=total or 0, recent_viewers=viewers, is_enabled=True)


# ─── Password ──────────────────────────────────────────────────────────


@router.put("/me/password")
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change password with re-authentication."""
    client_ip = get_client_ip(request)

    if not verify_password(data.current_password, current_user.hashed_password):
        log_audit(db, "password_change_failed", user_id=current_user.id,
                  ip_address=client_ip, details={"reason": "wrong_current_password"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    if current_user.is_totp_enabled:
        if not data.totp_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP code is required")
        if not verify_totp(current_user.totp_secret, data.totp_code, str(current_user.id), db):
            log_audit(db, "password_change_failed", user_id=current_user.id,
                      ip_address=client_ip, details={"reason": "invalid_totp"})
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    try:
        validate_password_strength(data.new_password)
    except PasswordValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()

    # Revoke all other sessions
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

    log_audit(db, "password_changed", user_id=current_user.id, ip_address=client_ip)
    return {"message": "Password changed successfully. Other sessions have been revoked."}


# ─── Public Profile View ───────────────────────────────────────────────


@router.get("/{user_id}", response_model=PublicUserProfile)
async def get_user_profile(
    user_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    View another user's profile. Open to all authenticated users.
    Fields are filtered based on the target's privacy settings
    and the viewer's connection status.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # If viewing own profile, redirect concept — return full profile
    if str(user.id) == str(current_user.id):
        p = build_profile(user)
        return PublicUserProfile(
            id=p.id, full_name=p.full_name, headline=p.headline,
            location=p.location, bio=p.bio, avatar_url=p.avatar_url,
            role=p.role, created_at=p.created_at, email=p.email,
            education=p.education, experience=p.experience, skills=p.skills,
            connection_status="self",
        )

    is_connected = _are_connected(db, current_user.id, user_id)
    conn_status = _connection_status(db, current_user.id, user_id)

    # Record profile view (one per day per viewer)
    today = date.today()
    existing_view = db.query(ProfileView).filter(
        ProfileView.viewer_id == current_user.id,
        ProfileView.viewed_user_id == user.id,
        ProfileView.viewed_date == today,
    ).first()
    if not existing_view:
        pv = ProfileView(
            viewer_id=current_user.id,
            viewed_user_id=user.id,
            viewed_date=today,
        )
        db.add(pv)
        db.commit()

    log_audit(db, "profile_viewed", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"viewed_user": user_id})

    return build_public_profile(user, current_user, is_connected, conn_status)
