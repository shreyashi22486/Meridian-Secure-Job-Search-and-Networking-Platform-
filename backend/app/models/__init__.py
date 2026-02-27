# Import all models so SQLAlchemy's Base.metadata is fully populated.
# This ensures create_all() creates every table on startup.
from app.models.user import User, UserRole         # noqa: F401
from app.models.session import Session             # noqa: F401
from app.models.resume import Resume               # noqa: F401
from app.models.audit_log import AuditLog          # noqa: F401
from app.models.education import UserEducation     # noqa: F401
from app.models.experience import UserExperience   # noqa: F401
from app.models.skill import UserSkill             # noqa: F401
