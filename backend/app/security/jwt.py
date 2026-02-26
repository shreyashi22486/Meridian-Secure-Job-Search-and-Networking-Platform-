"""
JWT token creation, verification, and device fingerprinting.

Security features:
- Short-lived access tokens (15 min) limit exposure window
- Refresh tokens enable session continuity without long-lived access
- Device fingerprint (IP+UA hash) detects stolen cookies used from different devices
- JTI (unique ID) enables refresh token rotation with reuse detection
- Session ID links tokens to server-side session for revocation

What it prevents: Session hijacking, cookie theft from different devices,
indefinite session persistence.
"""

import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from jose import jwt, JWTError

from app.config import settings


class TokenError(Exception):
    """Raised when token creation or verification fails."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def create_fingerprint(ip_address: str, user_agent: str) -> str:
    """
    Create a device fingerprint from IP and User-Agent.
    SHA256 hash prevents leaking raw values if token is somehow exposed.
    """
    raw = f"{ip_address}:{user_agent}"
    return hashlib.sha256(raw.encode()).hexdigest()


def create_access_token(
    user_id: str,
    role: str,
    session_id: str,
    fingerprint: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a short-lived access token.

    Claims:
    - sub: user ID
    - role: user role for RBAC
    - type: "access"
    - jti: unique token ID
    - sid: session ID (links to DB session)
    - fp: device fingerprint
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "sid": str(session_id),
        "fp": fingerprint,
        "iat": now,
        "exp": expire,
    }

    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    user_id: str,
    session_id: str,
    fingerprint: str,
    jti: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> tuple[str, str]:
    """
    Create a long-lived refresh token.
    Returns (token_string, jti) — the JTI is stored in the sessions table
    for rotation tracking.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES))
    token_jti = jti or str(uuid.uuid4())

    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": token_jti,
        "sid": str(session_id),
        "fp": fingerprint,
        "iat": now,
        "exp": expire,
    }

    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, token_jti


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token.
    Raises TokenError on any failure — caller must handle.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as e:
        raise TokenError(f"Invalid token: {str(e)}")


def verify_token_fingerprint(token_payload: Dict[str, Any], ip_address: str, user_agent: str) -> bool:
    """
    Verify that the token's device fingerprint matches the current request.
    Returns False if fingerprints don't match (cookie possibly stolen).
    """
    expected_fp = create_fingerprint(ip_address, user_agent)
    return token_payload.get("fp") == expected_fp
