import argparse
import base64
import datetime
import io
import os
from pathlib import Path
from typing import List, Optional, Tuple, Union

from dotenv import load_dotenv, find_dotenv
from langchain_core.messages import HumanMessage
from langchain_openai import AzureChatOpenAI
from PIL import Image
from pydantic import BaseModel, Field

from google_services import schedule_meet as create_calendar_event
from integrations.base import Recipient
from integrations.dispatch import send_to_recipient
from visit_store import DEFAULT_DB_PATH, add_visit, find_by_source_image, get_treatment_history
from visit_utils import PRESCRIPTIONS_DIR, guess_date_from_filename, locate_image

load_dotenv(find_dotenv())


class NextVisit(BaseModel):
    date: str = Field(description="Next visit date in YYYY-MM-DD format")
    time: str = Field(description="Next visit time in 24-hour HH:MM format")
    reason: Optional[str] = Field(default=None, description="Reason or purpose of the next visit")
    location: Optional[str] = Field(default=None, description="Clinic/hospital name or address for the next visit, if mentioned")


class PrescriptionSummary(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient ID / MRN, if printed on the prescription")
    patient_name: Optional[str] = Field(default=None, description="Name of the patient")
    doctor_name: Optional[str] = Field(default=None, description="Name of the prescribing doctor")
    clinic_name: Optional[str] = Field(default=None, description="Clinic/hospital name or address where this visit took place, if mentioned")
    diagnosis: Optional[str] = Field(
        default=None,
        description=(
            "ONLY the clinical diagnosis/condition/findings themselves, as a clean clinical statement — "
            "e.g. 'Working length determined 11 & 25mm; BMP done to file #25; temporary dressing placed.' "
            "Read every section (chief complaint, exam findings, assessment, impression, procedure notes), "
            "not just text literally labeled 'Diagnosis' — but write out only the clinical content itself. "
            "Do NOT narrate the extraction: no 'handwritten notes appear to read', 'the image shows', 'there "
            "is also a note that says', document-type descriptions (that belongs in summary, not here), or "
            "sentences hedging about legibility. If a specific word is illegible, either omit it or tag just "
            "that word '(unclear)' — don't write a sentence explaining what might be unclear. Only leave this "
            "null if the image truly contains no clinical content at all (e.g. it's purely an appointment slip)."
        ),
    )
    medications: List[str] = Field(default_factory=list, description="Prescribed medications with dosage")
    summary: str = Field(
        description=(
            "A concise 1-2 sentence summary, written after you've extracted the detailed diagnosis above — "
            "condense that detail here rather than re-reading the image independently."
        )
    )
    visit_date: Optional[str] = Field(default=None, description="Date this prescription/visit was issued, in YYYY-MM-DD format if determinable from the image")
    next_visit: Optional[NextVisit] = Field(default=None, description="Details of the next scheduled visit, if mentioned")


def get_llm():
    return AzureChatOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        azure_deployment="gpt-5.4",
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        api_key=os.environ["AZURE_OPENAI_KEY"],
    )


def _image_data_url(image_path: str) -> str:
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    ext = os.path.splitext(image_path)[1].lstrip(".").lower() or "jpeg"
    return f"data:image/{ext};base64,{image_data}"


def generate_prescription_summary(image_path: str, extra_image_paths: Optional[List[str]] = None) -> PrescriptionSummary:
    """extra_image_paths: additional pages of the SAME case sheet (e.g. the
    backside) to read together with image_path as one document — not separate
    visits. Medications/diagnosis are often split across front and back, so
    passing linked extra pages here (rather than extracting each in isolation)
    is what makes the combined result complete."""
    text = (
        "Read this prescription image carefully, including all handwritten notes — not just "
        "printed/typed fields. First, work through the clinical content in detail: chief "
        "complaint, exam findings, assessment/impression, and any procedure notes. Diagnostic "
        "information is often embedded in freeform clinical notes without an explicit 'Diagnosis:' "
        "label — look for it there too, and don't leave diagnosis null just because there's no "
        "such label. Put ONLY the clinical findings themselves into the diagnosis field, written as "
        "a plain clinical statement — not a description of what you're reading. Do not write things "
        "like 'handwritten notes appear to read', 'the image shows', or sentences explaining that "
        "something is hard to read; if a word is illegible, either skip it or tag just that word "
        "'(unclear)'. Then write the concise summary from that detail. Also extract the patient "
        "name, patient ID, doctor name, clinic/hospital name, medications, the date this visit/"
        "prescription was issued (visit_date), and next visit date/time/reason/location if mentioned."
    )
    if extra_image_paths:
        text += (
            " The following image(s) are additional pages of this SAME case sheet (e.g. the reverse "
            "side) — read them together as one document, not as separate visits; combine medications "
            "and clinical content from all pages into the single result."
        )

    content = [{"type": "text", "text": text}]
    for path in [image_path, *(extra_image_paths or [])]:
        content.append({"type": "image_url", "image_url": {"url": _image_data_url(path)}})

    message = HumanMessage(content=content)
    llm = get_llm().with_structured_output(PrescriptionSummary)
    return llm.invoke([message])


