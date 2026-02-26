"""
FastAPI application entry point.

Assembles all middleware, routers, and startup/shutdown events.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.security.headers import SecurityHeadersMiddleware
from app.security.csrf import CSRFMiddleware
from app.security.rate_limiter import RateLimitMiddleware
from app.routers import auth, users, resumes, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: create tables and upload directory
    Base.metadata.create_all(bind=engine)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title=settings.APP_NAME,
    description="Nexora — The Future of Secure Hiring",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,   # Disable in production
    redoc_url="/api/redoc" if settings.DEBUG else None,
)


# ─── MIDDLEWARE (order matters: last added = first executed) ─────────────

# 1. CORS — must be outermost for preflight requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,  # Required for cookies
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
    expose_headers=["X-RateLimit-Remaining"],
)

# 2. Security headers
app.add_middleware(SecurityHeadersMiddleware)

# 3. Rate limiting
app.add_middleware(RateLimitMiddleware)

# 4. CSRF protection
app.add_middleware(CSRFMiddleware)


# ─── ROUTERS ─────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(resumes.router)
app.include_router(admin.router)


# ─── HEALTH CHECK ────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "app": settings.APP_NAME}
