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


def _job_response(job: Job, include_poster: bool = False) -> JobResponse:
    """Build a JobResponse from an ORM Job object.
    
    Args:
        include_poster: If True, include posted_by UUID. Only set True
                       when the requesting user is the poster or a platform admin.
    """
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
        posted_by=str(job.posted_by) if include_poster and job.posted_by else None,
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
    status: Optional[str] = "active",
    min_salary: Optional[int] = None,
    company_id: Optional[str] = None,
    db: DBSession = Depends(get_db),
):
    """
    Search and filter job postings. Public endpoint.
    All queries use parameterized SQLAlchemy filters (SQL injection safe).
    """
    query = db.query(Job)
    
    # Status filter logic
    if company_id:
        # If searching for a specific company, default to showing everything 
        # unless a specific status is requested.
        effective_status = status if status in ["active", "inactive"] else "all"
    else:
        effective_status = status or "active"

    if effective_status == "active":
        query = query.filter(Job.is_active.is_(True))
    elif effective_status == "inactive":
        query = query.filter(Job.is_active.is_(False))
    # 'all' means no filter on is_active

    # Keyword search in title and description
    if keyword:
        from app.routers.users import _escape_ilike
        safe_keyword = _escape_ilike(keyword)
        search_term = f"%{safe_keyword}%"
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


@router.get("/recommended")
async def recommended_jobs(
    limit: int = 20,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return active jobs ranked by skill match against the user's resume skills.

    Algorithm:
    1. Collect all extracted_skills from the user's resumes (union)
    2. Fetch all active jobs with required_skills
    3. Compute match_percent = (matched / total_required) * 100
    4. Return sorted by match_percent descending (only jobs with > 0% match)
    """
    from app.models.resume import Resume

    # 1. Gather user's skills from all their resumes
    resumes = db.query(Resume).filter(Resume.user_id == current_user.id).all()
    user_skills: set[str] = set()
    for r in resumes:
        if r.extracted_skills:
            user_skills.update(s.lower() for s in r.extracted_skills)

    if not user_skills:
        return {"jobs": [], "user_skills": [], "total": 0}

    # 2. Fetch all active jobs that have required_skills
    jobs = db.query(Job).filter(
        Job.is_active.is_(True),
        Job.required_skills.isnot(None),
    ).all()

    # 3. Compute match scores
    scored_jobs = []
    for job in jobs:
        required = [s.lower() for s in (job.required_skills or [])]
        if not required:
            continue
        matched = [s for s in required if s in user_skills]
        match_percent = round(len(matched) / len(required) * 100)
        if match_percent > 0:
            job_data = _job_response(job).model_dump()
            job_data["match_percent"] = match_percent
            job_data["matched_skills"] = matched
            job_data["total_required"] = len(required)
            scored_jobs.append(job_data)

    # 4. Sort by match_percent descending
    scored_jobs.sort(key=lambda x: x["match_percent"], reverse=True)

    return {
        "jobs": scored_jobs[:limit],
        "user_skills": sorted(user_skills),
        "total": len(scored_jobs),
    }


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
):
    """Get job details. Public endpoint with optional auth for ownership info."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    # Attempt optional authentication to determine ownership
    include_poster = False
    token = request.cookies.get("access_token")
    if token:
        try:
            from app.security.jwt import decode_token
            payload = decode_token(token)
            user_id = payload.get("sub")
            if user_id:
                viewer = db.query(User).filter(User.id == user_id).first()
                if viewer:
                    # Show posted_by if viewer is the poster or a platform admin
                    if (job.posted_by and str(job.posted_by) == str(viewer.id)) or \
                       viewer.role.value == "admin":
                        include_poster = True
        except Exception:
            pass  # Not authenticated — that's fine, it's a public endpoint
    return _job_response(job, include_poster=include_poster)


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: str,
    data: UpdateJobRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a job posting. Only the original poster or platform admin can update."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Platform admins can edit any job; otherwise only the poster can
    if current_user.role.value != "admin" and job.posted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the person who posted this job can edit it",
        )

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
    """Delete a job posting. Only platform admins can delete (fraud prevention)."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Only platform admins can delete jobs (fraud prevention)
    if current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform administrators can delete job postings",
        )

    job_title = job.title
    company_id = str(job.company_id)
    db.delete(job)
    db.commit()

    log_audit(db, "job_deleted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"job_id": job_id, "title": job_title,
                        "company_id": company_id})

    return {"message": "Job posting deleted"}
