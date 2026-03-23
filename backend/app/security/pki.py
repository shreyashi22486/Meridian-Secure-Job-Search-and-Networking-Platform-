"""
PKI (Public Key Infrastructure) — RSA key pair management, signing, and verification.

Security features:
- RSA 2048-bit key pair generated on first startup
- Private key stored on disk (gitignored), never exposed via API
- Signs data with PKCS1v15 + SHA-256
- Used for: resume integrity, message authenticity, audit log tamper-evidence

What it prevents: Data tampering, message forgery, audit log manipulation.
"""

import os
import base64

from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.exceptions import InvalidSignature

from app.config import settings


def _ensure_key_dir() -> str:
    """Ensure the PKI key directory exists."""
    key_dir = settings.PKI_KEY_DIR
    os.makedirs(key_dir, exist_ok=True)
    return key_dir


def _private_key_path() -> str:
    return os.path.join(_ensure_key_dir(), "server_private.pem")


def _public_key_path() -> str:
    return os.path.join(_ensure_key_dir(), "server_public.pem")


def _generate_key_pair() -> None:
    """Generate a new RSA 2048-bit key pair and save to disk."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Write private key (no password — secured by filesystem permissions)
    with open(_private_key_path(), "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Write public key
    public_key = private_key.public_key()
    with open(_public_key_path(), "wb") as f:
        f.write(public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ))

    # Restrict private key permissions (owner read only)
    os.chmod(_private_key_path(), 0o600)


def _load_private_key():
    """Load the RSA private key from disk, generating if absent."""
    if not os.path.exists(_private_key_path()):
        _generate_key_pair()

    with open(_private_key_path(), "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def _load_public_key():
    """Load the RSA public key from disk, generating if absent."""
    if not os.path.exists(_public_key_path()):
        _generate_key_pair()

    with open(_public_key_path(), "rb") as f:
        return serialization.load_pem_public_key(f.read())


def sign_data(data: bytes) -> str:
    """
    Sign data with the server's RSA private key.

    Returns a Base64-encoded signature string.
    Uses PKCS1v15 padding with SHA-256 hash.
    """
    private_key = _load_private_key()
    signature = private_key.sign(
        data,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def verify_signature(data: bytes, signature_b64: str) -> bool:
    """
    Verify a signature against data using the server's RSA public key.

    Returns True if valid, False if tampered or invalid.
    """
    try:
        public_key = _load_public_key()
        signature = base64.b64decode(signature_b64)
        public_key.verify(
            signature,
            data,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, Exception):
        return False


def get_public_key_pem() -> str:
    """Return the public key as a PEM string (for display/export)."""
    with open(_public_key_path(), "r") as f:
        return f.read()
