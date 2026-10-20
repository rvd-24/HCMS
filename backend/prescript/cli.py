"""`uv run prescript <command>` — one entry point replacing the old scripts.

    serve            run the web app (API + built frontend)
    setup            create tables, logins and doctors, import data/visits.json
    seed-demo        add synthetic demo patients/appointments (DEMO- MRNs)
    reset-db         delete the database file (uploads are kept)
    create-user      add an admin or doctor login
    ingest           extract one prescription (+ extra pages) and record it   [was: schedule_meet.py from-image]
    process-folder   ingest every image in a folder                          [was: process_visits.py]
    book             schedule a visit from existing history and notify       [was: schedule_meet.py manual]
    pharmacy         send a visit's medicines to the pharmacy                 [was: pharmacy_request.py]
    google-auth      one-time Google OAuth consent (Calendar + Gmail)
"""
import argparse
import datetime
import sys
from pathlib import Path

from .config import get_settings


def _db():
    from .db import init_db, session_scope

    init_db()
    return session_scope()


def cmd_serve(args):
    import uvicorn

    uvicorn.run("prescript.main:app", host=args.host, port=args.port, reload=args.reload)


def _contact_email(args):
    return args.contact_email if args.contact_email is not None else get_settings().email_redirect


def cmd_setup(args):
    from .seed import fill_contact_emails, import_legacy_json, seed_core

    settings = get_settings()
    with _db() as db:
        result = seed_core(db, password=args.password)
        if result["created_logins"]:
            print("Created logins:")
            for email in result["created_logins"]:
                print(f"  {email}")
            if result["password"]:
                print(f"  password (for logins without one in .env): {result['password']}")
        if result["updated_logins"]:
            print("Reset to the password in .env:")
            for email in result["updated_logins"]:
                print(f"  {email}")
        if not result["created_logins"] and not result["updated_logins"]:
            print("Logins already exist and match .env — nothing to change.")
        json_path = Path(args.legacy_json) if args.legacy_json else settings.legacy_visits_json
        if json_path.exists() and not args.skip_import:
            stats = import_legacy_json(db, json_path, settings.prescriptions_dir)
            print(f"Imported {json_path}: {stats}")
        if _contact_email(args):
            print(f"Set {fill_contact_emails(db, _contact_email(args))} missing doctor/patient email(s) to {_contact_email(args)}")


def cmd_seed_demo(args):
    from .seed import fill_contact_emails, seed_demo

    with _db() as db:
        print(seed_demo(db))
        if _contact_email(args):
            fill_contact_emails(db, _contact_email(args))


def cmd_reset_db(args):
    settings = get_settings()
    url = settings.resolved_database_url
    if not url.startswith("sqlite:///"):
        sys.exit("reset-db only deletes local SQLite databases")
    path = Path(url.removeprefix("sqlite:///"))
    if not args.yes:
        sys.exit(f"This deletes {path}. Re-run with --yes to confirm.")
    for suffix in ("", "-wal", "-shm"):
        Path(str(path) + suffix).unlink(missing_ok=True)
    print(f"Deleted {path}")


def cmd_create_user(args):
    from sqlalchemy import select

    from .db.models import Doctor, User
    from .security import hash_password
    from .services.matching import find_doctor_by_name

    with _db() as db:
        doctor = None
        if args.role == "doctor":
            doctor = find_doctor_by_name(db, args.doctor) if args.doctor else None
            if not doctor:
                sys.exit("--doctor must name an existing doctor for doctor logins")
        if db.scalar(select(User).where(User.email == args.email.lower())):
            sys.exit(f"{args.email} already exists")
        db.add(User(email=args.email.lower(), full_name=args.name or (doctor.full_name if doctor else args.email),
                    role=args.role, password_hash=hash_password(args.password), doctor_id=doctor.id if doctor else None))
    print(f"Created {args.role} login {args.email}")


def _ingest(db, image: Path, extra_pages, actor=None):
    """Upload + extract synchronously, then auto-confirm the draft with whatever
    matched — the CLI equivalent of the web review step, without the review."""
    from .db.models import Document
    from .services.documents import confirm_document, find_duplicate, run_extraction, save_upload

    data = image.read_bytes()
    existing = find_duplicate(db, data)
    if existing:
        print(f"skip (already recorded): {image.name}")
        return None
    document = save_upload(db, data, image.name, None, actor)
    for i, page in enumerate(extra_pages, start=1):
        save_upload(db, page.read_bytes(), page.name, None, actor, kind="extra_page", parent_id=document.id, sort_order=i)
    db.commit()

    print(f"extracting: {image.name} ...")
    run_extraction(document.id)
    db.expire_all()
    document = db.get(Document, document.id)
    if document.status != "extracted":
        print(f"  failed: {document.error}")
        return None
    extraction = document.extraction
    draft = extraction["draft"]
    for warning in extraction["warnings"]:
        print(f"  warning: {warning}")
    review = {
        "patient_id": extraction["matched_patient_id"],
        "new_patient": {"full_name": draft.get("patient_name") or "Unknown patient", "mrn": draft.get("patient_id")},
        "doctor_id": extraction["matched_doctor_id"],
        "doctor_name_raw": draft.get("doctor_name"),
        "clinic_name": draft.get("clinic_name"),
        "visit_date": draft.get("visit_date"),
        "diagnosis": draft.get("diagnosis"),
        "medications": draft.get("medications") or [],
        "summary": draft.get("summary"),
        "next_visit": draft.get("next_visit"),
    }
    visit = confirm_document(db, document, review, actor)
    db.commit()
    print(f"  recorded visit {visit.id}: {visit.visit_date} — {draft.get('doctor_name')}")
    return visit


