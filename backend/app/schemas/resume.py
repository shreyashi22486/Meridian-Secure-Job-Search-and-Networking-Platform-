"""Pydantic schemas for resume endpoints."""

from pydantic import BaseModel
from datetime import datetime


class ResumeResponse(BaseModel):
    """Resume metadata response (never exposes file content directly)."""
    id: str
    original_filename: str
    file_size: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ResumeListResponse(BaseModel):
    """List of resume metadata."""
    resumes: list[ResumeResponse]
    total: int
