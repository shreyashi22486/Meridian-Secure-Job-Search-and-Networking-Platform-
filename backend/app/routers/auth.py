"""
Authentication router — registration, login, 2FA, session management.

Security features:
- Argon2 password hashing
- Account lockout after failed attempts
- TOTP 2FA with replay prevention
- JWT in HttpOnly cookies (no localStorage)
- Refresh token rotation with reuse detection
- Device fingerprinting
- Audit logging for all auth events
"""

import uuid
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.session import Session
from app.schemas.auth import (
    RegisterRequest, LoginRequest, Verify2FARequest,
    Confirm2FARequest, TokenResponse, LoginResponse,
    Setup2FAResponse, CSRFTokenResponse,
)
from app.security.password import (
    hash_password, verify_password, validate_password_strength,
    PasswordValidationError,
)
from app.security.jwt import (
    create_access_token, create_refresh_token, decode_token,
    create_fingerprint, verify_token_fingerprint, TokenError,
)
from app.security.totp import (
    generate_totp_secret, get_provisioning_uri, generate_qr_base64, verify_totp,
)
from app.security.csrf import generate_csrf_token, CSRF_COOKIE_NAME
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Account lockout settings
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

# Grace period for concurrent refresh requests (A1.4)
REFRESH_GRACE_SECONDS = 5


def _safe_ua(request: Request) -> str:
    """Sanitize User-Agent for audit logs — truncate and strip control chars (A9.1)."""
    ua = request.headers.get("User-Agent", "")
    # Strip control characters and null bytes
    ua = re.sub(r'[\x00-\x1f\x7f]', '', ua)
    return ua[:512]


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    """Set JWT tokens as HttpOnly, Secure, SameSite cookies."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        path="/api/auth/refresh",  # Scoped to refresh endpoint only
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear all authentication cookies."""
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")


def _create_session_and_tokens(
    db: DBSession,
    user: User,
    request: Request,
    response: Response,
) -> TokenResponse:
    """Create a DB session and set JWT cookies."""
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")
    fingerprint = create_fingerprint(client_ip, user_agent)

    # Create DB session
    session = Session(
        user_id=user.id,
        refresh_token_jti=str(uuid.uuid4()),  # Placeholder, updated below
        ip_address=client_ip,
        user_agent=user_agent[:512],  # Truncate long UAs
        fingerprint=fingerprint,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES),
    )
    db.add(session)
    db.flush()  # Get session.id

    # Create tokens
    access_token = create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        session_id=str(session.id),
        fingerprint=fingerprint,
    )
    refresh_token, refresh_jti = create_refresh_token(
        user_id=str(user.id),
        session_id=str(session.id),
        fingerprint=fingerprint,
    )

    # Update session with actual refresh JTI
    session.refresh_token_jti = refresh_jti
    db.commit()

    # Set cookies
    _set_auth_cookies(response, access_token, refresh_token)

    return TokenResponse(
        message="Authentication successful",
        user_id=str(user.id),
        role=user.role.value,
    )


