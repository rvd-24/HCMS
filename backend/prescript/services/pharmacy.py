"""Pharmacy medicine requests for a recorded visit (web version of
pharmacy_request.py — uses the confirmed visit instead of re-extracting)."""
import traceback

from ..db import session_scope
from ..db.models import PharmacyRequest, Visit
from ..pipeline.extraction import PrescriptionSummary
from ..pipeline.notify import send_pharmacy_request
from .records import pharmacy_recipient, resolve_path


def run_pharmacy_request(request_id: str) -> None:
    with session_scope() as db:
        request = db.get(PharmacyRequest, request_id)
        if not request:
            return
        visit = db.get(Visit, request.visit_id)
        prescription = PrescriptionSummary(
            patient_id=visit.patient.mrn,
            patient_name=visit.patient.full_name,
            doctor_name=visit.doctor.full_name if visit.doctor else visit.doctor_name_raw,
            clinic_name=visit.clinic_name,
            diagnosis=visit.diagnosis,
            medications=request.medications,
            summary=visit.summary or "",
        )
        # Case sheet + its extra pages; pharmacy receipts aren't sent back to the pharmacy.
        pages = [str(resolve_path(d)) for d in visit.documents if d.kind in ("prescription", "extra_page")]
        try:
            outcome = send_pharmacy_request(prescription, pharmacy_recipient(), pages)
        except Exception as error:
            traceback.print_exc()
            outcome = {"sent": False, "reason": f"{type(error).__name__}: {error}"}
        request.results = outcome
        request.status = "sent" if outcome.get("sent") else "failed"
