"""
Job posting router — CRUD and search for job listings.

Security features:
- Only company admins can create/update/delete jobs
- Public search with parameterized queries (SQL injection safe)
- All mutations are audit-logged
- Input sanitization via Pydantic schemas
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.company import Company, CompanyAdmin
from app.models.job import Job, WorkType, JobType
from app.schemas.job import (
    CreateJobRequest,
    UpdateJobRequest,
    JobResponse,
    JobListResponse,
)
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


def _job_response(job: Job) -> JobResponse:
    """Build a JobResponse from an ORM Job object."""
    return JobResponse(
        id=str(job.id),
        company_id=str(job.company_id),
        company_name=job.company.name if job.company else "Unknown",
        title=job.title,
        description=job.description,
        required_skills=job.required_skills or [],
        location=job.location,
        work_type=job.work_type.value if job.work_type else None,
        job_type=job.job_type.value if job.job_type else None,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        application_deadline=job.application_deadline,
        is_active=job.is_active,
        posted_by=str(job.posted_by) if job.posted_by else None,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _check_company_admin(db: DBSession, company_id, user: User):
    """Raise 403 if user is not a company admin or platform admin."""
    if user.role.value == "admin":
        return
    ca = db.query(CompanyAdmin).filter(
        CompanyAdmin.company_id == company_id,
        CompanyAdmin.user_id == user.id,
    ).first()
    if not ca:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to manage jobs for this company",
        )


# ─── CRUD ───────────────────────────────────────────────────────────────


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    data: CreateJobRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new job posting. Must be a company admin."""
    # Verify company exists
    company = db.query(Company).filter(Company.id == data.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    _check_company_admin(db, data.company_id, current_user)

    job = Job(
        company_id=data.company_id,
        title=data.title,
        description=data.description,
        required_skills=data.required_skills or [],
        location=data.location,
        work_type=WorkType(data.work_type) if data.work_type else None,
        job_type=JobType(data.job_type) if data.job_type else None,
        salary_min=data.salary_min,
        salary_max=data.salary_max,
        application_deadline=data.application_deadline,
        posted_by=current_user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    log_audit(db, "job_posted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"job_id": str(job.id), "title": job.title,
                        "company_id": data.company_id})

    return _job_response(job)


@router.get("/", response_model=JobListResponse)
async def search_jobs(
    skip: int = 0,
    limit: int = 20,
    keyword: Optional[str] = None,
    location: Optional[str] = None,
    work_type: Optional[str] = None,
    job_type: Optional[str] = None,
    skills: Optional[str] = None,  # comma-separated
    min_salary: Optional[int] = None,
    company_id: Optional[str] = None,
    db: DBSession = Depends(get_db),
):
    """
    Search and filter job postings. Public endpoint.
    All queries use parameterized SQLAlchemy filters (SQL injection safe).
    """
    query = db.query(Job).filter(Job.is_active.is_(True))

    # Keyword search in title and description
    if keyword:
        search_term = f"%{keyword}%"
        query = query.filter(
            or_(
                Job.title.ilike(search_term),
                Job.description.ilike(search_term),
            )
        )

    # Location filter
    if location:
        query = query.filter(Job.location.ilike(f"%{location}%"))

    # Work type filter
    if work_type:
        try:
            query = query.filter(Job.work_type == WorkType(work_type))
        except ValueError:
            pass

    # Job type filter
    if job_type:
        try:
            query = query.filter(Job.job_type == JobType(job_type))
        except ValueError:
            pass

    # Skills filter (check if any of the requested skills are in the job's required_skills)
    if skills:
        skill_list = [s.strip().lower() for s in skills.split(",") if s.strip()]
        for skill in skill_list:
            # Use JSONB containment operator — checks if the array contains the skill
            query = query.filter(
                Job.required_skills.op("@>")(f'["{skill}"]')
            )

    # Salary filter
    if min_salary:
        query = query.filter(
            or_(
                Job.salary_min >= min_salary,
                Job.salary_max >= min_salary,
            )
        )

    # Company filter
    if company_id:
        query = query.filter(Job.company_id == company_id)

    total = query.count()
    jobs = query.order_by(Job.created_at.desc()).offset(skip).limit(min(limit, 100)).all()

    return JobListResponse(
        jobs=[_job_response(j) for j in jobs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: DBSession = Depends(get_db),
):
    """Get job details. Public endpoint."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return _job_response(job)


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: str,
    data: UpdateJobRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a job posting. Only company admins can update."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Only company admins, platform admins, or the original poster can update
    is_poster = (job.posted_by == current_user.id)
    if not is_poster:
        _check_company_admin(db, job.company_id, current_user)

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Convert enum strings to enum values
    if "work_type" in update_data and update_data["work_type"] is not None:
        update_data["work_type"] = WorkType(update_data["work_type"])
    if "job_type" in update_data and update_data["job_type"] is not None:
        update_data["job_type"] = JobType(update_data["job_type"])

    for field, value in update_data.items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)

    log_audit(db, "job_updated", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"job_id": job_id, "fields": list(update_data.keys())})

    return _job_response(job)


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a job posting. Only company admins can delete."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Only company admins, platform admins, or the original poster can delete
    is_poster = (job.posted_by == current_user.id)
    if not is_poster:
        _check_company_admin(db, job.company_id, current_user)

    job_title = job.title
    company_id = str(job.company_id)
    db.delete(job)
    db.commit()

    log_audit(db, "job_deleted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"job_id": job_id, "title": job_title,
                        "company_id": company_id})

    return {"message": "Job posting deleted"}
