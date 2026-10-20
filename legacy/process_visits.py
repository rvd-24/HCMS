"""Scan a folder of prescription/visit images, extract structured details
for any image not yet recorded, and persist them as visits in the local
JSON store. Read-only w.r.t. calendar/notifications — this only maps out
visit history, it does not schedule anything.

Usage: python process_visits.py [images_dir]
"""
import argparse
import sys
from pathlib import Path
from typing import Optional

from schedule_meet import generate_prescription_summary, prescription_to_visit_record
from visit_store import (
    DEFAULT_DB_PATH,
    add_visit,
    find_by_source_image,
    link_pharmacy_receipt,
    list_visits,
    update_visit,
)
from visit_utils import PRESCRIPTIONS_DIR, guess_date_from_filename, locate_image

DEFAULT_IMAGES_DIR = Path(__file__).parent / "prescriptions/new"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Filenames containing any of these (case-insensitive) are skipped during extraction —
# receipts, not clinical documents, so they carry no diagnosis/visit content worth
# extracting. They're still surfaced as unlinked so they can be attached to a visit
# with --link-pharmacy-receipt / --visit-id instead of silently dropped.
EXCLUDE_KEYWORDS = ("pharmacy",)


def find_unlinked_pharmacy_receipts(images_dir: Path, db_path: Path = DEFAULT_DB_PATH) -> list[Path]:
    """Pharmacy receipt images under images_dir (any depth) that aren't yet linked
    to any visit's pharmacy_receipts list — these need a manual --link-pharmacy-receipt
    call since which visit a receipt belongs to can't be inferred reliably from the
    filename alone (e.g. same-day visits with more than one doctor)."""
    linked = {r for v in list_visits(db_path) for r in (v.get("pharmacy_receipts") or [])}
    return sorted(
        p for p in images_dir.rglob("*")
        if p.suffix.lower() in IMAGE_EXTENSIONS
        and "pharmacy" in p.name.lower()
        and p.name not in linked
    )


def process_directory(images_dir: Path, db_path: Path = DEFAULT_DB_PATH) -> list[dict]:
    newly_added = []
    image_files = sorted(
        p for p in images_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS
    )

    for image_path in image_files:
        if any(keyword in image_path.name.lower() for keyword in EXCLUDE_KEYWORDS):
            print(f"skip (pharmacy receipt, not a prescription): {image_path.name}")
            continue

        if find_by_source_image(image_path.name, db_path):
            print(f"skip (already mapped): {image_path.name}")
            continue

        print(f"processing: {image_path.name} ...")
        try:
            prescription = generate_prescription_summary(str(image_path))
        except Exception as error:
            print(f"  failed to extract details: {error}")
            continue

        filename_date = guess_date_from_filename(image_path.name)
        if prescription.visit_date and filename_date and prescription.visit_date != filename_date:
            print(
                f"  warning: extracted visit_date {prescription.visit_date} disagrees with "
                f"filename-implied date {filename_date} — keeping extracted value, check the image"
            )

        stored = add_visit(prescription_to_visit_record(prescription, str(image_path)), db_path)
        newly_added.append(stored)
        print(f"  added visit {stored['id']}: {stored['visit_date']} - {stored['doctor_name']}")

    return newly_added


