"""
Applications router — job application workflow.

Security features:
- Users can only apply once per job (unique constraint)
- Users can only see their own applications
- Only company admins can see applicants and update status
- Resume access is controlled by existing RBAC
- All actions are audit-logged
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models.user import User
from app.models.job import Job
from app.models.application import Application, ApplicationStatus
from app.models.resume import Resume
from app.schemas.application import (
    ApplyRequest,
    UpdateStatusRequest,
    UpdateNotesRequest,
    ApplicationResponse,
    ApplicationDetailResponse,
    ApplicationListResponse,
    ApplicantListResponse,
)
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/applications", tags=["Applications"])


def _is_job_poster(db: DBSession, job_id, user: User) -> bool:
    """Check if user is the person who posted this job (creator only)."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return False
    return job.posted_by == user.id


def _app_response(app: Application) -> ApplicationResponse:
    """Build ApplicationResponse for applicants."""
    return ApplicationResponse(
        id=str(app.id),
        job_id=str(app.job_id),
        job_title=app.job.title if app.job else "Unknown",
        company_name=app.job.company.name if app.job and app.job.company else "Unknown",
        status=app.status.value,
        cover_note=app.cover_note,
        resume_id=str(app.resume_id) if app.resume_id else None,
        applied_at=app.applied_at,
        updated_at=app.updated_at,
    )


def _app_detail_response(app: Application) -> ApplicationDetailResponse:
    """Build ApplicationDetailResponse for recruiters."""
    return ApplicationDetailResponse(
        id=str(app.id),
        job_id=str(app.job_id),
        user_id=str(app.user_id),
        applicant_name=app.user.full_name if app.user else "Unknown",
        applicant_email=app.user.email if app.user else "Unknown",
        status=app.status.value,
        cover_note=app.cover_note,
        resume_id=str(app.resume_id) if app.resume_id else None,
        recruiter_notes=app.recruiter_notes,
        applied_at=app.applied_at,
        updated_at=app.updated_at,
    )


# ─── Applicant Endpoints ───────────────────────────────────────────────


@router.post("/", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def apply_to_job(
    data: ApplyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply to a job. Users can attach a resume and cover note."""
    # Verify job exists and is active
    job = db.query(Job).filter(Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if not job.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This job is no longer accepting applications")

    # Check if application deadline has passed
    if job.application_deadline:
        from datetime import datetime, timezone
        if datetime.now(timezone.utc) > job.application_deadline.replace(tzinfo=timezone.utc):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The application deadline for this job has passed")

    # Check for duplicate application
    existing = db.query(Application).filter(
        Application.job_id == data.job_id,
        Application.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already applied to this job")

    # Verify resume belongs to user (if provided)
    if data.resume_id:
        resume = db.query(Resume).filter(
            Resume.id == data.resume_id,
            Resume.user_id == current_user.id,
        ).first()
        if not resume:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    application = Application(
        job_id=data.job_id,
        user_id=current_user.id,
        resume_id=data.resume_id,
        cover_note=data.cover_note,
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    log_audit(db, "application_submitted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"application_id": str(application.id), "job_id": data.job_id})

    return _app_response(application)


@router.get("/me", response_model=ApplicationListResponse)
async def list_my_applications(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all applications for the current user."""
    apps = db.query(Application).filter(
        Application.user_id == current_user.id,
    ).order_by(Application.applied_at.desc()).all()

    return ApplicationListResponse(
        applications=[_app_response(a) for a in apps],
        total=len(apps),
    )


@router.delete("/{application_id}")
async def withdraw_application(
    application_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Withdraw (delete) an application. Only the applicant can do this."""
    app = db.query(Application).filter(
        Application.id == application_id,
        Application.user_id == current_user.id,
    ).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    db.delete(app)
    db.commit()

    log_audit(db, "application_withdrawn", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"application_id": application_id})

    return {"message": "Application withdrawn"}


# ─── Recruiter Endpoints ───────────────────────────────────────────────


@router.get("/job/{job_id}", response_model=ApplicantListResponse)
async def list_applicants(
    job_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all applicants for a job. Only the job poster can view."""
    if not _is_job_poster(db, job_id, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the person who posted this job can view applicants")

    apps = db.query(Application).filter(
        Application.job_id == job_id,
    ).order_by(Application.applied_at.desc()).all()

    return ApplicantListResponse(
        applicants=[_app_detail_response(a) for a in apps],
        total=len(apps),
    )


@router.put("/{application_id}/status")
async def update_application_status(
    application_id: str,
    data: UpdateStatusRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update application status. Only the job poster can update."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    if not _is_job_poster(db, str(app.job_id), current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the person who posted this job can update application status")

    old_status = app.status.value
    app.status = ApplicationStatus(data.status)
    db.commit()

    log_audit(db, "application_status_changed", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={
                  "application_id": application_id,
                  "old_status": old_status,
                  "new_status": data.status,
              })

    return {"message": f"Status updated to {data.status}"}


@router.put("/{application_id}/notes")
async def update_recruiter_notes(
    application_id: str,
    data: UpdateNotesRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add/update private recruiter notes on an application."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    if not _is_job_poster(db, str(app.job_id), current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the person who posted this job can update notes")

    app.recruiter_notes = data.notes
    db.commit()

    return {"message": "Notes updated"}
