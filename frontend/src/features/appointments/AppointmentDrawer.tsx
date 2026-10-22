import { format, parseISO } from "date-fns";
import { BellRing, CalendarClock, Check, ExternalLink, FileText, MapPin, Stethoscope, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppointmentBadge } from "@/components/domain";
import { Drawer } from "@/components/ui/overlays";
import { Avatar, Button, Field, Input, KeyValue, Notice, Select, Textarea } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { doctorName, fmtDateTime, isActive, nextActions, toLocalIso } from "@/lib/format";
import { useAppointments, useAppointmentStatus, useDeclineRequest, useDoctors, useResendNotification, useUpdateAppointment } from "@/lib/queries";
import type { Appointment } from "@/lib/types";
import { useApprove } from "./RequestsPanel";

function NotificationSummary({ results }: { results: Record<string, unknown> }) {
  if ("error" in results) return <Notice tone="red">Notification failed: {String(results.error)}</Notice>;
  const rows: [string, Record<string, string>][] = [];
  if (results.patient) rows.push(["Patient", results.patient as Record<string, string>]);
  for (const [who, r] of Object.entries((results.doctors as Record<string, Record<string, string>>) ?? {})) rows.push([`Doctor (${who})`, r]);
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      {rows.map(([who, channels]) => (
        <div key={who}>
          <p className="text-xs font-medium text-ink-soft">{who}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(channels).map(([ch, st]) => (
              <span
                key={ch}
                title={st}
                className={
                  st === "sent"
                    ? "rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                    : st.startsWith("error")
                      ? "rounded-md bg-red-50 px-2 py-0.5 text-[11px] text-red-600"
                      : "rounded-md bg-canvas px-2 py-0.5 text-[11px] text-ink-faint"
                }
              >
                {ch}: {st.startsWith("error") ? "error" : st}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppointmentDrawer({ appointmentId, initial, onClose }: { appointmentId: string; initial: Appointment; onClose: () => void }) {
  const { user } = useAuth();
  // Read through the list cache so status changes elsewhere reflect here.
  const { data: fresh } = useAppointments({ patient_id: initial.patient.id });
  const a = fresh?.find((x) => x.id === appointmentId) ?? initial;
  const status = useAppointmentStatus();
  const update = useUpdateAppointment();
  const resend = useResendNotification();
  const approve = useApprove();
  const decline = useDeclineRequest();
  const requested = a.status === "requested";
  const { data: doctors } = useDoctors();
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view");
  const [date, setDate] = useState(format(parseISO(a.start_at), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(parseISO(a.start_at), "HH:mm"));
  const [doctorId, setDoctorId] = useState(a.doctor?.id ?? "");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(a.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const actions = nextActions(a.status);

  const reschedule = (allowOverlap = false) =>
    update.mutate(
      { id: a.id, start_at: toLocalIso(date, time), doctor_id: doctorId || undefined, allow_overlap: allowOverlap },
      {
        onSuccess: () => {
          toast.success("Appointment moved — patient and doctor notified");
          setMode("view");
          setError(null);
        },
        onError: (e) => setError(e.message),
      },
    );

  return (
    <Drawer
      open
      onClose={onClose}
      title="Appointment"
      footer={
        mode === "view" && requested ? (
          <div className="flex flex-wrap gap-2">
            <Button icon={Check} loading={approve.pending} onClick={() => approve.run(a)}>
              Approve for {format(parseISO(a.start_at), "EEE d MMM, h:mm a")}
            </Button>
            <Button variant="danger" icon={XCircle} onClick={() => setMode("cancel")}>
              Decline
            </Button>
          </div>
        ) : (
        mode === "view" &&
        isActive(a.status) && (
          <div className="flex flex-wrap gap-2">
            {actions.map((act) => (
              <Button
                key={act.status}
                loading={status.isPending && status.variables?.status === act.status}
                onClick={() => status.mutate({ id: a.id, status: act.status }, { onSuccess: () => toast.success(act.label) })}
              >
                {act.label}
              </Button>
            ))}
            <Button variant="secondary" icon={CalendarClock} onClick={() => setMode("reschedule")}>
              Reschedule
            </Button>
            <Button variant="danger" icon={XCircle} onClick={() => setMode("cancel")}>
              Cancel
            </Button>
          </div>
        ))
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={a.patient.full_name} size="lg" />
          <div className="min-w-0 flex-1">
            <Link to={`/patients/${a.patient.id}`} onClick={onClose} className="block truncate text-lg font-semibold text-ink hover:underline">
              {a.patient.full_name}
            </Link>
            <p className="text-sm text-ink-faint">{a.patient.mrn ?? "No patient ID"}</p>
          </div>
          <AppointmentBadge status={a.status} />
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-canvas p-4">
          <KeyValue label="When">{fmtDateTime(a.start_at)}</KeyValue>
          <KeyValue label="Duration">{Math.round((parseISO(a.end_at).getTime() - parseISO(a.start_at).getTime()) / 60000)} min</KeyValue>
          <KeyValue label="Doctor">
            <span className="flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 text-ink-faint" />
              {doctorName(a.doctor?.full_name)}
            </span>
          </KeyValue>
          <KeyValue label="Source">{a.source === "prescription" ? "From prescription" : "Booked manually"}</KeyValue>
          <div className="col-span-2">
            <KeyValue label="Reason">{a.reason}</KeyValue>
          </div>
          <div className="col-span-2">
            <KeyValue label="Location">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-ink-faint" />
                {a.location}
              </span>
            </KeyValue>
          </div>
        </dl>

        {requested && <Notice tone="brand">Requested by the patient — the time above is what they asked for. Approve it, decline it, or drag the request onto the schedule to pick another slot.</Notice>}
        {a.cancel_reason && <Notice tone="red">Cancelled: {a.cancel_reason}</Notice>}

        {mode === "reschedule" && (
          <div className="space-y-3 rounded-xl border border-line p-4">
            <p className="font-medium text-ink">Reschedule</p>
            {error && (
              <Notice tone="amber">
                {error}{" "}
                <button className="font-semibold underline" onClick={() => reschedule(true)}>
                  Book anyway
                </button>
              </Notice>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Time">
                <Input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            {user?.role === "admin" && (
              <Field label="Doctor">
                <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  {doctors?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {doctorName(d.full_name)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="flex gap-2">
              <Button loading={update.isPending} onClick={() => reschedule()}>
                Save & notify
              </Button>
              <Button variant="ghost" onClick={() => setMode("view")}>
                Back
              </Button>
            </div>
          </div>
        )}

        {mode === "cancel" && requested && (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
            <p className="font-medium text-ink">Decline request</p>
            <Field label="Reason (shared with the patient)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fully booked that day" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                loading={decline.isPending}
                onClick={() => decline.mutate({ id: a.id, reason: reason || undefined }, { onSuccess: () => (toast("Request declined"), setMode("view")) })}
              >
                Decline request
              </Button>
              <Button variant="ghost" onClick={() => setMode("view")}>
                Back
              </Button>
            </div>
          </div>
        )}

        {mode === "cancel" && !requested && (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
            <p className="font-medium text-ink">Cancel appointment</p>
            <Field label="Reason (shared with the patient)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Doctor unavailable" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                loading={status.isPending}
                onClick={() =>
                  status.mutate({ id: a.id, status: "cancelled", reason }, { onSuccess: () => (toast.success("Appointment cancelled"), setMode("view")) })
                }
              >
                Cancel appointment
              </Button>
              <Button
                variant="secondary"
                onClick={() => status.mutate({ id: a.id, status: "no_show", notify: false }, { onSuccess: () => (toast("Marked as no-show"), setMode("view")) })}
              >
                Mark no-show instead
              </Button>
              <Button variant="ghost" onClick={() => setMode("view")}>
                Back
              </Button>
            </div>
          </div>
        )}

        <div>
          <Field label="Notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes for this appointment" />
          </Field>
          {notes !== (a.notes ?? "") && (
            <Button size="sm" className="mt-2" loading={update.isPending} onClick={() => update.mutate({ id: a.id, notes, notify: false }, { onSuccess: () => toast.success("Notes saved") })}>
              Save notes
            </Button>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-medium text-ink">
              <BellRing className="h-4 w-4 text-ink-faint" /> Notifications
            </p>
            <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => resend.mutate(a.id, { onSuccess: () => toast.success("Re-sending notifications") })}>
              {a.notified_at ? "Resend" : "Send now"}
            </Button>
          </div>
          <p className="text-xs text-ink-faint">{a.notified_at ? `Last sent ${fmtDateTime(a.notified_at)}` : "Not sent yet."}</p>
          {a.notification_results && <NotificationSummary results={a.notification_results} />}
          {a.calendar_event_link && (
            <a href={a.calendar_event_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Open in Google Calendar
            </a>
          )}
        </div>

        {a.origin_visit_id && (
          <Link to={`/patients/${a.patient.id}`} onClick={onClose} className="flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
            <FileText className="h-4 w-4" /> View the prescription that requested this follow-up
          </Link>
        )}
      </div>
    </Drawer>
  );
}