# ─── REGISTER ───────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    """
    Register a new user.

    Security:
    - Validates password strength
    - Hashes password with Argon2id
    - Sanitizes all text inputs
    - Returns generic error for existing email (prevents enumeration)
    """
    # Check password strength
    try:
        validate_password_strength(data.password)
    except PasswordValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )

    # Check if email already exists (generic error to prevent enumeration)
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Please check your details.",
        )

    # Create user
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=UserRole.USER,
    )
    db.add(user)
    db.flush()

    # Audit log
    log_audit(db, "user_registered", user_id=user.id, 
              ip_address=get_client_ip(request),
              details={"user_agent": _safe_ua(request)})

    # Create session and return tokens
    return _create_session_and_tokens(db, user, request, response)


# ─── LOGIN ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    """
    Login with email and password.

    Security:
    - Account lockout after MAX_FAILED_ATTEMPTS
    - Generic error messages (don't reveal if email exists)
    - If 2FA enabled, returns temp_token instead of session cookies
    """
    client_ip = get_client_ip(request)

    # Find user
    user = db.query(User).filter(User.email == data.email).first()

    if not user:
        # Fake Argon2 verification to prevent timing attacks
        # Timing attack prevention: run verify (not hash) to match the code path
        # when user exists, making response time indistinguishable (A1.1)
        verify_password(
            "fake_password_to_waste_time",
            "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check suspension
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended",
        )

    # Check account lockout
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        remaining = (user.locked_until - datetime.now(timezone.utc)).seconds // 60
        log_audit(db, "login_locked_out", user_id=user.id, ip_address=client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked. Try again in {remaining + 1} minutes.",
        )

    # Verify password
    if not verify_password(data.password, user.hashed_password):
        user.failed_login_attempts += 1

        # Lock account if too many failures
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            log_audit(
                db, "account_locked",
                user_id=user.id, ip_address=client_ip,
                details={"attempts": user.failed_login_attempts},
            )

        db.commit()

        log_audit(db, "login_failed", user_id=user.id, ip_address=client_ip,
                  details={"user_agent": _safe_ua(request)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Reset failed attempts on success
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    # Check if 2FA is required
    if user.is_totp_enabled:
        # Create a short-lived temp token for 2FA verification
        # This token is NOT a session token — it only authorizes the 2FA step
        from app.security.jwt import create_access_token
        temp_token = create_access_token(
            user_id=str(user.id),
            role=user.role.value,
            session_id="pending-2fa",
            fingerprint=create_fingerprint(client_ip, request.headers.get("User-Agent", "")),
            expires_delta=timedelta(minutes=5),  # 5 min to complete 2FA
        )

        log_audit(db, "login_2fa_required", user_id=user.id, ip_address=client_ip,
                  details={"user_agent": _safe_ua(request)})

        return LoginResponse(
            message="2FA verification required",
            requires_2fa=True,
            temp_token=temp_token,
        )

    # No 2FA — create session directly
    log_audit(db, "login_success", user_id=user.id, ip_address=client_ip,
              details={"user_agent": _safe_ua(request)})
    result = _create_session_and_tokens(db, user, request, response)

    return LoginResponse(
        message=result.message,
        requires_2fa=False,
    )


# ─── 2FA VERIFICATION ──────────────────────────────────────────────────────

@router.post("/verify-2fa", response_model=TokenResponse)
async def verify_2fa(
    data: Verify2FARequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    """
    Verify TOTP code after login.
    Requires the temp_token from the login step.
    """
    # Decode temp token
    try:
        payload = decode_token(data.temp_token)
    except TokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification token",
        )

    # Verify it's a pending 2FA token
    if payload.get("sid") != "pending-2fa":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid verification token",
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid verification",
        )

    # Verify TOTP code (with replay prevention)
    client_ip = get_client_ip(request)
    if not verify_totp(user.totp_secret, data.code, str(user.id), db):
        log_audit(db, "2fa_failed", user_id=user.id, ip_address=client_ip,
                  details={"user_agent": _safe_ua(request)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP code",
        )

    # Success — create full session
    log_audit(db, "login_success_2fa", user_id=user.id, ip_address=client_ip,
              details={"user_agent": _safe_ua(request)})
    return _create_session_and_tokens(db, user, request, response)


# ─── 2FA SETUP ─────────────────────────────────────────────────────────────

@router.post("/setup-2fa", response_model=Setup2FAResponse)
async def setup_2fa(
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate TOTP secret and QR code for 2FA setup.
    Must be confirmed with /confirm-2fa before 2FA is active.
    """
    if current_user.is_totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled",
        )

    # Generate new TOTP secret
    encrypted_secret, plain_secret = generate_totp_secret()

    # Store encrypted secret (not yet enabled until confirmed)
    current_user.totp_secret = encrypted_secret
    db.commit()

    # Generate QR code
    uri = get_provisioning_uri(plain_secret, current_user.email)
    qr_base64 = generate_qr_base64(uri)

    log_audit(db, "2fa_setup_initiated", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"user_agent": _safe_ua(request)})

    return Setup2FAResponse(
        qr_code_base64=qr_base64,
        message="Scan this QR code with your authenticator app, then confirm with a code",
    )


