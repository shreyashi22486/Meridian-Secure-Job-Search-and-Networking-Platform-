"""
UserExperience model — stores a user's work/professional experience.

Security: UUID PK, FK with cascade delete tied to User.
Date fields stored as strings (e.g., "Jan 2022") for maximum flexibility
without timezone complexity.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class UserExperience(Base):
    __tablename__ = "user_experience"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    company = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    start_date = Column(String(20), nullable=True)   # e.g. "Jan 2022"
    end_date = Column(String(20), nullable=True)     # NULL means "Present"
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship back to user
    user = relationship("User", back_populates="experience")

    def __repr__(self) -> str:
        return f"<UserExperience {self.title} @ {self.company}>"
