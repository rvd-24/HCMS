import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import Appointment, Doctor, User
from ...services import appointments as svc
from ..deps import current_user, doctor_scope, get_accessible_patient
from ..schemas import AppointmentApproveIn, AppointmentDeclineIn, AppointmentIn, AppointmentPatch, AppointmentStatusIn
from ..serializers import appointment_out

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _get_scoped(db: Session, appointment_id: str, user: User) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    scope = doctor_scope(user)
    if not appointment or (scope and appointment.doctor_id != scope):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appointment not found")
    return appointment


def _doctor_for_booking(db: Session, user: User, doctor_id: Optional[str]) -> Optional[Doctor]:
    scope = doctor_scope(user)
    if scope:
        # Doctors book into their own calendar only.
        if doctor_id and doctor_id != scope:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Doctors can only book their own appointments")
        doctor_id = scope
    if not doctor_id:
        return None
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")
    return doctor


@router.get("")
def list_appointments(
    start: Optional[datetime.date] = None,
    end: Optional[datetime.date] = None,
    doctor_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = None,
    limit: int = Query(500, le=2000),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Appointment)
    scope = doctor_scope(user)
    if scope:
        stmt = stmt.where(Appointment.doctor_id == scope)
    elif doctor_id:
        stmt = stmt.where(Appointment.doctor_id == doctor_id)
    if patient_id:
        stmt = stmt.where(Appointment.patient_id == patient_id)
    if start:
        stmt = stmt.where(Appointment.start_at >= datetime.datetime.combine(start, datetime.time.min))
    if end:
        stmt = stmt.where(Appointment.start_at < datetime.datetime.combine(end + datetime.timedelta(days=1), datetime.time.min))
    if status_filter:
        stmt = stmt.where(Appointment.status.in_(status_filter.split(",")))
    rows = list(db.scalars(stmt.order_by(Appointment.start_at).limit(limit)).unique())
    if q:
        needle = q.lower()
        rows = [a for a in rows if needle in a.patient.full_name.lower() or needle in (a.patient.mrn or "").lower()]
    return [appointment_out(a) for a in rows]


@router.post("", status_code=201)
def create_appointment(
    body: AppointmentIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doctor = _doctor_for_booking(db, user, body.doctor_id)
    if user.role == "doctor":
        patient = get_accessible_patient(body.patient_id, user, db)
    else:
        from ...db.models import Patient

        patient = db.get(Patient, body.patient_id)
        if not patient:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    try:
        appointment = svc.book(
            db, patient, doctor, body.start_at.replace(tzinfo=None), user,
            duration_minutes=body.duration_minutes, reason=body.reason, location=body.location,
            source="prescription" if body.origin_visit_id else "manual",
            origin_visit_id=body.origin_visit_id, allow_overlap=body.allow_overlap, requested=body.request,
        )
    except svc.SlotConflict as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    db.commit()
    # A request is only announced once the doctor approves it.
    if body.notify and not body.request:
        background.add_task(svc.notify_booking, appointment.id)
    return appointment_out(appointment)


@router.get("/{appointment_id}")
def get_appointment(appointment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return appointment_out(_get_scoped(db, appointment_id, user))


@router.patch("/{appointment_id}")
def update_appointment(
    appointment_id: str,
    body: AppointmentPatch,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_scoped(db, appointment_id, user)
    moved = False
    if body.doctor_id is not None and body.doctor_id != appointment.doctor_id:
        doctor = _doctor_for_booking(db, user, body.doctor_id)
        appointment.doctor_id = doctor.id if doctor else None
        moved = True
    if body.start_at or body.duration_minutes:
        start = (body.start_at or appointment.start_at).replace(tzinfo=None)
        minutes = body.duration_minutes or int((appointment.end_at - appointment.start_at).total_seconds() // 60)
        moved = moved or start != appointment.start_at
        appointment.start_at = start
        appointment.end_at = start + datetime.timedelta(minutes=minutes)
    if moved and not body.allow_overlap:
        clash = svc.find_conflict(db, appointment.doctor_id, appointment.start_at, appointment.end_at, ignore_id=appointment.id)
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Clashes with {clash.patient.full_name} at {clash.start_at:%H:%M}")
    for field in ("reason", "location", "notes"):
        value = getattr(body, field)
        if value is not None:
            setattr(appointment, field, value)
    if moved:
        svc.audit(db, user, "appointment.rescheduled", "appointment", appointment.id, f"Now {appointment.start_at:%Y-%m-%d %H:%M}")
    db.commit()
    if moved and body.notify:
        background.add_task(svc.notify_change, appointment.id, "rescheduled")
    return appointment_out(appointment)


@router.post("/{appointment_id}/status")
def change_status(
    appointment_id: str,
    body: AppointmentStatusIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_scoped(db, appointment_id, user)
    svc.set_status(db, appointment, body.status, user, body.reason)
    db.commit()
    if body.status == "cancelled" and body.notify:
        background.add_task(svc.notify_change, appointment.id, "cancelled")
    return appointment_out(appointment)


@router.post("/{appointment_id}/approve")
def approve_request(
    appointment_id: str,
    body: AppointmentApproveIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_scoped(db, appointment_id, user)
    if appointment.status != "requested":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been handled")
    try:
        svc.approve(
            db, appointment, user,
            start_at=body.start_at.replace(tzinfo=None) if body.start_at else None,
            duration_minutes=body.duration_minutes, allow_overlap=body.allow_overlap,
        )
    except svc.SlotConflict as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    db.commit()
    if body.notify:
        background.add_task(svc.notify_booking, appointment.id)
    return appointment_out(appointment)


@router.post("/{appointment_id}/decline")
def decline_request(
    appointment_id: str,
    body: AppointmentDeclineIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_scoped(db, appointment_id, user)
    if appointment.status != "requested":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been handled")
    appointment.status = "cancelled"
    appointment.cancel_reason = body.reason
    svc.audit(db, user, "appointment.declined", "appointment", appointment.id, body.reason or "")
    db.commit()
    if body.notify:
        background.add_task(svc.notify_change, appointment.id, "declined")
    return appointment_out(appointment)


@router.post("/{appointment_id}/notify", status_code=202)
def resend_notification(
    appointment_id: str,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    appointment = _get_scoped(db, appointment_id, user)
    background.add_task(svc.notify_booking, appointment.id)
    return {"queued": True}
