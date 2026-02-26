"""
Security headers middleware.

Adds defense-in-depth HTTP headers to every response.
These headers instruct browsers to enable built-in security mechanisms.
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)

        # Prevent MIME-type sniffing — browser must respect Content-Type
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking — page cannot be embedded in iframes
        response.headers["X-Frame-Options"] = "DENY"

        # Enable browser XSS filter (legacy, but defense-in-depth)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Force HTTPS (even in LAN with self-signed certs)
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        # Content Security Policy — restrict resource loading
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )

        # Control Referer header — don't leak full URL to external sites
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        return response
