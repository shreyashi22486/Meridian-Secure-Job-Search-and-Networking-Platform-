"""
PDF file validation with multi-layer security checks.

Validation pipeline:
1. File extension check (.pdf only)
2. MIME type validation (application/pdf)
3. Magic bytes check (first 5 bytes = %PDF-)
4. File size check (max 2 MB)
5. Malicious content scan (JavaScript, auto-actions)
6. UUID-based renaming (prevents path traversal)

What it prevents: Malicious file uploads, path traversal, executable disguised
as PDF, PDF-based JavaScript attacks.
"""

import uuid
from typing import Tuple

import magic

from app.config import settings


class FileValidationError(Exception):
    """Raised when a file fails validation."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


# PDF magic bytes
PDF_MAGIC_BYTES = b"%PDF-"

# Suspicious patterns in PDF content that may indicate malicious payloads
MALICIOUS_PATTERNS = [
    b"/JS",           # JavaScript action
    b"/JavaScript",   # JavaScript dictionary
    b"/Launch",       # Launch action (can execute commands)
    b"/OpenAction",   # Auto-execute on open
    b"/AA",           # Additional actions
    b"/RichMedia",    # Embedded Flash/media
    b"/AcroForm",     # Can contain JavaScript in form fields
]


def validate_pdf(
    file_content: bytes,
    filename: str,
    content_type: str,
) -> Tuple[str, bytes]:
    """
    Validate a file upload as a safe PDF.

    Args:
        file_content: Raw file bytes
        filename: Original filename from client
        content_type: Content-Type header from client

    Returns:
        (new_uuid_filename, validated_content)

    Raises:
        FileValidationError on any validation failure
    """
    # 1. Extension check
    if not filename.lower().endswith(".pdf"):
        raise FileValidationError("Only PDF files are allowed")

    # 2. Content-Type check (client-provided, not trusted alone)
    if content_type not in ("application/pdf", "application/x-pdf"):
        raise FileValidationError("Invalid file type. Only PDF files are allowed")

    # 3. File size check
    if len(file_content) > settings.MAX_UPLOAD_SIZE:
        max_mb = settings.MAX_UPLOAD_SIZE / (1024 * 1024)
        raise FileValidationError(f"File size exceeds maximum allowed size of {max_mb:.0f} MB")

    # 4. Empty file check
    if len(file_content) == 0:
        raise FileValidationError("File is empty")

    # 5. Magic bytes check — most reliable indicator
    if not file_content[:5].startswith(PDF_MAGIC_BYTES):
        raise FileValidationError(
            "File content does not match PDF format. "
            "The file may be disguised as a PDF."
        )

    # 6. MIME type via libmagic (inspects file content, not extension)
    try:
        detected_mime = magic.from_buffer(file_content, mime=True)
        if detected_mime != "application/pdf":
            raise FileValidationError(
                f"File content detected as {detected_mime}, not PDF"
            )
    except Exception as e:
        # If libmagic fails, reject the file (fail-secure)
        raise FileValidationError(f"Could not verify file type: {str(e)}")

    # 7. Malicious content scan
    content_upper = file_content  # PDF keywords are case-sensitive
    threats_found = []
    for pattern in MALICIOUS_PATTERNS:
        if pattern in content_upper:
            threats_found.append(pattern.decode())

    if threats_found:
        raise FileValidationError(
            f"PDF contains potentially malicious content: {', '.join(threats_found)}"
        )

    # 8. Generate UUID filename
    new_filename = f"{uuid.uuid4()}.pdf"

    return new_filename, file_content
