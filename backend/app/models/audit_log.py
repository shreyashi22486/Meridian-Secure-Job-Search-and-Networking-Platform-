"""
Audit log and Used OTP models.

AuditLog: Records security-relevant actions for monitoring and forensics.
UsedOTP: Prevents TOTP replay attacks by tracking recently used codes.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class AuditLog(Base):
    """
    Immutable log of security-relevant actions.
    Future milestone: add hash chaining for tamper-evidence.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    details = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} user={self.user_id}>"


class UsedOTP(Base):
    """
    Prevents OTP replay attacks by storing recently used codes.
    Entries are scoped by time_step so old ones can be garbage-collected.

    Security rationale: Without this, an attacker who observes a valid OTP
    could replay it within the same time window.
    """
    __tablename__ = "used_otps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    otp_code = Column(String(10), nullable=False)
    time_step = Column(Integer, nullable=False)  # TOTP time counter
    used_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="used_otps")

    def __repr__(self) -> str:
        return f"<UsedOTP user={self.user_id} code=***>"
