"""Prescription intake: upload -> background extraction -> human review ->
confirmed visit (+ optional follow-up appointment).

This is the web version of process_visits.py / schedule_meet.py from-image,
with a review step in between: the extraction is only a draft until an admin
or doctor confirms it, so OCR drift (patient IDs, doctor spellings, dates)
gets caught before it lands in someone's history.
"""
import datetime
import hashlib
import traceback
from pathlib import Path
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import session_scope
from ..db.models import Document, Patient, User, Visit, new_id
from ..pipeline.extraction import ExtractionNotConfigured, generate_prescription_summary
from ..pipeline.text import guess_date_from_filename, parse_time_or_default, valid_iso_date
from .matching import clean_patient_name, find_doctor_by_name, find_patient_by_mrn, remember_doctor_alias
from .records import audit, resolve_path, to_stored_path

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class UploadError(ValueError):
    pass


def save_upload(
    db: Session,
    data: bytes,
    filename: str,
    content_type: Optional[str],
    uploaded_by: Optional[User],
    kind: str = "prescription",
    patient_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    sort_order: int = 0,
) -> Document:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise UploadError(f"{filename}: only {', '.join(sorted(ALLOWED_EXTENSIONS))} images are supported")
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError(f"{filename}: larger than {MAX_UPLOAD_BYTES // (1024 * 1024)}MB")
    if not data:
        raise UploadError(f"{filename}: empty file")

    doc_id = new_id()
    today = datetime.date.today()
    target_dir = get_settings().uploads_dir / f"{today:%Y}" / f"{today:%m}"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{doc_id}{ext}"
    target.write_bytes(data)

    document = Document(
        id=doc_id,
        kind=kind,
        status="attached" if visit_id else "uploaded",
        original_filename=Path(filename).name,
        stored_path=to_stored_path(target),
        content_type=content_type,
        patient_id=patient_id,
        visit_id=visit_id,
        parent_id=parent_id,
        sha256=hashlib.sha256(data).hexdigest(),
        sort_order=sort_order,
        uploaded_by=uploaded_by.id if uploaded_by else None,
    )
    db.add(document)
    return document


def find_duplicate(db: Session, data: bytes) -> Optional[Document]:
    digest = hashlib.sha256(data).hexdigest()
    return db.scalar(select(Document).where(Document.sha256 == digest).limit(1))


def child_pages(db: Session, document: Document) -> List[Document]:
    return list(db.scalars(
        select(Document).where(Document.parent_id == document.id).order_by(Document.sort_order)
    ))


def run_extraction(document_id: str) -> None:
    """Background job. Reads the prescription plus any child pages together,
    stores the draft on the document, and pre-matches patient/doctor."""
    with session_scope() as db:
        document = db.get(Document, document_id)
        if not document:
            return
        document.status = "processing"
        document.error = None
        db.commit()

        extra_paths = [str(resolve_path(d)) for d in child_pages(db, document)]
        try:
            summary = generate_prescription_summary(str(resolve_path(document)), extra_image_paths=extra_paths or None)
        except ExtractionNotConfigured as error:
            document.status = "failed"
            document.error = str(error)
            return
        except Exception as error:  # LLM/network errors — keep the doc, let a human retry or fill manually
            traceback.print_exc()
            document.status = "failed"
            document.error = f"{type(error).__name__}: {error}"
            return

        draft = summary.model_dump()
        warnings = []
        filename_date = guess_date_from_filename(document.original_filename)
        if summary.visit_date and filename_date and summary.visit_date != filename_date:
            warnings.append(
                f"Extracted visit date {summary.visit_date} disagrees with the filename's {filename_date} — check the image."
            )
        if not summary.visit_date and filename_date:
            draft["visit_date"] = filename_date
            warnings.append("Visit date wasn't readable; taken from the filename.")

        patient = find_patient_by_mrn(db, summary.patient_id)
        doctor = find_doctor_by_name(db, summary.doctor_name)
        if summary.patient_id and not patient:
            warnings.append(f"No existing patient with ID {summary.patient_id} — confirming will create one.")
        if summary.doctor_name and not doctor:
            warnings.append(f"'{summary.doctor_name}' didn't match a known doctor — pick one or leave unlinked.")
        nv = summary.next_visit
        if nv and not valid_iso_date(nv.date):
            warnings.append("A follow-up is mentioned but has no usable date — it won't be auto-scheduled.")

        document.extraction = {
            "draft": draft,
            "matched_patient_id": patient.id if patient else None,
            "matched_doctor_id": doctor.id if doctor else None,
            "warnings": warnings,
            "extracted_at": datetime.datetime.now().isoformat(timespec="seconds"),
        }
        document.status = "extracted"
        if patient and not document.patient_id:
            document.patient_id = patient.id


def confirm_document(db: Session, document: Document, review: dict, actor: Optional[User]) -> Visit:
    """Turn a reviewed draft into a Visit. `review` holds the human-corrected
    fields (see api.schemas.DocumentConfirm). Does not schedule anything — the
    caller decides whether to book the follow-up."""
    patient: Optional[Patient] = None
    if review.get("patient_id"):
        patient = db.get(Patient, review["patient_id"])
        if not patient:
            raise ValueError("Selected patient no longer exists")
    else:
        new_patient = review.get("new_patient") or {}
        mrn = (new_patient.get("mrn") or "").strip() or None
        if mrn:
            patient = find_patient_by_mrn(db, mrn)
        if not patient:
            if not new_patient.get("full_name"):
                raise ValueError("Pick an existing patient or enter a name for a new one")
            patient = Patient(
                mrn=mrn,
                full_name=clean_patient_name(new_patient["full_name"]),
                email=new_patient.get("email") or None,
                phone_number=new_patient.get("phone_number") or None,
            )
            db.add(patient)
            db.flush()
            audit(db, actor, "patient.created", "patient", patient.id, f"Created from document {document.original_filename}")

    doctor = None
    if review.get("doctor_id"):
        from ..db.models import Doctor

        doctor = db.get(Doctor, review["doctor_id"])
        if doctor:
            remember_doctor_alias(doctor, review.get("doctor_name_raw"))

    visit_date = review.get("visit_date")
    next_visit = review.get("next_visit")
    if next_visit:
        next_visit = {**next_visit, "time": parse_time_or_default(next_visit.get("time"), default="")}

    visit = Visit(
        patient_id=patient.id,
        doctor_id=doctor.id if doctor else None,
        doctor_name_raw=review.get("doctor_name_raw"),
        clinic_name=review.get("clinic_name"),
        visit_date=datetime.date.fromisoformat(visit_date) if valid_iso_date(visit_date) else None,
        diagnosis=review.get("diagnosis"),
        medications=[m for m in (review.get("medications") or []) if m and m.strip()],
        summary=review.get("summary"),
        next_visit_note=next_visit,
        created_by=actor.id if actor else None,
    )
    db.add(visit)
    db.flush()

    document.visit_id = visit.id
    document.patient_id = patient.id
    document.status = "confirmed"
    for i, page in enumerate(child_pages(db, document), start=1):
        page.visit_id = visit.id
        page.patient_id = patient.id
        page.status = "attached"
        page.sort_order = i

    audit(db, actor, "visit.created", "visit", visit.id,
          f"{patient.full_name} — {visit.visit_date or 'undated'} ({doctor.full_name if doctor else visit.doctor_name_raw or 'no doctor'})")
    return visit
