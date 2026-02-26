"""
Input sanitization to prevent XSS attacks.

Uses bleach to strip all HTML tags and attributes from text inputs.
Applied at the Pydantic schema level via validators.

What it prevents: Stored XSS — malicious scripts embedded in user input
fields that would execute when rendered by other users' browsers.
"""

import bleach


def sanitize_string(value: str) -> str:
    """
    Strip all HTML tags and entities from a string.
    Returns clean text safe for storage and display.
    """
    if not value:
        return value

    # Strip ALL tags — no whitelist (job portal has no legitimate HTML input)
    cleaned = bleach.clean(value, tags=[], attributes={}, strip=True)

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
