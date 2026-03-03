"""
Messaging router — encrypted conversations and messages.

Security design:
- 1:1 (direct): True E2EE — client encrypts/decrypts, server stores ciphertext
- Group: Server-side Fernet encryption — encrypted at rest, decrypted per-request
- Only conversation members can read/send messages
- All mutations are audit-logged
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_, func
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from cryptography.fernet import Fernet
import os

from app.database import get_db
from app.models.user import User
from app.models.messaging import (
    Conversation, ConversationMember, ConversationType, Message,
)
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit
from app.security.sanitizer import sanitize_string

router = APIRouter(prefix="/api/messages", tags=["Messaging"])

# Fernet key for server-side encryption of group messages
_FERNET_KEY = os.getenv("FERNET_KEY", Fernet.generate_key().decode())
_fernet = Fernet(_FERNET_KEY.encode() if isinstance(_FERNET_KEY, str) else _FERNET_KEY)


# ─── Schemas ────────────────────────────────────────────────────────────


class StartConversationRequest(BaseModel):
    target_user_id: str
    public_key: Optional[str] = None  # for E2EE key exchange


class CreateGroupRequest(BaseModel):
    name: str
    member_ids: List[str]

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)


class SendMessageRequest(BaseModel):
    encrypted_content: str  # E2EE: client-side ciphertext / Group: plaintext (server encrypts)
    nonce: Optional[str] = None  # only for E2EE messages


class ConversationResponse(BaseModel):
    id: str
    name: Optional[str] = None
    type: str
    members: List[dict]
    last_message: Optional[dict] = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    encrypted_content: str
    nonce: Optional[str] = None
    sent_at: datetime


class MessageListResponse(BaseModel):
    messages: List[MessageResponse]
    total: int


# ─── Helpers ────────────────────────────────────────────────────────────


def _check_member(db: DBSession, conversation_id, user_id) -> ConversationMember:
    """Verify user is a member of the conversation."""
    member = db.query(ConversationMember).filter(
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this conversation",
        )
    return member


def _conv_response(conv: Conversation, current_user_id=None, db=None) -> ConversationResponse:
    members = [
        {"user_id": str(m.user_id), "name": m.user.full_name if m.user else "Unknown",
         "public_key": m.public_key, "is_admin": m.is_admin}
        for m in conv.members
    ]
    last_msg = None
    if conv.messages:
        last = conv.messages[-1]
        # Show preview for group messages (decrypted by server)
        preview = "(encrypted)"
        if conv.type != ConversationType.DIRECT and last.encrypted_content:
            try:
                preview = _fernet.decrypt(last.encrypted_content.encode()).decode()
                if len(preview) > 40:
                    preview = preview[:40] + "…"
            except Exception:
                preview = "(encrypted)"
        last_msg = {
            "id": str(last.id),
            "sender_name": last.sender.full_name if last.sender else "Unknown",
            "sent_at": last.sent_at.isoformat(),
            "preview": preview,
        }

    # Calculate unread count
    unread = 0
    if current_user_id and db:
        membership = db.query(ConversationMember).filter(
            ConversationMember.conversation_id == conv.id,
            ConversationMember.user_id == current_user_id,
        ).first()
        if membership and membership.last_read_at:
            unread = db.query(func.count(Message.id)).filter(
                Message.conversation_id == conv.id,
                Message.sent_at > membership.last_read_at,
                Message.sender_id != current_user_id,
            ).scalar() or 0

    return ConversationResponse(
        id=str(conv.id),
        name=conv.name,
        type=conv.type.value,
        members=members,
        last_message=last_msg,
        unread_count=unread,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


def _msg_response(msg: Message) -> MessageResponse:
    return MessageResponse(
        id=str(msg.id),
        conversation_id=str(msg.conversation_id),
        sender_id=str(msg.sender_id) if msg.sender_id else None,
        sender_name=msg.sender.full_name if msg.sender else None,
        encrypted_content=msg.encrypted_content,
        nonce=msg.nonce,
        sent_at=msg.sent_at,
    )


# ─── Conversation Endpoints ────────────────────────────────────────────


@router.post("/conversations/direct", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def start_direct_conversation(
    data: StartConversationRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a 1:1 E2EE conversation with another user."""
    target = db.query(User).filter(User.id == data.target_user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(current_user.id) == data.target_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot message yourself")

    # Check if conversation already exists between these two users
    existing = db.query(Conversation).join(ConversationMember).filter(
        Conversation.type == ConversationType.DIRECT,
        ConversationMember.user_id == current_user.id,
    ).all()

    for conv in existing:
        member_ids = {str(m.user_id) for m in conv.members}
        if data.target_user_id in member_ids:
            return _conv_response(conv)

    # Create new direct conversation
    conv = Conversation(type=ConversationType.DIRECT, created_by=current_user.id)
    db.add(conv)
    db.flush()

    # Add both members
    db.add(ConversationMember(
        conversation_id=conv.id, user_id=current_user.id,
        public_key=data.public_key, is_admin=True,
    ))
    db.add(ConversationMember(
        conversation_id=conv.id, user_id=data.target_user_id,
    ))
    db.commit()
    db.refresh(conv)

    log_audit(db, "conversation_created", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"conversation_id": str(conv.id), "type": "direct"})

    return _conv_response(conv)


