// Side panel on the schedule: appointment requests waiting for the doctor. Each can be
// approved at the time the patient asked for, declined, or dragged onto the grid to set a time.
import { format, isPast, parseISO } from "date-fns";
import clsx from "clsx";
import { CalendarClock, CalendarDays, Check, GripVertical, Inbox, MessageSquareText, Stethoscope, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppointmentBadge } from "@/components/domain";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api";
import { doctorName } from "@/lib/format";
import { useApproveRequest, useDeclineRequest } from "@/lib/queries";
import type { Appointment } from "@/lib/types";
import { appointmentDragProps } from "./ScheduleGrid";

const when = (iso: string) => format(parseISO(iso), "EEE, d MMM · h:mm a");

/** Approve a request (optionally at another start time); on a clash, offer to double-book. */
export function useApprove() {
  const approve = useApproveRequest();
  const run = (a: Appointment, startAt?: string, allowOverlap = false) =>
    approve.mutate(
      { id: a.id, start_at: startAt, allow_overlap: allowOverlap },
      {
        onSuccess: (done) =>
          toast.success(`Approved ${done.patient.full_name} for ${when(done.start_at)}`, { description: "The patient is being notified." }),
        onError: (err) =>
          err instanceof ApiError && err.status === 409 && !err.message.includes("already been handled")
            ? toast.error(err.message, { action: { label: "Approve anyway", onClick: () => run(a, startAt, true) } })
            : toast.error(err.message),
      },
    );
  return { run, pending: approve.isPending, pendingId: approve.isPending ? approve.variables?.id : undefined };
}

function RequestCard({ a, showDoctor, onOpen }: { a: Appointment; showDoctor: boolean; onOpen: (a: Appointment) => void }) {
  const approve = useApprove();
  const decline = useDeclineRequest();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const overdue = isPast(parseISO(a.start_at));

  return (
    <li
      {...appointmentDragProps(a)}
      className="group relative cursor-grab rounded-2xl bg-canvas/70 p-4 ring-1 ring-inset ring-line/60 transition-all hover:bg-white hover:shadow-card active:cursor-grabbing"
    >
      <GripVertical className="absolute right-3 top-4 h-4 w-4 text-ink-faint/60 transition-colors group-hover:text-ink-faint" aria-hidden />
      <div className="flex items-center gap-3 pr-5">
        <Avatar name={a.patient.full_name} />
        <div className="min-w-0">
          <Link to={`/patients/${a.patient.id}`} className="block truncate font-semibold text-ink hover:underline" draggable={false}>
            {a.patient.full_name}
          </Link>
          <p className="truncate text-xs text-ink-faint">{a.patient.mrn ?? "No patient ID"}</p>
        </div>
      </div>

      <button type="button" onClick={() => onOpen(a)} className="mt-3 block w-full space-y-1.5 text-left text-sm">
        <span className="flex items-start gap-2 text-ink">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <span className="line-clamp-2">{a.reason || "No reason given"}</span>
        </span>
        <span className={clsx("flex items-center gap-2 text-xs", overdue ? "font-semibold text-amber-700" : "text-ink-soft")}>
          <CalendarClock className="h-4 w-4 shrink-0" />
          {overdue ? `Asked for ${when(a.start_at)} (passed)` : `Prefers ${when(a.start_at)}`}
        </span>
        {showDoctor && (
          <span className="flex items-center gap-2 text-xs text-ink-soft">
            <Stethoscope className="h-4 w-4 shrink-0" />
            {doctorName(a.doctor?.full_name)}
          </span>
        )}
      </button>

      {declining ? (
        <div className="mt-3 space-y-2">
          <Input className="h-9" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shared with the patient)" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={decline.isPending}
              onClick={() =>
                decline.mutate(
                  { id: a.id, reason: reason || undefined },
                  { onSuccess: () => toast(`Declined ${a.patient.full_name}'s request`), onError: (e) => toast.error(e.message) },
                )
              }
            >
              Decline request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" icon={Check} className="flex-1" loading={approve.pendingId === a.id} disabled={overdue} onClick={() => approve.run(a)}>
            Approve
          </Button>
          <Button size="sm" variant="danger" icon={X} className="flex-1" onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}

/** Booked appointments coming up, one row each; click opens the appointment. */
function UpcomingList({ items, showDoctor, onOpen }: { items: Appointment[]; showDoctor: boolean; onOpen: (a: Appointment) => void }) {
  return (
    <ul className="space-y-1">
      {items.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onOpen(a)}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-canvas"
          >
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <span className="text-[9px] font-bold uppercase leading-none">{format(parseISO(a.start_at), "EEE")}</span>
              <span className="num text-base font-semibold leading-tight">{format(parseISO(a.start_at), "d")}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{a.patient.full_name}</span>
              <span className="block truncate text-xs text-ink-faint">
                {format(parseISO(a.start_at), "h:mm a")} · {a.reason ?? "Appointment"}
                {showDoctor && a.doctor ? ` · ${doctorName(a.doctor.full_name)}` : ""}
              </span>
            </span>
            <AppointmentBadge status={a.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RequestsPanel({
  requests,
  upcoming,
  loading,
  showDoctor,
  onOpen,
}: {
  requests: Appointment[];
  /** Booked appointments from now on, soonest first. */
  upcoming: Appointment[];
  loading: boolean;
  showDoctor: boolean;
  onOpen: (a: Appointment) => void;
}) {
  return (
    <Card className="flex max-h-[calc(100vh-7rem)] flex-col xl:sticky xl:top-6">
      <CardHeader
        icon={Inbox}
        title="Requests"
        subtitle="Approve, decline, or drag onto the calendar"
        actions={requests.length > 0 && <Badge tone="blue">{requests.length} pending</Badge>}
      />
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {requests.length ? (
            <ul className="space-y-3">
              {requests.map((a) => (
                <RequestCard key={a.id} a={a} showDoctor={showDoctor} onOpen={onOpen} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-canvas/70 px-4 py-3 text-center text-sm text-ink-faint">No pending requests. New ones from patients show up here.</p>
          )}
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <CalendarDays className="h-3.5 w-3.5" /> Upcoming
              {upcoming.length > 0 && <span className="font-semibold normal-case tracking-normal">· {upcoming.length}</span>}
            </p>
            {upcoming.length ? (
              <UpcomingList items={upcoming} showDoctor={showDoctor} onOpen={onOpen} />
            ) : (
              <EmptyState icon={CalendarDays} title="Nothing booked ahead" description="Booked appointments for the next two weeks show up here." />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
