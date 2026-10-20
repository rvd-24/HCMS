"""Booking, status changes and notifications for appointments."""
import datetime
import traceback
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import session_scope
from ..db.models import ACTIVE_APPOINTMENT_STATUSES, Appointment, Doctor, Patient, User, Visit, now
from ..integrations.dispatch import send_to_recipient
from ..integrations.google import google_configured
from ..pipeline.extraction import NextVisit
from ..pipeline.notify import notify_follow_up
from .records import (
    audit,
    doctor_recipient,
    patient_recipient,
    prescription_from_visit,
    treatment_history,
    visit_to_dict,
)


class SlotConflict(ValueError):
    pass


def find_conflict(db: Session, doctor_id: Optional[str], start_at, end_at, ignore_id: Optional[str] = None) -> Optional[Appointment]:
    if not doctor_id:
        return None
    stmt = select(Appointment).where(
        Appointment.doctor_id == doctor_id,
        Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
        Appointment.start_at < end_at,
        Appointment.end_at > start_at,
    )
    if ignore_id:
        stmt = stmt.where(Appointment.id != ignore_id)
    return db.scalar(stmt.limit(1))


def book(
    db: Session,
    patient: Patient,
    doctor: Optional[Doctor],
    start_at: datetime.datetime,
    actor: Optional[User],
    duration_minutes: Optional[int] = None,
    reason: Optional[str] = None,
    location: Optional[str] = None,
    source: str = "manual",
    origin_visit_id: Optional[str] = None,
    allow_overlap: bool = False,
) -> Appointment:
    end_at = start_at + datetime.timedelta(minutes=duration_minutes or get_settings().default_slot_minutes)
    if not allow_overlap:
        clash = find_conflict(db, doctor.id if doctor else None, start_at, end_at)
        if clash:
            raise SlotConflict(
                f"{doctor.full_name} already has {clash.patient.full_name} at {clash.start_at:%d %b %H:%M}"
            )
    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id if doctor else None,
        start_at=start_at,
        end_at=end_at,
        reason=reason or "Follow-up",
        location=location or get_settings().clinic_name,
        source=source,
        origin_visit_id=origin_visit_id,
        created_by=actor.id if actor else None,
    )
    db.add(appointment)
    db.flush()
    audit(db, actor, "appointment.booked", "appointment", appointment.id,
          f"{patient.full_name} with {doctor.full_name if doctor else 'unassigned'} on {start_at:%Y-%m-%d %H:%M}")
    return appointment


STATUS_TIMESTAMPS = {"checked_in": "checked_in_at", "completed": "completed_at"}


def set_status(db: Session, appointment: Appointment, status: str, actor: User, reason: Optional[str] = None) -> Appointment:
    appointment.status = status
    stamp = STATUS_TIMESTAMPS.get(status)
    if stamp and not getattr(appointment, stamp):
        setattr(appointment, stamp, now())
    if status == "cancelled":
        appointment.cancel_reason = reason
    audit(db, actor, f"appointment.{status}", "appointment", appointment.id, reason or "")
    return appointment


def _latest_context_visit(db: Session, appointment: Appointment, history: list) -> Optional[Visit]:
    """Which visit leads the 'Most Recent Visit' block: the visit that asked for
    this follow-up if known, else the booked doctor's latest, else the latest
    overall (mirrors schedule_manual_next_visit's doctor_name tie-break)."""
    if appointment.origin_visit_id:
        origin = db.get(Visit, appointment.origin_visit_id)
        if origin:
            return origin
    if not history:
        return None
    own = [v for v in history if v.doctor_id and v.doctor_id == appointment.doctor_id]
    return own[-1] if own else history[-1]


def notify_booking(appointment_id: str) -> None:
    """Background job: calendar invite + multi-channel notification with the
    full treatment history PDF, exactly as the CLI scheduler did."""
    with session_scope() as db:
        appointment = db.get(Appointment, appointment_id)
        if not appointment:
            return
        patient, doctor = appointment.patient, appointment.doctor
        history = treatment_history(db, patient.id, before=appointment.start_at.date())
        if appointment.origin_visit_id and not any(v.id == appointment.origin_visit_id for v in history):
            origin = db.get(Visit, appointment.origin_visit_id)
            if origin:
                history.append(origin)
        latest = _latest_context_visit(db, appointment, history)

        next_visit = NextVisit(
            date=appointment.start_at.date().isoformat(),
            time=appointment.start_at.strftime("%H:%M"),
            reason=appointment.reason,
            location=appointment.location,
        )
        prescription = prescription_from_visit(latest, patient, doctor, next_visit)
        try:
            results = notify_follow_up(
                prescription,
                appointment.start_at,
                appointment.end_at,
                [visit_to_dict(v) for v in history],
                patient_recipient(patient),
                [doctor_recipient(doctor)] if doctor else [],
                exclude_visit_id=latest.id if latest else None,
                create_calendar_event=google_configured(),
            )
        except Exception as error:
            traceback.print_exc()
            results = {"error": f"{type(error).__name__}: {error}"}

        appointment.notification_results = results
        appointment.calendar_event_link = results.get("event_link")
        appointment.notified_at = now()


def notify_change(appointment_id: str, kind: str) -> None:
    """Short text notice for reschedules and cancellations."""
    with session_scope() as db:
        appointment = db.get(Appointment, appointment_id)
        if not appointment:
            return
        patient, doctor = appointment.patient, appointment.doctor
        when = appointment.start_at.strftime("%A, %d %B %Y at %I:%M %p")
        doctor_name = doctor.full_name if doctor else "your doctor"
        if kind == "cancelled":
            subject = f"Appointment cancelled: {patient.full_name}"
            text = f"The appointment for {patient.full_name} with {doctor_name} on {when} has been cancelled."
            if appointment.cancel_reason:
                text += f"\nReason: {appointment.cancel_reason}"
        else:
            subject = f"Appointment rescheduled: {patient.full_name}"
            text = (
                f"The appointment for {patient.full_name} with {doctor_name} has moved to {when}.\n"
                f"Location: {appointment.location or 'TBD'}"
            )
        results = {"patient": send_to_recipient(patient_recipient(patient), subject, text)}
        if doctor:
            results["doctor"] = send_to_recipient(doctor_recipient(doctor), subject, text)
        appointment.notification_results = {**(appointment.notification_results or {}), kind: results}
