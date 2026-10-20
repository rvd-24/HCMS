"""Bootstrap data: logins, the doctors seen in the existing prescriptions, the
legacy data/visits.json import, and optional synthetic demo data."""
import datetime
import json
import os
import random
import secrets
from pathlib import Path
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db.models import Appointment, Department, Doctor, Document, Patient, User, Visit
from .pipeline.text import locate_image, parse_time_or_default, valid_iso_date
from .security import hash_password, verify_password
from .services.matching import clean_patient_name, find_doctor_by_name, find_patient_by_mrn, remember_doctor_alias
from .services.records import to_stored_path

# Doctors appearing in the prescriptions on file. OCR spells some of them
# several ways; aliases make those variants resolve to one record. Specialties
# are only filled where the prescription states the department.
KNOWN_DOCTORS = [
    {"full_name": "Kabir Suman Dash", "specialty": None, "aliases": []},
    {"full_name": "Nivedita Sahoo", "specialty": None, "aliases": []},
    {"full_name": "Arpita Singh", "specialty": None, "aliases": []},
    {"full_name": "Sangamesh N. Chinnanavar", "specialty": None, "aliases": []},
    {
        "full_name": "Anlanuru Sri Sasank Tejaswee",
        "specialty": "Oral & Maxillofacial Surgery",
        "aliases": ["A Srisasank Tejaswee", "A Sri Sasank Tejaswee"],
    },
]


def _login_email(full_name: str) -> str:
    parts = [p for p in full_name.lower().replace(".", " ").split() if len(p) > 1]
    return f"{parts[0]}.{parts[-1]}@clinic.local"


def seed_core(db: Session, password: Optional[str] = None) -> dict:
    """Idempotent: creates the admin login, known doctors and one login per doctor.

    PRESCRIPT_ADMIN_PASSWORD / PRESCRIPT_DOCTOR_PASSWORD, when set, are the source
    of truth: existing admin/seeded doctor logins are reset to them on every run.
    Otherwise new logins get `password`, PRESCRIPT_SEED_PASSWORD, or a random one,
    and existing logins are left alone."""
    fallback = password or os.environ.get("PRESCRIPT_SEED_PASSWORD") or secrets.token_urlsafe(9)
    admin_env = os.environ.get("PRESCRIPT_ADMIN_PASSWORD", "").strip()
    doctor_env = os.environ.get("PRESCRIPT_DOCTOR_PASSWORD", "").strip()
    created, updated = [], []

    def ensure_password(user: User, env_password: str):
        if env_password and not verify_password(env_password, user.password_hash):
            user.password_hash = hash_password(env_password)
            updated.append(user.email)

    admin_email = os.environ.get("PRESCRIPT_ADMIN_EMAIL", "admin@clinic.local").strip().lower()
    admin = db.scalar(select(User).where(func.lower(User.email) == admin_email))
    if admin:
        ensure_password(admin, admin_env)
    else:
        db.add(User(email=admin_email, full_name="Hospital Admin", role="admin",
                    password_hash=hash_password(admin_env or fallback)))
        created.append(admin_email)

    for spec in KNOWN_DOCTORS:
        doctor = find_doctor_by_name(db, spec["full_name"])
        if not doctor:
            dept = None
            if spec["specialty"]:
                dept = db.scalar(select(Department).where(Department.name == spec["specialty"])) or Department(name=spec["specialty"])
            doctor = Doctor(full_name=spec["full_name"], specialty=spec["specialty"], aliases=spec["aliases"], department=dept)
            db.add(doctor)
            db.flush()
        if doctor.user:
            ensure_password(doctor.user, doctor_env)
        else:
            email = _login_email(doctor.full_name)
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(email=email, full_name=doctor.full_name, role="doctor",
                            password_hash=hash_password(doctor_env or fallback), doctor_id=doctor.id))
                created.append(email)
    db.flush()
    # Only report a password that isn't already written down in .env.
    shown = fallback if created and not (admin_env and doctor_env) else None
    return {"created_logins": created, "updated_logins": updated, "password": shown}


