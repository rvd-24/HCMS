import clsx from "clsx";
import { format, parseISO } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  FileScan,
  History,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuickActions } from "@/app/QuickActions";
import { AppointmentBadge, Delta, DoctorStatusBadge, PersonCell, StatCard } from "@/components/domain";
import { CountUp } from "@/components/ui/motion";
import { Avatar, Button, Card, CardHeader, EmptyState, PageLoader, Segmented } from "@/components/ui/primitives";
import { BarSpark, EcgLine, LiveDot, QueueGauge, Ring, SERIES_COLORS } from "@/components/viz";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { useAuth } from "@/lib/auth";
import { doctorName, fmtDateTime, fmtTime } from "@/lib/format";
import { useAdminDashboard } from "@/lib/queries";
import type { Appointment, AuditEvent, DoctorStatus } from "@/lib/types";
import { TrendChart } from "./TrendChart";

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Split a day's appointments the same way the trend chart does: completed / not yet seen / missed. */
export function queueSegments(today: Appointment[]) {
  const c = { completed: 0, open: 0, missed: 0 };
  today.forEach((a) => {
    if (a.status === "completed") c.completed++;
    else if (a.status === "cancelled" || a.status === "no_show") c.missed++;
    else c.open++;
  });
  return [
    { key: "completed", label: "Completed", value: c.completed, color: SERIES_COLORS.completed },
    { key: "open", label: "Not yet seen", value: c.open, color: SERIES_COLORS.open },
    { key: "missed", label: "Cancelled / no-show", value: c.missed, color: SERIES_COLORS.missed },
  ];
}

export function QueueCard({ today, title = "Today's queue" }: { today: Appointment[]; title?: string }) {
  const segments = queueSegments(today);
  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        <span className="flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <LiveDot className="scale-75" /> Live
        </span>
      </div>
      <div className="mt-6 flex-1">
        <QueueGauge
          segments={segments}
          center={
            <>
              <p className="num text-5xl font-normal text-ink">
                <CountUp value={today.length} />
              </p>
              <p className="text-xs text-ink-soft">appointments today</p>
            </>
          }
        />
      </div>
      <ul className="mt-6 space-y-2.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-ink-soft">{s.label}</span>
            <span className="num text-base font-semibold text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const ENTITY_ICON: Record<string, LucideIcon> = {
  appointment: CalendarCheck2,
  document: FileScan,
  patient: UserRound,
  visit: Stethoscope,
  doctor: Stethoscope,
  user: ShieldCheck,
};

