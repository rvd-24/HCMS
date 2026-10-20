"""Small text/date helpers shared across the pipeline (from visit_utils.py and
schedule_meet.py)."""
import datetime
import re
from pathlib import Path
from typing import Optional

FILENAME_DATE_RE = re.compile(r"(\d{1,2})_([A-Za-z]+)_(\d{4})")
ISO_FILENAME_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def guess_date_from_filename(filename: str) -> Optional[str]:
    """Supports both naming schemes in prescriptions/: 12_May_2026_... and 2026-06-26_visit1."""
    match = FILENAME_DATE_RE.search(filename)
    if match:
        day, month, year = match.groups()
        try:
            return datetime.datetime.strptime(f"{day} {month} {year}", "%d %B %Y").strftime("%Y-%m-%d")
        except ValueError:
            return None
    match = ISO_FILENAME_DATE_RE.search(filename)
    if match:
        try:
            return datetime.date(*map(int, match.groups())).isoformat()
        except ValueError:
            return None
    return None


def locate_image(source_image: str, images_dir: Path) -> Optional[Path]:
    """Resolve a stored filename to a real path. Images may live directly under
    images_dir or in any subfolder (e.g. prescriptions/original, prescriptions/new),
    so this searches recursively rather than assuming a flat layout."""
    direct_path = images_dir / source_image
    if direct_path.exists():
        return direct_path
    return next(images_dir.rglob(source_image), None)


def html_escape(text) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def display_name(name: Optional[str]) -> Optional[str]:
    """Title-case a name for display when it's mostly caps (as OCR tends to read
    printed prescriptions). Uses a ratio rather than a strict name.isupper() check,
    since prefixes like "Dr." / "Mr" carry a lowercase letter that would otherwise
    make e.g. "Dr. KABIR SUMAN DASH" fail an all-caps test. Leaves already
    mixed-case names untouched so this can't mangle a name with legitimate
    internal capitals (e.g. "McDonald")."""
    if not name:
        return name
    letters = [c for c in name if c.isalpha()]
    if not letters:
        return name
    upper_ratio = sum(c.isupper() for c in letters) / len(letters)
    return name.title() if upper_ratio > 0.8 else name


_HONORIFIC_RE = re.compile(r"^(dr|mr|mrs|ms|miss|prof)\.?\s+", re.IGNORECASE)
_DEGREE_RE = re.compile(r",?\s*\b(mds|bds|mbbs|md|ms|phd)\b\.?", re.IGNORECASE)


def normalize_person_name(name: Optional[str]) -> str:
    """Key for matching OCR'd names to known people: "DR. KABIR SUMAN DASH",
    "Dr. Kabir Suman Dash" and "Dr Kabir Suman Dash, MDS" all map to
    "kabir suman dash"."""
    if not name:
        return ""
    value = _HONORIFIC_RE.sub("", name.strip())
    value = _DEGREE_RE.sub("", value)
    value = re.sub(r"[^a-z\s]", " ", value.lower())
    return re.sub(r"\s+", " ", value).strip()


def fmt_date(date_str: str, time_str: str) -> tuple:
    try:
        dt = datetime.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        return dt.strftime("%A, %d %B %Y"), dt.strftime("%I:%M %p").lstrip("0")
    except ValueError:
        return date_str, time_str


def valid_iso_date(value: Optional[str]) -> bool:
    """Extraction can return a blank/placeholder date (e.g. "" or ".") when the
    image mentions a follow-up is needed but doesn't state when — that's not a
    schedulable date."""
    if not value:
        return False
    try:
        datetime.datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def parse_time_or_default(value: Optional[str], default: str = "09:00") -> str:
    """Extraction returns times like "", ":" or "9:30"; normalise to HH:MM."""
    try:
        return datetime.datetime.strptime((value or "").strip(), "%H:%M").strftime("%H:%M")
    except ValueError:
        return default
