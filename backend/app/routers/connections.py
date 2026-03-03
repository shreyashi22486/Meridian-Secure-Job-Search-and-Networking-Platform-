"""
Connections router — professional network management.

Features:
- Send/accept/reject/remove connection requests
- List connections and pending requests
- Connection graph for network visualization
- Audit logging for all actions
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_, and_
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.models.connection import Connection, ConnectionStatus
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/connections", tags=["Connections"])


# ─── Schemas ────────────────────────────────────────────────────────────

class ConnectionRequest(BaseModel):
    target_user_id: str

class ConnectionResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    receiver_id: str
    receiver_name: str
    status: str
    created_at: datetime

class ConnectionListResponse(BaseModel):
    connections: List[ConnectionResponse]
    total: int

class ConnectionGraphResponse(BaseModel):
    """For network visualization."""
    nodes: List[dict]
    edges: List[dict]


# ─── Helpers ────────────────────────────────────────────────────────────

def _conn_response(conn: Connection) -> ConnectionResponse:
    return ConnectionResponse(
        id=str(conn.id),
        sender_id=str(conn.sender_id),
        sender_name=conn.sender.full_name if conn.sender else "Unknown",
        receiver_id=str(conn.receiver_id),
        receiver_name=conn.receiver.full_name if conn.receiver else "Unknown",
        status=conn.status.value,
        created_at=conn.created_at,
    )


def _get_existing_connection(db: DBSession, user1_id, user2_id):
    """Check if any connection exists between two users (in either direction)."""
    return db.query(Connection).filter(
        or_(
            and_(Connection.sender_id == user1_id, Connection.receiver_id == user2_id),
            and_(Connection.sender_id == user2_id, Connection.receiver_id == user1_id),
        )
    ).first()


# ─── Endpoints ──────────────────────────────────────────────────────────


@router.post("/request", status_code=status.HTTP_201_CREATED)
async def send_connection_request(
    data: ConnectionRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a connection request to another user."""
    if str(current_user.id) == data.target_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot connect with yourself")

    target = db.query(User).filter(User.id == data.target_user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = _get_existing_connection(db, current_user.id, data.target_user_id)
    if existing:
        if existing.status == ConnectionStatus.ACCEPTED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already connected")
        if existing.status == ConnectionStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already pending")
        if existing.status == ConnectionStatus.REJECTED:
            # Allow re-requesting after rejection
            existing.status = ConnectionStatus.PENDING
            existing.sender_id = current_user.id
            existing.receiver_id = data.target_user_id
            db.commit()
            log_audit(db, "connection_re_requested", user_id=current_user.id,
                      ip_address=get_client_ip(request),
                      details={"target": data.target_user_id})
            return {"message": "Connection request sent", "id": str(existing.id)}

    conn = Connection(
        sender_id=current_user.id,
        receiver_id=data.target_user_id,
    )
    db.add(conn)
    db.commit()

    log_audit(db, "connection_requested", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"target": data.target_user_id})

    return {"message": "Connection request sent", "id": str(conn.id)}


@router.put("/{connection_id}/accept")
async def accept_connection(
    connection_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept a connection request. Only the receiver can accept."""
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if str(conn.receiver_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the receiver can accept")
    if conn.status != ConnectionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Connection is already {conn.status.value}")

    conn.status = ConnectionStatus.ACCEPTED
    db.commit()

    log_audit(db, "connection_accepted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"connection_id": connection_id, "sender": str(conn.sender_id)})

    return {"message": "Connection accepted"}


@router.put("/{connection_id}/reject")
async def reject_connection(
    connection_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a connection request. Only the receiver can reject."""
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if str(conn.receiver_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the receiver can reject")
    if conn.status != ConnectionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Connection is already {conn.status.value}")

    conn.status = ConnectionStatus.REJECTED
    db.commit()

    log_audit(db, "connection_rejected", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"connection_id": connection_id})

    return {"message": "Connection rejected"}


@router.delete("/{connection_id}")
async def remove_connection(
    connection_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a connection. Either party can remove."""
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if str(conn.sender_id) != str(current_user.id) and str(conn.receiver_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your connection")

    db.delete(conn)
    db.commit()

    log_audit(db, "connection_removed", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"connection_id": connection_id})

    return {"message": "Connection removed"}


@router.get("/me", response_model=ConnectionListResponse)
async def list_my_connections(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List accepted connections for the current user."""
    conns = db.query(Connection).filter(
        or_(
            Connection.sender_id == current_user.id,
            Connection.receiver_id == current_user.id,
        ),
        Connection.status == ConnectionStatus.ACCEPTED,
    ).order_by(Connection.created_at.desc()).all()

    return ConnectionListResponse(
        connections=[_conn_response(c) for c in conns],
        total=len(conns),
    )


@router.get("/pending", response_model=ConnectionListResponse)
async def list_pending_requests(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List pending connection requests received by the current user."""
    pending = db.query(Connection).filter(
        Connection.receiver_id == current_user.id,
        Connection.status == ConnectionStatus.PENDING,
    ).order_by(Connection.created_at.desc()).all()

    return ConnectionListResponse(
        connections=[_conn_response(c) for c in pending],
        total=len(pending),
    )


@router.get("/status/{user_id}")
async def get_connection_status(
    user_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check connection status between current user and another user."""
    conn = _get_existing_connection(db, current_user.id, user_id)
    if not conn:
        return {"status": "none", "connection_id": None}
    return {
        "status": conn.status.value,
        "connection_id": str(conn.id),
        "is_sender": str(conn.sender_id) == str(current_user.id),
    }


@router.get("/graph", response_model=ConnectionGraphResponse)
async def get_connection_graph(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the connection graph for visualization.
    Returns the current user's connections and their inter-connections.
    """
    # Get all accepted connections involving the current user
    my_conns = db.query(Connection).filter(
        or_(
            Connection.sender_id == current_user.id,
            Connection.receiver_id == current_user.id,
        ),
        Connection.status == ConnectionStatus.ACCEPTED,
    ).all()

    # Collect connected user IDs
    connected_ids = set()
    for c in my_conns:
        connected_ids.add(str(c.sender_id))
        connected_ids.add(str(c.receiver_id))

    # Build nodes
    nodes = []
    user_map = {}
    for uid in connected_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            user_map[str(u.id)] = u
            nodes.append({
                "id": str(u.id),
                "name": u.full_name or u.email,
                "role": u.role.value,
                "is_me": str(u.id) == str(current_user.id),
            })

    # Build edges
    edges = []
    for c in my_conns:
        edges.append({
            "source": str(c.sender_id),
            "target": str(c.receiver_id),
        })

    return ConnectionGraphResponse(nodes=nodes, edges=edges)