def import_legacy_json(db: Session, json_path: Path, images_dir: Path) -> dict:
    """Import data/visits.json (the old flat store) and link each visit's images
    in place — files stay in prescriptions/, they aren't copied. Safe to re-run:
    visits already imported (same legacy id) are skipped."""
    records = json.loads(json_path.read_text(encoding="utf-8"))
    stats = {"visits": 0, "skipped": 0, "patients": 0, "doctors": 0, "documents": 0, "missing_images": [], "appointments": 0}

    for record in records:
        if db.get(Visit, record["id"]):
            stats["skipped"] += 1
            continue

        patient = find_patient_by_mrn(db, record.get("patient_id"))
        if not patient:
            patient = Patient(mrn=record.get("patient_id"), full_name=clean_patient_name(record.get("patient_name")) or "Unknown patient")
            db.add(patient)
            db.flush()
            stats["patients"] += 1

        doctor = find_doctor_by_name(db, record.get("doctor_name"))
        if not doctor and record.get("doctor_name"):
            doctor = Doctor(full_name=clean_patient_name(record["doctor_name"].replace("Dr.", "").replace("DR.", "").strip()))
            db.add(doctor)
            db.flush()
            stats["doctors"] += 1
        if doctor:
            remember_doctor_alias(doctor, record.get("doctor_name"))

        nv = record.get("next_visit")
        visit = Visit(
            id=record["id"],
            patient_id=patient.id,
            doctor_id=doctor.id if doctor else None,
            doctor_name_raw=record.get("doctor_name"),
            clinic_name=record.get("clinic_name"),
            visit_date=datetime.date.fromisoformat(record["visit_date"]) if valid_iso_date(record.get("visit_date")) else None,
            diagnosis=record.get("diagnosis"),
            medications=record.get("medications") or [],
            summary=record.get("summary"),
            next_visit_note=nv,
        )
        if record.get("processed_at"):
            visit.created_at = datetime.datetime.fromisoformat(record["processed_at"])
        db.add(visit)
        db.flush()
        stats["visits"] += 1

        pages = [("prescription", record.get("source_image"))]
        pages += [("extra_page", name) for name in record.get("extra_pages") or []]
        pages += [("pharmacy_receipt", name) for name in record.get("pharmacy_receipts") or []]
        for order, (kind, name) in enumerate(pages):
            if not name:
                continue
            path = locate_image(name, images_dir)
            if not path:
                stats["missing_images"].append(name)
                continue
            db.add(Document(
                kind=kind, status="confirmed" if kind == "prescription" else "attached",
                original_filename=name, stored_path=to_stored_path(path),
                content_type=f"image/{path.suffix.lstrip('.').lower().replace('jpg', 'jpeg')}",
                patient_id=patient.id, visit_id=visit.id, sort_order=order,
            ))
            stats["documents"] += 1

    db.flush()

    # Turn each prescribed follow-up with a real date into an appointment so the
    # calendar shows the treatment's history. Past ones are marked completed when
    # a visit exists that day, otherwise no-show.
    for visit in db.scalars(select(Visit).where(Visit.next_visit_note.is_not(None))).unique():
        nv = visit.next_visit_note or {}
        if not valid_iso_date(nv.get("date")) or nv.get("date") == (visit.visit_date.isoformat() if visit.visit_date else None):
            continue
        if db.scalar(select(Appointment).where(Appointment.origin_visit_id == visit.id)):
            continue
        start = datetime.datetime.fromisoformat(f"{nv['date']}T{parse_time_or_default(nv.get('time'))}")
        happened = db.scalar(select(Visit).where(Visit.patient_id == visit.patient_id, Visit.visit_date == start.date()))
        status = "completed" if happened else ("no_show" if start < datetime.datetime.now() else "scheduled")
        db.add(Appointment(
            patient_id=visit.patient_id, doctor_id=visit.doctor_id, start_at=start,
            end_at=start + datetime.timedelta(minutes=get_settings().default_slot_minutes),
            reason=nv.get("reason") or "Follow-up", location=nv.get("location") or visit.clinic_name,
            status=status, source="prescription", origin_visit_id=visit.id,
            completed_at=start if status == "completed" else None,
        ))
        stats["appointments"] += 1
    db.flush()
    return stats


