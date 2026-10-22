"""Bridges between DB rows and the storage-agnostic pipeline: file paths,
treatment history as visit dicts, recipients, audit trail."""
import datetime
import os
from pathlib import Path
from typing import List, Optional

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import PROJECT_ROOT
from ..db.models import Appointment, AuditEvent, Doctor, Document, Patient, User, Visit
from ..integrations.base import Recipient
from ..pipeline.extraction import NextVisit, PrescriptionSummary
from . import storage


def to_stored_path(path: Path) -> str:
    """Paths under the project are stored relative to it so the data folder can
    move between machines; anything else stays absolute."""
    path = path.resolve()
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)


def resolve_path(document: Document) -> Path:
    """Local path to the document's file; bucket files are downloaded to the cache first."""
    if storage.is_stored(document.stored_path):
        return storage.local_copy(storage.key_of(document.stored_path))
    path = Path(document.stored_path)
    return path if path.is_absolute() else PROJECT_ROOT / path


def remove_file(document: Document) -> None:
    """Delete a document's file: the bucket object and its cached copy, or, for local files,
    only ones under data/uploads (the legacy prescriptions folder is shared, so it's left alone)."""
    if storage.is_stored(document.stored_path):
        key = storage.key_of(document.stored_path)
        storage.delete(key)
        storage.cache_path(key).unlink(missing_ok=True)
        return
    path = Path(document.stored_path)
    path = path if path.is_absolute() else PROJECT_ROOT / path
    if "uploads" in path.parts:
        path.unlink(missing_ok=True)


def _page_order(document: Document) -> tuple:
    rank = {"prescription": 0, "extra_page": 1, "other": 2, "pharmacy_receipt": 3}
    return rank.get(document.kind, 9), document.sort_order


def visit_pages(visit: Visit) -> List[Path]:
    return [resolve_path(d) for d in sorted(visit.documents, key=_page_order)]


def visit_to_dict(visit: Visit) -> dict:
    """The plain shape the pipeline (history grouping, messages, PDF) consumes."""
    return {
        "id": visit.id,
        "patient_id": visit.patient.mrn if visit.patient else None,
        "patient_name": visit.patient.full_name if visit.patient else None,
        "visit_date": visit.visit_date.isoformat() if visit.visit_date else None,
        "doctor_name": visit.doctor.full_name if visit.doctor else visit.doctor_name_raw,
        "clinic_name": visit.clinic_name,
        "diagnosis": visit.diagnosis,
        "medications": visit.medications or [],
        "summary": visit.summary,
        "pages": visit_pages(visit),
    }


def treatment_history(db: Session, patient_id: str, before: Optional[datetime.date] = None) -> List[Visit]:
    """All visits for this patient across every doctor/clinic, treated as one
    continuous medical history, oldest first, up to (exclusive of) `before`."""
    stmt = (
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .options(selectinload(Visit.documents))
    )
    if before:
        stmt = stmt.where(Visit.visit_date.is_not(None), Visit.visit_date < before)
    visits = list(db.scalars(stmt).unique())
    return sorted(visits, key=lambda v: (v.visit_date is None, v.visit_date or datetime.date.min, v.created_at))


def prescription_from_visit(visit: Optional[Visit], patient: Patient, doctor: Optional[Doctor], next_visit: NextVisit) -> PrescriptionSummary:
    """Synthesize the 'current visit' context for a notification from stored data
    (the web equivalent of schedule_manual_next_visit)."""
    return PrescriptionSummary(
        patient_id=patient.mrn,
        patient_name=patient.full_name,
        doctor_name=doctor.full_name if doctor else (visit.doctor_name_raw if visit else None),
        clinic_name=visit.clinic_name if visit else None,
        diagnosis=visit.diagnosis if visit else None,
        medications=(visit.medications or []) if visit else [],
        summary=(visit.summary or "") if visit else "First appointment — no previous visits on record.",
        visit_date=visit.visit_date.isoformat() if visit and visit.visit_date else None,
        next_visit=next_visit,
    )


def patient_recipient(patient: Patient) -> Recipient:
    return Recipient(
        name=patient.full_name,
        email=patient.email,
        slack_user_id=patient.slack_user_id,
        teams_upn=patient.teams_upn,
        whatsapp_number=patient.whatsapp_number,
        phone_number=patient.phone_number,
    )


def doctor_recipient(doctor: Doctor) -> Recipient:
    return Recipient(
        name=doctor.full_name,
        email=doctor.email,
        slack_user_id=doctor.slack_user_id,
        teams_upn=doctor.teams_upn,
        whatsapp_number=doctor.whatsapp_number,
        phone_number=doctor.phone_number,
    )


def pharmacy_recipient() -> Recipient:
    return Recipient(
        name="Pharmacy",
        email=os.environ.get("PHARMACY_EMAIL") or None,
        slack_user_id=os.environ.get("PHARMACY_SLACK_ID"),
        teams_upn=os.environ.get("PHARMACY_TEAMS_UPN"),
        whatsapp_number=os.environ.get("PHARMACY_WHATSAPP_NUMBER"),
        phone_number=os.environ.get("PHARMACY_PHONE_NUMBER"),
    )


def doctor_can_access_patient(db: Session, doctor_id: Optional[str], patient_id: str) -> bool:
    """A doctor sees a patient once they've treated them or have them booked.
    From then on they see the patient's FULL history across all doctors — the
    whole case travels together, as in the original scheduling emails."""
    if not doctor_id:
        return False
    return bool(db.scalar(select(
        or_(
            exists().where(Visit.patient_id == patient_id, Visit.doctor_id == doctor_id),
            exists().where(Appointment.patient_id == patient_id, Appointment.doctor_id == doctor_id),
        )
    )))


def audit(db: Session, actor: Optional[User], action: str, entity_type: str, entity_id: Optional[str], summary: str = "") -> None:
    db.add(AuditEvent(
        actor_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary[:1000],
    ))
