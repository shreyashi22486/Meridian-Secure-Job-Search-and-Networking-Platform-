"""
JWT creation and verification using PyJWT.

Security features:
- HttpOnly cookie storage (no JavaScript access)
- Short-lived access tokens (15 min default)
- Refresh token rotation with device binding
- Token type claim prevents token misuse
- Hardcoded algorithm prevents algorithm confusion attacks

Migration note: Replaced python-jose (unmaintained, 3 CVEs) with PyJWT.
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional

import jwt as pyjwt
from jwt.exceptions import PyJWTError

from app.config import settings


class TokenError(Exception):
    """Raised when a token is invalid, expired, or tampered with."""
    pass


# ─── Device Fingerprinting ──────────────────────────────────────────────


def compute_fingerprint(ip: str, user_agent: str) -> str:
    """
    Create a SHA-256 fingerprint from the client's IP and User-Agent.
    This binds tokens to the originating device.
    """
    raw = f"{ip}:{user_agent or 'unknown'}"
    return hashlib.sha256(raw.encode()).hexdigest()


# Backward-compatible alias
create_fingerprint = compute_fingerprint


def verify_token_fingerprint(payload: Dict[str, Any], ip: str, user_agent: str) -> bool:
    """
    Verify the token's embedded fingerprint matches the current request.
    Returns False if the token is being used from a different device.
    """
    expected = compute_fingerprint(ip, user_agent)
    token_fp = payload.get("fp", "")
    return token_fp == expected

# ─── Token Creation ─────────────────────────────────────────────────────


def create_access_token(
    user_id: str,
    role: str,
    session_id: str,
    fingerprint: str,
) -> str:
    """
    Create a short-lived access token.
    Claims include user identity, role, session binding, and device fingerprint.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "jti": _generate_jti(),
        "sid": session_id,          # Bind to server-side session
        "fp": fingerprint,          # Bind to device
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    user_id: str,
    session_id: str,
    fingerprint: str,
    jti: Optional[str] = None,
) -> tuple[str, str]:
    """
    Create a long-lived refresh token.
    Returns (token_string, jti) — the JTI is stored server-side for rotation.
    """
    now = datetime.now(timezone.utc)
    token_jti = jti or _generate_jti()
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": token_jti,
        "sid": session_id,
        "fp": fingerprint,
        "iat": now,
        "exp": now + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES),
    }
    token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, token_jti


def create_temp_token(user_id: str, session_id: str, fingerprint: str) -> str:
    """
    Create a temporary token for 2FA verification flow.
    Very short-lived (5 minutes), single purpose.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "temp_2fa",
        "jti": _generate_jti(),
        "sid": session_id,
        "fp": fingerprint,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    return pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


# ─── Token Verification ─────────────────────────────────────────────────


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and verify a JWT.
    Raises TokenError if invalid, expired, or tampered with.

    Security: algorithms is hardcoded to prevent algorithm confusion attacks.
    """
    try:
        payload = pyjwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except pyjwt.ExpiredSignatureError:
        raise TokenError("Token has expired")
    except PyJWTError as e:
        raise TokenError(f"Invalid token: {str(e)}")


# ─── Helpers ─────────────────────────────────────────────────────────────


def _generate_jti() -> str:
    """Generate a unique token identifier."""
    import uuid
    return str(uuid.uuid4())
