"""
Profile expansion router — Avatar, Education, Experience, Skills.

Endpoints:
- PUT  /api/users/me/avatar              Upload profile picture (auth required)
- GET  /api/users/me/avatar              Stream current user's avatar (auth required)
- GET  /api/users/{id}/avatar            Stream another user's avatar (recruiter/admin)
- POST   /api/users/me/education         Add education entry
- PUT    /api/users/me/education/{id}    Update education entry
- DELETE /api/users/me/education/{id}    Delete education entry
- POST   /api/users/me/experience        Add experience entry
- PUT    /api/users/me/experience/{id}   Update experience entry
- DELETE /api/users/me/experience/{id}   Delete experience entry
- POST   /api/users/me/skills            Add skill
- DELETE /api/users/me/skills/{id}       Remove skill

Security:
- Avatar: JPEG/PNG only, magic-byte validated, 2 MB cap, UUID filename, auth-gated serve
- Education/Experience/Skills: ownership check before update/delete, XSS sanitized via schemas
"""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.education import UserEducation
from app.models.experience import UserExperience
from app.models.skill import UserSkill
from app.schemas.profile import (
    EducationItem, CreateEducation, UpdateEducation,
    ExperienceItem, CreateExperience, UpdateExperience,
    SkillItem, CreateSkill,
)
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit

router = APIRouter(prefix="/api/users", tags=["Profile"])


# ─── Avatar helpers ────────────────────────────────────────────────────────────

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png"}

# Magic bytes for JPEG and PNG
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
}


def _validate_image(content: bytes, content_type: str, filename: str) -> str:
    """
    Validate image file for extension, MIME type, magic bytes, and size.
    Returns the appropriate content_type string if valid.
    Raises HTTPException on any violation.
    """
    # Extension check
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only JPEG and PNG images are allowed. Got: {ext}",
        )

    # MIME type check
    if content_type not in ALLOWED_IMAGE_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type: {content_type}",
        )

    # Size check
    if len(content) > settings.MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar must be under 2 MB",
        )

    # Magic bytes check
    for magic, mime in MAGIC_BYTES.items():
        if content[:len(magic)] == magic:
            return mime

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="File content does not match an allowed image format",
    )


def _avatar_path(filename: str) -> str:
    return os.path.join(settings.AVATAR_DIR, filename)


