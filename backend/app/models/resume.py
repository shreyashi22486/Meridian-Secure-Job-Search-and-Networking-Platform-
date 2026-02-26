"""
Resume model.

Security features:
- UUID stored filename prevents path traversal
- encryption_key_id tracks Fernet key version for future key rotation
- Files stored outside web root, encrypted at rest
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), unique=True, nullable=False)  # UUID-based
    file_path = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=False)  # Original size before encryption

    # Encryption tracking — enables key rotation in future
    encryption_key_id = Column(String(64), nullable=False, default="v1")

    # Timestamps
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    owner = relationship("User", back_populates="resumes")

    def __repr__(self) -> str:
        return f"<Resume {self.original_filename} user={self.user_id}>"
