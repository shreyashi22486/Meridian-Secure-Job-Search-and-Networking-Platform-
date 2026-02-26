"""
Utility helpers used across the application.
"""

from fastapi import Request
from sqlalchemy.orm import Session as DBSession
from app.models.audit_log import AuditLog


def get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def log_audit(
    db: DBSession,
    action: str,
    user_id=None,
    ip_address: str = None,
    details: dict = None,
) -> None:
    """
    Record a security-relevant action in the audit log.
    Called from routers after credential changes, login attempts, admin actions, etc.
    """
    entry = AuditLog(
        user_id=user_id,
        action=action,
        ip_address=ip_address,
        details=details,
    )
    db.add(entry)
    db.commit()
