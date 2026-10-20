"""Auth and role-scoping dependencies.

Roles today: admin (everything) and doctor (own schedule + patients they've
treated or have booked). New roles (reception, pharmacy, ...) slot in by adding
to db.models.ROLES and using require_role(...) on the routes they may use.
"""
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..db import get_db
from ..db.models import Patient, User
from ..security import decode_access_token
from ..services.records import doctor_can_access_patient

_bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired — sign in again")
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled")
    return user


def require_role(*roles: str):
    def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this")
        return user
    return checker


require_admin = require_role("admin")


def doctor_scope(user: User) -> Optional[str]:
    """doctor_id to filter by, or None meaning unrestricted (admin)."""
    if user.role == "doctor":
        if not user.doctor_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This login isn't linked to a doctor profile")
        return user.doctor_id
    return None


def get_accessible_patient(patient_id: str, user: User, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    scope = doctor_scope(user)
    if scope and not doctor_can_access_patient(db, scope, patient.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    return patient
