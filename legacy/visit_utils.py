"""Small helpers shared between process_visits.py and schedule_meet.py."""
import datetime
import re
from pathlib import Path

PRESCRIPTIONS_DIR = Path(__file__).parent / "prescriptions"

FILENAME_DATE_RE = re.compile(r"(\d{1,2})_([A-Za-z]+)_(\d{4})")


def guess_date_from_filename(filename: str) -> str | None:
    match = FILENAME_DATE_RE.search(filename)
    if not match:
        return None
    day, month, year = match.groups()
    try:
        dt = datetime.datetime.strptime(f"{day} {month} {year}", "%d %B %Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None


def locate_image(source_image: str, images_dir: Path = PRESCRIPTIONS_DIR) -> Path | None:
    """Resolve a stored visit's source_image filename to a real path. Images may
    live directly under images_dir or in any subfolder (e.g. prescriptions/original,
    prescriptions/new), so this searches recursively rather than assuming a flat layout."""
    direct_path = images_dir / source_image
    if direct_path.exists():
        return direct_path
    return next(images_dir.rglob(source_image), None)