DEMO_PATIENTS = [
    ("Ananya Mishra", "F"), ("Rohan Patnaik", "M"), ("Sneha Rath", "F"), ("Arjun Mohanty", "M"),
    ("Priya Nayak", "F"), ("Vikram Behera", "M"), ("Kavya Das", "F"), ("Siddharth Jena", "M"),
    ("Meera Swain", "F"), ("Aditya Sahu", "M"), ("Ishita Pradhan", "F"), ("Rahul Tripathy", "M"),
]
DEMO_REASONS = ["Follow-up", "Scaling & polishing", "Root canal review", "Orthodontic adjustment",
                "Extraction review", "Consultation", "Dressing change", "Crown fitting"]
DEMO_DIAGNOSES = [
    ("Chronic generalized gingivitis.", ["Chlorhexidine mouthwash 0.2% — 10ml twice daily"]),
    ("Irreversible pulpitis with 36.", ["Amoxicillin 500mg TDS x 5 days", "Ibuprofen 400mg SOS"]),
    ("Dental caries with 16, 17.", []),
    ("Angle's Class I malocclusion with crowding.", []),
    ("Pericoronitis with 48.", ["Metronidazole 400mg TDS x 5 days", "Paracetamol 650mg SOS"]),
]


def seed_demo(db: Session, seed: int = 7) -> dict:
    """Synthetic patients/appointments around today so every screen has data to
    show. All demo patients carry a DEMO- MRN and a note saying so."""
    rng = random.Random(seed)
    doctors = list(db.scalars(select(Doctor).where(Doctor.is_active)).unique())
    if not doctors:
        raise RuntimeError("Run seed first — no doctors to attach demo appointments to")
    patients = []
    for i, (name, sex) in enumerate(DEMO_PATIENTS, start=1):
        mrn = f"DEMO-{1000 + i}"
        patient = find_patient_by_mrn(db, mrn)
        if not patient:
            patient = Patient(mrn=mrn, full_name=name, sex=sex, notes="Synthetic demo record.",
                              date_of_birth=datetime.date(rng.randint(1970, 2005), rng.randint(1, 12), rng.randint(1, 28)))
            db.add(patient)
        patients.append(patient)
    db.flush()

    today = datetime.date.today()
    made = 0
    for offset in range(-21, 8):
        day = today + datetime.timedelta(days=offset)
        if day.weekday() == 6:
            continue
        for doctor in doctors:
            for slot in rng.sample(range(16), k=rng.randint(1, 4)):
                start = datetime.datetime.combine(day, datetime.time(9, 0)) + datetime.timedelta(minutes=30 * slot)
                if db.scalar(select(Appointment).where(Appointment.doctor_id == doctor.id, Appointment.start_at == start)):
                    continue
                patient = rng.choice(patients)
                if offset < 0:
                    status = rng.choices(["completed", "no_show", "cancelled"], weights=[85, 8, 7])[0]
                elif offset == 0:
                    status = "completed" if start.hour < 11 else rng.choice(["scheduled", "confirmed", "checked_in"])
                else:
                    status = rng.choice(["scheduled", "scheduled", "confirmed"])
                appt = Appointment(
                    patient_id=patient.id, doctor_id=doctor.id, start_at=start,
                    end_at=start + datetime.timedelta(minutes=30), reason=rng.choice(DEMO_REASONS),
                    location=get_settings().clinic_name, status=status, source="manual",
                    completed_at=start if status == "completed" else None,
                )
                db.add(appt)
                made += 1
                if status == "completed" and rng.random() < 0.5:
                    diagnosis, meds = rng.choice(DEMO_DIAGNOSES)
                    db.add(Visit(patient_id=patient.id, doctor_id=doctor.id, visit_date=day,
                                 clinic_name=get_settings().clinic_name, diagnosis=diagnosis, medications=meds,
                                 summary=f"Demo visit — {diagnosis}"))
    db.flush()
    return {"patients": len(patients), "appointments": made}


def fill_contact_emails(db: Session, email: str) -> int:
    """Give every doctor and patient without an email this placeholder address
    (used while the clinic is in testing, so nothing can reach real people)."""
    filled = 0
    for model in (Doctor, Patient):
        for row in db.scalars(select(model).where((model.email.is_(None)) | (model.email == ""))).unique():
            row.email = email
            filled += 1
    db.flush()
    return filled
