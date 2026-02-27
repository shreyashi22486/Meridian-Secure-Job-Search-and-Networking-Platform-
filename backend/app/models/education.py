"""
UserEducation model — stores a user's education history.

Security: UUID PK, FK with cascade delete tied to User.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class UserEducation(Base):
    __tablename__ = "user_education"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    institution = Column(String(255), nullable=False)
    degree = Column(String(255), nullable=True)
    field_of_study = Column(String(255), nullable=True)
    start_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)  # NULL means "Present"

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship back to user
    user = relationship("User", back_populates="education")

    def __repr__(self) -> str:
        return f"<UserEducation {self.institution} ({self.start_year}–{self.end_year})>"
