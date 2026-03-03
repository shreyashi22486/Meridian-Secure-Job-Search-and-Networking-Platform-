"""Pydantic schemas for user profile endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from app.security.sanitizer import sanitize_string
from app.schemas.profile import EducationItem, ExperienceItem, SkillItem


class UserProfile(BaseModel):
    """Public user profile response — includes nested education, experience, skills."""
    id: str
    email: str
    full_name: str
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None   # e.g. "/api/users/me/avatar" or None
    role: str
    is_totp_enabled: bool
    created_at: datetime
    education: List[EducationItem] = []
    experience: List[ExperienceItem] = []
    skills: List[SkillItem] = []

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    """Profile update — all fields optional."""
    full_name: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None

    @field_validator("full_name", "headline", "location", "bio")
    @classmethod
    def sanitize_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v


class UserListItem(BaseModel):
    """Abbreviated user info for admin listing."""
    id: str
    email: str
    full_name: str
    role: str
    is_suspended: bool
    is_totp_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Privacy schemas ────────────────────────────────────────────────────

PRIVACY_LEVELS = {"public", "connections_only", "private"}
PRIVACY_FIELDS = {"headline", "location", "bio", "education", "experience", "skills", "email"}

class PrivacySettings(BaseModel):
    headline: str = "public"
    location: str = "public"
    bio: str = "public"
    education: str = "public"
    experience: str = "connections_only"
    skills: str = "public"
    email: str = "connections_only"

    @field_validator("*")
    @classmethod
    def validate_level(cls, v):
        if v not in PRIVACY_LEVELS:
            raise ValueError(f"Privacy level must be one of: {PRIVACY_LEVELS}")
        return v


class UpdatePrivacyRequest(BaseModel):
    privacy_settings: Optional[PrivacySettings] = None
    show_profile_views: Optional[bool] = None


class PrivacyResponse(BaseModel):
    privacy_settings: dict
    show_profile_views: bool


class ProfileViewerItem(BaseModel):
    id: str
    full_name: str
    headline: Optional[str] = None
    avatar_url: Optional[str] = None
    viewed_at: datetime


class ViewersResponse(BaseModel):
    total_views: int
    recent_viewers: List[ProfileViewerItem]


class PublicUserProfile(BaseModel):
    """Profile as seen by another user — fields may be hidden by privacy."""
    id: str
    full_name: str
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    created_at: datetime
    email: Optional[str] = None
    education: Optional[List[EducationItem]] = None
    experience: Optional[List[ExperienceItem]] = None
    skills: Optional[List[SkillItem]] = None
    connection_status: Optional[str] = None  # none | pending | accepted
    privacy: Optional[dict] = None  # which fields are hidden

    model_config = {"from_attributes": True}