def _admin(db):
    from sqlalchemy import select

    from .db.models import User

    return db.scalar(select(User).where(User.role == "admin").limit(1))


def cmd_ingest(args):
    from .pipeline.text import parse_time_or_default, valid_iso_date
    from .services import appointments as svc

    with _db() as db:
        visit = _ingest(db, Path(args.image), [Path(p) for p in args.extra_page or []], _admin(db))
        if not visit or not args.schedule:
            return
        nv = visit.next_visit_note or {}
        if not valid_iso_date(nv.get("date")):
            print("No usable next visit date on the prescription; not scheduling.")
            return
        start = datetime.datetime.fromisoformat(f"{nv['date']}T{parse_time_or_default(nv.get('time'))}")
        appointment = svc.book(db, visit.patient, visit.doctor, start, _admin(db), reason=nv.get("reason"),
                               location=nv.get("location"), source="prescription", origin_visit_id=visit.id, allow_overlap=True)
        db.commit()
        appointment_id = appointment.id
    svc.notify_booking(appointment_id)
    print(f"Booked and notified: appointment {appointment_id}")


def cmd_process_folder(args):
    folder = Path(args.folder)
    images = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    with _db() as db:
        actor = _admin(db)
        for image in images:
            if "pharmacy" in image.name.lower():
                print(f"skip (pharmacy receipt — attach it to its visit in the app): {image.name}")
                continue
            _ingest(db, image, [], actor)


def cmd_book(args):
    from sqlalchemy import select

    from .db.models import Patient
    from .services import appointments as svc
    from .services.matching import find_doctor_by_name

    with _db() as db:
        patient = db.scalar(select(Patient).where(Patient.mrn == args.patient_id))
        if not patient:
            sys.exit(f"No patient with ID {args.patient_id}")
        if args.patient_email:
            patient.email = args.patient_email
        doctor = find_doctor_by_name(db, args.doctor) if args.doctor else None
        if args.doctor and not doctor:
            sys.exit(f"No doctor matching {args.doctor!r}")
        if doctor and args.doctor_email:
            doctor.email = args.doctor_email
        start = datetime.datetime.fromisoformat(f"{args.date}T{args.time}")
        appointment = svc.book(db, patient, doctor, start, _admin(db), reason=args.reason, location=args.location)
        db.commit()
        appointment_id = appointment.id
    if not args.no_notify:
        svc.notify_booking(appointment_id)
    print(f"Booked appointment {appointment_id}")


def cmd_pharmacy(args):
    from .db.models import PharmacyRequest, Visit
    from .services.pharmacy import run_pharmacy_request

    with _db() as db:
        visit = db.get(Visit, args.visit_id)
        if not visit:
            sys.exit(f"No visit {args.visit_id}")
        request = PharmacyRequest(visit_id=visit.id, patient_id=visit.patient_id, medications=list(visit.medications or []))
        db.add(request)
        db.commit()
        request_id = request.id
    run_pharmacy_request(request_id)
    with _db() as db:
        print(db.get(PharmacyRequest, request_id).results)


def cmd_google_auth(args):
    from .integrations.google import get_credentials

    get_credentials(interactive=True)
    print(f"Google authorised; token saved to {get_settings().google_token_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="prescript", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("serve")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("setup")
    p.add_argument("--password", help="password for the seeded logins (default: PRESCRIPT_SEED_PASSWORD or random)")
    p.add_argument("--legacy-json", help="path to the old visits.json (default: data/visits.json)")
    p.add_argument("--skip-import", action="store_true")
    p.add_argument("--contact-email", help="fill missing doctor/patient emails with this (default: PRESCRIPT_EMAIL_REDIRECT)")
    p.set_defaults(func=cmd_setup)

    p = sub.add_parser("seed-demo")
    p.add_argument("--contact-email", help="fill missing emails with this (default: PRESCRIPT_EMAIL_REDIRECT)")
    p.set_defaults(func=cmd_seed_demo)

    p = sub.add_parser("reset-db")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(func=cmd_reset_db)

    p = sub.add_parser("create-user")
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--role", choices=["admin", "doctor"], required=True)
    p.add_argument("--name")
    p.add_argument("--doctor", help="doctor name to link (doctor logins)")
    p.set_defaults(func=cmd_create_user)

    p = sub.add_parser("ingest")
    p.add_argument("image")
    p.add_argument("--extra-page", action="append", help="another page of the same case sheet (repeatable)")
    p.add_argument("--schedule", action="store_true", help="book + notify the next visit named on the prescription")
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("process-folder")
    p.add_argument("folder", nargs="?", default=str(get_settings().prescriptions_dir / "new"))
    p.set_defaults(func=cmd_process_folder)

    p = sub.add_parser("book")
    p.add_argument("--patient-id", required=True, help="patient ID / MRN")
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--time", required=True, help="HH:MM, 24-hour")
    p.add_argument("--doctor", help="doctor name (any spelling on file)")
    p.add_argument("--patient-email", help="also saves it on the patient record")
    p.add_argument("--doctor-email", help="also saves it on the doctor record")
    p.add_argument("--reason", default="Follow-up")
    p.add_argument("--location")
    p.add_argument("--no-notify", action="store_true")
    p.set_defaults(func=cmd_book)

    p = sub.add_parser("pharmacy")
    p.add_argument("--visit-id", required=True)
    p.set_defaults(func=cmd_pharmacy)

    sub.add_parser("google-auth").set_defaults(func=cmd_google_auth)
    return parser


def main():
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
