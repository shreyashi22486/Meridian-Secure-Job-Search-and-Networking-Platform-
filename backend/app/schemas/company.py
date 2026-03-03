"""Pydantic schemas for company endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from app.security.sanitizer import sanitize_string


class CreateCompanyRequest(BaseModel):
    """Create a new company."""
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None

    @field_validator("name", "description", "location")
    @classmethod
    def sanitize_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v

    @field_validator("website")
    @classmethod
    def validate_website(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if v and not v.startswith(("http://", "https://")):
                v = f"https://{v}"
            return sanitize_string(v)
        return v


class UpdateCompanyRequest(BaseModel):
    """Update company details — all fields optional."""
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None

    @field_validator("name", "description", "location")
    @classmethod
    def sanitize_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v

    @field_validator("website")
    @classmethod
    def validate_website(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if v and not v.startswith(("http://", "https://")):
                v = f"https://{v}"
            return sanitize_string(v)
        return v


class CompanyResponse(BaseModel):
    """Company response."""
    id: str
    name: str
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    created_by: Optional[str] = None
    job_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompanyListResponse(BaseModel):
    """Paginated list of companies."""
    companies: List[CompanyResponse]
    total: int
    skip: int
    limit: int


class AddCompanyAdminRequest(BaseModel):
    """Add a user as company admin."""
    user_id: str
    role: str = "admin"  # owner, admin, editor

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("owner", "admin", "editor"):
            raise ValueError("Role must be one of: owner, admin, editor")
        return v
