"""Resolve names/IDs read off a prescription to existing records."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import Doctor, Patient
from ..pipeline.text import display_name, normalize_person_name


def find_doctor_by_name(db: Session, name: Optional[str]) -> Optional[Doctor]:
    key = normalize_person_name(name)
    if not key:
        return None
    for doctor in db.scalars(select(Doctor)):
        candidates = [doctor.full_name, *(doctor.aliases or [])]
        if any(normalize_person_name(c) == key for c in candidates):
            return doctor
    return None


def remember_doctor_alias(doctor: Doctor, raw_name: Optional[str]) -> None:
    """Store an OCR spelling we confirmed belongs to this doctor so the next
    prescription with the same spelling matches automatically."""
    if not raw_name:
        return
    key = normalize_person_name(raw_name)
    known = {normalize_person_name(n) for n in [doctor.full_name, *(doctor.aliases or [])]}
    if key and key not in known:
        doctor.aliases = [*(doctor.aliases or []), raw_name]


def find_patient_by_mrn(db: Session, mrn: Optional[str]) -> Optional[Patient]:
    if not mrn:
        return None
    return db.scalar(select(Patient).where(Patient.mrn == mrn.strip()))


def clean_patient_name(name: Optional[str]) -> Optional[str]:
    """"Mr PARIMESH PANDA" -> "Parimesh Panda"."""
    if not name:
        return name
    value = display_name(name.strip())
    for prefix in ("Mr ", "Mr. ", "Mrs ", "Mrs. ", "Ms ", "Ms. ", "Miss "):
        if value.startswith(prefix):
            return value[len(prefix):]
    return value
