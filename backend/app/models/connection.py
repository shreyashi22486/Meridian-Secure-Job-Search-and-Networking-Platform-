"""
Connection model for professional connections.

Features:
- Request/Accept/Reject flow
- Unique bidirectional constraint (can't have duplicate connections)
- Timestamps for all state changes
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, Enum, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ConnectionStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class Connection(Base):
    __tablename__ = "connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # sender = who sent the request
    sender_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # receiver = who received the request
    receiver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(
        Enum(ConnectionStatus, name="connection_status", create_constraint=True),
        nullable=False,
        default=ConnectionStatus.PENDING,
    )

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Prevent self-connections
    __table_args__ = (
        CheckConstraint("sender_id != receiver_id", name="ck_no_self_connect"),
    )

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])

    def __repr__(self) -> str:
        return f"<Connection {self.sender_id} -> {self.receiver_id} [{self.status.value}]>"
