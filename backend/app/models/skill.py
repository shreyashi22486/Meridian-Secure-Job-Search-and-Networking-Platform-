"""
UserSkill model — stores a user's skills as individual rows.

Security: UUID PK, FK with cascade delete, UNIQUE constraint prevents
duplicate skills per user at the DB level.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class UserSkill(Base):
    __tablename__ = "user_skills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Enforce uniqueness at DB level: no duplicate skill names per user
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_skill_name"),
    )

    # Relationship back to user
    user = relationship("User", back_populates="skills")

    def __repr__(self) -> str:
        return f"<UserSkill {self.name}>"
