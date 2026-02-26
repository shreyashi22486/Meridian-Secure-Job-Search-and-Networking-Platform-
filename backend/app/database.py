"""
Database engine, session factory, and base model.

Security rationale: Using SQLAlchemy ORM exclusively prevents SQL injection.
Connection pooling with overflow limits prevents resource exhaustion.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


# pool_pre_ping: verifies connections before use (handles stale connections)
# pool_size=10, max_overflow=20: limits concurrent DB connections
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def get_db():
    """
    FastAPI dependency that yields a DB session and ensures cleanup.
    Usage: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
