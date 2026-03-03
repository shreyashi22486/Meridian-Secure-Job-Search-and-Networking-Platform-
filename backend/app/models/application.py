"""
Application model for job applications.

Tracks the full lifecycle: Applied → Reviewed → Interviewed → Rejected/Offer
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, Enum, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ApplicationStatus(str, enum.Enum):
    APPLIED = "applied"
    REVIEWED = "reviewed"
    INTERVIEWED = "interviewed"
    REJECTED = "rejected"
    OFFER = "offer"


class Application(Base):
    __tablename__ = "applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resume_id = Column(
        UUID(as_uuid=True),
        ForeignKey("resumes.id", ondelete="SET NULL"),
        nullable=True,
    )

    cover_note = Column(Text, nullable=True)

    status = Column(
        Enum(ApplicationStatus, name="application_status", create_constraint=True),
        nullable=False,
        default=ApplicationStatus.APPLIED,
    )

    recruiter_notes = Column(Text, nullable=True)  # private to recruiter

    applied_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Prevent duplicate applications
    __table_args__ = (
        UniqueConstraint("job_id", "user_id", name="uq_application_job_user"),
    )

    # Relationships
    job = relationship("Job")
    user = relationship("User")
    resume = relationship("Resume")

    def __repr__(self) -> str:
        return f"<Application user={self.user_id} job={self.job_id} status={self.status.value}>"
