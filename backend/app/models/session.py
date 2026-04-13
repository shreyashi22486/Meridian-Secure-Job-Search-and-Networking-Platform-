"""
Session model for server-side session management.

Security features:
- Enables refresh token rotation with reuse detection
- Stores device fingerprint for token binding
- Server-side revocation (logout actually kills the session)
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Current valid refresh token JTI — rotated on each refresh
    refresh_token_jti = Column(String(255), unique=True, nullable=False)

    # Device binding
    ip_address = Column(String(45), nullable=False)  # IPv6 max length
    user_agent = Column(String(512), nullable=True)
    fingerprint = Column(String(64), nullable=False)  # SHA256 hex digest

    # Revocation
    is_revoked = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    expires_at = Column(DateTime, nullable=False)

    # Relationships
    user = relationship("User", back_populates="sessions")

    def __repr__(self) -> str:
        return f"<Session {self.id} user={self.user_id} revoked={self.is_revoked}>"