def prescription_to_visit_record(prescription: PrescriptionSummary, image_path: str) -> dict:
    filename = os.path.basename(image_path)
    visit_date = prescription.visit_date or guess_date_from_filename(filename)
    return {
        "source_image": filename,
        "processed_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "visit_date": visit_date,
        "patient_id": prescription.patient_id,
        "patient_name": prescription.patient_name,
        "doctor_name": prescription.doctor_name,
        "clinic_name": prescription.clinic_name,
        "diagnosis": prescription.diagnosis,
        "medications": prescription.medications,
        "summary": prescription.summary,
        "next_visit": prescription.next_visit.model_dump() if prescription.next_visit else None,
        "extra_pages": [],
        "pharmacy_receipts": [],
    }


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


def history_attachments(
    history: List[dict], images_dir: Path = PRESCRIPTIONS_DIR
) -> Tuple[List[Tuple[str, bytes]], int]:
    """Resolve every visit's source image (plus any linked extra pages — e.g. the
    backside of the same case sheet — and pharmacy receipts, immediately following
    their visit, in that order), downscale them, and combine them all into ONE PDF
    in reverse-chronological order (most recent visit first — history arrives
    oldest-first, so visits are walked in reverse) rather than attaching each image
    separately. If the combined size would still be too large, keeps the most
    recent images and drops the oldest — dropped ones are still described in the
    Earlier Visits text/HTML, just not included as pages.

    Returns (attachments, included_count): attachments is a single-item list
    [(filename, pdf_bytes)] (empty list if nothing could be resolved), and
    included_count is how many images (prescriptions + extra pages + pharmacy
    receipts) actually made it into the PDF."""
    pages = []  # (label, PIL.Image, estimated_bytes), most recent visit first

    def _add_page(label: str, kind: str) -> None:
        match = locate_image(label, images_dir)
        if not match:
            print(f"  warning: could not locate {kind} {label}")
            return
        try:
            img = _compress_image(match)
            pages.append((label, img, _estimate_jpeg_bytes(img)))
        except Exception as error:
            print(f"  warning: failed to process {kind} {label}: {error}")

    for visit in reversed(history):
        source_image = visit.get("source_image")
        if source_image:
            _add_page(source_image, "attachment for")

        for page_name in visit.get("extra_pages") or []:
            _add_page(page_name, f"extra page for visit {source_image} —")

        for receipt_name in visit.get("pharmacy_receipts") or []:
            _add_page(receipt_name, f"pharmacy receipt for visit {source_image} —")

    if not pages:
        return [], 0

    total = sum(size for _, _, size in pages)
    if total > MAX_TOTAL_ATTACHMENT_BYTES:
        # Over budget — pages is already most-recent-first, so keep from the front
        # (most recent) and stop once the budget is used up.
        kept = []
        running = 0
        for entry in pages:
            if kept and running + entry[2] > MAX_TOTAL_ATTACHMENT_BYTES:
                break
            kept.append(entry)
            running += entry[2]
        dropped = len(pages) - len(kept)
        print(
            f"  warning: combined attachment images totalled {total / 1024 / 1024:.1f}MB; "
            f"keeping the {len(kept)} most recent and omitting the {dropped} oldest "
            f"(still listed in Earlier Visits, just not included in the PDF)"
        )
        pages = kept

    images = [img for _, img, _ in pages]
    buf = io.BytesIO()
    images[0].save(buf, format="PDF", save_all=True, append_images=images[1:])

    patient_id = next((v.get("patient_id") for v in history if v.get("patient_id")), "patient")
    filename = f"{patient_id}_treatment_history.pdf"
    return [(filename, buf.getvalue())], len(pages)


