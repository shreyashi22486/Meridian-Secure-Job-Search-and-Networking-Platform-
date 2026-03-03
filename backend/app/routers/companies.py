"""
Company router — CRUD for company pages.

Security features:
- Only recruiters/admins can create companies
- Only company admins can update/delete
- All actions are audit-logged
- Input sanitization via Pydantic schemas
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.company import Company, CompanyAdmin, CompanyAdminRole
from app.schemas.company import (
    CreateCompanyRequest,
    UpdateCompanyRequest,
    CompanyResponse,
    CompanyListResponse,
    AddCompanyAdminRequest,
)
from app.dependencies import get_current_user, require_recruiter_or_admin
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/companies", tags=["Companies"])


def _company_response(company: Company) -> CompanyResponse:
    """Build a CompanyResponse from an ORM Company object."""
    return CompanyResponse(
        id=str(company.id),
        name=company.name,
        description=company.description,
        location=company.location,
        website=company.website,
        logo_url=None,  # TODO: company logo serving
        created_by=str(company.created_by) if company.created_by else None,
        job_count=len(company.jobs) if company.jobs else 0,
        created_at=company.created_at,
        updated_at=company.updated_at,
    )


def _is_company_admin(db: DBSession, company_id, user: User) -> bool:
    """Check if a user is an admin of the company (or platform admin)."""
    if user.role.value == "admin":
        return True
    ca = db.query(CompanyAdmin).filter(
        CompanyAdmin.company_id == company_id,
        CompanyAdmin.user_id == user.id,
    ).first()
    return ca is not None


def _is_company_owner(db: DBSession, company_id, user: User) -> bool:
    """Check if user is the owner of the company (or platform admin)."""
    if user.role.value == "admin":
        return True
    ca = db.query(CompanyAdmin).filter(
        CompanyAdmin.company_id == company_id,
        CompanyAdmin.user_id == user.id,
        CompanyAdmin.role == CompanyAdminRole.OWNER,
    ).first()
    return ca is not None


# ─── CRUD ───────────────────────────────────────────────────────────────


@router.post("/", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    data: CreateCompanyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_recruiter_or_admin),
):
    """Create a new company. The creator becomes the company owner."""
    # Check for duplicate name
    existing = db.query(Company).filter(Company.name == data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A company with this name already exists",
        )

    company = Company(
        name=data.name,
        description=data.description,
        location=data.location,
        website=data.website,
        created_by=current_user.id,
    )
    db.add(company)
    db.flush()  # Get the company ID

    # Creator is automatically the owner
    company_admin = CompanyAdmin(
        company_id=company.id,
        user_id=current_user.id,
        role=CompanyAdminRole.OWNER,
    )
    db.add(company_admin)
    db.commit()
    db.refresh(company)

    log_audit(db, "company_created", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"company_id": str(company.id), "name": company.name})

    return _company_response(company)


@router.get("/", response_model=CompanyListResponse)
async def list_companies(
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = None,
    db: DBSession = Depends(get_db),
):
    """List companies. Public endpoint with optional search."""
    query = db.query(Company)

    if search:
        query = query.filter(Company.name.ilike(f"%{search}%"))

    total = query.count()
    companies = query.order_by(Company.created_at.desc()).offset(skip).limit(min(limit, 100)).all()

    return CompanyListResponse(
        companies=[_company_response(c) for c in companies],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: str,
    db: DBSession = Depends(get_db),
):
    """Get company details. Public endpoint."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    return _company_response(company)


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    data: UpdateCompanyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a company. Only company admins can update."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    if not _is_company_admin(db, company_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to manage this company",
        )

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Check name uniqueness if being changed
    if "name" in update_data and update_data["name"] != company.name:
        existing = db.query(Company).filter(Company.name == update_data["name"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A company with this name already exists",
            )

    for field, value in update_data.items():
        setattr(company, field, value)

    db.commit()
    db.refresh(company)

    log_audit(db, "company_updated", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"company_id": company_id, "fields": list(update_data.keys())})

    return _company_response(company)


@router.delete("/{company_id}")
async def delete_company(
    company_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a company. Only the company owner or platform admin can delete."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    if not _is_company_owner(db, company_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the company owner can delete this company",
        )

    company_name = company.name
    db.delete(company)
    db.commit()

    log_audit(db, "company_deleted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"company_id": company_id, "name": company_name})

    return {"message": "Company and all associated jobs deleted"}


# ─── Company Admin Management ──────────────────────────────────────────


@router.post("/{company_id}/admins")
async def add_company_admin(
    company_id: str,
    data: AddCompanyAdminRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a user as a company admin. Only the company owner can do this."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    if not _is_company_owner(db, company_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the company owner can add admins",
        )

    # Check if user exists
    from app.models.user import User as UserModel
    target_user = db.query(UserModel).filter(UserModel.id == data.user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if already an admin
    existing = db.query(CompanyAdmin).filter(
        CompanyAdmin.company_id == company_id,
        CompanyAdmin.user_id == data.user_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a company admin",
        )

    ca = CompanyAdmin(
        company_id=company_id,
        user_id=data.user_id,
        role=CompanyAdminRole(data.role),
    )
    db.add(ca)
    db.commit()

    log_audit(db, "company_admin_added", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={
                  "company_id": company_id,
                  "target_user": data.user_id,
                  "role": data.role,
              })

    return {"message": f"User added as {data.role}"}


@router.delete("/{company_id}/admins/{user_id}")
async def remove_company_admin(
    company_id: str,
    user_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a company admin. Only the company owner can do this."""
    if not _is_company_owner(db, company_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the company owner can remove admins",
        )

    # Cannot remove yourself if you're the owner
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself as owner",
        )

    ca = db.query(CompanyAdmin).filter(
        CompanyAdmin.company_id == company_id,
        CompanyAdmin.user_id == user_id,
    ).first()
    if not ca:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a company admin",
        )

    db.delete(ca)
    db.commit()

    log_audit(db, "company_admin_removed", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"company_id": company_id, "removed_user": user_id})

    return {"message": "Company admin removed"}