export function ActivityTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="px-6 pb-6 text-sm text-ink-faint">Nothing yet — bookings, uploads and edits will show up here.</p>;
  return (
    <ol className="relative px-6 pb-6">
      <span className="absolute bottom-8 left-[43px] top-2 w-px bg-gradient-to-b from-line via-line to-transparent" />
      {events.map((e, i) => {
        const Icon = ENTITY_ICON[e.entity_type] ?? History;
        return (
          <li key={e.id} className="relative flex animate-fade-up gap-3 py-2.5" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-card ring-1 ring-line">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm text-ink">
                <span className="font-semibold">{e.actor}</span> <span className="text-ink-soft">{e.action.replace(/[._]/g, " ")}</span>
              </p>
              {e.summary && <p className="truncate text-xs text-ink-faint">{e.summary}</p>}
              <p className="mt-0.5 text-[11px] font-medium text-ink-faint">{fmtDateTime(e.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const STATUS_PULSE: Record<DoctorStatus, string> = { available: "bg-emerald-500", in_session: "bg-amber-500", off: "bg-coral-500" };

export function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useAdminDashboard();
  const { openBooking, openUpload } = useQuickActions();
  const navigate = useNavigate();
  const [doctorFilter, setDoctorFilter] = useState<"all" | DoctorStatus>("all");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [showAll, setShowAll] = useState(false);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const ahead = useMemo(() => (data?.trend ?? []).filter((p) => p.date >= todayKey).slice(0, 7), [data, todayKey]);

  if (isLoading || !data) return <PageLoader label="Loading your clinic" />;
  const { kpis } = data;
  const doctors = data.doctors.filter((d) => doctorFilter === "all" || d.status === doctorFilter);
  const available = data.doctors.filter((d) => d.status === "available").length;
  const donePct = kpis.today_total ? Math.round((kpis.completed_today / kpis.today_total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Hero + queue */}
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 p-7 text-white shadow-float sm:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 animate-blob rounded-full bg-lime-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 animate-blob rounded-full bg-sky-300/20 blur-3xl [animation-delay:-6s]" />
          <EcgLine className="pointer-events-none absolute inset-x-0 bottom-6 h-24 w-full text-white/25" beats={9} strokeWidth={1.6} duration={5} />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                <LiveDot color="bg-lime-300" /> {format(new Date(), "EEEE, d MMMM")}
              </p>
              <h1 className="mt-3 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
                {greeting()}, {user?.full_name.split(" ")[0]}
              </h1>
              <p className="mt-3 text-white/80">
                {kpis.today_total
                  ? `${kpis.today_total} appointment${kpis.today_total === 1 ? "" : "s"} today · ${kpis.checked_in} in the building · ${available} doctor${available === 1 ? "" : "s"} free right now.`
                  : `A quiet day so far — ${available} doctor${available === 1 ? "" : "s"} free right now.`}
              </p>
              <div className="mt-7 flex flex-wrap gap-2.5">
                <Button
                  size="lg"
                  icon={CalendarCheck2}
                  className="!bg-none !bg-white !text-brand-800 !shadow-none hover:!bg-lime-200"
                  onClick={() => openBooking()}
                >
                  Book appointment
                </Button>
                <Button size="lg" icon={FileScan} className="glass-dark !bg-none !shadow-none hover:!bg-white/20" onClick={() => openUpload()}>
                  Upload prescription
                </Button>
              </div>
            </div>
            <div className="glass-dark flex items-center gap-4 self-start rounded-3xl p-4 lg:self-auto">
              <Ring value={kpis.completed_today} max={kpis.today_total} size={84} stroke={8} color="#d2ec5c">
                <span className="num text-xl font-semibold">{donePct}%</span>
              </Ring>
              <div>
                <p className="text-xs text-white/70">Day progress</p>
                <p className="font-display text-2xl font-semibold">
                  {kpis.completed_today}
                  <span className="text-base font-normal text-white/70"> / {kpis.today_total} seen</span>
                </p>
              </div>
            </div>
          </div>
        </section>
        <QueueCard today={data.today} />
      </div>

      {/* KPI tiles */}
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          featured
          icon={Users}
          label="Today's appointments"
          value={kpis.today_total}
          hint={<Delta value={kpis.today_total - kpis.today_total_yesterday} featured />}
          onClick={() => navigate("/appointments")}
        />
        <StatCard
          icon={UserCheck}
          label="Checked in now"
          value={kpis.checked_in}
          hint={`${kpis.completed_today} completed today`}
          chart={
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full origin-left animate-grow-x rounded-full bg-gradient-to-r from-brand-300 to-brand-500" style={{ width: `${donePct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">{donePct}% of today's list seen</p>
            </div>
          }
        />
        <StatCard
          icon={CalendarClock}
          label="Next 7 days"
          value={kpis.upcoming_7d}
          hint="Upcoming appointments"
          onClick={() => navigate("/appointments")}
          chart={<BarSpark data={ahead.map((p) => p.booked)} labels={ahead.map((p) => format(parseISO(p.date), "EEE d"))} highlight={0} height={44} />}
        />
        <StatCard
          icon={FileScan}
          label="Awaiting review"
          value={kpis.pending_review}
          hint={kpis.pending_review ? "Prescriptions to confirm" : "Inbox is clear"}
          onClick={() => navigate("/prescriptions")}
          chart={
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-canvas px-3 py-2">
                <p className="text-ink-faint">Patients</p>
                <p className="num text-lg font-semibold text-ink">{kpis.patients_total}</p>
              </div>
              <div className="rounded-2xl bg-canvas px-3 py-2">
                <p className="text-ink-faint">Visits · 30d</p>
                <p className="num text-lg font-semibold text-ink">{kpis.visits_30d}</p>
              </div>
            </div>
          }
        />
      </div>

      {/* Trends + doctors */}
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader
            icon={Activity}
            title="Appointment trends"
            subtitle={`Last ${Math.max(0, data.trend.length - 8)} days and the week ahead`}
            actions={
              <Link
                to="/appointments"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-ink-soft transition-colors hover:bg-ink hover:text-white"
                aria-label="Open schedule"
              >
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="px-5 pb-6">
            <TrendChart data={data.trend} />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={Stethoscope}
            title="Doctors"
            subtitle={`${available} of ${data.doctors.length} available`}
            actions={
              <Segmented
                value={doctorFilter}
                onChange={setDoctorFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "available", label: "Free" },
                  { value: "in_session", label: "Busy" },
                ]}
              />
            }
          />
          <ul className="flex-1 space-y-2 px-4 pb-5">
            {doctors.map((d, i) => (
              <li
                key={d.id}
                className="group flex animate-fade-up items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-canvas"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="relative">
                  <Avatar name={d.full_name} />
                  <span className={clsx("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-white", STATUS_PULSE[d.status])} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{doctorName(d.full_name)}</p>
                  <p className="truncate text-xs text-ink-faint">{d.specialty ?? "General"}</p>
                </div>
                <span className="hidden text-right sm:block">
                  <span className="num block text-lg font-semibold leading-none text-ink">{d.today_count ?? 0}</span>
                  <span className="text-[10px] text-ink-faint">today</span>
                </span>
                <DoctorStatusBadge status={d.status} />
              </li>
            ))}
            {!doctors.length && <li className="py-6 text-center text-sm text-ink-faint">No doctors match this filter.</li>}
          </ul>
        </Card>
      </div>

      {/* Bookings + activity */}
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            icon={CalendarCheck2}
            title="Today's bookings"
            subtitle={`${data.today.length} appointment${data.today.length === 1 ? "" : "s"}`}
            actions={
              <Link to="/appointments">
                <Button variant="secondary" size="sm" icon={ArrowUpRight}>
                  Open schedule
                </Button>
              </Link>
            }
          />
          {data.today.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Patient</th>
                    <th>Doctor · reason</th>
                    <th>Status</th>
                    <th className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? data.today : data.today.slice(0, 8)).map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">
                        <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-bold text-ink">{fmtTime(a.start_at)}</span>
                      </td>
                      <td>
                        <PersonCell name={a.patient.full_name} sub={a.patient.mrn ?? undefined} href={`/patients/${a.patient.id}`} />
                      </td>
                      <td className="max-w-[220px]">
                        <span className="block truncate text-sm font-medium text-ink">{doctorName(a.doctor?.full_name)}</span>
                        <span className="block truncate text-xs text-ink-faint">{a.reason}</span>
                      </td>
                      <td>
                        <AppointmentBadge status={a.status} />
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => setSelected(a)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow-sm transition-transform hover:scale-110"
                          aria-label={`Details for ${a.patient.full_name}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.today.length > 8 && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full border-t border-line/70 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50/60"
                >
                  {showAll ? "Show fewer" : `Show all ${data.today.length}`}
                </button>
              )}
            </div>
          ) : (
            <EmptyState
              icon={CalendarCheck2}
              title="No appointments today"
              description="Book one, or upload a prescription and the follow-up books itself."
              action={<Button onClick={() => openBooking()}>Book one</Button>}
            />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={History}
            title="Recent activity"
            actions={
              <Link to="/activity" className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50">
                View all
              </Link>
            }
          />
          <ActivityTimeline events={data.activity} />
        </Card>
      </div>
      {selected && <AppointmentDrawer appointmentId={selected.id} initial={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
