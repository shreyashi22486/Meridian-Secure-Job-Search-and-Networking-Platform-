"""
Job posting model.

Linked to a Company. Supports filtering by work type, job type,
salary range, skills, and location.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, Enum, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class WorkType(str, enum.Enum):
    REMOTE = "remote"
    ON_SITE = "on_site"
    HYBRID = "hybrid"


class JobType(str, enum.Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    INTERNSHIP = "internship"
    CONTRACT = "contract"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=False)

    # Skills stored as JSON list ["python", "react", "sql"]
    required_skills = Column(JSONB, nullable=True, default=list)

    location = Column(String(255), nullable=True)

    work_type = Column(
        Enum(WorkType, name="work_type", create_constraint=True),
        nullable=True,
    )
    job_type = Column(
        Enum(JobType, name="job_type", create_constraint=True),
        nullable=True,
    )

    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    application_deadline = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)

    # Who posted the job
    posted_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    company = relationship("Company", back_populates="jobs")
    poster = relationship("User", foreign_keys=[posted_by])
    # Note: applications relationship will be added in Phase 2 when Application model is created

    def __repr__(self) -> str:
        return f"<Job {self.title} at company={self.company_id}>"
