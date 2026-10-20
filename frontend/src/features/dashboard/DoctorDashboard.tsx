import clsx from "clsx";
import { format, parseISO } from "date-fns";
import { Activity, ArrowUpRight, CalendarDays, CheckCircle2, ClipboardList, Clock, FileScan, HeartPulse, ListOrdered, Pill, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQuickActions } from "@/app/QuickActions";
import { AppointmentBadge, MedicationChips, StatCard } from "@/components/domain";
import { Avatar, Button, Card, CardHeader, EmptyState, PageLoader } from "@/components/ui/primitives";
import { BarSpark, EcgLine, LiveDot, Ring } from "@/components/viz";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtTime, nextActions } from "@/lib/format";
import { useAppointmentStatus, useDoctorDashboard, usePatientVisits } from "@/lib/queries";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { greeting, QueueCard } from "./AdminDashboard";
import { TrendChart } from "./TrendChart";

/** The patient who's next — with the last visit's context, so the doctor walks in prepared. */
function NextUpHero({ appointment, onOpen, title }: { appointment: Appointment; onOpen: () => void; title: string }) {
  const { data: visits } = usePatientVisits(appointment.patient.id);
  const last = visits?.[0];
  const status = useAppointmentStatus();
  const action = nextActions(appointment.status)[0];
  const [time, meridiem] = fmtTime(appointment.start_at).split(" ");
  return (
    <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 p-7 text-white shadow-float sm:p-9">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 animate-blob rounded-full bg-lime-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/4 h-80 w-80 animate-blob rounded-full bg-sky-300/20 blur-3xl [animation-delay:-8s]" />
      <EcgLine className="pointer-events-none absolute inset-x-0 bottom-4 h-28 w-full text-white/20" beats={10} strokeWidth={1.6} duration={4.5} />

      <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
        <LiveDot color="bg-lime-300" /> {title}
      </p>
      <div className="relative mt-5 grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/60">Next patient</p>
            <p className="num text-7xl font-light leading-none">
              {time}
              <span className="ml-1 text-2xl font-normal text-white/70">{meridiem}</span>
            </p>
          </div>
          <span className="hidden h-20 w-px bg-white/20 sm:block" />
          <Link to={`/patients/${appointment.patient.id}`} className="group flex min-w-0 items-center gap-3">
            <Avatar name={appointment.patient.full_name} size="lg" className="!ring-white/30" />
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl font-semibold group-hover:underline">{appointment.patient.full_name}</span>
              <span className="block truncate text-sm text-white/75">{appointment.reason ?? "Consultation"}</span>
            </span>
          </Link>
        </div>

        <div className="glass-dark min-w-0 rounded-3xl p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/65">
            <HeartPulse className="h-3.5 w-3.5 animate-beat text-lime-300" />
            Last visit{last ? ` · ${fmtDate(last.visit_date)}${last.doctor ? ` · Dr. ${last.doctor.full_name}` : ""}` : ""}
          </p>
          {last ? (
            <>
              <p className="mt-1.5 line-clamp-2 text-sm">{last.diagnosis ?? last.summary ?? "No notes recorded."}</p>
              {last.medications.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {last.medications.slice(0, 4).map((m) => (
                    <span key={m} className="inline-flex items-center gap-1 rounded-full bg-lime-300/90 px-2.5 py-0.5 text-[11px] font-semibold text-brand-950">
                      <Pill className="h-3 w-3" /> {m}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-sm text-white/85">First visit — no history on file.</p>
          )}
        </div>

        <div className="flex gap-2 lg:flex-col">
          {action && (
            <Button
              size="lg"
              className="!bg-none !bg-white !text-brand-800 !shadow-none hover:!bg-lime-200"
              loading={status.isPending}
              onClick={() =>
                status.mutate(
                  { id: appointment.id, status: action.status },
                  { onSuccess: () => toast.success(`${appointment.patient.full_name}: ${action.label.toLowerCase()}`) },
                )
              }
            >
              {action.label}
            </Button>
          )}
          <Button size="lg" className="glass-dark !bg-none !shadow-none hover:!bg-white/20" onClick={onOpen}>
            Details
          </Button>
        </div>
      </div>
    </section>
  );
}

const RAIL_DOT: Partial<Record<AppointmentStatus, string>> = {
  in_consultation: "bg-violet-500",
  checked_in: "bg-amber-500",
  confirmed: "bg-emerald-500",
  scheduled: "bg-sky-500",
  completed: "bg-brand-300",
};

export function DoctorDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useDoctorDashboard();
  const status = useAppointmentStatus();
  const { openUpload } = useQuickActions();
  const [selected, setSelected] = useState<Appointment | null>(null);
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const past = useMemo(() => (data?.trend ?? []).filter((p) => p.date <= todayKey).slice(-10), [data, todayKey]);

  if (isLoading || !data) return <PageLoader label="Preparing your day" />;
  const { kpis } = data;
  const title = `${greeting()}, Dr. ${user?.full_name.split(" ")[0]} · ${format(new Date(), "EEEE, d MMMM")}`;
  const donePct = kpis.today_total ? Math.round((kpis.completed_today / kpis.today_total) * 100) : 0;

  return (
    <div className="space-y-4">
      {data.next_up ? (
        <NextUpHero appointment={data.next_up} onOpen={() => setSelected(data.next_up)} title={title} />
      ) : (
        <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 p-9 text-white shadow-float">
          <EcgLine className="pointer-events-none absolute inset-x-0 bottom-4 h-24 w-full text-white/20" beats={10} strokeWidth={1.6} duration={6} />
          <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            <LiveDot color="bg-lime-300" /> {title}
          </p>
          <h1 className="relative mt-3 font-display text-5xl font-medium tracking-tight">All clear for now.</h1>
          <p className="relative mt-2 text-white/80">
            {kpis.remaining_today
              ? `${kpis.remaining_today} appointment${kpis.remaining_today === 1 ? "" : "s"} still to go today.`
              : "No one else is booked today."}
          </p>
          <div className="relative mt-6 flex flex-wrap gap-2.5">
            <Link to="/appointments">
              <Button size="lg" icon={CalendarDays} className="!bg-none !bg-white !text-brand-800 !shadow-none hover:!bg-lime-200">
                My schedule
              </Button>
            </Link>
            <Button size="lg" icon={FileScan} className="glass-dark !bg-none !shadow-none hover:!bg-white/20" onClick={() => openUpload()}>
              Upload prescription
            </Button>
          </div>
        </section>
      )}

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard featured icon={ListOrdered} label="Today" value={kpis.today_total} hint={`${kpis.remaining_today} remaining`} />
        <StatCard
          icon={Clock}
          label="Waiting room"
          value={kpis.waiting}
          hint="Checked in, not yet seen"
          chart={
            <div className="flex -space-x-2">
              {data.today
                .filter((a) => a.status === "checked_in")
                .slice(0, 6)
                .map((a) => (
                  <Avatar key={a.id} name={a.patient.full_name} size="sm" />
                ))}
              {!kpis.waiting && <span className="text-xs text-ink-faint">Nobody waiting</span>}
            </div>
          }
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed today"
          value={kpis.completed_today}
          hint={`${kpis.week_total} booked this week`}
          chart={
            <div className="flex items-center gap-3">
              <Ring value={kpis.completed_today} max={kpis.today_total} size={44} stroke={5}>
                <span className="text-[10px] font-bold text-ink">{donePct}%</span>
              </Ring>
              <span className="text-xs text-ink-faint">of today's list</span>
            </div>
          }
        />
        <StatCard
          icon={Users}
          label="My patients"
          value={kpis.patients_seen}
          hint="Seen at least once"
          chart={
            <BarSpark data={past.map((p) => p.completed)} labels={past.map((p) => format(parseISO(p.date), "EEE d"))} highlight={past.length - 1} height={40} />
          }
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              icon={ClipboardList}
              title="Today's queue"
              subtitle="Move patients along as you see them"
              actions={
                <Link to="/appointments">
                  <Button variant="secondary" size="sm" icon={ArrowUpRight}>
                    Full schedule
                  </Button>
                </Link>
              }
            />
            {data.today.length ? (
              <ol className="relative px-6 pb-6">
                <span className="absolute bottom-8 left-[118px] top-3 w-px bg-line" />
                {data.today.map((a, i) => {
                  const actions = nextActions(a.status);
                  const done = ["completed", "cancelled", "no_show"].includes(a.status);
                  const current = a.status === "in_consultation";
                  return (
                    <li
                      key={a.id}
                      className={clsx("relative flex animate-fade-up items-center gap-4 py-1.5", done && "opacity-55")}
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <span className="w-[72px] shrink-0 text-right text-sm font-bold tabular-nums text-ink">{fmtTime(a.start_at)}</span>
                      <span className="relative z-[1] flex h-4 w-4 shrink-0 items-center justify-center">
                        {current && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-violet-400" />}
                        <span className={clsx("h-3 w-3 rounded-full ring-4 ring-white", RAIL_DOT[a.status] ?? "bg-gray-300")} />
                      </span>
                      <div
                        className={clsx(
                          "flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-2xl p-3 transition-all",
                          current ? "bg-gradient-to-r from-violet-50 to-white shadow-card ring-1 ring-violet-200" : "hover:bg-canvas",
                        )}
                      >
                        <button onClick={() => setSelected(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar name={a.patient.full_name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">{a.patient.full_name}</span>
                            <span className="block truncate text-xs text-ink-faint">{a.reason}</span>
                          </span>
                        </button>
                        <AppointmentBadge status={a.status} />
                        {actions[0] && (
                          <Button
                            size="sm"
                            variant={current ? "dark" : "soft"}
                            onClick={() => status.mutate({ id: a.id, status: actions[actions.length - 1].status })}
                          >
                            {actions[actions.length - 1].label}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState icon={CalendarDays} title="No appointments today" description="Enjoy the quiet — new bookings will appear here." />
            )}
          </Card>
          <Card>
            <CardHeader icon={Activity} title="My workload" subtitle="Two weeks back, one week ahead" />
            <div className="px-5 pb-6">
              <TrendChart data={data.trend} height={200} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <QueueCard today={data.today} title="Day at a glance" />
          <Card>
            <CardHeader icon={HeartPulse} title="Recently recorded visits" />
            <ul className="space-y-2.5 px-5 pb-5">
              {data.recent_visits.map((v) => (
                <li key={v.id}>
                  <Link to={`/patients/${v.patient.id}`} className="lift block rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-ink/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={v.patient.full_name} size="sm" />
                        <span className="truncate text-sm font-semibold text-ink">{v.patient.full_name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{fmtDate(v.visit_date)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft">{v.diagnosis ?? v.summary}</p>
                    {v.medications.length > 0 && (
                      <div className="mt-2">
                        <MedicationChips items={v.medications.slice(0, 3)} />
                      </div>
                    )}
                  </Link>
                </li>
              ))}
              {!data.recent_visits.length && <li className="text-sm text-ink-faint">No visits recorded yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
      {selected && <AppointmentDrawer appointmentId={selected.id} initial={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
