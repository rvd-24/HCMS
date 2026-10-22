"""Radiographs (intraoral X-rays and OPGs) on a patient's record, looked up by tooth."""
import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import SCAN_KINDS, Scan, User
from ...services.documents import UploadError, save_upload
from ...services.records import audit, remove_file
from ..deps import current_user, get_accessible_patient
from ..serializers import scan_out

router = APIRouter(tags=["scans"])


def _is_tooth(n: int) -> bool:
    """FDI: permanent 11–48, primary 51–85."""
    q, i = divmod(n, 10)
    return (1 <= q <= 4 and 1 <= i <= 8) or (5 <= q <= 8 and 1 <= i <= 5)


def _parse_teeth(raw: str) -> list:
    teeth = []
    for part in raw.replace(";", ",").replace(" ", ",").split(","):
        if not part:
            continue
        if not part.isdigit() or not _is_tooth(int(part)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{part} isn't an FDI tooth number (11–48)")
        if int(part) not in teeth:
            teeth.append(int(part))
    return teeth


@router.get("/patients/{patient_id}/scans")
def list_scans(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_accessible_patient(patient_id, user, db)
    rows = db.scalars(
        select(Scan).where(Scan.patient_id == patient_id)
        .order_by(Scan.taken_on.desc().nulls_last(), Scan.created_at.desc())
    ).unique()
    return [scan_out(s) for s in rows]


@router.post("/patients/{patient_id}/scans", status_code=201)
async def upload_scan(
    patient_id: str,
    file: UploadFile = File(...),
    kind: str = Form("xray"),
    teeth: str = Form(""),
    taken_on: Optional[datetime.date] = Form(None),
    note: Optional[str] = Form(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    patient = get_accessible_patient(patient_id, user, db)
    if kind not in SCAN_KINDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind must be xray or opg")
    tooth_list = [] if kind == "opg" else _parse_teeth(teeth)
    if kind == "xray" and not tooth_list:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Say which teeth the X-ray shows")
    try:
        document = save_upload(db, await file.read(), file.filename or "scan", file.content_type, user,
                               kind="scan", patient_id=patient.id)
    except UploadError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error))
    document.status = "attached"  # filed on the record, not waiting in the prescription inbox
    db.flush()
    scan = Scan(patient_id=patient.id, document_id=document.id, kind=kind, teeth=tooth_list,
                taken_on=taken_on, note=(note or "").strip() or None, uploaded_by=user.id)
    db.add(scan)
    db.flush()
    audit(db, user, "scan.uploaded", "patient", patient.id,
          f"{'OPG' if kind == 'opg' else 'X-ray of ' + ', '.join(map(str, tooth_list))}: {document.original_filename}")
    db.commit()
    db.refresh(scan)
    return scan_out(scan)


@router.delete("/scans/{scan_id}", status_code=204)
def delete_scan(scan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    get_accessible_patient(scan.patient_id, user, db)
    document = scan.document
    db.delete(scan)
    db.flush()
    db.delete(document)
    audit(db, user, "scan.deleted", "patient", scan.patient_id, document.original_filename)
    db.commit()
    remove_file(document)