def _fmt_date(date_str, time_str):
    try:
        dt = datetime.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        return dt.strftime("%A, %d %B %Y"), dt.strftime("%I:%M %p").lstrip("0")
    except ValueError:
        return date_str, time_str


def _html_escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _display_name(name: Optional[str]) -> Optional[str]:
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


def build_latest_visit_text(prescription: PrescriptionSummary) -> str:
    meds = ", ".join(prescription.medications) if prescription.medications else "None recorded"
    return (
        f"Most recent visit ({prescription.visit_date or 'recent'}, {prescription.doctor_name or 'N/A'}):\n"
        f"  Diagnosis: {prescription.diagnosis or 'N/A'}\n"
        f"  Medications: {meds}\n"
        f"  Notes: {prescription.summary}"
    )


def build_latest_visit_html(prescription: PrescriptionSummary) -> str:
    meds = ", ".join(prescription.medications) if prescription.medications else "None recorded"
    return f"""
      <div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Most Recent Visit — {_html_escape(prescription.visit_date or 'recent')}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#4b5563;"><b>Diagnosis:</b> {_html_escape(prescription.diagnosis or 'N/A')}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#4b5563;"><b>Medications:</b> {_html_escape(meds)}</p>
        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">{_html_escape(prescription.summary)}</p>
      </div>
    """


def _group_by_visit_date(history: List[dict]) -> List[List[dict]]:
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


def _group_by_doctor(visits: List[dict]) -> List[Tuple[str, List[dict]]]:
    """Further group a same-date list of visits by doctor (case/whitespace
    insensitive, since OCR extraction casing drifts between visits — e.g. "DR.
    KABIR SUMAN DASH" vs "Dr. Kabir Suman Dash" for the same person), so one
    doctor's multiple same-day visits share a single heading instead of
    repeating their name. Preserves order of first appearance."""
    groups: List[Tuple[str, List[dict]]] = []
    index_by_key: dict = {}
    for v in visits:
        raw_name = v.get("doctor_name") or "N/A"
        key = raw_name.strip().lower()
        if key in index_by_key:
            groups[index_by_key[key]][1].append(v)
        else:
            index_by_key[key] = len(groups)
            groups.append((_display_name(raw_name) or raw_name, [v]))
    return groups


def build_earlier_visits_text(history: List[dict], detailed: bool) -> str:
    """history = visits strictly before the most recent one (already excludes it)."""
    if not history:
        return ""
    lines = [f"Earlier visits in this treatment ({len(history)}, most recent first):"]
    for group in _group_by_visit_date(history):
        date_label = group[0].get("visit_date") or "unknown date"
        if len(group) == 1:
            visit = group[0]
            if detailed:
                meds = ", ".join(visit.get("medications") or []) or "None recorded"
                lines.append(
                    f"- {date_label} ({visit.get('doctor_name') or 'N/A'}): "
                    f"{visit.get('diagnosis') or 'N/A'} | Meds: {meds}"
                )
            else:
                lines.append(f"- {date_label}: {visit.get('diagnosis') or 'N/A'}")
        elif detailed:
            lines.append(f"- {date_label}:")
            for doctor_name, doctor_visits in _group_by_doctor(group):
                if len(doctor_visits) == 1:
                    v = doctor_visits[0]
                    meds = ", ".join(v.get("medications") or []) or "None recorded"
                    lines.append(f"    - {doctor_name}: {v.get('diagnosis') or 'N/A'} | Meds: {meds}")
                else:
                    lines.append(f"    - {doctor_name}:")
                    for v in doctor_visits:
                        meds = ", ".join(v.get("medications") or []) or "None recorded"
                        lines.append(f"        - {v.get('diagnosis') or 'N/A'} | Meds: {meds}")
        else:
            lines.append(f"- {date_label}:")
            for visit in group:
                lines.append(f"    - {visit.get('diagnosis') or 'N/A'}")
    return "\n".join(lines)


