import { differenceInYears, format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import type { AppointmentStatus, DoctorStatus } from "./types";

export const parse = (iso: string) => parseISO(iso);

export function fmtDate(iso: string | null | undefined, pattern = "d MMM yyyy") {
  if (!iso) return "—";
  return format(parseISO(iso), pattern);
}

export function fmtTime(iso: string) {
  return format(parseISO(iso), "h:mm a");
}

export function fmtRelativeDay(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, d MMM");
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return `${fmtRelativeDay(iso)}, ${fmtTime(iso)}`;
}

export function age(dob: string | null) {
  return dob ? differenceInYears(new Date(), parseISO(dob)) : null;
}

/** Local datetime string for the API (backend stores clinic-local naive times). */
export function toLocalIso(date: string, time: string) {
  return `${date}T${time.length === 5 ? time + ":00" : time}`;
}

export function initials(name: string) {
  return name
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const doctorName = (name: string | null | undefined) => (name ? `Dr. ${name}` : "Unassigned");

export const APPOINTMENT_STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "slate" },
  confirmed: { label: "Confirmed", tone: "green" },
  checked_in: { label: "Checked in", tone: "amber" },
  in_consultation: { label: "In consultation", tone: "violet" },
  completed: { label: "Completed", tone: "teal" },
  cancelled: { label: "Cancelled", tone: "red" },
  no_show: { label: "No-show", tone: "gray" },
};

export const DOCTOR_STATUS: Record<DoctorStatus, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "green" },
  in_session: { label: "In session", tone: "amber" },
  off: { label: "Off", tone: "red" },
};

export type Tone = "green" | "teal" | "amber" | "red" | "violet" | "slate" | "gray" | "blue";

/** Next actions a user can take on an appointment, in display order. */
export function nextActions(status: AppointmentStatus): { status: AppointmentStatus; label: string }[] {
  switch (status) {
    case "scheduled":
      return [
        { status: "confirmed", label: "Confirm" },
        { status: "checked_in", label: "Check in" },
      ];
    case "confirmed":
      return [{ status: "checked_in", label: "Check in" }];
    case "checked_in":
      return [{ status: "in_consultation", label: "Start consultation" }];
    case "in_consultation":
      return [{ status: "completed", label: "Complete" }];
    default:
      return [];
  }
}

export const isActive = (s: AppointmentStatus) => ["scheduled", "confirmed", "checked_in", "in_consultation"].includes(s);
