import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import ACTIVE_APPOINTMENT_STATUSES, Appointment, Patient, User, Visit
from ...pipeline.history import build_history_pdf
from ...services.records import audit, treatment_history, visit_to_dict
from ..deps import current_user, doctor_scope, get_accessible_patient, require_admin
from ..schemas import PatientIn, PatientPatch
from ..serializers import appointment_out, patient_out, visit_out

router = APIRouter(prefix="/patients", tags=["patients"])


def _patient_stats(db: Session, patient_ids: list) -> dict:
    if not patient_ids:
        return {}
    stats = {pid: {"visit_count": 0, "last_visit_date": None, "next_appointment": None} for pid in patient_ids}
    for pid, count, last in db.execute(
        select(Visit.patient_id, func.count(), func.max(Visit.visit_date))
        .where(Visit.patient_id.in_(patient_ids)).group_by(Visit.patient_id)
    ):
        stats[pid]["visit_count"] = count
        stats[pid]["last_visit_date"] = last.isoformat() if last else None
    upcoming = db.scalars(
        select(Appointment).where(
            Appointment.patient_id.in_(patient_ids),
            Appointment.start_at >= datetime.datetime.now(),
            Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
        ).order_by(Appointment.start_at)
    ).unique()
    for a in upcoming:
        if stats[a.patient_id]["next_appointment"] is None:
            stats[a.patient_id]["next_appointment"] = appointment_out(a)
    return stats


@router.get("")
def list_patients(
    q: Optional[str] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Patient)
    scope = doctor_scope(user)
    if scope:
        stmt = stmt.where(or_(
            Patient.id.in_(select(Visit.patient_id).where(Visit.doctor_id == scope)),
            Patient.id.in_(select(Appointment.patient_id).where(Appointment.doctor_id == scope)),
        ))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Patient.full_name.ilike(like), Patient.mrn.ilike(like), Patient.phone_number.ilike(like), Patient.email.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    patients = list(db.scalars(stmt.order_by(Patient.full_name).limit(limit).offset(offset)))
    stats = _patient_stats(db, [p.id for p in patients])
    return {"total": total, "items": [patient_out(p, **stats[p.id]) for p in patients]}


@router.post("", status_code=201)
def create_patient(body: PatientIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if body.mrn and db.scalar(select(Patient).where(Patient.mrn == body.mrn.strip())):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A patient with ID {body.mrn} already exists")
    patient = Patient(**{**body.model_dump(), "mrn": (body.mrn or "").strip() or None})
    db.add(patient)
    db.flush()
    audit(db, user, "patient.created", "patient", patient.id, patient.full_name)
    db.commit()
    return patient_out(patient)


@router.get("/{patient_id}")
def get_patient(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient = get_accessible_patient(patient_id, user, db)
    stats = _patient_stats(db, [patient.id])[patient.id]
    doctors = db.execute(
        select(Visit.doctor_id, func.count()).where(Visit.patient_id == patient.id, Visit.doctor_id.is_not(None))
        .group_by(Visit.doctor_id)
    ).all()
    medications = []
    for v in treatment_history(db, patient.id):
        for m in v.medications or []:
            if m not in medications:
                medications.append(m)
    return patient_out(patient, **stats, doctors_seen=len(doctors), all_medications=medications)


@router.patch("/{patient_id}")
def update_patient(patient_id: str, body: PatientPatch, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    changes = body.model_dump(exclude_unset=True)
    if "mrn" in changes:
        changes["mrn"] = (changes["mrn"] or "").strip() or None
        clash = changes["mrn"] and db.scalar(select(Patient).where(Patient.mrn == changes["mrn"], Patient.id != patient.id))
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Patient ID {changes['mrn']} belongs to {clash.full_name}")
    for key, value in changes.items():
        setattr(patient, key, value)
    audit(db, user, "patient.updated", "patient", patient.id, ", ".join(changes))
    db.commit()
    return patient_out(patient)


@router.get("/{patient_id}/visits")
def patient_visits(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient = get_accessible_patient(patient_id, user, db)
    visits = treatment_history(db, patient.id)
    return [visit_out(v) for v in reversed(visits)]  # newest first for the timeline


@router.get("/{patient_id}/appointments")
def patient_appointments(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient = get_accessible_patient(patient_id, user, db)
    rows = db.scalars(select(Appointment).where(Appointment.patient_id == patient.id).order_by(Appointment.start_at.desc())).unique()
    return [appointment_out(a) for a in rows]


@router.get("/{patient_id}/history.pdf")
def history_pdf(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The same combined treatment-history PDF that's attached to appointment emails."""
    patient = get_accessible_patient(patient_id, user, db)
    attachments, _ = build_history_pdf([visit_to_dict(v) for v in treatment_history(db, patient.id)])
    if not attachments:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No documents on file for this patient")
    filename, data = attachments[0]
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
