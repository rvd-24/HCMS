from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import Doctor, PharmacyRequest, User, Visit
from ...services.documents import UploadError, save_upload
from ...services.pharmacy import run_pharmacy_request
from ...services.records import audit
from ..deps import current_user, doctor_scope, get_accessible_patient
from ..schemas import VisitIn, VisitPatch
from ..serializers import document_out, pharmacy_request_out, visit_out

router = APIRouter(prefix="/visits", tags=["visits"])


def _get_scoped(db: Session, visit_id: str, user: User) -> Visit:
    visit = db.get(Visit, visit_id)
    if not visit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    get_accessible_patient(visit.patient_id, user, db)
    return visit


def _check_doctor(db: Session, user: User, doctor_id):
    scope = doctor_scope(user)
    if scope and doctor_id and doctor_id != scope:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Doctors can only record their own visits")
    if doctor_id and not db.get(Doctor, doctor_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")
    return doctor_id or scope


@router.post("", status_code=201)
def create_visit(body: VisitIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Record a visit without a scanned document (e.g. typed notes)."""
    get_accessible_patient(body.patient_id, user, db)
    doctor_id = _check_doctor(db, user, body.doctor_id)
    visit = Visit(**{**body.model_dump(), "doctor_id": doctor_id}, created_by=user.id)
    db.add(visit)
    db.flush()
    audit(db, user, "visit.created", "visit", visit.id, f"Manual visit {visit.visit_date or ''}")
    db.commit()
    db.refresh(visit)
    return visit_out(visit)


@router.get("/{visit_id}")
def get_visit(visit_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return visit_out(_get_scoped(db, visit_id, user))


@router.patch("/{visit_id}")
def update_visit(visit_id: str, body: VisitPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    visit = _get_scoped(db, visit_id, user)
    scope = doctor_scope(user)
    if scope and visit.doctor_id != scope:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the treating doctor or an admin can edit this visit")
    changes = body.model_dump(exclude_unset=True)
    if "doctor_id" in changes:
        changes["doctor_id"] = _check_doctor(db, user, changes["doctor_id"])
    for key, value in changes.items():
        setattr(visit, key, value)
    audit(db, user, "visit.updated", "visit", visit.id, ", ".join(changes))
    db.commit()
    return visit_out(visit)


@router.post("/{visit_id}/documents", status_code=201)
async def attach_document(
    visit_id: str,
    kind: str = Form("extra_page"),
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Attach the back of a case sheet, a pharmacy receipt or another page to an
    existing visit (replaces process_visits.py --link-pharmacy-receipt)."""
    if kind not in ("extra_page", "pharmacy_receipt", "other"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind must be extra_page, pharmacy_receipt or other")
    visit = _get_scoped(db, visit_id, user)
    try:
        document = save_upload(
            db, await file.read(), file.filename or "upload", file.content_type, user,
            kind=kind, patient_id=visit.patient_id, visit_id=visit.id, sort_order=len(visit.documents),
        )
    except UploadError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error))
    audit(db, user, "document.attached", "visit", visit.id, f"{kind}: {document.original_filename}")
    db.commit()
    return document_out(document)


@router.get("/{visit_id}/pharmacy-requests")
def list_pharmacy_requests(visit_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    visit = _get_scoped(db, visit_id, user)
    rows = db.scalars(select(PharmacyRequest).where(PharmacyRequest.visit_id == visit.id).order_by(PharmacyRequest.created_at.desc()))
    return [pharmacy_request_out(r) for r in rows]


@router.post("/{visit_id}/pharmacy-requests", status_code=202)
def request_pharmacy(
    visit_id: str,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    visit = _get_scoped(db, visit_id, user)
    if not visit.medications:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This visit has no medications to request")
    request = PharmacyRequest(visit_id=visit.id, patient_id=visit.patient_id, medications=list(visit.medications), requested_by=user.id)
    db.add(request)
    db.flush()
    audit(db, user, "pharmacy.requested", "visit", visit.id, f"{len(visit.medications)} medication(s)")
    db.commit()
    background.add_task(run_pharmacy_request, request.id)
    return pharmacy_request_out(request)
