"""User accounts, audit log and integration status — admin only."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...config import get_settings
from ...db import get_db
from ...db.models import AuditEvent, Doctor, User
from ...integrations.dispatch import channel_status
from ...integrations.google import google_configured
from ...security import hash_password
from ...services.records import audit
from ..deps import current_user, require_admin
from ..schemas import UserIn, UserPatch
from ..serializers import audit_out, user_out

router = APIRouter(tags=["admin"])


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.role, User.full_name)).unique()]


def _check_doctor_link(db: Session, role: str, doctor_id, ignore_user_id=None):
    if role == "doctor" and not doctor_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Doctor logins must be linked to a doctor profile")
    if doctor_id:
        if not db.get(Doctor, doctor_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")
        taken = db.scalar(select(User).where(User.doctor_id == doctor_id, User.id != ignore_user_id))
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT, f"That doctor already has a login ({taken.email})")


@router.post("/users", status_code=201)
def create_user(body: UserIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{email} already has a login")
    doctor_id = body.doctor_id if body.role == "doctor" else None
    _check_doctor_link(db, body.role, doctor_id)
    user = User(email=email, full_name=body.full_name, role=body.role,
                password_hash=hash_password(body.password), doctor_id=doctor_id)
    db.add(user)
    db.flush()
    audit(db, admin, "user.created", "user", user.id, f"{email} ({body.role})")
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    changes = body.model_dump(exclude_unset=True)
    if user.id == admin.id and (changes.get("is_active") is False or changes.get("role", "admin") != "admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't disable or demote your own account")
    role = changes.get("role", user.role)
    doctor_id = changes.get("doctor_id", user.doctor_id) if role == "doctor" else None
    _check_doctor_link(db, role, doctor_id, ignore_user_id=user.id)
    if "password" in changes:
        user.password_hash = hash_password(changes.pop("password"))
    changes.pop("doctor_id", None)
    for key, value in changes.items():
        setattr(user, key, value)
    user.doctor_id = doctor_id
    audit(db, admin, "user.updated", "user", user.id, ", ".join(body.model_dump(exclude_unset=True)))
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.get("/audit")
def audit_log(limit: int = Query(100, le=1000), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit)).unique()
    return [audit_out(e) for e in rows]


@router.get("/system/status")
def system_status(_: User = Depends(current_user)):
    settings = get_settings()
    return {
        "clinic_name": settings.clinic_name,
        "timezone": settings.clinic_timezone,
        "default_slot_minutes": settings.default_slot_minutes,
        "extraction_configured": settings.llm_configured,
        "google_calendar_configured": google_configured(),
        "channels": channel_status(),
        "email_enabled": settings.email_enabled,
        "email_redirect": settings.email_redirect or None,
    }
