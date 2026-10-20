// Mirrors backend/prescript/api/serializers.py — keep the two in step.

export type Role = "admin" | "doctor";
export type DoctorStatus = "available" | "in_session" | "off";
export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "no_show";
export type DocumentKind = "prescription" | "extra_page" | "pharmacy_receipt" | "other";
export type DocumentStatus = "uploaded" | "processing" | "extracted" | "failed" | "confirmed" | "attached";

export interface DoctorBrief {
  id: string;
  full_name: string;
  specialty: string | null;
  status: DoctorStatus;
}

export interface Contact {
  email: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  slack_user_id: string | null;
  teams_upn: string | null;
}

export interface Doctor extends DoctorBrief, Contact {
  department: string | null;
  aliases: string[];
  is_active: boolean;
  has_login: boolean;
  today_count?: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  doctor: DoctorBrief | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface PatientBrief {
  id: string;
  mrn: string | null;
  full_name: string;
}

export interface Patient extends PatientBrief, Contact {
  date_of_birth: string | null;
  sex: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  visit_count?: number;
  last_visit_date?: string | null;
  next_appointment?: Appointment | null;
  doctors_seen?: number;
  all_medications?: string[];
}

export interface Appointment {
  id: string;
  patient: PatientBrief;
  doctor: DoctorBrief | null;
  start_at: string;
  end_at: string;
  reason: string | null;
  location: string | null;
  status: AppointmentStatus;
  source: "manual" | "prescription";
  origin_visit_id: string | null;
  calendar_event_link: string | null;
  notification_results: Record<string, unknown> | null;
  notified_at: string | null;
  notes: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface NextVisit {
  date: string | null;
  time: string | null;
  reason: string | null;
  location: string | null;
}

export interface ExtractionDraft {
  patient_id: string | null;
  patient_name: string | null;
  doctor_name: string | null;
  clinic_name: string | null;
  diagnosis: string | null;
  medications: string[];
  summary: string;
  visit_date: string | null;
  next_visit: NextVisit | null;
}

export interface Extraction {
  draft: ExtractionDraft;
  matched_patient_id: string | null;
  matched_doctor_id: string | null;
  warnings: string[];
  extracted_at: string;
}

export interface DocumentRecord {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  original_filename: string;
  content_type: string | null;
  patient_id: string | null;
  visit_id: string | null;
  parent_id: string | null;
  extraction: Extraction | null;
  error: string | null;
  uploaded_at: string;
  children?: DocumentRecord[];
}

export interface Visit {
  id: string;
  patient: PatientBrief;
  doctor: DoctorBrief | null;
  doctor_name_raw: string | null;
  clinic_name: string | null;
  visit_date: string | null;
  diagnosis: string | null;
  medications: string[];
  summary: string | null;
  next_visit_note: NextVisit | null;
  documents: DocumentRecord[];
  created_at: string;
}

export interface PharmacyRequest {
  id: string;
  visit_id: string;
  medications: string[];
  status: "pending" | "sent" | "failed";
  results: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditEvent {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
}

export interface TrendPoint {
  date: string;
  booked: number;
  completed: number;
  missed: number;
}

export interface AdminDashboard {
  kpis: {
    today_total: number;
    today_total_yesterday: number;
    checked_in: number;
    completed_today: number;
    upcoming_7d: number;
    pending_review: number;
    patients_total: number;
    visits_30d: number;
  };
  trend: TrendPoint[];
  doctors: Doctor[];
  today: Appointment[];
  activity: AuditEvent[];
}

export interface DoctorDashboard {
  doctor: Doctor | null;
  kpis: {
    today_total: number;
    remaining_today: number;
    waiting: number;
    completed_today: number;
    week_total: number;
    patients_seen: number;
  };
  next_up: Appointment | null;
  today: Appointment[];
  trend: TrendPoint[];
  recent_visits: Visit[];
}

export interface SystemStatus {
  clinic_name: string;
  timezone: string;
  default_slot_minutes: number;
  extraction_configured: boolean;
  google_calendar_configured: boolean;
  channels: Record<string, boolean>;
  email_enabled: boolean;
  email_redirect: string | null;
}
