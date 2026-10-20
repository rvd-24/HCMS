"""DB row -> JSON shapes returned by the API. Kept in one place so the
frontend types (frontend/src/lib/types.ts) have a single source to mirror."""
from typing import Optional

from ..db.models import Appointment, AuditEvent, Doctor, Document, Patient, PharmacyRequest, User, Visit


def _iso(value) -> Optional[str]:
    return value.isoformat() if value else None


def doctor_brief(d: Optional[Doctor]) -> Optional[dict]:
    if not d:
        return None
    return {"id": d.id, "full_name": d.full_name, "specialty": d.specialty, "status": d.status}


def doctor_out(d: Doctor, **extra) -> dict:
    return {
        **doctor_brief(d),
        "department": d.department.name if d.department else None,
        "email": d.email,
        "phone_number": d.phone_number,
        "whatsapp_number": d.whatsapp_number,
        "slack_user_id": d.slack_user_id,
        "teams_upn": d.teams_upn,
        "aliases": d.aliases or [],
        "is_active": d.is_active,
        "has_login": d.user is not None,
        **extra,
    }


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "doctor": doctor_brief(u.doctor),
        "is_active": u.is_active,
        "last_login_at": _iso(u.last_login_at),
        "created_at": _iso(u.created_at),
    }


def patient_brief(p: Patient) -> dict:
    return {"id": p.id, "mrn": p.mrn, "full_name": p.full_name}


def patient_out(p: Patient, **extra) -> dict:
    return {
        **patient_brief(p),
        "email": p.email,
        "phone_number": p.phone_number,
        "whatsapp_number": p.whatsapp_number,
        "slack_user_id": p.slack_user_id,
        "teams_upn": p.teams_upn,
        "date_of_birth": _iso(p.date_of_birth),
        "sex": p.sex,
        "address": p.address,
        "notes": p.notes,
        "created_at": _iso(p.created_at),
        **extra,
    }


def appointment_out(a: Appointment) -> dict:
    return {
        "id": a.id,
        "patient": patient_brief(a.patient),
        "doctor": doctor_brief(a.doctor),
        "start_at": _iso(a.start_at),
        "end_at": _iso(a.end_at),
        "reason": a.reason,
        "location": a.location,
        "status": a.status,
        "source": a.source,
        "origin_visit_id": a.origin_visit_id,
        "calendar_event_link": a.calendar_event_link,
        "notification_results": a.notification_results,
        "notified_at": _iso(a.notified_at),
        "notes": a.notes,
        "checked_in_at": _iso(a.checked_in_at),
        "completed_at": _iso(a.completed_at),
        "cancel_reason": a.cancel_reason,
        "created_at": _iso(a.created_at),
    }


def document_out(d: Document, children: Optional[list] = None) -> dict:
    out = {
        "id": d.id,
        "kind": d.kind,
        "status": d.status,
        "original_filename": d.original_filename,
        "content_type": d.content_type,
        "patient_id": d.patient_id,
        "visit_id": d.visit_id,
        "parent_id": d.parent_id,
        "extraction": d.extraction,
        "error": d.error,
        "uploaded_at": _iso(d.uploaded_at),
    }
    if children is not None:
        out["children"] = [document_out(c) for c in children]
    return out


def visit_out(v: Visit) -> dict:
    return {
        "id": v.id,
        "patient": patient_brief(v.patient),
        "doctor": doctor_brief(v.doctor),
        "doctor_name_raw": v.doctor_name_raw,
        "clinic_name": v.clinic_name,
        "visit_date": _iso(v.visit_date),
        "diagnosis": v.diagnosis,
        "medications": v.medications or [],
        "summary": v.summary,
        "next_visit_note": v.next_visit_note,
        "documents": [document_out(d) for d in v.documents],
        "created_at": _iso(v.created_at),
    }


def pharmacy_request_out(r: PharmacyRequest) -> dict:
    return {
        "id": r.id,
        "visit_id": r.visit_id,
        "medications": r.medications or [],
        "status": r.status,
        "results": r.results,
        "created_at": _iso(r.created_at),
    }


def audit_out(e: AuditEvent) -> dict:
    return {
        "id": e.id,
        "actor": e.actor.full_name if e.actor else "System",
        "action": e.action,
        "entity_type": e.entity_type,
        "entity_id": e.entity_id,
        "summary": e.summary,
        "created_at": _iso(e.created_at),
    }
