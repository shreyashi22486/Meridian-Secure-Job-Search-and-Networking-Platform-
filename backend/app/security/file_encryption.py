"""
File encryption at rest using Fernet (symmetric, authenticated encryption).

Why Fernet:
- AES-128-CBC with HMAC-SHA256 — provides both confidentiality and integrity
- Authenticated encryption prevents tampering with encrypted files
- Built into the `cryptography` library (no extra dependencies)

What it prevents: Data breach exposure — even if an attacker gains access
to the file system, resumes remain encrypted and unreadable.

Course requirement: "All resumes must be encrypted at rest."
"""

from cryptography.fernet import Fernet, InvalidToken
from app.config import settings


class FileEncryptionError(Exception):
    """Raised when encryption or decryption fails."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def _get_fernet() -> Fernet:
    """Get Fernet instance using the file encryption key from config."""
    try:
        return Fernet(settings.FILE_ENCRYPTION_KEY.encode())
    except Exception:
        raise FileEncryptionError("Invalid file encryption key in configuration")


def encrypt_file(plaintext_data: bytes) -> bytes:
    """
    Encrypt file content.

    The Fernet token includes:
    - Version byte
    - Timestamp (when encrypted)
    - IV (random, unique per encryption)
    - Ciphertext (AES-128-CBC)
    - HMAC-SHA256 (covers all of the above)

    Returns encrypted bytes.
    """
    try:
        fernet = _get_fernet()
        return fernet.encrypt(plaintext_data)
    except FileEncryptionError:
        raise
    except Exception as e:
        raise FileEncryptionError(f"Encryption failed: {str(e)}")


def decrypt_file(encrypted_data: bytes) -> bytes:
    """
    Decrypt file content.

    Fernet.decrypt() verifies the HMAC before decrypting,
    ensuring the ciphertext has not been tampered with.

    Raises FileEncryptionError if decryption or integrity check fails.
    """
    try:
        fernet = _get_fernet()
        return fernet.decrypt(encrypted_data)
    except InvalidToken:
        raise FileEncryptionError(
            "Decryption failed: file may have been tampered with or key mismatch"
        )
    except FileEncryptionError:
        raise
    except Exception as e:
        raise FileEncryptionError(f"Decryption failed: {str(e)}")
