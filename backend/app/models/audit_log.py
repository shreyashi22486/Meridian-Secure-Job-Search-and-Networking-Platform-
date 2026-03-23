"""
Audit log and Used OTP models.

AuditLog: Records security-relevant actions for monitoring and forensics.
UsedOTP: Prevents TOTP replay attacks by tracking recently used codes.
"""

from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class AuditLog(Base):
    """
    Immutable log of security-relevant actions.
    Tamper-evident via SHA-256 hash chaining and PKI digital signatures.
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

    # Tamper-evident hash chain
    prev_hash = Column(String(64), nullable=True)   # SHA-256 of previous entry
    entry_hash = Column(String(64), nullable=True)   # SHA-256 of this entry
    signature = Column(Text, nullable=True)          # PKI signature of entry_hash

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
