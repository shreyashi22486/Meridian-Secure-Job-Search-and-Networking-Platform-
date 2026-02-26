"""
FastAPI dependency injection for authentication and RBAC.

Security architecture:
- get_current_user: extracts JWT from HttpOnly cookie, verifies fingerprint,
  checks session validity in DB, returns User object
- require_role: factory that returns a dependency checking the user's role
- require_admin: convenience shortcut for admin-only endpoints

Every protected endpoint uses these as Depends() — no ad-hoc auth checks.
"""

from typing import List, Callable, Optional
from uuid import UUID

from fastapi import Depends, Request, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models.user import User
from app.models.session import Session
from app.security.jwt import decode_token, verify_token_fingerprint, TokenError


def _get_client_ip(request: Request) -> str:
    """Extract client IP address."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def get_current_user(
    request: Request,
    db: DBSession = Depends(get_db),
) -> User:
    """
    Extract and validate the current user from the access token cookie.

    Validation steps:
    1. Read access_token from HttpOnly cookie
    2. Decode and verify JWT signature + expiration
    3. Verify device fingerprint (token binding)
    4. Check session is not revoked in DB
    5. Check user exists and is not suspended
    """
    # 1. Get token from cookie
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    # 2. Decode token
    try:
        payload = decode_token(token)
    except TokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Verify token type
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    # 3. Verify device fingerprint
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")

    if not verify_token_fingerprint(payload, client_ip, user_agent):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalid — device mismatch",
        )

    # 4. Check session in DB
    session_id = payload.get("sid")
    if session_id:
        session = db.query(Session).filter(
            Session.id == session_id,
            Session.is_revoked == False,
        ).first()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked",
            )

    # 5. Get user
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended",
        )

    return user


def require_role(*roles: str) -> Callable:
    """
    Factory that creates a dependency requiring specific roles.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role("admin"))])
        @router.get("/staff", dependencies=[Depends(require_role("admin", "recruiter"))])
    """
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


# Convenience dependencies
require_admin = require_role("admin")
require_recruiter_or_admin = require_role("admin", "recruiter")
