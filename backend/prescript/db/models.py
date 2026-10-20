"""Relational model replacing data/visits.json.

Statuses are plain strings validated in the API layer (see the *_STATUSES
tuples) rather than DB enums, so adding a new status later is a code change,
not a schema migration.
"""
import datetime
import uuid
from typing import List, Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return uuid.uuid4().hex


def now() -> datetime.datetime:
    return datetime.datetime.now().replace(microsecond=0)


class Base(DeclarativeBase):
    pass


ROLES = ("admin", "doctor")
DOCTOR_STATUSES = ("available", "in_session", "off")
APPOINTMENT_STATUSES = ("scheduled", "confirmed", "checked_in", "in_consultation", "completed", "cancelled", "no_show")
ACTIVE_APPOINTMENT_STATUSES = ("scheduled", "confirmed", "checked_in", "in_consultation")
DOCUMENT_KINDS = ("prescription", "extra_page", "pharmacy_receipt", "other")
DOCUMENT_STATUSES = ("uploaded", "processing", "extracted", "failed", "confirmed", "attached")


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), unique=True)


class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    full_name: Mapped[str] = mapped_column(String(200))
    specialty: Mapped[Optional[str]] = mapped_column(String(200))
    department_id: Mapped[Optional[str]] = mapped_column(ForeignKey("departments.id"))
    email: Mapped[Optional[str]] = mapped_column(String(320))
    phone_number: Mapped[Optional[str]] = mapped_column(String(40))
    whatsapp_number: Mapped[Optional[str]] = mapped_column(String(40))
    slack_user_id: Mapped[Optional[str]] = mapped_column(String(64))
    teams_upn: Mapped[Optional[str]] = mapped_column(String(320))
    # Name variants OCR has produced for this doctor ("DR. KABIR SUMAN DASH",
    # "Dr. Anlanuru Sri Sasank Tejaswee, MDS", ...) — used to match extracted
    # prescriptions to the right doctor record.
    aliases: Mapped[List[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="available")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)

    department: Mapped[Optional[Department]] = relationship(lazy="joined")
    user: Mapped[Optional["User"]] = relationship(back_populates="doctor", uselist=False)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20))
    doctor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("doctors.id"), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)

    doctor: Mapped[Optional[Doctor]] = relationship(back_populates="user", lazy="joined")


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    # The hospital's patient ID / MRN as printed on prescriptions (e.g.
    # KIMS22512260127) — the key treatment history is linked by.
    mrn: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[Optional[str]] = mapped_column(String(320))
    phone_number: Mapped[Optional[str]] = mapped_column(String(40))
    whatsapp_number: Mapped[Optional[str]] = mapped_column(String(40))
    slack_user_id: Mapped[Optional[str]] = mapped_column(String(64))
    teams_upn: Mapped[Optional[str]] = mapped_column(String(320))
    date_of_birth: Mapped[Optional[datetime.date]] = mapped_column(Date)
    sex: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)


class Visit(Base):
    __tablename__ = "visits"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("doctors.id"), index=True)
    doctor_name_raw: Mapped[Optional[str]] = mapped_column(String(200))
    clinic_name: Mapped[Optional[str]] = mapped_column(String(500))
    visit_date: Mapped[Optional[datetime.date]] = mapped_column(Date, index=True)
    diagnosis: Mapped[Optional[str]] = mapped_column(Text)
    medications: Mapped[List[str]] = mapped_column(JSON, default=list)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    # What the prescription itself said about the next visit, kept verbatim even
    # when it wasn't schedulable (e.g. "Review SOS" with no date).
    next_visit_note: Mapped[Optional[dict]] = mapped_column(JSON)
    appointment_id: Mapped[Optional[str]] = mapped_column(ForeignKey("appointments.id", use_alter=True))
    created_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now, onupdate=now)

    patient: Mapped[Patient] = relationship(lazy="joined")
    doctor: Mapped[Optional[Doctor]] = relationship(lazy="joined")
    documents: Mapped[List["Document"]] = relationship(
        back_populates="visit", order_by="Document.sort_order", foreign_keys="Document.visit_id"
    )


class Document(Base):
    """Every uploaded image: prescriptions awaiting review, extra pages of a
    case sheet, pharmacy receipts. Replaces source_image / extra_pages /
    pharmacy_receipts on the old JSON visit record."""
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(30), default="prescription")
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    original_filename: Mapped[str] = mapped_column(String(300))
    stored_path: Mapped[str] = mapped_column(String(1000))
    content_type: Mapped[Optional[str]] = mapped_column(String(100))
    patient_id: Mapped[Optional[str]] = mapped_column(ForeignKey("patients.id"), index=True)
    visit_id: Mapped[Optional[str]] = mapped_column(ForeignKey("visits.id"), index=True)
    # Extra pages uploaded together with a prescription (e.g. the back of the
    # same case sheet) point at it until review attaches them all to one visit;
    # extraction reads parent + children as a single document.
    parent_id: Mapped[Optional[str]] = mapped_column(ForeignKey("documents.id"), index=True)
    # Content hash — the same scan uploaded twice is detected even if renamed
    # (the old store only de-duplicated by filename).
    sha256: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    extraction: Mapped[Optional[dict]] = mapped_column(JSON)
    error: Mapped[Optional[str]] = mapped_column(Text)
    uploaded_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)

    visit: Mapped[Optional[Visit]] = relationship(back_populates="documents", foreign_keys=[visit_id])
    patient: Mapped[Optional[Patient]] = relationship()


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("doctors.id"), index=True)
    # Naive datetimes in the clinic's local timezone (settings.clinic_timezone).
    start_at: Mapped[datetime.datetime] = mapped_column(DateTime, index=True)
    end_at: Mapped[datetime.datetime] = mapped_column(DateTime)
    reason: Mapped[Optional[str]] = mapped_column(String(500))
    location: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30), default="scheduled")
    source: Mapped[str] = mapped_column(String(30), default="manual")  # manual | prescription
    origin_visit_id: Mapped[Optional[str]] = mapped_column(ForeignKey("visits.id"))
    calendar_event_link: Mapped[Optional[str]] = mapped_column(String(1000))
    notification_results: Mapped[Optional[dict]] = mapped_column(JSON)
    notified_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    checked_in_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(500))
    created_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now, onupdate=now)

    patient: Mapped[Patient] = relationship(lazy="joined")
    doctor: Mapped[Optional[Doctor]] = relationship(lazy="joined")


class PharmacyRequest(Base):
    __tablename__ = "pharmacy_requests"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    medications: Mapped[List[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | sent | failed
    results: Mapped[Optional[dict]] = mapped_column(JSON)
    requested_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[Optional[str]] = mapped_column(String(32))
    summary: Mapped[Optional[str]] = mapped_column(String(1000))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=now, index=True)

    actor: Mapped[Optional[User]] = relationship(lazy="joined")
