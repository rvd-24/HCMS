"""Extract medicines/dosage from a case sheet image and email the pharmacy
department to fulfil them, with the case sheet attached for reference.

Usage: python pharmacy_request.py path/to/case_sheet.png
"""
import argparse
import os
from pathlib import Path

from dotenv import find_dotenv, load_dotenv

from integrations.base import Recipient
from integrations.dispatch import send_to_recipient
from schedule_meet import PrescriptionSummary, _display_name, generate_prescription_summary
from visit_store import find_by_source_image
from visit_utils import PRESCRIPTIONS_DIR, locate_image

load_dotenv(find_dotenv())


def _html_escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_pharmacy_recipient() -> Recipient:
    return Recipient(
        name="Pharmacy",
        email=os.environ.get("PHARMACY_EMAIL") or None,
        slack_user_id=os.environ.get("PHARMACY_SLACK_ID"),
        teams_upn=os.environ.get("PHARMACY_TEAMS_UPN"),
        whatsapp_number=os.environ.get("PHARMACY_WHATSAPP_NUMBER"),
        phone_number=os.environ.get("PHARMACY_PHONE_NUMBER"),
    )


def build_pharmacy_request_text(prescription: PrescriptionSummary, page_count: int = 1) -> str:
    meds = prescription.medications or []
    meds_lines = "\n".join(f"  - {m}" for m in meds) if meds else "  (none listed)"
    attachment_note = "Case sheet attached for reference (front and back)." if page_count > 1 else "Case sheet attached for reference."
    return (
        f"Patient {prescription.patient_name or 'N/A'} (ID: {prescription.patient_id or 'N/A'}) "
        f"from {prescription.clinic_name or 'this department'}, under {prescription.doctor_name or 'the attending doctor'}, "
        f"needs the following medicines:\n\n"
        f"{meds_lines}\n\n"
        f"{attachment_note}"
    )


def build_pharmacy_request_html(prescription: PrescriptionSummary, page_count: int = 1) -> str:
    meds = prescription.medications or []
    meds_html = (
        "<ul>" + "".join(f"<li>{_html_escape(m)}</li>" for m in meds) + "</ul>"
        if meds else "<i>None listed</i>"
    )
    attachment_note = "Case sheet attached for reference (front and back)." if page_count > 1 else "Case sheet attached for reference."
    return f"""
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#1f2937;">
        <p style="margin:0 0 12px;">
          <b>Patient:</b> {_html_escape(prescription.patient_name or 'N/A')}<br>
          <b>Patient ID:</b> {_html_escape(prescription.patient_id or 'N/A')}<br>
          <b>Department/Clinic:</b> {_html_escape(prescription.clinic_name or 'N/A')}<br>
          <b>Doctor:</b> {_html_escape(prescription.doctor_name or 'N/A')}
        </p>
        <p style="margin:0 0 4px;">The above patient needs the following medicines:</p>
        {meds_html}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">{attachment_note}</p>
      </div>
    """


def send_pharmacy_request(image_path: str, images_dir: Path = PRESCRIPTIONS_DIR) -> dict:
    """Extract medicines from a case sheet and request them from the pharmacy
    department. Read-only w.r.t. visit history — this doesn't write to visits.json,
    it just relays a medicine request straight from the case sheet image. If the
    image is already recorded as a visit with linked extra_pages (e.g. the
    backside of the same sheet), those pages are read together with it so
    medications split across front/back aren't missed, and are attached to the
    email alongside the main case sheet."""
    visit = find_by_source_image(os.path.basename(image_path))
    extra_page_names = (visit.get("extra_pages") or []) if visit else []

    extra_image_paths = []
    for name in extra_page_names:
        match = locate_image(name, images_dir)
        if match:
            extra_image_paths.append(str(match))
        else:
            print(f"  warning: could not locate extra page {name!r} linked to this visit; continuing without it")

    prescription = generate_prescription_summary(image_path, extra_image_paths=extra_image_paths or None)
    print(prescription.model_dump_json(indent=2))

    # Display-only normalization (e.g. ALL-CAPS -> Sentence Case from OCR).
    prescription = prescription.model_copy(update={
        "patient_name": _display_name(prescription.patient_name),
        "doctor_name": _display_name(prescription.doctor_name),
    })

    if not prescription.medications:
        print("No medicines found on this case sheet; skipping pharmacy request.")
        return {"sent": False, "reason": "no medications extracted", "prescription": prescription.model_dump()}

    pharmacy = build_pharmacy_recipient()
    if not any([pharmacy.email, pharmacy.slack_user_id, pharmacy.teams_upn, pharmacy.whatsapp_number, pharmacy.phone_number]):
        raise RuntimeError(
            "No pharmacy contact configured — set PHARMACY_EMAIL (or another PHARMACY_* var) in .env"
        )

    subject = (
        f"Medicine request: {prescription.patient_name or prescription.patient_id or 'Patient'} "
        f"({prescription.doctor_name or 'N/A'})"
    )
    page_count = 1 + len(extra_image_paths)
    results = send_to_recipient(
        pharmacy,
        subject,
        build_pharmacy_request_text(prescription, page_count=page_count),
        html=build_pharmacy_request_html(prescription, page_count=page_count),
        attachments=[image_path, *extra_image_paths],
    )
    print("Pharmacy notification results:", results)
    return {"sent": True, "prescription": prescription.model_dump(), "results": results}


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract medicines from a case sheet image and request them from the pharmacy department."
    )
    parser.add_argument("image_path", help="Path to the case sheet image.")
    return parser


if __name__ == "__main__":
    cli_args = _build_arg_parser().parse_args()
    send_pharmacy_request(cli_args.image_path)