def build_earlier_visits_html(history: List[dict], detailed: bool) -> str:
    """history = visits strictly before the most recent one (already excludes it)."""
    if not history:
        return ""

    def _entry(v: dict) -> str:
        if detailed:
            return (
                f"<b>{_html_escape(v.get('doctor_name') or 'N/A')}</b><br>"
                f"{_html_escape(v.get('diagnosis') or 'N/A')}<br>"
                f'<span style="color:#6b7280;font-size:12px;">Meds: '
                f"{_html_escape(', '.join(v.get('medications') or []) or 'None recorded')}</span>"
            )
        return _html_escape(v.get("diagnosis") or "N/A")

    def _note(v: dict) -> str:
        """Diagnosis + meds without the doctor name — used once a doctor heading
        already covers it."""
        return (
            f"{_html_escape(v.get('diagnosis') or 'N/A')}<br>"
            f'<span style="color:#6b7280;font-size:12px;">Meds: '
            f"{_html_escape(', '.join(v.get('medications') or []) or 'None recorded')}</span>"
        )

    def _doctor_group_item(doctor_name: str, visits: List[dict]) -> str:
        if len(visits) == 1:
            return f'<li style="margin-bottom:6px;">{_entry(visits[0])}</li>'
        notes = "".join(f'<li style="margin-bottom:4px;">{_note(v)}</li>' for v in visits)
        return (
            f'<li style="margin-bottom:6px;"><b>{_html_escape(doctor_name)}</b>'
            f'<ul style="margin:4px 0 0;padding-left:16px;">{notes}</ul></li>'
        )

    item_parts = []
    for group in _group_by_visit_date(history):
        date_label = _html_escape(group[0].get("visit_date") or "Unknown date")
        if len(group) == 1:
            v = group[0]
            if detailed:
                item_parts.append(f"""
            <li style="margin-bottom:10px;">
              <b>{date_label}</b><br>
              {_entry(v)}
            </li>""")
            else:
                item_parts.append(f"<li style='margin-bottom:4px;'><b>{date_label}:</b> {_entry(v)}</li>")
        elif detailed:
            sub_items = "".join(_doctor_group_item(doctor_name, visits) for doctor_name, visits in _group_by_doctor(group))
            item_parts.append(f"""
            <li style="margin-bottom:10px;">
              <b>{date_label}</b> <span style="color:#6b7280;font-size:12px;">({len(group)} visits)</span>
              <ul style="margin:4px 0 0;padding-left:16px;">{sub_items}</ul>
            </li>""")
        else:
            sub_items = "".join(f'<li style="margin-bottom:6px;">{_entry(v)}</li>' for v in group)
            item_parts.append(f"""
            <li style="margin-bottom:10px;">
              <b>{date_label}</b> <span style="color:#6b7280;font-size:12px;">({len(group)} visits)</span>
              <ul style="margin:4px 0 0;padding-left:16px;">{sub_items}</ul>
            </li>""")
    items = "".join(item_parts)
    return f"""
      <div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Earlier Visits ({len(history)}, most recent first)</p>
        <ul style="margin:0;padding-left:18px;">{items}</ul>
      </div>
    """


def build_attachment_note_text(count: int) -> str:
    if not count:
        return ""
    label = "image" if count == 1 else "images"
    return f"Attached: a single PDF combining {count} {label} (visits and pharmacy receipts) from this treatment's history (most recent first).\n"


def build_attachment_note_html(count: int) -> str:
    if not count:
        return ""
    label = "image" if count == 1 else "images"
    return (
        f'<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">&#128206; Attached: a single PDF '
        f'combining {count} {label} (visits and pharmacy receipts) from this treatment (most recent first).</p>'
    )


