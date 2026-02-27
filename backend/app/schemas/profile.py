"""Pydantic schemas for profile expansion endpoints.

Covers Education, Experience, and Skills CRUD.
All string inputs are sanitized against XSS via field_validators.
"""
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import uuid
from app.security.sanitizer import sanitize_string


# ─── Education ────────────────────────────────────────────────────────────────

class EducationItem(BaseModel):
    """Education entry returned in responses."""
    id: str
    institution: str
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None  # None = "Present"
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_str_id(cls, obj):
        return cls(
            id=str(obj.id),
            institution=obj.institution,
            degree=obj.degree,
            field_of_study=obj.field_of_study,
            start_year=obj.start_year,
            end_year=obj.end_year,
            created_at=obj.created_at,
        )


class CreateEducation(BaseModel):
    institution: str
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None

    @field_validator("institution", "degree", "field_of_study")
    @classmethod
    def sanitize_str_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v


class UpdateEducation(BaseModel):
    institution: Optional[str] = None
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None

    @field_validator("institution", "degree", "field_of_study")
    @classmethod
    def sanitize_str_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v


# ─── Experience ───────────────────────────────────────────────────────────────

class ExperienceItem(BaseModel):
    """Experience entry returned in responses."""
    id: str
    company: str
    title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None   # None = "Present"
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_str_id(cls, obj):
        return cls(
            id=str(obj.id),
            company=obj.company,
            title=obj.title,
            start_date=obj.start_date,
            end_date=obj.end_date,
            description=obj.description,
            created_at=obj.created_at,
        )


class CreateExperience(BaseModel):
    company: str
    title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None

    @field_validator("company", "title", "start_date", "end_date", "description")
    @classmethod
    def sanitize_str_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v


class UpdateExperience(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None

    @field_validator("company", "title", "start_date", "end_date", "description")
    @classmethod
    def sanitize_str_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_string(v)
        return v


# ─── Skills ───────────────────────────────────────────────────────────────────

class SkillItem(BaseModel):
    """Skill entry returned in responses."""
    id: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_str_id(cls, obj):
        return cls(
            id=str(obj.id),
            name=obj.name,
            created_at=obj.created_at,
        )


class CreateSkill(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v.strip())