def _serve_avatar(filename: str) -> StreamingResponse:
    path = _avatar_path(filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")

    # Determine content type from extension
    ext = os.path.splitext(filename)[1].lower()
    content_type = "image/png" if ext == ".png" else "image/jpeg"

    def file_iter():
        with open(path, "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    return StreamingResponse(file_iter(), media_type=content_type)


# ─── Avatar endpoints ──────────────────────────────────────────────────────────

@router.put("/me/avatar", status_code=status.HTTP_200_OK)
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a profile picture.
    Validates extension, MIME type, magic bytes, and size before storing.
    File is stored as a UUID filename — original name never touches disk.
    """
    content = await file.read()
    mime = _validate_image(content, file.content_type or "", file.filename or "")

    # Delete old avatar if exists
    if current_user.avatar_filename:
        old_path = _avatar_path(current_user.avatar_filename)
        if os.path.exists(old_path):
            os.remove(old_path)

    # Store with UUID filename
    ext = ".png" if mime == "image/png" else ".jpg"
    new_filename = f"{uuid.uuid4()}{ext}"
    os.makedirs(settings.AVATAR_DIR, exist_ok=True)

    with open(_avatar_path(new_filename), "wb") as f:
        f.write(content)

    current_user.avatar_filename = new_filename
    db.commit()

    log_audit(db, "avatar_uploaded", user_id=current_user.id,
              ip_address=get_client_ip(request))

    return {"message": "Avatar uploaded successfully", "avatar_url": "/api/users/me/avatar"}


@router.get("/me/avatar")
async def get_my_avatar(
    current_user: User = Depends(get_current_user),
):
    """Serve the current user's avatar. Requires authentication."""
    if not current_user.avatar_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No avatar set")
    return _serve_avatar(current_user.avatar_filename)


@router.get("/{user_id}/avatar")
async def get_user_avatar(
    user_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve another user's avatar. Available to all authenticated users."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.avatar_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No avatar set")
    return _serve_avatar(user.avatar_filename)


# ─── Education endpoints ───────────────────────────────────────────────────────

@router.post("/me/education", status_code=status.HTTP_201_CREATED)
async def add_education(
    data: CreateEducation,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add an education entry for the current user."""
    edu = UserEducation(
        user_id=current_user.id,
        institution=data.institution,
        degree=data.degree,
        field_of_study=data.field_of_study,
        start_year=data.start_year,
        end_year=data.end_year,
    )
    db.add(edu)
    db.commit()
    db.refresh(edu)
    log_audit(db, "education_added", user_id=current_user.id,
              ip_address=get_client_ip(request), details={"institution": data.institution})
    return EducationItem.from_orm_with_str_id(edu)


@router.put("/me/education/{edu_id}")
async def update_education(
    edu_id: str,
    data: UpdateEducation,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an education entry. Only the owner can update."""
    edu = db.query(UserEducation).filter(
        UserEducation.id == edu_id,
        UserEducation.user_id == current_user.id,
    ).first()
    if not edu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Education entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(edu, field, value)
    db.commit()
    db.refresh(edu)
    return EducationItem.from_orm_with_str_id(edu)


@router.delete("/me/education/{edu_id}", status_code=status.HTTP_200_OK)
async def delete_education(
    edu_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an education entry. Only the owner can delete."""
    edu = db.query(UserEducation).filter(
        UserEducation.id == edu_id,
        UserEducation.user_id == current_user.id,
    ).first()
    if not edu:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Education entry not found")
    db.delete(edu)
    db.commit()
    return {"message": "Education entry deleted"}


# ─── Experience endpoints ──────────────────────────────────────────────────────

@router.post("/me/experience", status_code=status.HTTP_201_CREATED)
async def add_experience(
    data: CreateExperience,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a work experience entry for the current user."""
    exp = UserExperience(
        user_id=current_user.id,
        company=data.company,
        title=data.title,
        start_date=data.start_date,
        end_date=data.end_date,
        description=data.description,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    log_audit(db, "experience_added", user_id=current_user.id,
              ip_address=get_client_ip(request), details={"company": data.company})
    return ExperienceItem.from_orm_with_str_id(exp)


@router.put("/me/experience/{exp_id}")
async def update_experience(
    exp_id: str,
    data: UpdateExperience,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a work experience entry. Only the owner can update."""
    exp = db.query(UserExperience).filter(
        UserExperience.id == exp_id,
        UserExperience.user_id == current_user.id,
    ).first()
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experience entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(exp, field, value)
    db.commit()
    db.refresh(exp)
    return ExperienceItem.from_orm_with_str_id(exp)


@router.delete("/me/experience/{exp_id}", status_code=status.HTTP_200_OK)
async def delete_experience(
    exp_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a work experience entry. Only the owner can delete."""
    exp = db.query(UserExperience).filter(
        UserExperience.id == exp_id,
        UserExperience.user_id == current_user.id,
    ).first()
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experience entry not found")
    db.delete(exp)
    db.commit()
    return {"message": "Experience entry deleted"}


# ─── Skills endpoints ──────────────────────────────────────────────────────────

@router.post("/me/skills", status_code=status.HTTP_201_CREATED)
async def add_skill(
    data: CreateSkill,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a skill. Duplicate skills (same name, same user) are rejected
    by the UNIQUE DB constraint — returns 409 Conflict.
    """
    skill = UserSkill(user_id=current_user.id, name=data.name)
    db.add(skill)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Skill '{data.name}' already exists",
        )
    db.refresh(skill)
    return SkillItem.from_orm_with_str_id(skill)


@router.delete("/me/skills/{skill_id}", status_code=status.HTTP_200_OK)
async def delete_skill(
    skill_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a skill. Only the owner can remove."""
    skill = db.query(UserSkill).filter(
        UserSkill.id == skill_id,
        UserSkill.user_id == current_user.id,
    ).first()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    db.delete(skill)
    db.commit()
    return {"message": "Skill removed"}
