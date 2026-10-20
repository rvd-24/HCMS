"""Text/HTML bodies for appointment emails and calendar event descriptions
(moved from schedule_meet.py)."""
from typing import List, Optional

from .extraction import PrescriptionSummary
from .history import group_by_doctor, group_by_visit_date
from .text import fmt_date, html_escape as _html_escape


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


def build_earlier_visits_text(history: List[dict], detailed: bool) -> str:
    """history = visits strictly before the most recent one (already excludes it)."""
    if not history:
        return ""
    lines = [f"Earlier visits in this treatment ({len(history)}, most recent first):"]
    for group in group_by_visit_date(history):
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
            for doctor_name, doctor_visits in group_by_doctor(group):
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
    for group in group_by_visit_date(history):
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
            sub_items = "".join(_doctor_group_item(doctor_name, visits) for doctor_name, visits in group_by_doctor(group))
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


def build_calendar_description(prescription: PrescriptionSummary, earlier_history: Optional[List[dict]] = None) -> str:
    nv = prescription.next_visit
    meds = prescription.medications or []
    meds_html = (
        "<ul>" + "".join(f"<li>{_html_escape(m)}</li>" for m in meds) + "</ul>"
        if meds else "<i>None recorded</i>"
    )

    rows = [("Patient", prescription.patient_name), ("Doctor", prescription.doctor_name)]
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
        for group in group_by_visit_date(earlier_history):
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
                    for doctor_name, visits in group_by_doctor(group)
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


def _calendar_button(event_link: Optional[str], color: str) -> str:
    if not event_link:
        return ""
    return (
        f'<a href="{event_link}" style="display:inline-block;margin-top:20px;padding:10px 18px;'
        f'background:{color};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;'
        f'font-weight:600;">View in Calendar</a>'
    )


def build_patient_email_html(prescription, event_link, earlier_history: Optional[List[dict]] = None, attachment_count: int = 0):
    nv = prescription.next_visit
    date_str, time_str = fmt_date(nv.date, nv.time)
    rows = [
        ("Date", _html_escape(date_str)),
        ("Time", _html_escape(time_str)),
        ("Location", _html_escape(nv.location or "TBD")),
        ("Reason", _html_escape(nv.reason or "Follow-up visit")),
    ]
    closing = f"""
      {build_latest_visit_html(prescription)}
      {build_earlier_visits_html(earlier_history or [], detailed=False)}
      {build_attachment_note_html(attachment_count)}
      {_calendar_button(event_link, "#2563eb")}
    """
    return _email_shell(
        accent="#2563eb",
        title="Your Follow-up Visit is Scheduled",
        subtitle=f"Hi {_html_escape(prescription.patient_name or 'there')}, here are your visit details",
        body_rows=rows,
        closing_html=closing,
    )


def build_doctor_email_html(prescription, event_link, earlier_history: Optional[List[dict]] = None, attachment_count: int = 0):
    nv = prescription.next_visit
    date_str, time_str = fmt_date(nv.date, nv.time)
    rows = [
        ("Patient", _html_escape(prescription.patient_name or "N/A")),
        ("Patient ID", _html_escape(prescription.patient_id or "N/A")),
        ("Date", _html_escape(date_str)),
        ("Time", _html_escape(time_str)),
        ("Reason", _html_escape(nv.reason or "Follow-up visit")),
    ]
    closing = f"""
      {build_latest_visit_html(prescription)}
      {build_earlier_visits_html(earlier_history or [], detailed=True)}
      {build_attachment_note_html(attachment_count)}
      {_calendar_button(event_link, "#0f766e")}
    """
    return _email_shell(
        accent="#0f766e",
        title="Follow-up Visit Scheduled",
        subtitle="A new appointment has been added to your calendar",
        body_rows=rows,
        closing_html=closing,
    )


def build_patient_email_text(prescription, event_link, earlier_history, attachment_count) -> str:
    nv = prescription.next_visit
    event_link_line = f"Event link: {event_link}\n" if event_link else ""
    return (
        f"Hi {prescription.patient_name or 'there'},\n\n"
        f"Your next visit with {prescription.doctor_name or 'your doctor'} is scheduled for "
        f"{nv.date} at {nv.time}.\n"
        f"Location: {nv.location or 'TBD'}\n"
        f"Reason: {nv.reason or 'Follow-up'}\n"
        f"{event_link_line}\n"
        f"{build_latest_visit_text(prescription)}\n\n"
        f"{build_earlier_visits_text(earlier_history, detailed=False)}\n\n"
        f"{build_attachment_note_text(attachment_count)}"
    )


def build_doctor_email_text(prescription, event_link, earlier_history, attachment_count) -> str:
    nv = prescription.next_visit
    event_link_line = f"Event link: {event_link}\n" if event_link else ""
    return (
        f"A follow-up visit has been scheduled for patient {prescription.patient_name or 'N/A'} "
        f"(ID: {prescription.patient_id or 'N/A'}) on {nv.date} at {nv.time}.\n"
        f"Reason: {nv.reason or 'Follow-up'}\n"
        f"{event_link_line}\n"
        f"{build_latest_visit_text(prescription)}\n\n"
        f"{build_earlier_visits_text(earlier_history, detailed=True)}\n\n"
        f"{build_attachment_note_text(attachment_count)}"
    )
