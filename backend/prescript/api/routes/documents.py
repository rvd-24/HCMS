"""Prescription inbox: upload, extraction status, review/confirm."""
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import Doctor, Document, PharmacyRequest, User
from ...services import appointments as appt_svc
from ...services.documents import UploadError, child_pages, confirm_document, find_duplicate, run_extraction, save_upload
from ...services.pharmacy import run_pharmacy_request
from ...services.records import audit, doctor_can_access_patient, resolve_path
from ..deps import current_user, doctor_scope
from ..schemas import DocumentConfirm
from ..serializers import appointment_out, document_out, visit_out

router = APIRouter(prefix="/documents", tags=["documents"])

INBOX_STATUSES = ("uploaded", "processing", "extracted", "failed")


def _get_scoped(db: Session, document_id: str, user: User) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    scope = doctor_scope(user)
    if scope and document.uploaded_by != user.id:
        if not (document.patient_id and doctor_can_access_patient(db, scope, document.patient_id)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return document


@router.get("")
def list_documents(
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Defaults to the review inbox: top-level documents not yet turned into a visit."""
    statuses = status_filter.split(",") if status_filter else INBOX_STATUSES
    stmt = select(Document).where(Document.parent_id.is_(None), Document.status.in_(statuses))
    if doctor_scope(user):
        stmt = stmt.where(Document.uploaded_by == user.id)
    docs = list(db.scalars(stmt.order_by(Document.uploaded_at.desc()).limit(200)))
    return [document_out(d, children=child_pages(db, d)) for d in docs]


@router.post("", status_code=201)
async def upload_documents(
    background: BackgroundTasks,
    files: List[UploadFile] = File(...),
    same_sheet: bool = Form(False),
    patient_id: Optional[str] = Form(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Upload one or more prescription images. With same_sheet=true the files are
    pages of ONE case sheet (front/back) and are extracted together; otherwise
    each file is its own prescription."""
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files uploaded")
    created, duplicates = [], []
    parent: Optional[Document] = None
    try:
        for index, upload in enumerate(files):
            data = await upload.read()
            existing = find_duplicate(db, data)
            if existing:
                duplicates.append({"filename": upload.filename, "existing": document_out(existing)})
                continue
            is_child = same_sheet and parent is not None
            document = save_upload(
                db, data, upload.filename or "upload", upload.content_type, user,
                kind="extra_page" if is_child else "prescription",
                patient_id=patient_id,
                parent_id=parent.id if is_child else None,
                sort_order=index,
            )
            if not is_child:
                created.append(document)
                if same_sheet:
                    parent = document
    except UploadError as error:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error))
    for document in created:
        audit(db, user, "document.uploaded", "document", document.id, document.original_filename)
    db.commit()
    for document in created:
        background.add_task(run_extraction, document.id)
    return {
        "documents": [document_out(d, children=child_pages(db, d)) for d in created],
        "duplicates": duplicates,
    }


@router.get("/{document_id}")
def get_document(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    document = _get_scoped(db, document_id, user)
    return document_out(document, children=child_pages(db, document))


@router.get("/{document_id}/file")
def get_document_file(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    document = _get_scoped(db, document_id, user)
    path = resolve_path(document)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File is missing on disk")
    return FileResponse(path, media_type=document.content_type or None, filename=document.original_filename)


@router.post("/{document_id}/extract", status_code=202)
def retry_extraction(
    document_id: str, background: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    document = _get_scoped(db, document_id, user)
    if document.status not in INBOX_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already confirmed")
    document.status = "processing"
    db.commit()
    background.add_task(run_extraction, document.id)
    return document_out(document)


@router.post("/{document_id}/confirm")
def confirm(
    document_id: str,
    body: DocumentConfirm,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Save the reviewed draft as a visit; optionally book the follow-up and send
    the medicines to the pharmacy in the same step."""
    document = _get_scoped(db, document_id, user)
    if document.status not in INBOX_STATUSES or document.parent_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This document has already been processed")

    scope = doctor_scope(user)
    review = body.model_dump()
    if scope:
        # A doctor confirming their own prescription — the visit is theirs.
        review["doctor_id"] = review.get("doctor_id") or scope
        if review["doctor_id"] != scope:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Doctors can only record their own visits")
        if review.get("patient_id") and not doctor_can_access_patient(db, scope, review["patient_id"]):
            # Allow linking to an existing patient only by ID read off their own prescription.
            matched = (document.extraction or {}).get("matched_patient_id")
            if matched != review["patient_id"]:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    try:
        visit = confirm_document(db, document, review, user)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error))

    appointment = None
    if body.follow_up:
        follow = body.follow_up
        doctor_id = scope or follow.doctor_id or visit.doctor_id
        doctor = db.get(Doctor, doctor_id) if doctor_id else None
        try:
            appointment = appt_svc.book(
                db, visit.patient, doctor, follow.start_at.replace(tzinfo=None), user,
                duration_minutes=follow.duration_minutes, reason=follow.reason, location=follow.location,
                source="prescription", origin_visit_id=visit.id, allow_overlap=follow.allow_overlap,
            )
        except appt_svc.SlotConflict as error:
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, str(error))

    pharmacy_request = None
    if body.send_to_pharmacy and visit.medications:
        pharmacy_request = PharmacyRequest(
            visit_id=visit.id, patient_id=visit.patient_id, medications=list(visit.medications), requested_by=user.id
        )
        db.add(pharmacy_request)
    db.commit()
    db.refresh(visit)

    if appointment and body.follow_up.notify:
        background.add_task(appt_svc.notify_booking, appointment.id)
    if pharmacy_request:
        background.add_task(run_pharmacy_request, pharmacy_request.id)
    return {
        "visit": visit_out(visit),
        "appointment": appointment_out(appointment) if appointment else None,
        "pharmacy_request_id": pharmacy_request.id if pharmacy_request else None,
    }


@router.delete("/{document_id}", status_code=204)
def discard(document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Discard an unconfirmed upload (and its extra pages)."""
    document = _get_scoped(db, document_id, user)
    if document.status not in INBOX_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Confirmed documents belong to a visit and can't be discarded here")
    for doc in [*child_pages(db, document), document]:
        path = resolve_path(doc)
        if path.exists() and "uploads" in path.parts:
            path.unlink()
        db.delete(doc)
        db.flush()  # children before parent — the self-referencing FK has no ORM relationship to order deletes
    audit(db, user, "document.discarded", "document", document.id, document.original_filename)
    db.commit()
