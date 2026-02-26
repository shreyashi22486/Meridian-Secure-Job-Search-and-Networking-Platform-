"""
Password hashing and validation using Argon2id.

Why Argon2id:
- Memory-hard: resistant to GPU/ASIC brute-force attacks
- Winner of the Password Hashing Competition (2015)
- Recommended by OWASP for password storage

What it prevents: Credential stuffing, brute-force, rainbow table attacks.
"""

import re
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

# Argon2id with OWASP-recommended parameters
# time_cost=3, memory_cost=65536 (64MB), parallelism=4
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=Type.ID,  # Argon2id
)

# Password policy constants
MIN_PASSWORD_LENGTH = 8
PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?])"
)


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return _hasher.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plaintext password against an Argon2id hash.
    Returns False on mismatch instead of raising — prevents timing leaks
    in error handling.
    """
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def check_needs_rehash(hashed_password: str) -> bool:
    """Check if a hash was created with outdated parameters and needs rehashing."""
    return _hasher.check_needs_rehash(hashed_password)


class PasswordValidationError(Exception):
    """Raised when a password fails policy checks."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def validate_password_strength(password: str) -> None:
    """
    Enforce password policy. Raises PasswordValidationError on failure.

    Policy:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    errors = []

    if len(password) < MIN_PASSWORD_LENGTH:
        errors.append(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")

    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")

    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")

    if not re.search(r"\d", password):
        errors.append("Password must contain at least one digit")

    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password):
        errors.append("Password must contain at least one special character")

    if errors:
        raise PasswordValidationError("; ".join(errors))
