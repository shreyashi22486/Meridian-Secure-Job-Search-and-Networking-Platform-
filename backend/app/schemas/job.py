"""Pydantic schemas for job posting endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from app.security.sanitizer import sanitize_string


class CreateJobRequest(BaseModel):
    """Create a new job posting."""
    company_id: str
    title: str
    description: str
    required_skills: Optional[List[str]] = []
    location: Optional[str] = None
    work_type: Optional[str] = None   # remote, on_site, hybrid
    job_type: Optional[str] = None    # full_time, part_time, internship, contract
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    application_deadline: Optional[datetime] = None

    @field_validator("title", "description", "location")
    @classmethod
    def sanitize_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v

    @field_validator("required_skills")
    @classmethod
    def sanitize_skills(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            return [sanitize_string(s.strip()) for s in v if s.strip()]
        return v

    @field_validator("work_type")
    @classmethod
    def validate_work_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("remote", "on_site", "hybrid"):
            raise ValueError("work_type must be one of: remote, on_site, hybrid")
        return v

    @field_validator("job_type")
    @classmethod
    def validate_job_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("full_time", "part_time", "internship", "contract"):
            raise ValueError("job_type must be one of: full_time, part_time, internship, contract")
        return v


class UpdateJobRequest(BaseModel):
    """Update a job posting — all fields optional."""
    title: Optional[str] = None
    description: Optional[str] = None
    required_skills: Optional[List[str]] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    job_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    application_deadline: Optional[datetime] = None
    is_active: Optional[bool] = None

    @field_validator("title", "description", "location")
    @classmethod
    def sanitize_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v

    @field_validator("required_skills")
    @classmethod
    def sanitize_skills(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            return [sanitize_string(s.strip()) for s in v if s.strip()]
        return v

    @field_validator("work_type")
    @classmethod
    def validate_work_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("remote", "on_site", "hybrid"):
            raise ValueError("work_type must be one of: remote, on_site, hybrid")
        return v

    @field_validator("job_type")
    @classmethod
    def validate_job_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("full_time", "part_time", "internship", "contract"):
            raise ValueError("job_type must be one of: full_time, part_time, internship, contract")
        return v


class JobResponse(BaseModel):
    """Job posting response."""
    id: str
    company_id: str
    company_name: str
    title: str
    description: str
    required_skills: List[str] = []
    location: Optional[str] = None
    work_type: Optional[str] = None
    job_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    application_deadline: Optional[datetime] = None
    is_active: bool
    posted_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    """Paginated list of jobs."""
    jobs: List[JobResponse]
    total: int
    skip: int
    limit: int
