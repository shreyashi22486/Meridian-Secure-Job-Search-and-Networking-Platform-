"""
ProfileView model — tracks who viewed whose profile.

Features:
- One record per viewer per viewed user per day (prevents spam counting)
- Timestamps for analytics
"""

import uuid
from datetime import datetime, date
from sqlalchemy import Column, DateTime, Date, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ProfileView(Base):
    __tablename__ = "profile_views"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    viewer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    viewed_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    viewed_date = Column(Date, default=date.today, nullable=False)
    viewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Only one view record per viewer per viewed user per day
    __table_args__ = (
        UniqueConstraint("viewer_id", "viewed_user_id", "viewed_date",
                         name="uq_profile_view_per_day"),
    )

    viewer = relationship("User", foreign_keys=[viewer_id])
    viewed_user = relationship("User", foreign_keys=[viewed_user_id])

    def __repr__(self) -> str:
        return f"<ProfileView {self.viewer_id} -> {self.viewed_user_id} on {self.viewed_date}>"
