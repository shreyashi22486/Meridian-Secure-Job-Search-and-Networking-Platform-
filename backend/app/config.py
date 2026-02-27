"""
Application configuration loaded from environment variables.

Security rationale: All secrets come from env vars, never hardcoded.
Pydantic Settings validates types and provides defaults.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Central configuration — loaded from .env file or environment."""

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/secure_job_portal"

    # JWT
    JWT_SECRET: str  # No default — must be explicitly set
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Encryption keys (Fernet)
    TOTP_ENCRYPTION_KEY: str  # For encrypting TOTP secrets at rest
    FILE_ENCRYPTION_KEY: str  # For encrypting uploaded resumes at rest

    # File uploads
    UPLOAD_DIR: str = "./data/resumes"
    MAX_UPLOAD_SIZE: int = 2_097_152  # 2 MB

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"

    # App
    APP_NAME: str = "Nexora"
    DEBUG: bool = False
    # Cookie Secure flag — set True with CA-signed certs, False with self-signed
    # When False, nginx 301 redirect still enforces HTTPS-only transport
    SECURE_COOKIES: bool = False

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


# Singleton instance — imported throughout the app
settings = Settings()
