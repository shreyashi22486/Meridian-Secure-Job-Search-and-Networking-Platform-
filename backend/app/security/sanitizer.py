"""
Input sanitization to prevent XSS attacks.

Uses nh3 (Rust-based HTML sanitizer) to strip all HTML tags from text inputs.
Applied at the Pydantic schema level via validators.

Migration note: Replaced deprecated bleach with nh3 for long-term maintainability.

What it prevents: Stored XSS — malicious scripts embedded in user input
fields that would execute when rendered by other users' browsers.
"""

import nh3


def sanitize_string(value: str) -> str:
    """
    Strip all HTML tags and entities from a string.
    Returns clean text safe for storage and display.
    """
    if not value:
        return value

    # Strip ALL tags — no whitelist (job portal has no legitimate HTML input)
    cleaned = nh3.clean(value, tags=set())

    # Also strip any null bytes (used in some injection attacks)
    cleaned = cleaned.replace("\x00", "")

    return cleaned.strip()


def sanitize_email(email: str) -> str:
    """
    Sanitize and normalize an email address.
    Lowercase + strip whitespace + remove HTML.
    """
    if not email:
        return email

    return sanitize_string(email).lower().strip()