def refresh_visit_extraction(
    visit: dict, images_dir: Path = PRESCRIPTIONS_DIR, db_path: Path = DEFAULT_DB_PATH
) -> Optional[dict]:
    """Re-run extraction for one already-stored visit and update it in place (same
    id, same source_image). Keeps the visit's existing patient_id even if the fresh
    OCR pass drifts (LLM extraction is non-deterministic) — patient_id is the sole
    key treatment-history linking relies on, so silently letting it change would
    silently sever that patient's history chain, exactly what happened here once."""
    source_image = visit.get("source_image")
    image_path = locate_image(source_image, images_dir) if source_image else None
    if not image_path:
        print(f"  warning: could not locate image for {source_image!r}; skipping")
        return None

    try:
        prescription = generate_prescription_summary(str(image_path))
    except Exception as error:
        print(f"  failed to re-extract {source_image}: {error}")
        return None

    fresh = prescription_to_visit_record(prescription, str(image_path))
    fresh.pop("source_image", None)  # keep the original filename/id stable

    if visit.get("patient_id") and fresh.get("patient_id") != visit.get("patient_id"):
        print(
            f"  warning: re-extracted patient_id {fresh.get('patient_id')!r} differs from stored "
            f"{visit.get('patient_id')!r} for {source_image} — keeping the original (OCR likely drifted)"
        )
        fresh["patient_id"] = visit.get("patient_id")

    return update_visit(visit["id"], fresh, db_path)


def reextract_missing_diagnoses(images_dir: Path = PRESCRIPTIONS_DIR, db_path: Path = DEFAULT_DB_PATH) -> list[dict]:
    """Re-run extraction for any stored visit whose diagnosis came back null. Searches
    the full prescriptions/ tree since a null-diagnosis visit could be in any subfolder."""
    updated = []
    for visit in list_visits(db_path):
        if visit.get("diagnosis"):
            continue
        print(f"re-extracting: {visit.get('source_image')} (diagnosis was null) ...")
        stored = refresh_visit_extraction(visit, images_dir, db_path)
        if stored:
            updated.append(stored)
            print(f"  diagnosis now: {stored.get('diagnosis')!r}")
    return updated


def print_visit_map(db_path: Path = DEFAULT_DB_PATH) -> None:
    visits = list_visits(db_path)
    if not visits:
        print("No visits recorded yet.")
        return

    print("\nVisit history:")
    for v in visits:
        doctor = v.get("doctor_name") or "Unknown doctor"
        clinic = f" ({v['clinic_name']})" if v.get("clinic_name") else ""
        diagnosis = v.get("diagnosis") or "N/A"
        print(f"  {v.get('visit_date') or 'unknown date':>10}  {doctor}{clinic} — {diagnosis}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images_dir", nargs="?", default=str(DEFAULT_IMAGES_DIR))
    parser.add_argument(
        "--backfill-null-diagnoses", action="store_true",
        help="Re-run extraction for stored visits with a null diagnosis, instead of scanning for new images.",
    )
    parser.add_argument(
        "--link-pharmacy-receipt", metavar="FILENAME",
        help="Associate a pharmacy receipt image (by filename) with a visit. Requires --visit-id.",
    )
    parser.add_argument(
        "--visit-id", metavar="ID",
        help="Visit id to link with --link-pharmacy-receipt (see the id column in the visit map below).",
    )
    args = parser.parse_args()

    if args.link_pharmacy_receipt:
        if not args.visit_id:
            print("--link-pharmacy-receipt requires --visit-id")
            sys.exit(1)
        visit = link_pharmacy_receipt(args.visit_id, args.link_pharmacy_receipt)
        if not visit:
            print(f"No visit found with id={args.visit_id!r}")
            sys.exit(1)
        print(f"Linked {args.link_pharmacy_receipt} -> visit {visit['id']} ({visit.get('visit_date')}, {visit.get('doctor_name')})")
    elif args.backfill_null_diagnoses:
        reextract_missing_diagnoses()
    else:
        images_dir = Path(args.images_dir)
        print(f"Scanning images in: {images_dir}")
        if not images_dir.is_dir():
            print(f"Not a directory: {images_dir}")
            sys.exit(1)
        process_directory(images_dir)

        unlinked = find_unlinked_pharmacy_receipts(images_dir)
        if unlinked:
            print(f"\n{len(unlinked)} pharmacy receipt(s) not yet linked to a visit:")
            for p in unlinked:
                print(f"  {p.relative_to(images_dir)}")
            print(
                "Link each with: python process_visits.py --link-pharmacy-receipt <filename> --visit-id <id>"
            )

    print_visit_map()
