"""
Resume router — secure PDF upload, listing, download, and deletion.

Security features:
- Multi-layer PDF validation (extension, MIME, magic bytes, content scan)
- Fernet encryption at rest
- UUID-based filenames (no path traversal)
- Files stored outside web root
- Access control on download (owner, recruiter, admin)
"""

import os
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession
from io import BytesIO

from app.database import get_db
from app.models.user import User
from app.models.resume import Resume
from app.schemas.resume import ResumeResponse, ResumeListResponse
from app.security.file_validator import validate_pdf, FileValidationError
from app.security.file_encryption import encrypt_file, decrypt_file, FileEncryptionError
from app.security.pki import sign_data, verify_signature
from app.security.totp import verify_totp
from app.dependencies import get_current_user
from app.utils import get_client_ip, log_audit
from app.security.resume_parser import parse_resume
from app.config import settings

router = APIRouter(prefix="/api/resumes", tags=["Resumes"])


@router.post("/upload", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a PDF resume.

    Pipeline:
    1. Read file content
    2. Validate PDF (extension, MIME, magic bytes, size, malicious content scan)
    3. Encrypt the validated content with Fernet
    4. Write encrypted file to disk with UUID filename
    5. Save metadata to database
    """
    client_ip = get_client_ip(request)

    # Read file content
    content = await file.read()

    # 1. Validate PDF
    try:
        uuid_filename, validated_content = validate_pdf(
            file_content=content,
            filename=file.filename or "unknown.pdf",
            content_type=file.content_type or "unknown",
        )
    except FileValidationError as e:
        log_audit(db, "resume_upload_rejected", user_id=current_user.id,
                  ip_address=client_ip,
                  details={"reason": e.message, "filename": file.filename})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )

    # 2. Encrypt the file content
    try:
        encrypted_content = encrypt_file(validated_content)
    except FileEncryptionError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File processing error",
        )

    # 3. Write encrypted file to disk
    encrypted_filename = f"{uuid_filename}.enc"
    upload_dir = os.path.abspath(settings.UPLOAD_DIR)
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, encrypted_filename)

    try:
        with open(file_path, "wb") as f:
            f.write(encrypted_content)
    except IOError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File storage error",
        )

    # 4. PKI sign the encrypted content
    try:
        file_signature = sign_data(encrypted_content)
    except Exception:
        file_signature = None

    # 5. Parse resume to extract skills (in-memory, never written to disk)
    try:
        extracted_skills = parse_resume(validated_content)
    except Exception:
        extracted_skills = []  # Don't block upload if parsing fails

    # 6. Save metadata
    resume = Resume(
        user_id=current_user.id,
        original_filename=file.filename or "resume.pdf",
        stored_filename=encrypted_filename,
        file_path=file_path,
        file_size=len(validated_content),  # Original size
        encryption_key_id="v1",
        signature=file_signature,
        extracted_skills=extracted_skills,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)

    log_audit(db, "resume_uploaded", user_id=current_user.id,
              ip_address=client_ip,
              details={"resume_id": str(resume.id), "original_name": file.filename,
                       "signed": file_signature is not None,
                       "skills_extracted": len(extracted_skills)})

    return ResumeResponse(
        id=str(resume.id),
        original_filename=resume.original_filename,
        file_size=resume.file_size,
        uploaded_at=resume.uploaded_at,
    )


@router.get("/me", response_model=ResumeListResponse)
async def list_my_resumes(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all resumes uploaded by the current user."""
    resumes = db.query(Resume).filter(Resume.user_id == current_user.id).all()

    return ResumeListResponse(
        resumes=[
            ResumeResponse(
                id=str(r.id),
                original_filename=r.original_filename,
                file_size=r.file_size,
                uploaded_at=r.uploaded_at,
            )
            for r in resumes
        ],
        total=len(resumes),
    )


@router.get("/{resume_id}/download")
async def download_resume(
    resume_id: str,
    request: Request,
    otp_code: str = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download a resume (decrypted on-the-fly).

    Security:
    - ALL users must verify via OTP (high-risk action)
    - PKI signature is verified before serving (tamper detection)

    Access control:
    - Owner can always download
    - Recruiters and admins can download any resume
    - Regular users cannot download others' resumes
    """
    # OTP verification required for ALL downloads (high-risk action)
    if not current_user.is_totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Two-factor authentication must be enabled before downloading resumes",
        )
    if not otp_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OTP verification required for resume download",
        )
    if not verify_totp(current_user.totp_secret, otp_code, str(current_user.id), db):
        log_audit(db, "resume_download_otp_failed", user_id=current_user.id,
                  ip_address=get_client_ip(request),
                  details={"resume_id": resume_id})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid OTP code",
        )

    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found",
        )

    # Access control
    is_owner = str(resume.user_id) == str(current_user.id)
    is_privileged = current_user.role.value in ("recruiter", "admin")

    if not is_owner and not is_privileged:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resume",
        )

    # Read and decrypt
    try:
        with open(resume.file_path, "rb") as f:
            encrypted_content = f.read()

        # Verify PKI signature before decrypting
        if resume.signature:
            if not verify_signature(encrypted_content, resume.signature):
                log_audit(db, "resume_tamper_detected", user_id=current_user.id,
                          ip_address=get_client_ip(request),
                          details={"resume_id": resume_id})
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Resume integrity check failed — file may have been tampered with",
                )

        decrypted_content = decrypt_file(encrypted_content)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume file not found on server",
        )
    except FileEncryptionError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error decrypting resume",
        )

    log_audit(db, "resume_downloaded", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"resume_id": resume_id, "owner_id": str(resume.user_id)})

    # Sanitize filename for Content-Disposition header (A3.3)
    import re
    safe_filename = re.sub(r'[^\w\s\-.]', '_', resume.original_filename)

    return StreamingResponse(
        BytesIO(decrypted_content),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
            "Content-Length": str(len(decrypted_content)),
        },
    )


@router.get("/{resume_id}/verify")
async def verify_resume_integrity(
    resume_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Verify resume integrity without downloading.
    Checks the PKI digital signature against the stored encrypted file.
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if not resume.signature:
        return {"verified": False, "message": "No signature found (uploaded before PKI was enabled)"}

    try:
        with open(resume.file_path, "rb") as f:
            encrypted_content = f.read()
        is_valid = verify_signature(encrypted_content, resume.signature)
    except FileNotFoundError:
        return {"verified": False, "message": "File not found on disk"}
    except Exception:
        return {"verified": False, "message": "Verification error"}

    return {
        "verified": is_valid,
        "message": "Signature valid — file integrity confirmed" if is_valid else "TAMPER DETECTED — file has been modified",
    }


@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a resume. Only the owner or an admin can delete.
    Deletes both the file on disk and the database record.
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found",
        )

    # Access control
    is_owner = str(resume.user_id) == str(current_user.id)
    is_admin = current_user.role.value == "admin"

    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this resume",
        )

    # Delete file from disk
    try:
        if os.path.exists(resume.file_path):
            os.remove(resume.file_path)
    except OSError:
        pass  # Best effort — still delete DB record

    # Delete DB record
    db.delete(resume)
    db.commit()

    log_audit(db, "resume_deleted", user_id=current_user.id,
              ip_address=get_client_ip(request),
              details={"resume_id": resume_id})

    return {"message": "Resume deleted successfully"}
