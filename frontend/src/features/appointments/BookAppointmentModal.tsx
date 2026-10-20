import { format } from "date-fns";
import { AlertTriangle, BellRing } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PatientPicker } from "@/components/domain";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Notice, Select, Toggle } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { doctorName, toLocalIso } from "@/lib/format";
import { useBookAppointment, useDoctors, useSystemStatus } from "@/lib/queries";
import type { PatientBrief } from "@/lib/types";

export interface BookingPrefill {
  patient?: PatientBrief;
  doctorId?: string;
  date?: string;
  time?: string;
  reason?: string;
  location?: string;
  originVisitId?: string;
}

export function BookAppointmentModal({ prefill, onClose }: { prefill: BookingPrefill; onClose: () => void }) {
  const { user } = useAuth();
  const { data: doctors } = useDoctors();
  const { data: system } = useSystemStatus();
  const book = useBookAppointment();
  const [patient, setPatient] = useState<PatientBrief | null>(prefill.patient ?? null);
  const [doctorId, setDoctorId] = useState(prefill.doctorId ?? user?.doctor?.id ?? "");
  const [date, setDate] = useState(prefill.date ?? format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(prefill.time ?? "10:00");
  const [duration, setDuration] = useState(system?.default_slot_minutes ?? 30);
  const [reason, setReason] = useState(prefill.reason ?? "Follow-up");
  const [location, setLocation] = useState(prefill.location ?? "");
  const [notify, setNotify] = useState(true);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (allowOverlap = false) => {
    if (!patient) return setError("Choose a patient");
    setError(null);
    book.mutate(
      {
        patient_id: patient.id,
        doctor_id: doctorId || null,
        start_at: toLocalIso(date, time),
        duration_minutes: Number(duration),
        reason,
        location: location || undefined,
        notify,
        allow_overlap: allowOverlap,
        origin_visit_id: prefill.originVisitId ?? null,
      },
      {
        onSuccess: (a) => {
          toast.success(`Booked ${a.patient.full_name} for ${format(new Date(a.start_at), "EEE d MMM, h:mm a")}`, {
            description: notify ? "Invites and notifications are being sent." : undefined,
          });
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) setConflict(err.message);
          else setError(err.message);
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Book appointment"
      description={prefill.originVisitId ? "Follow-up requested on a prescription" : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {conflict ? (
            <Button variant="danger" loading={book.isPending} onClick={() => submit(true)}>
              Book anyway
            </Button>
          ) : (
            <Button loading={book.isPending} onClick={() => submit()}>
              Book appointment
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        {conflict && (
          <Notice tone="amber" icon={AlertTriangle}>
            {conflict}. Pick another time, or book anyway to double-book.
          </Notice>
        )}
        <Field label="Patient">
          <PatientPicker value={patient} onChange={setPatient} autoFocus={!patient} />
        </Field>
        <Field label="Doctor">
          <Select
            value={doctorId}
            disabled={user?.role === "doctor"}
            onChange={(e) => {
              setDoctorId(e.target.value);
              setConflict(null);
            }}
          >
            <option value="">Unassigned</option>
            {doctors?.map((d) => (
              <option key={d.id} value={d.id}>
                {doctorName(d.full_name)}
                {d.specialty ? ` — ${d.specialty}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => (setDate(e.target.value), setConflict(null))} required />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} step={300} onChange={(e) => (setTime(e.target.value), setConflict(null))} required />
          </Field>
          <Field label="Duration" className="col-span-2 sm:col-span-1">
            <Select value={duration} onChange={(e) => (setDuration(Number(e.target.value)), setConflict(null))}>
              {[15, 20, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Follow-up, dressing change, review…" />
        </Field>
        <Field label="Location" hint={`Defaults to ${system?.clinic_name ?? "the clinic"}`}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="OPD, department or room" />
        </Field>
        <div className="rounded-xl border border-line p-3.5">
          <Toggle
            checked={notify}
            onChange={setNotify}
            label="Send invites & notifications"
            description="Calendar invite plus email/WhatsApp/Slack to the patient and doctor, with the full treatment history PDF attached."
          />
          {notify && system && !system.email_enabled && (
            <p className="mt-2 flex items-center gap-1.5 pl-12 text-xs text-amber-700">
              <BellRing className="h-3.5 w-3.5" /> Email is switched off — no emails or calendar invites will be sent.
            </p>
          )}
          {notify && system?.email_enabled && system.email_redirect && (
            <p className="mt-2 flex items-center gap-1.5 pl-12 text-xs text-ink-faint">
              <BellRing className="h-3.5 w-3.5" /> Test mode: emails go to {system.email_redirect}.
            </p>
          )}
          {notify && system?.email_enabled && !system.google_calendar_configured && (
            <p className="mt-2 flex items-center gap-1.5 pl-12 text-xs text-amber-700">
              <BellRing className="h-3.5 w-3.5" /> Google isn't connected — notifications go out, but no calendar event is created.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
