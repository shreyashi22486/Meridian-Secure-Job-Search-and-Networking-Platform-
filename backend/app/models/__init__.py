# Import all models so SQLAlchemy's Base.metadata is fully populated.
# This ensures create_all() creates every table on startup.
from app.models.user import User, UserRole         # noqa: F401
from app.models.session import Session             # noqa: F401
from app.models.resume import Resume               # noqa: F401
from app.models.audit_log import AuditLog          # noqa: F401
from app.models.education import UserEducation     # noqa: F401
from app.models.experience import UserExperience   # noqa: F401
from app.models.skill import UserSkill             # noqa: F401
from app.models.company import Company, CompanyAdmin, CompanyAdminRole  # noqa: F401
from app.models.job import Job, WorkType, JobType   # noqa: F401
from app.models.application import Application, ApplicationStatus  # noqa: F401
from app.models.messaging import Conversation, ConversationMember, Message  # noqa: F401
from app.models.connection import Connection, ConnectionStatus as ConnStatus  # noqa: F401
from app.models.profile_view import ProfileView  # noqa: F401
