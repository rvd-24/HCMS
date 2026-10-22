import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import NOT_BOOKED_STATUSES, Appointment, Department, Doctor, User
from ...security import hash_password
from ...services.records import audit
from ..deps import current_user, require_admin, require_role
from ..schemas import DoctorIn, DoctorPatch, DoctorStatusIn
from ..serializers import doctor_out

router = APIRouter(prefix="/doctors", tags=["doctors"])


def _department(db: Session, name: Optional[str]) -> Optional[Department]:
    if not name or not name.strip():
        return None
    dept = db.scalar(select(Department).where(func.lower(Department.name) == name.strip().lower()))
    if not dept:
        dept = Department(name=name.strip())
        db.add(dept)
        db.flush()
    return dept


@router.get("")
def list_doctors(include_inactive: bool = False, _: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Doctor).order_by(Doctor.full_name)
    if not include_inactive:
        stmt = stmt.where(Doctor.is_active)
    doctors = list(db.scalars(stmt).unique())
    start = datetime.datetime.combine(datetime.date.today(), datetime.time.min)
    counts = dict(db.execute(
        select(Appointment.doctor_id, func.count()).where(
            Appointment.start_at >= start,
            Appointment.start_at < start + datetime.timedelta(days=1),
            Appointment.status.not_in(NOT_BOOKED_STATUSES),
        ).group_by(Appointment.doctor_id)
    ).all())
    return [doctor_out(d, today_count=counts.get(d.id, 0)) for d in doctors]


@router.get("/departments")
def list_departments(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": d.id, "name": d.name} for d in db.scalars(select(Department).order_by(Department.name))]


@router.post("", status_code=201)
def create_doctor(body: DoctorIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = body.model_dump(exclude={"department", "create_login", "login_email", "login_password"})
    doctor = Doctor(**data, department=_department(db, body.department))
    db.add(doctor)
    db.flush()
    if body.create_login:
        login_email = (body.login_email or body.email or "").strip().lower()
        if not login_email or not body.login_password:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A login needs an email and a password (8+ characters)")
        if db.scalar(select(User).where(func.lower(User.email) == login_email)):
            raise HTTPException(status.HTTP_409_CONFLICT, f"{login_email} already has a login")
        db.add(User(email=login_email, full_name=doctor.full_name, role="doctor",
                    password_hash=hash_password(body.login_password), doctor_id=doctor.id))
    audit(db, user, "doctor.created", "doctor", doctor.id, doctor.full_name)
    db.commit()
    db.refresh(doctor)
    return doctor_out(doctor)


@router.patch("/{doctor_id}")
def update_doctor(doctor_id: str, body: DoctorPatch, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")
    changes = body.model_dump(exclude_unset=True)
    if "department" in changes:
        doctor.department = _department(db, changes.pop("department"))
    for key, value in changes.items():
        setattr(doctor, key, value)
    audit(db, user, "doctor.updated", "doctor", doctor.id, ", ".join(body.model_dump(exclude_unset=True)))
    db.commit()
    return doctor_out(doctor)


@router.post("/me/status")
def set_my_status(body: DoctorStatusIn, user: User = Depends(require_role("doctor")), db: Session = Depends(get_db)):
    doctor = db.get(Doctor, user.doctor_id) if user.doctor_id else None
    if not doctor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This login isn't linked to a doctor profile")
    doctor.status = body.status
    db.commit()
    return doctor_out(doctor)