def build_calendar_description(prescription, earlier_history: Optional[List[dict]] = None):
    nv = prescription.next_visit
    meds = prescription.medications or []
    meds_html = (
        "<ul>" + "".join(f"<li>{_html_escape(m)}</li>" for m in meds) + "</ul>"
        if meds else "<i>None recorded</i>"
    )

    rows = [
        ("Patient", prescription.patient_name),
        ("Doctor", prescription.doctor_name),
    ]
    lines = [f"<b>{label}:</b> {_html_escape(value)}<br>" for label, value in rows if value]

    parts = [
        "<b>&#128203; Appointment</b><br>",
        *lines,
        f"<b>Reason:</b> {_html_escape(nv.reason or 'Follow-up visit')}<br><br>",
        f"<b>&#128218; Most Recent Visit ({_html_escape(prescription.visit_date or 'recent')})</b><br>",
        f"<b>Diagnosis:</b> {_html_escape(prescription.diagnosis or 'N/A')}<br>",
        "<b>Medications:</b><br>",
        meds_html,
        "<br><br>",
        f"{_html_escape(prescription.summary)}",
    ]

    if earlier_history:
        history_parts = []
        for group in _group_by_visit_date(earlier_history):
            date_label = _html_escape(group[0].get("visit_date") or "Unknown date")
            if len(group) == 1:
                v = group[0]
                history_parts.append(
                    f"<li><b>{date_label}</b> ({_html_escape(v.get('doctor_name') or 'N/A')}): "
                    f"{_html_escape(v.get('diagnosis') or 'N/A')}</li>"
                )
            else:
                sub_items = "".join(
                    (
                        f"<li><b>{_html_escape(doctor_name)}</b>: {_html_escape(visits[0].get('diagnosis') or 'N/A')}</li>"
                        if len(visits) == 1 else
                        f"<li><b>{_html_escape(doctor_name)}</b><ul>"
                        + "".join(f"<li>{_html_escape(v.get('diagnosis') or 'N/A')}</li>" for v in visits)
                        + "</ul></li>"
                    )
                    for doctor_name, visits in _group_by_doctor(group)
                )
                history_parts.append(f"<li><b>{date_label}</b><ul>{sub_items}</ul></li>")
        history_items = "".join(history_parts)
        parts.append(f"<br><br><b>&#128220; Earlier Visits ({len(earlier_history)}, most recent first)</b><br><ul>{history_items}</ul>")

    return "".join(parts)


def _email_shell(accent, title, subtitle, body_rows, closing_html):
    rows_html = "".join(
        f"""
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">{label}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:14px;color:#1f2937;vertical-align:top;">{value}</td>
        </tr>"""
        for label, value in body_rows
    )

    return f"""\
<div style="background-color:#f4f5f7;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:{accent};padding:24px 28px;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">{title}</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">{subtitle}</p>
    </div>
    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        {rows_html}
      </table>
      {closing_html}
    </div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #eef0f3;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated message from your clinic's scheduling assistant.</p>
    </div>
  </div>
</div>"""


def build_patient_email_html(prescription, event_link, earlier_history: Optional[List[dict]] = None, attachment_count: int = 0):
    nv = prescription.next_visit

    rows = [
        ("Date", _html_escape(_fmt_date(nv.date, nv.time)[0])),
        ("Time", _html_escape(_fmt_date(nv.date, nv.time)[1])),
        ("Location", _html_escape(nv.location or "TBD")),
        ("Reason", _html_escape(nv.reason or "Follow-up visit")),
    ]

    button = (
        f'<a href="{event_link}" style="display:inline-block;margin-top:20px;padding:10px 18px;'
        f'background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;'
        f'font-weight:600;">View in Calendar</a>'
        if event_link else ""
    )
    closing = f"""
      {build_latest_visit_html(prescription)}
      {build_earlier_visits_html(earlier_history or [], detailed=False)}
      {build_attachment_note_html(attachment_count)}
      {button}
    """

    return _email_shell(
        accent="#2563eb",
        title="Your Follow-up Visit is Scheduled",
        subtitle=f"Hi {prescription.patient_name or 'there'}, here are your visit details",
        body_rows=rows,
        closing_html=closing,
    )


def build_doctor_email_html(prescription, event_link, earlier_history: Optional[List[dict]] = None, attachment_count: int = 0):
    nv = prescription.next_visit
    date_str, time_str = _fmt_date(nv.date, nv.time)

    rows = [
        ("Patient", _html_escape(prescription.patient_name or "N/A")),
        ("Patient ID", _html_escape(prescription.patient_id or "N/A")),
        ("Date", _html_escape(date_str)),
        ("Time", _html_escape(time_str)),
        ("Reason", _html_escape(nv.reason or "Follow-up visit")),
    ]

    button = (
        f'<a href="{event_link}" style="display:inline-block;margin-top:20px;padding:10px 18px;'
        f'background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;'
        f'font-weight:600;">View in Calendar</a>'
        if event_link else ""
    )
    closing = f"""
      {build_latest_visit_html(prescription)}
      {build_earlier_visits_html(earlier_history or [], detailed=True)}
      {build_attachment_note_html(attachment_count)}
      {button}
    """

    return _email_shell(
        accent="#0f766e",
        title="Follow-up Visit Scheduled",
        subtitle="A new appointment has been added to your calendar",
        body_rows=rows,
        closing_html=closing,
    )


