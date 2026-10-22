import { addDays, addWeeks, format, isSameDay, isToday, parseISO, startOfWeek } from "date-fns";
import clsx from "clsx";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, MousePointerClick, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuickActions } from "@/app/QuickActions";
import { AppointmentBadge, PersonCell } from "@/components/domain";
import { Avatar, Button, Card, EmptyState, Input, PageHeader, PageLoader, Segmented, Select } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { APPOINTMENT_STATUS, doctorName, fmtTime, toLocalIso } from "@/lib/format";
import { useAppointments, useDoctors, useUpdateAppointment } from "@/lib/queries";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { RequestsPanel, useApprove } from "./RequestsPanel";
import { ScheduleGrid, type DropTarget, type GridColumn } from "./ScheduleGrid";

type View = "day" | "week" | "list";
const ymd = (d: Date) => format(d, "yyyy-MM-dd");
/** Holds a slot on the calendar (requests don't until approved; cancellations no longer do). */
const onCalendar = (a: Appointment) => a.status !== "cancelled" && a.status !== "requested";

/** Healtho-style day pills for the visible week, with a dot per booking (up to 5). Click a day to open it. */
function WeekStrip({ start, anchor, appointments, onPick }: { start: Date; anchor: Date; appointments: Appointment[]; onPick: (d: Date) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line/70 px-6 py-4">
      {Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, i);
        const count = appointments.filter((a) => onCalendar(a) && isSameDay(parseISO(a.start_at), day)).length;
        const today = isToday(day);
        return (
          <button
            key={i}
            onClick={() => onPick(day)}
            className={clsx(
              "group flex min-w-[76px] flex-1 flex-col items-center rounded-2xl px-3 py-3 transition-all duration-300 hover:-translate-y-0.5",
              today
                ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-glow"
                : isSameDay(day, anchor)
                  ? "bg-ink text-white"
                  : "bg-canvas/70 text-ink hover:bg-white hover:shadow-card",
            )}
          >
            <span className={clsx("num text-2xl font-semibold leading-none")}>{format(day, "d")}</span>
            <span className={clsx("mt-1 text-xs font-medium", today ? "text-white/85" : "text-ink-faint")}>{format(day, "EEE")}</span>
            <span className="mt-2 flex h-1.5 gap-0.5">
              {Array.from({ length: Math.min(5, count) }, (_, j) => (
                <span key={j} className={clsx("h-1.5 w-1.5 rounded-full", today ? "bg-lime-300" : "bg-brand-400")} />
              ))}
            </span>
            <span className={clsx("mt-1 text-[10px] font-semibold", today ? "text-white/80" : "text-ink-faint")}>{count ? `${count} booked` : "free"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AppointmentsPage() {
  const { user, isAdmin } = useAuth();
  const { openBooking } = useQuickActions();
  // Doctors work a day at a time; the front desk plans the week.
  const [view, setView] = useState<View>(isAdmin ? "week" : "day");
  const [anchor, setAnchor] = useState(new Date());
  const [doctorId, setDoctorId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const { data: doctors } = useDoctors();

  const range = useMemo(() => {
    if (view === "day") return { start: anchor, end: anchor };
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return { start, end: addDays(start, 6) };
  }, [view, anchor]);

  const { data, isLoading } = useAppointments({
    start: ymd(range.start),
    end: ymd(range.end),
    doctor_id: doctorId || undefined,
    status: view === "list" ? statusFilter || undefined : undefined,
    q: view === "list" ? q || undefined : undefined,
  });
  const appointments = data ?? [];
  const visible = view === "list" ? appointments : appointments.filter(onCalendar);
  const { data: requestData, isLoading: requestsLoading } = useAppointments({ status: "requested", doctor_id: doctorId || undefined });
  // Next two weeks of booked work, for the side panel (independent of the day/week being viewed).
  const { data: aheadData } = useAppointments({
    start: ymd(new Date()),
    end: ymd(addDays(new Date(), 14)),
    doctor_id: doctorId || undefined,
    status: "scheduled,confirmed,checked_in",
  });
  const upcoming = (aheadData ?? []).filter((a) => parseISO(a.end_at) >= new Date());
  const requests = requestData ?? [];
  const approve = useApprove();
  const update = useUpdateAppointment();

  const moveTo = (a: Appointment, startAt: string, doctorId: string | undefined, allowOverlap = false) =>
    update.mutate(
      { id: a.id, start_at: startAt, doctor_id: doctorId, allow_overlap: allowOverlap },
      {
        onSuccess: (m) => toast.success(`Moved ${m.patient.full_name} to ${format(parseISO(m.start_at), "EEE d MMM, h:mm a")}`, { description: "Patient and doctor notified." }),
        onError: (err) =>
          err instanceof ApiError && err.status === 409
            ? toast.error(err.message, { action: { label: "Move anyway", onClick: () => moveTo(a, startAt, doctorId, true) } })
            : toast.error(err.message),
      },
    );

  // A request dropped on the grid is approved at that slot; a booked appointment is moved there.
  const onDrop = ({ appointment: a, date, time, doctorId: column }: DropTarget) => {
    const startAt = toLocalIso(date, time);
    if (a.status === "requested") {
      if (column && a.doctor && column !== a.doctor.id) return toast.error(`This request is for ${doctorName(a.doctor.full_name)} — drop it in their column.`);
      return approve.run(a, startAt);
    }
    if (parseISO(a.start_at).getTime() === parseISO(startAt).getTime() && (!column || column === a.doctor?.id)) return;
    moveTo(a, startAt, isAdmin && column !== a.doctor?.id ? column : undefined);
  };

  const step = (dir: number) => setAnchor((d) => (view === "day" ? addDays(d, dir) : addWeeks(d, dir)));
  const label =
    view === "day"
      ? format(anchor, "EEEE, d MMMM yyyy")
      : `${format(range.start, "d MMM")} – ${format(range.end, range.start.getMonth() === range.end.getMonth() ? "d" : "d MMM")}, ${format(range.end, "yyyy")}`;

  const columns: GridColumn[] = useMemo(() => {
    if (view === "day") {
      // Admin's day view: one column per doctor — who's free when, at a glance.
      const cols = (doctorId ? doctors?.filter((d) => d.id === doctorId) : isAdmin ? doctors : doctors?.filter((d) => d.id === user?.doctor?.id)) ?? [];
      return cols.map((d) => ({
        key: d.id,
        header: (
          <span className="flex items-center justify-center gap-2">
            <Avatar name={d.full_name} size="sm" />
            <span className="truncate text-sm font-medium text-ink">{doctorName(d.full_name)}</span>
          </span>
        ),
        items: visible.filter((a) => a.doctor?.id === d.id),
        slotContext: { date: ymd(anchor), doctorId: d.id },
      }));
    }
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(range.start, i);
      return {
        key: ymd(day),
        highlight: isToday(day),
        header: (
          <span>
            <span className="block text-xs text-ink-faint">{format(day, "EEE")}</span>
            <span className={isToday(day) ? "text-lg font-semibold text-brand-600" : "text-lg font-semibold text-ink"}>{format(day, "d")}</span>
          </span>
        ),
        items: visible.filter((a) => isSameDay(parseISO(a.start_at), day)),
        slotContext: { date: ymd(day), doctorId: doctorId || undefined },
      };
    });
  }, [view, doctors, doctorId, visible, range.start, anchor, isAdmin, user]);

  const counts = useMemo(() => {
    const c: Partial<Record<AppointmentStatus, number>> = {};
    appointments.forEach((a) => (c[a.status] = (c[a.status] ?? 0) + 1));
    return c;
  }, [appointments]);

  return (
    <>
      <PageHeader
        eyebrow={format(new Date(), "EEEE, d MMMM")}
        title={isAdmin ? "Appointments" : "My schedule"}
        subtitle={`${appointments.filter(onCalendar).length} appointments ${view === "day" ? "on this day" : "this week"}${requests.length ? ` · ${requests.length} requests waiting` : ""}`}
        actions={
          <Button icon={CalendarPlus} onClick={() => openBooking({ doctorId: doctorId || undefined })}>
            Add appointment
          </Button>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-6 py-4">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "list", label: "List" },
            ]}
          />
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => step(-1)} aria-label="Previous">
              <span className="sr-only">Prev</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button variant="secondary" size="sm" icon={ChevronRight} onClick={() => step(1)} aria-label="Next">
              <span className="sr-only">Next</span>
            </Button>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-canvas px-4 py-2 font-display text-base font-semibold text-ink">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            {label}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {view === "list" && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <Input className="h-9 w-48 pl-8" placeholder="Filter by patient" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <Select className="h-9 w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  {Object.entries(APPOINTMENT_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </>
            )}
            {isAdmin && (
              <Select className="h-9 w-52" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">All doctors</option>
                {doctors?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {doctorName(d.full_name)}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {view !== "day" && <WeekStrip start={range.start} anchor={anchor} appointments={appointments} onPick={(d) => (setAnchor(d), setView("day"))} />}

        {view !== "list" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 px-6 py-3 text-xs text-ink-soft">
            {(["scheduled", "confirmed", "checked_in", "in_consultation", "completed", "no_show"] as AppointmentStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <AppointmentBadge status={s} />
                <span className="font-medium text-ink">{counts[s] ?? 0}</span>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 font-semibold text-white">
              <MousePointerClick className="h-3.5 w-3.5" /> Click a slot to book · drag to move
            </span>
          </div>
        )}

        {isLoading ? (
          <PageLoader />
        ) : view === "list" ? (
          appointments.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date & time</th>
                    <th>Patient</th>
                    {isAdmin && <th>Doctor</th>}
                    <th>Reason</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">
                        <span className="block font-medium text-ink">{format(parseISO(a.start_at), "EEE, d MMM")}</span>
                        <span className="text-xs text-ink-faint">{fmtTime(a.start_at)}</span>
                      </td>
                      <td>
                        <PersonCell name={a.patient.full_name} sub={a.patient.mrn ?? undefined} href={`/patients/${a.patient.id}`} />
                      </td>
                      {isAdmin && <td className="whitespace-nowrap text-ink-soft">{doctorName(a.doctor?.full_name)}</td>}
                      <td className="max-w-[220px] truncate text-ink-soft">{a.reason}</td>
                      <td>
                        <AppointmentBadge status={a.status} />
                      </td>
                      <td className="text-right">
                        <Button size="sm" onClick={() => setSelected(a)}>
                          See details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="No appointments in this range" />
          )
        ) : (
          <ScheduleGrid
            columns={columns}
            showDoctor={isAdmin && view === "week" && !doctorId}
            onSelect={setSelected}
            onSlot={({ date, time, doctorId: d }) => openBooking({ date, time, doctorId: d })}
            onDrop={onDrop}
          />
        )}
      </Card>
      <RequestsPanel requests={requests} upcoming={upcoming} loading={requestsLoading} showDoctor={isAdmin && !doctorId} onOpen={setSelected} />
      </div>
      {selected && <AppointmentDrawer appointmentId={selected.id} initial={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
