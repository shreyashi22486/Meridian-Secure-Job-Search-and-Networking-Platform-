"""
In-memory sliding-window rate limiter.

Why in-memory (no Redis):
- LAN environment constraint — no external dependencies
- Sufficient for single-server deployment
- Automatically resets on server restart (acceptable trade-off)

What it prevents: Brute-force login attempts, OTP guessing, upload abuse.
"""

import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List, Tuple
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint


class SlidingWindowRateLimiter:
    """
    Sliding-window rate limiter keyed by (IP, endpoint_group).

    Each request is timestamped. On check, we count requests within the
    current window and reject if the limit is exceeded.
    """

    MAX_KEYS = 100_000  # Prevent memory exhaustion (A7.4)

    def __init__(self) -> None:
        # {key: [timestamp1, timestamp2, ...]}
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = Lock()

    def is_rate_limited(
        self, key: str, max_requests: int, window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check if the key is rate-limited.

        Returns:
            (is_limited, remaining_requests)
        """
        with self._lock:
            now = time.time()
            window_start = now - window_seconds

            # Clean old entries
            self._requests[key] = [
                t for t in self._requests[key] if t > window_start
            ]

            # Memory cap: evict oldest keys if too many (A7.4)
            if len(self._requests) > self.MAX_KEYS:
                keys_to_remove = sorted(
                    self._requests.keys(),
                    key=lambda k: self._requests[k][-1] if self._requests[k] else 0,
                )[:len(self._requests) // 4]
                for k in keys_to_remove:
                    del self._requests[k]

            current_count = len(self._requests[key])

            if current_count >= max_requests:
                return True, 0

            return False, max_requests - current_count

    def record_request(self, key: str) -> None:
        """Record a request timestamp for the given key."""
        with self._lock:
            self._requests[key].append(time.time())


# Singleton limiter instance
_limiter = SlidingWindowRateLimiter()


# Rate limit configurations per endpoint group
RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    # endpoint_prefix: (max_requests, window_seconds)
    "/api/auth/login": (5, 60),       # 5 per minute
    "/api/auth/verify-2fa": (3, 60),  # 3 per minute
    "/api/auth/register": (5, 60),    # 5 per minute
    "/api/resumes/upload": (10, 60),  # 10 per minute
}

# Default rate limit for all other endpoints
DEFAULT_RATE_LIMIT = (60, 60)  # 60 per minute


def _get_client_ip(request: Request) -> str:
    """
    Extract client IP securely behind a reverse proxy.

    Security: We do NOT blindly trust X-Forwarded-For because any client
    can set it to bypass rate limiting. Instead:
    1. Trust X-Real-IP (set server-side by Nginx, cannot be spoofed)
    2. Fall back to the TCP connection IP (request.client.host)
    """
    # X-Real-IP is set by our Nginx reverse proxy — trustworthy
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fallback: use the actual TCP connection IP
    return request.client.host if request.client else "unknown"


def _get_rate_limit_config(path: str) -> Tuple[int, int]:
    """Get rate limit config for a given path."""
    for prefix, config in RATE_LIMITS.items():
        if path.startswith(prefix):
            return config
    return DEFAULT_RATE_LIMIT


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Applies rate limiting per IP + endpoint group.
    Returns 429 Too Many Requests when limit is exceeded.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ):
        client_ip = _get_client_ip(request)
        path = request.url.path.rstrip("/")  # Normalize trailing slash (A7.3)
        max_requests, window_seconds = _get_rate_limit_config(path)

        key = f"{client_ip}:{path}"

        is_limited, remaining = _limiter.is_rate_limited(key, max_requests, window_seconds)

        if is_limited:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(window_seconds)},
            )

        _limiter.record_request(key)

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining - 1)
        return response


def get_limiter() -> SlidingWindowRateLimiter:
    """Get the singleton rate limiter (for use in tests)."""
    return _limiter
