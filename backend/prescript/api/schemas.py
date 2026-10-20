"""Request bodies. Validation lives here; responses come from serializers.py."""
import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from ..db.models import APPOINTMENT_STATUSES, DOCTOR_STATUSES, ROLES

AppointmentStatus = Literal[APPOINTMENT_STATUSES]  # type: ignore[valid-type]
DoctorStatus = Literal[DOCTOR_STATUSES]  # type: ignore[valid-type]
Role = Literal[ROLES]  # type: ignore[valid-type]


class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ContactFields(BaseModel):
    email: Optional[str] = None
    phone_number: Optional[str] = None
    whatsapp_number: Optional[str] = None
    slack_user_id: Optional[str] = None
    teams_upn: Optional[str] = None


class PatientIn(ContactFields):
    full_name: str = Field(min_length=1)
    mrn: Optional[str] = None
    date_of_birth: Optional[datetime.date] = None
    sex: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class PatientPatch(ContactFields):
    full_name: Optional[str] = None
    mrn: Optional[str] = None
    date_of_birth: Optional[datetime.date] = None
    sex: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class DoctorIn(ContactFields):
    full_name: str = Field(min_length=1)
    specialty: Optional[str] = None
    department: Optional[str] = None
    aliases: List[str] = []
    create_login: bool = False
    login_email: Optional[str] = None
    login_password: Optional[str] = Field(default=None, min_length=8)


class DoctorPatch(ContactFields):
    full_name: Optional[str] = None
    specialty: Optional[str] = None
    department: Optional[str] = None
    aliases: Optional[List[str]] = None
    status: Optional[DoctorStatus] = None
    is_active: Optional[bool] = None


class DoctorStatusIn(BaseModel):
    status: DoctorStatus


class UserIn(BaseModel):
    email: str
    full_name: str
    role: Role
    password: str = Field(min_length=8)
    doctor_id: Optional[str] = None


class UserPatch(BaseModel):
    full_name: Optional[str] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8)
    doctor_id: Optional[str] = None


class AppointmentIn(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    start_at: datetime.datetime
    duration_minutes: int = Field(default=30, ge=5, le=480)
    reason: Optional[str] = None
    location: Optional[str] = None
    notify: bool = True
    allow_overlap: bool = False
    origin_visit_id: Optional[str] = None


class AppointmentPatch(BaseModel):
    doctor_id: Optional[str] = None
    start_at: Optional[datetime.datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=480)
    reason: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    notify: bool = True
    allow_overlap: bool = False


class AppointmentStatusIn(BaseModel):
    status: AppointmentStatus
    reason: Optional[str] = None
    notify: bool = True


class NextVisitIn(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    reason: Optional[str] = None
    location: Optional[str] = None


class NewPatientIn(BaseModel):
    full_name: Optional[str] = None
    mrn: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None


class FollowUpIn(BaseModel):
    """Book the follow-up straight from the review screen."""
    start_at: datetime.datetime
    duration_minutes: int = Field(default=30, ge=5, le=480)
    doctor_id: Optional[str] = None
    reason: Optional[str] = None
    location: Optional[str] = None
    notify: bool = True
    allow_overlap: bool = False


class DocumentConfirm(BaseModel):
    patient_id: Optional[str] = None
    new_patient: Optional[NewPatientIn] = None
    doctor_id: Optional[str] = None
    doctor_name_raw: Optional[str] = None
    clinic_name: Optional[str] = None
    visit_date: Optional[str] = None
    diagnosis: Optional[str] = None
    medications: List[str] = []
    summary: Optional[str] = None
    next_visit: Optional[NextVisitIn] = None
    follow_up: Optional[FollowUpIn] = None
    send_to_pharmacy: bool = False


class VisitIn(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    visit_date: Optional[datetime.date] = None
    clinic_name: Optional[str] = None
    diagnosis: Optional[str] = None
    medications: List[str] = []
    summary: Optional[str] = None


class VisitPatch(BaseModel):
    doctor_id: Optional[str] = None
    visit_date: Optional[datetime.date] = None
    clinic_name: Optional[str] = None
    diagnosis: Optional[str] = None
    medications: Optional[List[str]] = None
    summary: Optional[str] = None
