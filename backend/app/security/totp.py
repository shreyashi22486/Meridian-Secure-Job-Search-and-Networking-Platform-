"""
TOTP (Time-based One-Time Password) setup, verification, and replay prevention.

Why TOTP:
- Works completely offline (no SMS/email dependency — LAN requirement)
- Standard algorithm (RFC 6238) supported by all authenticator apps
- Uses pyotp library

What it prevents: Account takeover even if password is compromised.
OTP replay prevention: Each code can only be used once per time window.
"""

import io
import time
import base64

import pyotp
import qrcode
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.models.audit_log import UsedOTP


def _get_fernet() -> Fernet:
    """Get Fernet instance for TOTP secret encryption."""
    return Fernet(settings.TOTP_ENCRYPTION_KEY.encode())


def generate_totp_secret() -> tuple[str, str]:
    """
    Generate a new TOTP secret.
    Returns (encrypted_secret, plain_secret).
    The encrypted version is stored in DB; the plain version is shown
    to the user once (via QR code) and never stored in plaintext.
    """
    plain_secret = pyotp.random_base32()
    encrypted_secret = _get_fernet().encrypt(plain_secret.encode()).decode()
    return encrypted_secret, plain_secret


def decrypt_totp_secret(encrypted_secret: str) -> str:
    """Decrypt a stored TOTP secret for verification."""
    return _get_fernet().decrypt(encrypted_secret.encode()).decode()


def get_provisioning_uri(plain_secret: str, email: str) -> str:
    """
    Generate an otpauth:// URI for QR code scanning.
    Compatible with Google Authenticator, Authy, etc.
    """
    totp = pyotp.TOTP(plain_secret)
    return totp.provisioning_uri(
        name=email,
        issuer_name=settings.APP_NAME,
    )


def generate_qr_base64(provisioning_uri: str) -> str:
    """
    Generate a base64-encoded PNG QR code for the provisioning URI.
    Returned to the frontend for display — no file written to disk.
    """
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return base64.b64encode(buffer.getvalue()).decode()


def verify_totp(
    encrypted_secret: str,
    code: str,
    user_id: str,
    db: DBSession,
    valid_window: int = 1,
) -> bool:
    """
    Verify a TOTP code with replay prevention.

    Steps:
    1. Decrypt the stored secret
    2. Verify the code against the current time (±1 window for clock drift)
    3. Check the used_otps table — reject if already used in this time window
    4. If valid and not replayed, record the code in used_otps

    Args:
        valid_window: Number of 30-second windows to accept (1 = ±30 sec)

    Returns:
        True if valid and not replayed, False otherwise.
    """
    try:
        plain_secret = decrypt_totp_secret(encrypted_secret)
    except Exception:
        return False

    totp = pyotp.TOTP(plain_secret)
    current_time_step = int(time.time()) // 30

    # Verify the code
    if not totp.verify(code, valid_window=valid_window):
        return False

    # Check for replay — has this exact code been used in the current time window?
    existing = db.query(UsedOTP).filter(
        UsedOTP.user_id == user_id,
        UsedOTP.otp_code == code,
        UsedOTP.time_step >= current_time_step - valid_window,
        UsedOTP.time_step <= current_time_step + valid_window,
    ).first()

    if existing:
        # Replay detected — same code used again in the same window
        return False

    # Record the used OTP to prevent replay
    used_otp = UsedOTP(
        user_id=user_id,
        otp_code=code,
        time_step=current_time_step,
    )
    db.add(used_otp)
    db.commit()

    # Garbage collection: remove old entries (older than 5 minutes / 10 time steps)
    cleanup_threshold = current_time_step - 10
    db.query(UsedOTP).filter(
        UsedOTP.user_id == user_id,
        UsedOTP.time_step < cleanup_threshold,
    ).delete()
    db.commit()

    return True
