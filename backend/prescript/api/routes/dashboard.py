"""Aggregates for the two home screens. Each widget on the dashboard maps to
one key here, so adding a widget = adding a key + a card."""
import datetime
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...db.models import ACTIVE_APPOINTMENT_STATUSES, Appointment, AuditEvent, Doctor, Document, Patient, User, Visit
from ..deps import current_user, doctor_scope, require_admin
from ..serializers import appointment_out, audit_out, doctor_out, visit_out

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _day_bounds(day: datetime.date):
    start = datetime.datetime.combine(day, datetime.time.min)
    return start, start + datetime.timedelta(days=1)


def _appointments_between(db: Session, start, end, doctor_id=None):
    stmt = select(Appointment).where(Appointment.start_at >= start, Appointment.start_at < end)
    if doctor_id:
        stmt = stmt.where(Appointment.doctor_id == doctor_id)
    return list(db.scalars(stmt.order_by(Appointment.start_at)).unique())


def _trend(db: Session, days_back: int, days_forward: int, doctor_id=None):
    """Per-day counts: booked (all non-cancelled), completed, cancelled/no-show."""
    today = datetime.date.today()
    first = today - datetime.timedelta(days=days_back)
    last = today + datetime.timedelta(days=days_forward)
    rows = _appointments_between(db, *_day_bounds(first)[:1], _day_bounds(last)[1], doctor_id)
    buckets = defaultdict(lambda: {"booked": 0, "completed": 0, "missed": 0})
    for a in rows:
        b = buckets[a.start_at.date()]
        if a.status in ("cancelled", "no_show"):
            b["missed"] += 1
        else:
            b["booked"] += 1
            if a.status == "completed":
                b["completed"] += 1
    out = []
    day = first
    while day <= last:
        out.append({"date": day.isoformat(), **buckets[day]})
        day += datetime.timedelta(days=1)
    return out


def _counts_by_status(appointments):
    counts = defaultdict(int)
    for a in appointments:
        counts[a.status] += 1
    return counts


@router.get("/admin")
def admin_dashboard(
    days: int = Query(30, ge=7, le=180),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    today = datetime.date.today()
    today_appts = _appointments_between(db, *_day_bounds(today))
    by_status = _counts_by_status(today_appts)
    week_end = datetime.datetime.combine(today + datetime.timedelta(days=8), datetime.time.min)
    upcoming = db.scalar(
        select(func.count()).select_from(Appointment).where(
            Appointment.start_at >= datetime.datetime.combine(today + datetime.timedelta(days=1), datetime.time.min),
            Appointment.start_at < week_end,
            Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
        )
    )
    yesterday_appts = _appointments_between(db, *_day_bounds(today - datetime.timedelta(days=1)))
    pending_review = db.scalar(
        select(func.count()).select_from(Document).where(
            Document.parent_id.is_(None), Document.visit_id.is_(None),
            Document.status.in_(("uploaded", "processing", "extracted", "failed")),
        )
    )

    doctors = list(db.scalars(select(Doctor).where(Doctor.is_active).order_by(Doctor.full_name)).unique())
    per_doctor_today = defaultdict(int)
    for a in today_appts:
        if a.status not in ("cancelled", "no_show"):
            per_doctor_today[a.doctor_id] += 1

    activity = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(8)).unique()

    return {
        "kpis": {
            "today_total": sum(v for k, v in by_status.items() if k not in ("cancelled", "no_show")),
            "today_total_yesterday": sum(1 for a in yesterday_appts if a.status not in ("cancelled", "no_show")),
            "checked_in": by_status["checked_in"] + by_status["in_consultation"],
            "completed_today": by_status["completed"],
            "upcoming_7d": upcoming,
            "pending_review": pending_review,
            "patients_total": db.scalar(select(func.count()).select_from(Patient)),
            "visits_30d": db.scalar(
                select(func.count()).select_from(Visit).where(Visit.visit_date >= today - datetime.timedelta(days=30))
            ),
        },
        "trend": _trend(db, days_back=days, days_forward=7),
        "doctors": [doctor_out(d, today_count=per_doctor_today[d.id]) for d in doctors],
        "today": [appointment_out(a) for a in today_appts],
        "activity": [audit_out(e) for e in activity],
    }


@router.get("/doctor")
def doctor_dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    doctor_id = doctor_scope(user)
    today = datetime.date.today()
    today_appts = _appointments_between(db, *_day_bounds(today), doctor_id)
    by_status = _counts_by_status(today_appts)
    week_start = today - datetime.timedelta(days=today.weekday())
    week_appts = _appointments_between(
        db, datetime.datetime.combine(week_start, datetime.time.min),
        datetime.datetime.combine(week_start + datetime.timedelta(days=7), datetime.time.min), doctor_id,
    )
    now_dt = datetime.datetime.now()
    next_up = next(
        (a for a in today_appts if a.status in ("scheduled", "confirmed", "checked_in") and a.end_at >= now_dt),
        None,
    )
    patients_seen = db.scalar(select(func.count(distinct(Visit.patient_id))).where(Visit.doctor_id == doctor_id))
    recent_visits = db.scalars(
        select(Visit).where(Visit.doctor_id == doctor_id)
        .order_by(Visit.visit_date.desc().nulls_last(), Visit.created_at.desc()).limit(5)
    ).unique()

    return {
        "doctor": doctor_out(user.doctor) if user.doctor else None,
        "kpis": {
            "today_total": sum(v for k, v in by_status.items() if k not in ("cancelled", "no_show")),
            "remaining_today": sum(by_status[s] for s in ("scheduled", "confirmed", "checked_in")),
            "waiting": by_status["checked_in"],
            "completed_today": by_status["completed"],
            "week_total": sum(1 for a in week_appts if a.status not in ("cancelled", "no_show")),
            "patients_seen": patients_seen,
        },
        "next_up": appointment_out(next_up) if next_up else None,
        "today": [appointment_out(a) for a in today_appts],
        "trend": _trend(db, days_back=13, days_forward=7, doctor_id=doctor_id),
        "recent_visits": [visit_out(v) for v in recent_visits],
    }
