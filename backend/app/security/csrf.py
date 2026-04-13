"""
CSRF protection using the double-submit cookie pattern.

How it works:
1. GET /api/auth/csrf → server generates a random token, sets it as a cookie
   AND returns it in the response body
2. Client reads the token from the response and includes it in the
   X-CSRF-Token header on all state-changing requests (POST/PUT/DELETE)
3. Middleware compares the header value against the cookie value

Why double-submit cookie:
- No server-side state needed (stateless)
- Works with SPAs (React reads token from response body, not cookie)
- SameSite cookie flag adds defense-in-depth

What it prevents: Cross-Site Request Forgery — an attacker's page cannot
read the CSRF cookie value (same-origin policy) so it cannot forge the header.
"""

import secrets
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint


CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
CSRF_TOKEN_LENGTH = 64  # bytes of entropy

# Methods that require CSRF validation
UNSAFE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

# Paths exempt from CSRF (login needs to work without a prior CSRF token)
CSRF_EXEMPT_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/verify-2fa",  # Protected by temp_token JWT, CSRF redundant
    "/api/auth/refresh",     # Protected by HttpOnly refresh cookie + JTI rotation
    "/api/auth/csrf",
}


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_hex(CSRF_TOKEN_LENGTH)


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Validates CSRF tokens on unsafe methods.
    Compares X-CSRF-Token header against csrf_token cookie.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Only validate on state-changing methods
        if request.method not in UNSAFE_METHODS:
            return await call_next(request)

        # Skip exempt paths
        if request.url.path in CSRF_EXEMPT_PATHS:
            return await call_next(request)

        # Get token from cookie and header
        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)

        # Both must be present and match
        if not cookie_token or not header_token:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing"},
            )

        if not secrets.compare_digest(cookie_token, header_token):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token mismatch"},
            )

        return await call_next(request)