def build_patient_recipient(name: str, email: str) -> Recipient:
    return Recipient(
        name=name,
        email=email,
        slack_user_id=os.environ.get('PATIENT_SLACK_ID'),
        teams_upn=os.environ.get('PATIENT_TEAMS_UPN'),
        whatsapp_number=os.environ.get('PATIENT_WHATSAPP_NUMBER'),
        phone_number=os.environ.get('PATIENT_PHONE_NUMBER'),
    )


def build_doctor_recipient(name: str, email: str) -> Recipient:
    return Recipient(
        name=name,
        email=email,
        slack_user_id=os.environ.get('DOCTOR_SLACK_ID'),
        teams_upn=os.environ.get('DOCTOR_TEAMS_UPN'),
        whatsapp_number=os.environ.get('DOCTOR_WHATSAPP_NUMBER'),
        phone_number=os.environ.get('DOCTOR_PHONE_NUMBER'),
    )


def _as_email_list(value) -> List[str]:
    return [value] if isinstance(value, str) else list(value)


def _has_valid_next_visit_date(next_visit: Optional[NextVisit]) -> bool:
    """True only if next_visit names an actual, parseable date. Extraction can
    return a NextVisit with a blank/placeholder date (e.g. "" or ".") when the
    image mentions a follow-up is needed but doesn't state when — that's not
    a schedulable next visit, so callers should treat it the same as no
    next_visit at all rather than pass it on to event creation and emails."""
    if next_visit is None or not next_visit.date:
        return False
    try:
        datetime.datetime.strptime(next_visit.date, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _parse_next_visit_datetime(next_visit: NextVisit) -> tuple:
    time_str = next_visit.time or "09:00"
    try:
        start_time = datetime.datetime.strptime(f"{next_visit.date} {time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        print(f"  warning: could not parse next_visit time {next_visit.time!r}; defaulting to 09:00")
        start_time = datetime.datetime.strptime(f"{next_visit.date} 09:00", "%Y-%m-%d %H:%M")
    return start_time, start_time + datetime.timedelta(minutes=30)


def _schedule_from_prescription(
    prescription: "PrescriptionSummary",
    patient_email: str,
    doctor_emails: List[str],
    exclude_visit_id: Optional[str] = None,
    images_dir: Path = PRESCRIPTIONS_DIR,
    db_path: Path = DEFAULT_DB_PATH,
) -> dict:
    """Shared tail for scheduling: given a prescription (freshly extracted, reused
    from storage, or synthesized from history for a manual booking) with a next_visit
    set, pull treatment history, create the calendar event, and notify patient + every
    doctor in doctor_emails (all get the same full history and attachments — the whole
    case travels together regardless of which doctor is being emailed).
    exclude_visit_id keeps the "current" visit out of the Earlier Visits list so it
    isn't shown twice (once as-is, once inside the Most Recent Visit card)."""
    history = get_treatment_history(
        prescription.patient_id,
        before_date=prescription.next_visit.date,
        db_path=db_path,
    )
    earlier_history = [v for v in history if v.get("id") != exclude_visit_id]
    attachments, attachment_count = history_attachments(history, images_dir)

    start_time, end_time = _parse_next_visit_datetime(prescription.next_visit)

    # Display-only normalization (e.g. ALL-CAPS -> Title Case from OCR); the raw
    # `prescription`/`history` stay untouched for anything stored or compared.
    prescription = prescription.model_copy(update={
        "patient_name": _display_name(prescription.patient_name),
        "doctor_name": _display_name(prescription.doctor_name),
    })
    earlier_history = [
        {**v, "doctor_name": _display_name(v.get("doctor_name"))} for v in earlier_history
    ]

    summary = f"Next Visit: {prescription.patient_name or 'Patient'} with {prescription.doctor_name or 'Doctor'}"
    description = build_calendar_description(prescription, earlier_history=earlier_history)

    event_link = create_calendar_event(
        summary, description, start_time, end_time,
        [patient_email, *doctor_emails], location=prescription.next_visit.location,
    )
    event_link_line = f"Event link: {event_link}\n" if event_link else ""

    patient = build_patient_recipient(prescription.patient_name or 'Patient', patient_email)

    patient_results = send_to_recipient(
        patient,
        f"Follow-up visit scheduled with {prescription.doctor_name or 'your doctor'}",
        (
            f"Hi {prescription.patient_name or 'there'},\n\n"
            f"Your next visit with {prescription.doctor_name or 'your doctor'} is scheduled for "
            f"{prescription.next_visit.date} at {prescription.next_visit.time}.\n"
            f"Location: {prescription.next_visit.location or 'TBD'}\n"
            f"Reason: {prescription.next_visit.reason or 'Follow-up'}\n"
            f"{event_link_line}\n"
            f"{build_latest_visit_text(prescription)}\n\n"
            f"{build_earlier_visits_text(earlier_history, detailed=False)}\n\n"
            f"{build_attachment_note_text(attachment_count)}"
        ),
        html=build_patient_email_html(prescription, event_link, earlier_history=earlier_history, attachment_count=attachment_count),
        attachments=attachments,
    )
    doctor_results = {}
    for doctor_email in doctor_emails:
        doctor = build_doctor_recipient(prescription.doctor_name or 'Doctor', doctor_email)
        doctor_results[doctor_email] = send_to_recipient(
            doctor,
            f"Follow-up scheduled: {prescription.patient_name or prescription.patient_id or 'Patient'}",
            (
                f"A follow-up visit has been scheduled for patient {prescription.patient_name or 'N/A'} "
                f"(ID: {prescription.patient_id or 'N/A'}) on {prescription.next_visit.date} at {prescription.next_visit.time}.\n"
                f"Reason: {prescription.next_visit.reason or 'Follow-up'}\n"
                f"{event_link_line}\n"
                f"{build_latest_visit_text(prescription)}\n\n"
                f"{build_earlier_visits_text(earlier_history, detailed=True)}\n\n"
                f"{build_attachment_note_text(attachment_count)}"
            ),
            html=build_doctor_email_html(prescription, event_link, earlier_history=earlier_history, attachment_count=attachment_count),
            attachments=attachments,
        )
        print(f"Doctor notification results ({doctor_email}):", doctor_results[doctor_email])

    print("Patient notification results:", patient_results)
    return {
        "scheduled": True,
        "event_link": event_link,
        "history": history,
        "attachments": attachments,
        "doctor_results": doctor_results,
    }


def schedule_next_visit(
    image_path: str,
    patient_email: str,
    doctor_email: Union[str, List[str]],
    images_dir: Path = PRESCRIPTIONS_DIR,
    db_path: Path = DEFAULT_DB_PATH,
) -> dict:
    """Process one prescription image, record it as a visit, and — if it names
    a next visit — schedule that appointment with a cumulative summary and
    attachments covering every prior visit in this patient's history."""
    existing = find_by_source_image(os.path.basename(image_path), db_path)
    if existing:
        print(f"Visit already recorded ({existing['id']}); reusing stored data instead of re-extracting.")
        prescription = PrescriptionSummary(
            patient_id=existing.get("patient_id"),
            patient_name=existing.get("patient_name"),
            doctor_name=existing.get("doctor_name"),
            clinic_name=existing.get("clinic_name"),
            diagnosis=existing.get("diagnosis"),
            medications=existing.get("medications") or [],
            summary=existing.get("summary") or "",
            visit_date=existing.get("visit_date"),
            next_visit=NextVisit(**existing["next_visit"]) if existing.get("next_visit") else None,
        )
        visit_record = existing
    else:
        prescription = generate_prescription_summary(image_path)
        print(prescription.model_dump_json(indent=2))
        visit_record = add_visit(prescription_to_visit_record(prescription, image_path), db_path)

    if not _has_valid_next_visit_date(prescription.next_visit):
        print("No usable next visit date found in the prescription; skipping scheduling (no event, no emails).")
        return {"visit": visit_record, "scheduled": False}

    result = _schedule_from_prescription(
        prescription, patient_email, _as_email_list(doctor_email),
        exclude_visit_id=visit_record.get("id"), images_dir=images_dir, db_path=db_path,
    )
    return {"visit": visit_record, **result}


def schedule_manual_next_visit(
    patient_id: str,
    date: str,
    time: str,
    patient_email: str,
    doctor_email: Union[str, List[str]],
    reason: Optional[str] = "Follow-up",
    location: Optional[str] = None,
    patient_name: Optional[str] = None,
    doctor_name: Optional[str] = None,
    images_dir: Path = PRESCRIPTIONS_DIR,
    db_path: Path = DEFAULT_DB_PATH,
) -> dict:
    """Schedule a future appointment straight from existing visit history — no new
    prescription image required. Use this to book ahead (e.g. a follow-up the doctor
    asked for verbally) before there's a new document to process. Every visit up to
    `date` is attached and summarized regardless of doctor — the whole case travels
    together. The single most recent visit stands in for "current visit" context in
    the email; if multiple visits share the latest date (e.g. two doctors seen the
    same day), pass doctor_name to pick which one's context leads — otherwise it
    defaults to whichever was recorded last."""
    history = get_treatment_history(patient_id, before_date=date, db_path=db_path)
    if not history:
        raise ValueError(f"No recorded visits found for patient_id={patient_id!r} before {date}")

    if doctor_name:
        needle = doctor_name.strip().lower()
        doctor_visits = [v for v in history if (v.get("doctor_name") or "").strip().lower() == needle]
        latest = doctor_visits[-1] if doctor_visits else history[-1]
    else:
        latest = history[-1]
        same_day = [v for v in history if v.get("visit_date") == latest.get("visit_date")]
        if len(same_day) > 1:
            names = ", ".join(sorted({v.get("doctor_name") or "N/A" for v in same_day}))
            print(
                f"  note: {len(same_day)} visits share the latest date ({latest.get('visit_date')}) "
                f"across doctors ({names}); defaulting 'Most Recent Visit' to {latest.get('doctor_name')!r}. "
                f"Pass doctor_name= to pick a specific one — all of them are still attached either way."
            )
    prescription = PrescriptionSummary(
        patient_id=patient_id,
        patient_name=patient_name or latest.get("patient_name"),
        doctor_name=doctor_name or latest.get("doctor_name"),
        clinic_name=latest.get("clinic_name"),
        diagnosis=latest.get("diagnosis"),
        medications=latest.get("medications") or [],
        summary=latest.get("summary") or "",
        visit_date=latest.get("visit_date"),
        next_visit=NextVisit(
            date=date, time=time, reason=reason, location=location or latest.get("clinic_name"),
        ),
    )
    return _schedule_from_prescription(
        prescription, patient_email, _as_email_list(doctor_email),
        exclude_visit_id=latest.get("id"), images_dir=images_dir, db_path=db_path,
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Process a prescription and/or schedule its next visit.")
    sub = parser.add_subparsers(dest="command", required=True)

    from_image = sub.add_parser(
        "from-image", help="Extract a prescription image, record it, and schedule the next visit it names."
    )
    from_image.add_argument("image_path")
    from_image.add_argument("--patient-email", required=True)
    from_image.add_argument(
        "--doctor-email", required=True, action="append",
        help="Repeatable — pass multiple times to notify multiple doctors, e.g. "
             "--doctor-email a@x.com --doctor-email b@y.com. All get the same full history.",
    )

    manual = sub.add_parser(
        "manual", help="Schedule a future visit from existing history, without a new prescription image."
    )
    manual.add_argument("--patient-id", required=True)
    manual.add_argument("--date", required=True, help="YYYY-MM-DD")
    manual.add_argument("--time", required=True, help="HH:MM, 24-hour")
    manual.add_argument("--patient-email", required=True)
    manual.add_argument(
        "--doctor-email", required=True, action="append",
        help="Repeatable — pass multiple times to notify multiple doctors, e.g. "
             "--doctor-email a@x.com --doctor-email b@y.com. All get the same full history.",
    )
    manual.add_argument("--reason", default="Follow-up")
    manual.add_argument("--location", default=None)
    manual.add_argument("--patient-name", default=None)
    manual.add_argument(
        "--doctor-name", default=None,
        help=(
            "Optional. Only matters if multiple visits share the latest recorded date "
            "(e.g. two doctors seen the same day) — picks whose visit leads the 'Most "
            "Recent Visit' summary. Every visit in the patient's history is attached "
            "and listed either way; this never excludes anyone."
        ),
    )

    return parser


if __name__ == '__main__':
    cli_args = _build_arg_parser().parse_args()

    if cli_args.command == "from-image":
        schedule_next_visit(
            image_path=cli_args.image_path,
            patient_email=cli_args.patient_email,
            doctor_email=cli_args.doctor_email,
        )
    elif cli_args.command == "manual":
        schedule_manual_next_visit(
            patient_id=cli_args.patient_id,
            date=cli_args.date,
            time=cli_args.time,
            patient_email=cli_args.patient_email,
            doctor_email=cli_args.doctor_email,
            reason=cli_args.reason,
            location=cli_args.location,
            patient_name=cli_args.patient_name,
            doctor_name=cli_args.doctor_name,
        )