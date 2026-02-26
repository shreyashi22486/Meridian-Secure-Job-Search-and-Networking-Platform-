"""
User model with security-focused design.

Security features:
- UUID primary key prevents ID enumeration
- Password stored as Argon2 hash (never plaintext)
- TOTP secret encrypted at rest with Fernet
- Account lockout fields for brute-force protection
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Integer, DateTime, Enum, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, enum.Enum):
    """User roles for RBAC."""
    USER = "user"
    RECRUITER = "recruiter"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)

    # Profile fields (Milestone 2: profile management)
    headline = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)

    # RBAC
    role = Column(
        Enum(UserRole, name="user_role", create_constraint=True),
        nullable=False,
        default=UserRole.USER,
    )

    # TOTP 2FA — secret encrypted with Fernet before storage
    totp_secret = Column(String(512), nullable=True)  # Fernet ciphertext
    is_totp_enabled = Column(Boolean, default=False, nullable=False)

    # Brute-force protection
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)

    # Account status
    is_suspended = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    resumes = relationship("Resume", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")
    used_otps = relationship("UsedOTP", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role.value}>"