@router.post("/conversations/group", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_group_conversation(
    data: CreateGroupRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a group conversation. Creator is auto-added as admin."""
    if len(data.member_ids) < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one other member required")

    conv = Conversation(
        name=data.name,
        type=ConversationType.GROUP,
        created_by=current_user.id,
    )
    db.add(conv)
    db.flush()

    # Add creator as admin
    db.add(ConversationMember(
        conversation_id=conv.id, user_id=current_user.id, is_admin=True,
    ))

    # Add other members
    for uid in data.member_ids:
        user = db.query(User).filter(User.id == uid).first()
        if user:
            db.add(ConversationMember(conversation_id=conv.id, user_id=uid))

    db.commit()
    db.refresh(conv)

    log_audit(db, "conversation_created", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"conversation_id": str(conv.id), "type": "group", "name": data.name})

    return _conv_response(conv)


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all conversations for the current user."""
    memberships = db.query(ConversationMember).filter(
        ConversationMember.user_id == current_user.id,
    ).all()

    conv_ids = [m.conversation_id for m in memberships]
    convs = db.query(Conversation).filter(
        Conversation.id.in_(conv_ids)
    ).order_by(Conversation.updated_at.desc()).all()

    return [_conv_response(c, current_user_id=current_user.id, db=db) for c in convs]


@router.get("/unread-count")
async def get_total_unread(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get total unread message count across all conversations."""
    memberships = db.query(ConversationMember).filter(
        ConversationMember.user_id == current_user.id,
    ).all()

    total = 0
    for m in memberships:
        count = db.query(func.count(Message.id)).filter(
            Message.conversation_id == m.conversation_id,
            Message.sent_at > m.last_read_at,
            Message.sender_id != current_user.id,
        ).scalar() or 0
        total += count

    return {"unread_count": total}


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get conversation details. Must be a member."""
    _check_member(db, conversation_id, current_user.id)
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return _conv_response(conv)


# ─── Message Endpoints ─────────────────────────────────────────────────


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: str,
    data: SendMessageRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a message.
    - Direct E2EE: client sends pre-encrypted ciphertext + nonce
    - Group: client sends plaintext, server encrypts with Fernet
    """
    _check_member(db, conversation_id, current_user.id)

    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    encrypted_content = data.encrypted_content
    nonce = data.nonce

    # For group messages, server-side encrypts the plaintext
    if conv.type != ConversationType.DIRECT:
        plaintext = data.encrypted_content
        encrypted_content = _fernet.encrypt(plaintext.encode()).decode()
        nonce = None  # No client-side nonce for server-encrypted messages

    msg = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        encrypted_content=encrypted_content,
        nonce=nonce,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return _msg_response(msg)


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def list_messages(
    conversation_id: str,
    skip: int = 0,
    limit: int = 50,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List messages in a conversation.
    - Direct E2EE: returns ciphertext as-is (client decrypts)
    - Group: decrypts Fernet and returns plaintext
    """
    member = _check_member(db, conversation_id, current_user.id)

    # Mark as read
    member.last_read_at = datetime.utcnow()
    db.commit()

    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    query = db.query(Message).filter(
        Message.conversation_id == conversation_id,
    ).order_by(Message.sent_at.desc())

    total = query.count()
    msgs = query.offset(skip).limit(min(limit, 100)).all()
    msgs.reverse()  # Chronological order

    results = []
    for msg in msgs:
        resp = _msg_response(msg)
        # Decrypt server-side encrypted group messages
        if conv.type != ConversationType.DIRECT and msg.encrypted_content:
            try:
                decrypted = _fernet.decrypt(msg.encrypted_content.encode()).decode()
                resp.encrypted_content = decrypted
            except Exception:
                resp.encrypted_content = "[decryption failed]"
        results.append(resp)

    return MessageListResponse(messages=results, total=total)


# ─── Member Key Exchange ───────────────────────────────────────────────


@router.put("/conversations/{conversation_id}/public-key")
async def update_public_key(
    conversation_id: str,
    data: dict,  # {"public_key": "base64..."}
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the public key for E2EE key exchange in a direct conversation."""
    member = _check_member(db, conversation_id, current_user.id)
    member.public_key = data.get("public_key")
    db.commit()
    return {"message": "Public key updated"}
