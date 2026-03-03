"""
Company and CompanyAdmin models.

Security features:
- UUID primary keys prevent enumeration
- CompanyAdmin tracks who can manage each company (RBAC)
- Cascade deletes clean up all related data
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


class CompanyAdminRole(str, enum.Enum):
    """Roles within a company."""
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"


class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    website = Column(String(512), nullable=True)
    logo_filename = Column(String(255), nullable=True)

    # Who created the company
    created_by = Column(
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
    creator = relationship("User", foreign_keys=[created_by])
    admins = relationship(
        "CompanyAdmin", back_populates="company", cascade="all, delete-orphan"
    )
    jobs = relationship(
        "Job", back_populates="company", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Company {self.name}>"


class CompanyAdmin(Base):
    """Many-to-many: which users can manage a company."""
    __tablename__ = "company_admins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = Column(
        Enum(CompanyAdminRole, name="company_admin_role", create_constraint=True),
        nullable=False,
        default=CompanyAdminRole.ADMIN,
    )

    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Unique constraint: one role per user per company
    __table_args__ = (
        UniqueConstraint("company_id", "user_id", name="uq_company_user"),
    )

    # Relationships
    company = relationship("Company", back_populates="admins")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<CompanyAdmin company={self.company_id} user={self.user_id} role={self.role.value}>"
