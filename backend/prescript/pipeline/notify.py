"""Calendar event + multi-channel notifications for a scheduled follow-up, and
the pharmacy medicine request (from schedule_meet._schedule_from_prescription
and pharmacy_request.py).

Storage-agnostic: callers pass in the treatment history (visit dicts with
resolved `pages`) and fully-built Recipients, so the same code runs from the
web app and the CLI.
"""
import datetime
from typing import List, Optional

from ..config import get_settings
from ..integrations.base import Recipient
from ..integrations.dispatch import email_address_for, send_to_recipient
from .extraction import PrescriptionSummary
from .history import build_history_pdf
from .messages import (
    build_calendar_description,
    build_doctor_email_html,
    build_doctor_email_text,
    build_patient_email_html,
    build_patient_email_text,
)
from .text import display_name, html_escape


def notify_follow_up(
    prescription: PrescriptionSummary,
    start_time: datetime.datetime,
    end_time: datetime.datetime,
    history: List[dict],
    patient: Recipient,
    doctors: List[Recipient],
    exclude_visit_id: Optional[str] = None,
    create_calendar_event: bool = True,
) -> dict:
    """Given a prescription (freshly extracted, reused from storage, or synthesized
    from history for a manual booking) with next_visit set, create the calendar
    event and notify the patient + every doctor (all get the same full history and
    attachments — the whole case travels together regardless of which doctor is
    being notified). exclude_visit_id keeps the "current" visit out of the Earlier
    Visits list so it isn't shown twice."""
    earlier_history = [v for v in history if v.get("id") != exclude_visit_id]
    attachments, attachment_count = build_history_pdf(history)

    # Display-only normalization (e.g. ALL-CAPS -> Title Case from OCR).
    prescription = prescription.model_copy(update={
        "patient_name": display_name(prescription.patient_name),
        "doctor_name": display_name(prescription.doctor_name),
    })
    earlier_history = [{**v, "doctor_name": display_name(v.get("doctor_name"))} for v in earlier_history]

    event_link = None
    # Calendar invites are emailed to attendees by Google, so they obey the same
    # email switch/redirect as everything else.
    if create_calendar_event and get_settings().email_enabled:
        from ..integrations.google import schedule_meet

        attendees = sorted({email_address_for(r.email) for r in [patient, *doctors] if r.email})
        event_link = schedule_meet(
            f"Next Visit: {prescription.patient_name or 'Patient'} with {prescription.doctor_name or 'Doctor'}",
            build_calendar_description(prescription, earlier_history=earlier_history),
            start_time,
            end_time,
            attendees,
            location=prescription.next_visit.location,
        )

    patient_results = send_to_recipient(
        patient,
        f"Follow-up visit scheduled with {prescription.doctor_name or 'your doctor'}",
        build_patient_email_text(prescription, event_link, earlier_history, attachment_count),
        html=build_patient_email_html(prescription, event_link, earlier_history=earlier_history, attachment_count=attachment_count),
        attachments=attachments,
    )
    doctor_results = {}
    for doctor in doctors:
        doctor_results[doctor.email or doctor.name] = send_to_recipient(
            doctor,
            f"Follow-up scheduled: {prescription.patient_name or prescription.patient_id or 'Patient'}",
            build_doctor_email_text(prescription, event_link, earlier_history, attachment_count),
            html=build_doctor_email_html(prescription, event_link, earlier_history=earlier_history, attachment_count=attachment_count),
            attachments=attachments,
        )

    return {
        "event_link": event_link,
        "attachment_count": attachment_count,
        "patient": patient_results,
        "doctors": doctor_results,
    }


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
        "<ul>" + "".join(f"<li>{html_escape(m)}</li>" for m in meds) + "</ul>"
        if meds else "<i>None listed</i>"
    )
    attachment_note = "Case sheet attached for reference (front and back)." if page_count > 1 else "Case sheet attached for reference."
    return f"""
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#1f2937;">
        <p style="margin:0 0 12px;">
          <b>Patient:</b> {html_escape(prescription.patient_name or 'N/A')}<br>
          <b>Patient ID:</b> {html_escape(prescription.patient_id or 'N/A')}<br>
          <b>Department/Clinic:</b> {html_escape(prescription.clinic_name or 'N/A')}<br>
          <b>Doctor:</b> {html_escape(prescription.doctor_name or 'N/A')}
        </p>
        <p style="margin:0 0 4px;">The above patient needs the following medicines:</p>
        {meds_html}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">{attachment_note}</p>
      </div>
    """


def send_pharmacy_request(prescription: PrescriptionSummary, pharmacy: Recipient, page_paths: List[str]) -> dict:
    """Relay the medicines on a case sheet to the pharmacy department, with the
    sheet (and any linked extra pages) attached."""
    prescription = prescription.model_copy(update={
        "patient_name": display_name(prescription.patient_name),
        "doctor_name": display_name(prescription.doctor_name),
    })
    if not prescription.medications:
        return {"sent": False, "reason": "no medications on this visit"}
    if not any([pharmacy.email, pharmacy.slack_user_id, pharmacy.teams_upn, pharmacy.whatsapp_number, pharmacy.phone_number]):
        return {"sent": False, "reason": "no pharmacy contact configured — set PHARMACY_EMAIL (or another PHARMACY_* var) in .env"}

    subject = (
        f"Medicine request: {prescription.patient_name or prescription.patient_id or 'Patient'} "
        f"({prescription.doctor_name or 'N/A'})"
    )
    results = send_to_recipient(
        pharmacy,
        subject,
        build_pharmacy_request_text(prescription, page_count=len(page_paths)),
        html=build_pharmacy_request_html(prescription, page_count=len(page_paths)),
        attachments=page_paths,
    )
    return {"sent": True, "results": results}
