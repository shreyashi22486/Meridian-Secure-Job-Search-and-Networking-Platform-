"""
Messaging models for encrypted one-to-one and group conversations.

Security design:
- Message content is stored encrypted (AES-GCM ciphertext for 1:1, Fernet for groups)
- Server never sees plaintext for 1:1 E2EE conversations
- Group messages use server-side Fernet encryption (key known to server)
- Conversation membership controls access
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, Enum, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ConversationType(str, enum.Enum):
    DIRECT = "direct"      # 1:1 E2EE
    GROUP = "group"        # Server-side encrypted group
    ANNOUNCEMENT = "announcement"  # Company/admin announcements


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=True)  # NULL for direct messages
    type = Column(
        Enum(ConversationType, name="conversation_type", create_constraint=True),
        nullable=False,
        default=ConversationType.DIRECT,
    )

    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    members = relationship(
        "ConversationMember", back_populates="conversation", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan",
        order_by="Message.sent_at",
    )

    def __repr__(self) -> str:
        return f"<Conversation {self.id} type={self.type.value}>"


class ConversationMember(Base):
    """Tracks who is part of which conversation."""
    __tablename__ = "conversation_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # For E2EE: stores the sender's public key used in key exchange
    public_key = Column(Text, nullable=True)

    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    last_read_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),
    )

    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<ConversationMember conv={self.conversation_id} user={self.user_id}>"


class Message(Base):
    """
    Messages — content is always stored encrypted.
    - For DIRECT (E2EE): ciphertext from client-side AES-GCM, server stores as-is
    - For GROUP: server encrypts with Fernet before storing
    """
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Encrypted content — never plaintext on server
    encrypted_content = Column(Text, nullable=False)

    # For E2EE messages: IV/nonce used for AES-GCM encryption
    nonce = Column(String(64), nullable=True)

    # PKI digital signature — message authenticity
    signature = Column(Text, nullable=True)

    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User")

    def __repr__(self) -> str:
        return f"<Message id={self.id} conv={self.conversation_id}>"