@router.post("/confirm-2fa", response_model=TokenResponse)
async def confirm_2fa(
    data: Confirm2FARequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Confirm 2FA setup by verifying the first TOTP code.
    This activates 2FA on the account.
    """
    if current_user.is_totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please set up 2FA first using /setup-2fa",
        )

    # Verify the code
    if not verify_totp(current_user.totp_secret, data.code, str(current_user.id), db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP code. Please try again.",
        )

    # Enable 2FA
    current_user.is_totp_enabled = True
    db.commit()

    log_audit(db, "2fa_enabled", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"user_agent": _safe_ua(request)})

    return TokenResponse(
        message="2FA has been enabled successfully",
        user_id=str(current_user.id),
        role=current_user.role.value,
    )


# ─── TOKEN REFRESH ─────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    """
    Refresh the access token using the refresh token cookie.

    Security: Refresh token rotation with reuse detection.
    - Each refresh issues a new refresh token and invalidates the old one.
    - If a revoked JTI is reused, ALL sessions for that user are revoked
      (indicates the token was stolen).
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    try:
        payload = decode_token(token)
    except TokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    # Verify fingerprint
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")
    if not verify_token_fingerprint(payload, client_ip, user_agent):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalid — device mismatch",
        )

    session_id = payload.get("sid")
    token_jti = payload.get("jti")

    # Find the session
    session = db.query(Session).filter(Session.id == session_id).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found",
        )

    # REUSE DETECTION: if the session's current JTI doesn't match,
    # this is a replayed/stolen token — but check for race condition first (A1.4)
    if session.refresh_token_jti != token_jti:
        # Grace period: if the token was just rotated (e.g., two browser tabs
        # racing to refresh), don't nuke all sessions — just reject this one.
        if (session.updated_at and
                (datetime.now(timezone.utc) - session.updated_at.replace(tzinfo=timezone.utc))
                < timedelta(seconds=REFRESH_GRACE_SECONDS)):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token already rotated, please retry",
            )

        # Outside grace period → genuine reuse. Revoke all sessions for this user.
        db.query(Session).filter(Session.user_id == session.user_id).update(
            {"is_revoked": True}
        )
        db.commit()

        log_audit(db, "refresh_token_reuse_detected",
                  user_id=session.user_id, ip_address=client_ip,
                  details={"revoked_session": str(session_id)})

        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Security alert: session has been compromised. All sessions revoked.",
        )

    if session.is_revoked:
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked",
        )

    # Get user
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or user.is_suspended:
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or suspended",
        )

    # ROTATION: issue new tokens, update session JTI
    fingerprint = create_fingerprint(client_ip, user_agent)

    access_token = create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        session_id=str(session.id),
        fingerprint=fingerprint,
    )
    new_refresh_token, new_jti = create_refresh_token(
        user_id=str(user.id),
        session_id=str(session.id),
        fingerprint=fingerprint,
    )

    # Update session with new JTI (old JTI is now invalid)
    session.refresh_token_jti = new_jti
    session.updated_at = datetime.now(timezone.utc)  # Track rotation time for grace period (A1.4)
    db.commit()

    _set_auth_cookies(response, access_token, new_refresh_token)

    return TokenResponse(
        message="Token refreshed",
        user_id=str(user.id),
        role=user.role.value,
    )


# ─── LOGOUT ────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    """
    Logout: revoke session in DB and clear cookies.
    Works even if token is invalid (best-effort cleanup).
    """
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = decode_token(token)
            session_id = payload.get("sid")
            if session_id and session_id != "pending-2fa":
                session = db.query(Session).filter(Session.id == session_id).first()
                if session:
                    session.is_revoked = True
                    db.commit()

                log_audit(db, "logout", user_id=payload.get("sub"),
                          ip_address=get_client_ip(request),
                          details={"session_id": str(session_id), "user_agent": _safe_ua(request)})
        except TokenError:
            pass  # Token invalid — still clear cookies

    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


# ─── SESSION MANAGEMENT ────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active sessions for the current user."""
    sessions = db.query(Session).filter(
        Session.user_id == current_user.id,
        Session.is_revoked.is_(False),
        Session.expires_at > datetime.now(timezone.utc),
    ).all()

    return {
        "sessions": [
            {
                "id": str(s.id),
                "ip_address": s.ip_address,
                "user_agent": s.user_agent,
                "created_at": s.created_at.isoformat(),
                "expires_at": s.expires_at.isoformat(),
            }
            for s in sessions
        ]
    }


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke a specific session."""
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    session.is_revoked = True
    db.commit()

    log_audit(db, "session_revoked", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"revoked_session": session_id})

    return {"message": "Session revoked"}


# ─── CSRF TOKEN ─────────────────────────────────────────────────────────────

@router.get("/csrf", response_model=CSRFTokenResponse)
async def get_csrf_token(response: Response):
    """
    Issue a CSRF token.
    Sets it as a cookie AND returns it in the response body.
    The frontend reads the body value and sends it as X-CSRF-Token header.
    """
    token = generate_csrf_token()

    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,  # Must be readable by JS for double-submit
        secure=settings.SECURE_COOKIES,
        samesite="lax",
        max_age=3600,
    )

    return CSRFTokenResponse(csrf_token=token)
