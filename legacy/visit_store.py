"""Local JSON-backed store for patient visits.

Kept intentionally simple (flat JSON file) so it's easy to swap for a
real database later without changing callers much — all access goes
through load_visits/save_visits/add_visit/find_by_source_image.
"""
import json
import os
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional

DEFAULT_DB_PATH = Path(__file__).parent / "data" / "visits.json"


def load_visits(db_path: Path = DEFAULT_DB_PATH) -> List[dict]:
    if not db_path.exists():
        return []
    with open(db_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_visits(visits: List[dict], db_path: Path = DEFAULT_DB_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=db_path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(visits, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, db_path)
    except BaseException:
        os.remove(tmp_path)
        raise


def find_by_source_image(source_image: str, db_path: Path = DEFAULT_DB_PATH) -> Optional[dict]:
    for visit in load_visits(db_path):
        if visit.get("source_image") == source_image:
            return visit
    return None


def add_visit(visit: dict, db_path: Path = DEFAULT_DB_PATH) -> dict:
    visits = load_visits(db_path)
    visit = {"id": visit.get("id") or uuid.uuid4().hex, **visit}
    visits.append(visit)
    save_visits(visits, db_path)
    return visit


def update_visit(visit_id: str, updates: dict, db_path: Path = DEFAULT_DB_PATH) -> Optional[dict]:
    visits = load_visits(db_path)
    for visit in visits:
        if visit.get("id") == visit_id:
            visit.update(updates)
            save_visits(visits, db_path)
            return visit
    return None


def link_pharmacy_receipt(visit_id: str, receipt_filename: str, db_path: Path = DEFAULT_DB_PATH) -> Optional[dict]:
    """Associate a pharmacy receipt image with an existing visit so it gets pulled
    into that visit's spot in the combined treatment-history PDF. Idempotent — linking
    the same filename twice is a no-op."""
    visits = load_visits(db_path)
    for visit in visits:
        if visit.get("id") == visit_id:
            receipts = visit.setdefault("pharmacy_receipts", [])
            if receipt_filename not in receipts:
                receipts.append(receipt_filename)
                save_visits(visits, db_path)
            return visit
    return None


def link_extra_page(visit_id: str, image_filename: str, db_path: Path = DEFAULT_DB_PATH) -> Optional[dict]:
    """Associate an additional page image (e.g. the backside of the same physical
    case sheet) with an existing visit — attached right after its main source_image
    in the combined treatment-history PDF. Use this when a second scan is the SAME
    visit/document, not a distinct visit (for a distinct visit, add it as its own
    visit record instead). Idempotent — linking the same filename twice is a no-op."""
    visits = load_visits(db_path)
    for visit in visits:
        if visit.get("id") == visit_id:
            pages = visit.setdefault("extra_pages", [])
            if image_filename not in pages:
                pages.append(image_filename)
                save_visits(visits, db_path)
            return visit
    return None


def delete_visit(visit_id: str, db_path: Path = DEFAULT_DB_PATH) -> bool:
    """Remove a visit record entirely — for retiring a record created in error
    (e.g. a second scan of the same document that was mistakenly stored as its
    own visit and has since been merged into the original via link_extra_page)."""
    visits = load_visits(db_path)
    remaining = [v for v in visits if v.get("id") != visit_id]
    if len(remaining) == len(visits):
        return False
    save_visits(remaining, db_path)
    return True


def list_visits(
    db_path: Path = DEFAULT_DB_PATH,
    doctor_name: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> List[dict]:
    visits = load_visits(db_path)
    if doctor_name:
        needle = doctor_name.strip().lower()
        visits = [v for v in visits if (v.get("doctor_name") or "").strip().lower() == needle]
    if patient_id:
        visits = [v for v in visits if v.get("patient_id") == patient_id]
    return sorted(visits, key=lambda v: (v.get("visit_date") is None, v.get("visit_date") or ""))


def get_treatment_history(
    patient_id: Optional[str],
    before_date: Optional[str] = None,
    db_path: Path = DEFAULT_DB_PATH,
) -> List[dict]:
    """All prior visits for this patient, across every doctor/clinic, treated as one
    continuous medical history, oldest first, up to (exclusive of) before_date.

    Requires patient_id — without one there's no reliable key to group visits by,
    so returns an empty history rather than risk mixing up different patients.
    """
    if not patient_id:
        return []
    visits = list_visits(db_path, patient_id=patient_id)
    if before_date:
        visits = [v for v in visits if v.get("visit_date") and v["visit_date"] < before_date]
    return visits
