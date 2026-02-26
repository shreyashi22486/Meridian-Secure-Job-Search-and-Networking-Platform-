"""Pydantic schemas for user profile endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from app.security.sanitizer import sanitize_string


class UserProfile(BaseModel):
    """Public user profile response."""
    id: str
    email: str
    full_name: str
    headline: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    role: str
    is_totp_enabled: bool
    created_at: datetime

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
