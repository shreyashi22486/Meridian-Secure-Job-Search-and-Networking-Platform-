"""Pydantic schemas for authentication endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional
from app.security.sanitizer import sanitize_string, sanitize_email


class RegisterRequest(BaseModel):
    """User registration request with input sanitization."""
    email: str
    password: str
    full_name: str

    @field_validator("email")
    @classmethod
    def sanitize_email_field(cls, v: str) -> str:
        return sanitize_email(v)

    @field_validator("full_name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)


class LoginRequest(BaseModel):
    """Login request."""
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def sanitize_email_field(cls, v: str) -> str:
        return sanitize_email(v)


class Verify2FARequest(BaseModel):
    """2FA verification request."""
    code: str
    temp_token: str  # Temporary token from login step

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        # OTP codes are 6 digits only
        v = v.strip()
        if not v.isdigit() or len(v) != 6:
            raise ValueError("OTP code must be exactly 6 digits")
        return v


class Confirm2FARequest(BaseModel):
    """Confirm 2FA setup with first valid code."""
    code: str

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit() or len(v) != 6:
            raise ValueError("OTP code must be exactly 6 digits")
        return v


class TokenResponse(BaseModel):
    """Response after successful authentication."""
    message: str
    user_id: str
    role: str


class LoginResponse(BaseModel):
    """Response after login — may require 2FA."""
    message: str
    requires_2fa: bool = False
    temp_token: Optional[str] = None  # Only set if 2FA required


class Setup2FAResponse(BaseModel):
    """Response with QR code for 2FA setup."""
    qr_code_base64: str
    message: str


class CSRFTokenResponse(BaseModel):
    """CSRF token response."""
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    """Password change with re-authentication."""
    current_password: str
    new_password: str
    totp_code: Optional[str] = None  # Required if 2FA enabled

    @field_validator("totp_code")
    @classmethod
    def validate_totp(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError("OTP code must be exactly 6 digits")
        return v
