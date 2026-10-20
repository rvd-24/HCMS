"""Treatment-history helpers: grouping visits for display and building the
combined history PDF that travels with every appointment notification.

A "visit dict" here is the plain shape the pipeline works with, whatever the
storage layer: id, patient_id, visit_date, doctor_name, diagnosis, medications,
summary, and `pages` — the already-resolved image paths for that visit, in PDF
order (main sheet, extra pages, then pharmacy receipts).
"""
import io
from pathlib import Path
from typing import List, Tuple

from PIL import Image

from .text import display_name

# Phone-camera prescription photos run 2MB+ each; a dozen of those blows well past
# Gmail's ~25MB total message size (attachments get base64-encoded, ~1.37x inflation).
MAX_ATTACHMENT_DIMENSION = 1600
ATTACHMENT_JPEG_QUALITY = 75
MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024  # raw budget, pre-base64


def _compress_image(path: Path) -> Image.Image:
    """Downscale an image for inclusion in the combined history PDF. Returns a
    PIL Image held in memory — the original file on disk is untouched."""
    img = Image.open(path)
    img = img.convert("RGB")
    img.thumbnail((MAX_ATTACHMENT_DIMENSION, MAX_ATTACHMENT_DIMENSION))
    return img


def _estimate_jpeg_bytes(img: Image.Image) -> int:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=ATTACHMENT_JPEG_QUALITY, optimize=True)
    return buf.tell()


def build_history_pdf(history: List[dict]) -> Tuple[List[Tuple[str, bytes]], int]:
    """Combine every visit's pages into ONE PDF in reverse-chronological order
    (most recent visit first — history arrives oldest-first, so visits are walked
    in reverse) rather than attaching each image separately. If the combined size
    would still be too large, keeps the most recent images and drops the oldest —
    dropped ones are still described in the Earlier Visits text/HTML, just not
    included as pages.

    Returns (attachments, included_count): attachments is a single-item list
    [(filename, pdf_bytes)] (empty list if nothing could be resolved)."""
    pages = []  # (label, PIL.Image, estimated_bytes), most recent visit first
    for visit in reversed(history):
        for path in visit.get("pages") or []:
            path = Path(path)
            if not path.exists():
                print(f"  warning: missing page {path.name} for visit {visit.get('id')}")
                continue
            try:
                img = _compress_image(path)
                pages.append((path.name, img, _estimate_jpeg_bytes(img)))
            except Exception as error:
                print(f"  warning: failed to process {path.name}: {error}")

    if not pages:
        return [], 0

    total = sum(size for _, _, size in pages)
    if total > MAX_TOTAL_ATTACHMENT_BYTES:
        kept, running = [], 0
        for entry in pages:
            if kept and running + entry[2] > MAX_TOTAL_ATTACHMENT_BYTES:
                break
            kept.append(entry)
            running += entry[2]
        print(
            f"  warning: combined attachment images totalled {total / 1024 / 1024:.1f}MB; "
            f"keeping the {len(kept)} most recent and omitting the {len(pages) - len(kept)} oldest"
        )
        pages = kept

    images = [img for _, img, _ in pages]
    buf = io.BytesIO()
    images[0].save(buf, format="PDF", save_all=True, append_images=images[1:])

    patient_id = next((v.get("patient_id") for v in history if v.get("patient_id")), "patient")
    return [(f"{patient_id}_treatment_history.pdf", buf.getvalue())], len(pages)


def group_by_visit_date(history: List[dict]) -> List[List[dict]]:
    """Group visits by visit_date, newest-first, so same-day visits (e.g. two lab
    reports from one appointment) render as a single entry with sub-points instead
    of a repeated date line per visit. Visits with no visit_date are never grouped
    together — "unknown date" isn't actually the same date."""
    groups: List[List[dict]] = []
    for visit in reversed(history):
        date = visit.get("visit_date")
        if date and groups and groups[-1][0].get("visit_date") == date:
            groups[-1].append(visit)
        else:
            groups.append([visit])
    return groups


def group_by_doctor(visits: List[dict]) -> List[Tuple[str, List[dict]]]:
    """Further group a same-date list of visits by doctor (case/whitespace
    insensitive, since OCR extraction casing drifts between visits), so one
    doctor's multiple same-day visits share a single heading. Preserves order of
    first appearance."""
    groups: List[Tuple[str, List[dict]]] = []
    index_by_key: dict = {}
    for v in visits:
        raw_name = v.get("doctor_name") or "N/A"
        key = raw_name.strip().lower()
        if key in index_by_key:
            groups[index_by_key[key]][1].append(v)
        else:
            index_by_key[key] = len(groups)
            groups.append((display_name(raw_name) or raw_name, [v]))
    return groups
