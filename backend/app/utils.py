"""
Utility helpers used across the application.
"""

import hashlib
import json
from datetime import datetime

from fastapi import Request
from sqlalchemy.orm import Session as DBSession
from app.models.audit_log import AuditLog
from app.security.pki import sign_data


# Consistent timestamp format for hashing — never changes between write and read
_HASH_TS_FMT = "%Y-%m-%dT%H:%M:%S.%f"


def get_client_ip(request: Request) -> str:
    """Get client IP from Nginx-set X-Real-IP header (trustworthy, not spoofable)."""
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    # Fallback for direct access (dev mode without Nginx)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _compute_entry_hash(
    action: str,
    user_id,
    ip_address: str,
    timestamp: str,
    details: dict,
    prev_hash: str,
) -> str:
    """
    Compute SHA-256 hash for an audit log entry.
    Includes all fields + previous hash to form a chain.
    """
    raw = f"{action}|{user_id}|{ip_address}|{timestamp}|{json.dumps(details, sort_keys=True, default=str)}|{prev_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _format_ts(dt: datetime) -> str:
    """Format a datetime consistently for hashing (no timezone suffix variance)."""
    return dt.strftime(_HASH_TS_FMT)


def log_audit(
    db: DBSession,
    action: str,
    user_id=None,
    ip_address: str = None,
    details: dict = None,
) -> None:
    """
    Create an audit log entry with tamper-evident hash chain and PKI signature.
    Uses PostgreSQL advisory lock to prevent race conditions in the hash chain (A9.2).
    """
    from datetime import timezone
    from sqlalchemy import text

    try:
        # Advisory lock to serialize hash chain writes (A9.2)
        db.execute(text("SELECT pg_advisory_lock(42)"))

        # Get previous entry's hash for chaining
        prev_entry = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
        prev_hash = prev_entry.entry_hash if (prev_entry and prev_entry.entry_hash) else "0" * 64

        # Build the entry
        ts = datetime.now(timezone.utc)

        # Compute the hash of this entry
        entry_hash = _compute_entry_hash(
            action=action,
            user_id=str(user_id) if user_id else "",
            ip_address=ip_address or "",
            timestamp=_format_ts(ts),
            details=details or {},
            prev_hash=prev_hash,
        )

        # PKI sign the hash
        try:
            signature = sign_data(entry_hash.encode("utf-8"))
        except Exception:
            signature = None  # Don't block logging if PKI is unavailable

        entry = AuditLog(
            user_id=user_id,
            action=action,
            ip_address=ip_address,
            details=details,
            prev_hash=prev_hash,
            entry_hash=entry_hash,
            signature=signature,
            created_at=ts,
        )

        db.add(entry)
        db.commit()
    finally:
        # Always release the advisory lock
        try:
            db.execute(text("SELECT pg_advisory_unlock(42)"))
        except Exception:
            pass

    # Auto-mine a new block if enough entries have accumulated
    try:
        from app.security.blockchain import maybe_create_block
        maybe_create_block(db)
    except Exception:
        pass  # Don't block logging if blockchain mining fails


def backfill_audit_hashes(db: DBSession) -> int:
    """
    Recompute hashes for ALL audit log entries from scratch.
    Call this once after migration to establish a valid chain.
    Returns the number of entries processed.
    """
    logs = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    prev_hash = "0" * 64

    for log in logs:
        timestamp = _format_ts(log.created_at)
        entry_hash = _compute_entry_hash(
            action=log.action,
            user_id=str(log.user_id) if log.user_id else "",
            ip_address=log.ip_address or "",
            timestamp=timestamp,
            details=log.details or {},
            prev_hash=prev_hash,
        )
        try:
            signature = sign_data(entry_hash.encode("utf-8"))
        except Exception:
            signature = None

        log.prev_hash = prev_hash
        log.entry_hash = entry_hash
        log.signature = signature
        prev_hash = entry_hash

    db.commit()
    return len(logs)
