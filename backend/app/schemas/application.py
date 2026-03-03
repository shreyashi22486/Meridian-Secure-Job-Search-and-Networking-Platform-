"""Pydantic schemas for application endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from app.security.sanitizer import sanitize_string


class ApplyRequest(BaseModel):
    """Submit a job application."""
    job_id: str
    resume_id: Optional[str] = None
    cover_note: Optional[str] = None

    @field_validator("cover_note")
    @classmethod
    def sanitize_cover_note(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v


class UpdateStatusRequest(BaseModel):
    """Recruiter updates application status."""
    status: str  # applied, reviewed, interviewed, rejected, offer

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid = ("applied", "reviewed", "interviewed", "rejected", "offer")
        if v not in valid:
            raise ValueError(f"Status must be one of: {', '.join(valid)}")
        return v


class UpdateNotesRequest(BaseModel):
    """Recruiter updates private notes on an application."""
    notes: str

    @field_validator("notes")
    @classmethod
    def sanitize_notes(cls, v: str) -> str:
        return sanitize_string(v)


class ApplicationResponse(BaseModel):
    """Application response (for applicants)."""
    id: str
    job_id: str
    job_title: str
    company_name: str
    status: str
    cover_note: Optional[str] = None
    resume_id: Optional[str] = None
    applied_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApplicationDetailResponse(BaseModel):
    """Application response (for recruiters) — includes recruiter notes."""
    id: str
    job_id: str
    user_id: str
    applicant_name: str
    applicant_email: str
    status: str
    cover_note: Optional[str] = None
    resume_id: Optional[str] = None
    recruiter_notes: Optional[str] = None
    applied_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApplicationListResponse(BaseModel):
    """List of applications."""
    applications: List[ApplicationResponse]
    total: int


class ApplicantListResponse(BaseModel):
    """List of applicants for a job (recruiter view)."""
    applicants: List[ApplicationDetailResponse]
    total: int
