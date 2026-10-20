import clsx from "clsx";
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, isSameDay, isSameMonth, parseISO, startOfDay, subMonths } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  CalendarCheck2,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  FileScan,
  FileText,
  HeartPulse,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Pill,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQuickActions } from "@/app/QuickActions";
import { AppointmentBadge, AuthImage, MedicationChips } from "@/components/domain";
import { Avatar, avatarTone, Button, Card, EmptyState, KeyValue, PageLoader, Tabs } from "@/components/ui/primitives";
import { BarSpark } from "@/components/viz";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { age, doctorName, fmtDate, fmtDateTime, fmtTime, initials } from "@/lib/format";
import { usePatient, usePatientAppointments, usePatientVisits } from "@/lib/queries";
import { isDentalCare } from "@/lib/teeth";
import type { Appointment, DocumentRecord, Visit } from "@/lib/types";
import { AnatomyStage } from "./anatomy/AnatomyStage";
import { PatientFormModal } from "./PatientFormModal";
import { Lightbox, VisitCard } from "./VisitCard";

type Tab = "timeline" | "appointments" | "medications" | "documents";

function groupByDate(visits: Visit[]) {
  const groups: { date: string | null; visits: Visit[] }[] = [];
  for (const v of visits) {
    const last = groups[groups.length - 1];
    if (v.visit_date && last && last.date === v.visit_date) last.visits.push(v);
    else groups.push({ date: v.visit_date, visits: [v] });
  }
  return groups;
}

function RoundAction({ icon: Icon, label, onClick, spin }: { icon: LucideIcon; label: string; onClick: () => void; spin?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-card ring-1 ring-line/60 transition-all hover:-translate-y-0.5 hover:bg-ink hover:text-white"
    >
      <Icon className={clsx("h-[18px] w-[18px]", spin && "animate-spin")} />
    </button>
  );
}

/** Healtho-style tile: round icon, label, one value, one small visual. */
function MiniStat({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft ring-1 ring-line/60">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-ink-faint">{label}</p>
          <p className="num truncate text-2xl font-normal leading-tight text-ink">{value}</p>
        </div>
      </div>
      <div className="mt-auto pt-3">{children}</div>
    </Card>
  );
}

const ACTIVE = ["scheduled", "confirmed", "checked_in", "in_consultation"];

/** Week strip (Healtho "Upcoming appointments") with the chosen day's appointment below. */
function UpcomingCard({ appointments, onOpen, onBook }: { appointments: Appointment[]; onOpen: (a: Appointment) => void; onBook: (date: string) => void }) {
  const today = startOfDay(new Date());
  const upcoming = appointments.filter((a) => ACTIVE.includes(a.status) && parseISO(a.start_at) >= today).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const next = upcoming[0];
  const firstDay = next ? Math.max(0, differenceInCalendarDays(parseISO(next.start_at), today) - 3) : 0;
  const [offset, setOffset] = useState(firstDay);
  const [day, setDay] = useState(next ? startOfDay(parseISO(next.start_at)) : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, Math.max(0, offset) + i));
  const onDay = upcoming.filter((a) => isSameDay(parseISO(a.start_at), day));

  return (
    <Card className="flex flex-1 flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Upcoming appointments</h2>
        <span className="text-xs font-medium text-ink-faint">{upcoming.length ? `${upcoming.length} booked` : "None booked"}</span>
      </div>
      <div className="mt-4 flex items-center gap-1">
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 7))}
          disabled={offset <= 0}
          aria-label="Earlier"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-canvas disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => {
            const has = upcoming.some((a) => isSameDay(parseISO(a.start_at), d));
            const active = isSameDay(d, day);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setDay(d)}
                className={clsx(
                  "flex flex-col items-center rounded-2xl py-2.5 transition-all",
                  active ? "bg-brand-500 text-white shadow-glow-sm" : "text-ink hover:bg-canvas",
                )}
              >
                <span className="num text-lg font-medium leading-none">{format(d, "d")}</span>
                <span className={clsx("mt-1.5 text-[11px]", active ? "text-white/85" : "text-ink-faint")}>{format(d, "EEE")}</span>
                <span className={clsx("mt-1 h-1.5 w-1.5 rounded-full", has ? (active ? "bg-lime-300" : "bg-coral-500") : "bg-transparent")} />
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setOffset((o) => o + 7)}
          aria-label="Later"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-canvas"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex-1 rounded-3xl bg-canvas/70 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Doctor details</p>
          <span className="text-xs text-ink-faint">{format(day, "EEE, d MMM")}</span>
        </div>
        {onDay.length ? (
          <ul className="mt-3 space-y-2">
            {onDay.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <Avatar name={a.doctor?.full_name ?? "?"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{doctorName(a.doctor?.full_name)}</p>
                  <p className="truncate text-xs text-ink-faint">{a.reason ?? a.doctor?.specialty ?? "Appointment"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">{fmtTime(a.start_at)}</p>
                  <p className="text-[11px] text-ink-faint">{fmtTime(a.end_at)}</p>
                </div>
                <button
                  onClick={() => onOpen(a)}
                  aria-label="Appointment details"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow-sm transition-transform hover:scale-110"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-faint">Nothing booked this day.</p>
            <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => onBook(format(day, "yyyy-MM-dd"))}>
              Book
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function PatientDetailPage() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const { openBooking, openUpload } = useQuickActions();
  const { data: patient, isLoading, error } = usePatient(id);
  const { data: visits } = usePatientVisits(id);
  const { data: appointments } = usePatientAppointments(id);
  const [tab, setTab] = useState<Tab>("timeline");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [lightbox, setLightbox] = useState<DocumentRecord | null>(null);
  const [downloading, setDownloading] = useState(false);

  const groups = useMemo(() => groupByDate(visits ?? []), [visits]);
  const documents = useMemo(() => (visits ?? []).flatMap((v) => v.documents.map((d) => ({ ...d, visit: v }))), [visits]);

  if (isLoading) return <PageLoader />;
  if (error || !patient)
    return (
      <EmptyState
        icon={HeartPulse}
        title="Patient not found"
        action={
          <Link to="/patients">
            <Button variant="secondary">Back to patients</Button>
          </Link>
        }
      />
    );

  const noContact = !patient.email && !patient.whatsapp_number && !patient.phone_number && !patient.slack_user_id;

  const dental = isDentalCare(visits ?? [], [patient.notes]);
  const dated = (visits ?? []).filter((v) => v.visit_date).sort((a, b) => a.visit_date!.localeCompare(b.visit_date!));
  const firstVisit = dated[0]?.visit_date;
  const lastVisit = dated[dated.length - 1];
  const meds = patient.all_medications ?? [];
  const team = [...new Set((visits ?? []).map((v) => v.doctor?.full_name ?? v.doctor_name_raw).filter((n): n is string => !!n))];
  const perMonth = Array.from({ length: 8 }, (_, i) => {
    const m = subMonths(new Date(), 7 - i);
    return { label: format(m, "MMM"), count: dated.filter((v) => isSameMonth(parseISO(v.visit_date!), m)).length };
  });

  const downloadHistory = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/patients/${patient.id}/history.pdf`, `${patient.mrn ?? patient.full_name}_treatment_history.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <nav className="mb-5 flex animate-fade-up items-center gap-2 text-sm">
        <Link to="/patients" className="rounded-full px-3 py-1.5 text-ink-faint transition-colors hover:bg-white hover:text-ink">
          Patients
        </Link>
        <ChevronLeft className="h-4 w-4 text-ink-faint" />
        <span className="font-semibold text-ink">{patient.full_name}</span>
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
        <AnatomyStage
          visits={visits ?? []}
          dental={dental}
          header={
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-[40px] font-medium leading-none tracking-tight text-ink">{patient.full_name}</h1>
                <p className="mt-2 text-ink-soft">
                  {dental ? "Dental record" : "Health record"}
                  {firstVisit ? ` · with us since ${fmtDate(firstVisit, "MMM yyyy")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button icon={CalendarPlus} onClick={() => openBooking({ patient })}>
                  Book
                </Button>
                <RoundAction icon={FileScan} label="Upload prescription" onClick={() => openUpload(patient.id)} />
                <RoundAction icon={downloading ? Loader2 : Download} spin={downloading} label="Treatment history PDF" onClick={downloadHistory} />
              </div>
            </div>
          }
        />

        <div className="flex min-w-0 flex-col gap-4">
          {/* Profile */}
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <div
                className={clsx(
                  "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-display text-xl font-bold",
                  avatarTone(patient.full_name),
                )}
              >
                {initials(patient.full_name)}
              </div>
              <dl className="grid min-w-0 flex-1 grid-cols-3 gap-3">
                <KeyValue label="Patient ID">
                  <span className="block truncate" title={patient.mrn ?? undefined}>
                    {patient.mrn ?? "—"}
                  </span>
                </KeyValue>
                <KeyValue label="Age / sex">
                  {age(patient.date_of_birth) ?? "—"}
                  {patient.sex ? ` · ${patient.sex}` : ""}
                </KeyValue>
                <KeyValue label="Born">{fmtDate(patient.date_of_birth)}</KeyValue>
              </dl>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {[
                { icon: Mail, href: patient.email && `mailto:${patient.email}`, label: patient.email ?? "No email" },
                { icon: Phone, href: patient.phone_number && `tel:${patient.phone_number}`, label: patient.phone_number ?? "No phone" },
                {
                  icon: MessageCircle,
                  href: patient.whatsapp_number && `https://wa.me/${patient.whatsapp_number.replace(/\D/g, "")}`,
                  label: patient.whatsapp_number ? `WhatsApp ${patient.whatsapp_number}` : "No WhatsApp",
                },
              ].map((c) =>
                c.href ? (
                  <a
                    key={c.label}
                    href={c.href}
                    target={c.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    title={c.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow-sm transition-transform hover:scale-110"
                  >
                    <c.icon className="h-4 w-4" />
                  </a>
                ) : (
                  <span key={c.label} title={c.label} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/5 text-ink-faint">
                    <c.icon className="h-4 w-4" />
                  </span>
                ),
              )}
              <span className="min-w-0 flex-1 truncate px-1 text-xs text-ink-faint">
                {noContact ? "No contact details — reminders can't reach them" : (patient.email ?? patient.phone_number ?? "")}
              </span>
              {isAdmin && (
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
            {patient.notes && <p className="mt-3 rounded-2xl bg-amber-50/70 px-3 py-2 text-xs text-ink-soft">{patient.notes}</p>}
          </Card>

          {/* Vitals-style tiles */}
          <div className="grid grid-cols-2 gap-4">
            <MiniStat icon={Activity} label="Visits" value={visits?.length ?? 0}>
              <BarSpark data={perMonth.map((m) => m.count)} labels={perMonth.map((m) => m.label)} highlight={perMonth.length - 1} height={36} />
            </MiniStat>
            <MiniStat icon={CalendarCheck2} label="Last visit" value={lastVisit ? fmtDate(lastVisit.visit_date, "d MMM") : "—"}>
              <p className="truncate text-xs text-ink-soft">
                {lastVisit
                  ? `${formatDistanceToNowStrict(parseISO(lastVisit.visit_date!), { addSuffix: true })} · ${doctorName(lastVisit.doctor?.full_name ?? lastVisit.doctor_name_raw)}`
                  : "No visits yet"}
              </p>
            </MiniStat>
            <MiniStat icon={Pill} label="Medicines" value={meds.length}>
              <div className="flex flex-wrap gap-1">
                {meds.slice(0, 24).map((m, i) => (
                  <span key={m} title={m} className={clsx("h-2.5 w-2.5 rounded-full", i < 3 ? "bg-brand-500" : "bg-brand-200")} />
                ))}
                {!meds.length && <span className="text-xs text-ink-faint">None prescribed</span>}
              </div>
            </MiniStat>
            <MiniStat icon={Stethoscope} label="Care team" value={team.length}>
              <div className="flex -space-x-2">
                {team.slice(0, 5).map((n) => (
                  <span key={n} title={doctorName(n)}>
                    <Avatar name={n} size="sm" />
                  </span>
                ))}
              </div>
            </MiniStat>
          </div>

          <UpcomingCard appointments={appointments ?? []} onOpen={setSelected} onBook={(date) => openBooking({ patient, date })} />
        </div>
      </div>

      <Card className="mt-4">
        <div className="px-5 pt-5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "timeline", label: "Treatment timeline", count: visits?.length },
              { value: "appointments", label: "Appointments", count: appointments?.length },
              { value: "medications", label: "Medications", count: patient.all_medications?.length },
              { value: "documents", label: "Documents", count: documents.length },
            ]}
          />
        </div>
        <div className="p-5">
          {tab === "timeline" &&
            (groups.length ? (
              <ol className="relative space-y-7 border-l-2 border-dashed border-brand-200 pl-7">
                {groups.map((g, i) => (
                  <li key={(g.date ?? "nodate") + i} className="relative">
                    <span className="absolute -left-[39px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-card ring-4 ring-brand-50">
                      <span className="h-2 w-2 rounded-full bg-brand-500" />
                    </span>
                    <p className="mb-3 font-display text-lg font-semibold text-ink">
                      {fmtDate(g.date, "EEEE, d MMMM yyyy")}
                      {g.visits.length > 1 && <span className="ml-2 text-xs font-normal text-ink-faint">{g.visits.length} visits</span>}
                    </p>
                    <div className="space-y-3">
                      {g.visits.map((v) => (
                        <VisitCard key={v.id} visit={v} canEdit={isAdmin || v.doctor?.id === user?.doctor?.id} />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={FileText}
                title="No visits recorded"
                description="Upload a prescription to start this patient's history."
                action={<Button onClick={() => openUpload(patient.id)}>Upload prescription</Button>}
              />
            ))}

          {tab === "appointments" &&
            (appointments?.length ? (
              <ul className="divide-y divide-line">
                {appointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-canvas">
                    <span className="w-44 text-sm font-medium text-ink">{fmtDateTime(a.start_at)}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-soft">
                      <Stethoscope className="h-4 w-4 text-ink-faint" />
                      {doctorName(a.doctor?.full_name)} · <span className="truncate">{a.reason}</span>
                    </span>
                    <AppointmentBadge status={a.status} />
                    <Button size="sm" variant="secondary" onClick={() => setSelected(a)}>
                      Details
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarPlus} title="No appointments" action={<Button onClick={() => openBooking({ patient })}>Book one</Button>} />
            ))}

          {tab === "medications" && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
                <Pill className="h-4 w-4" /> Everything prescribed across all visits, in the order it was first prescribed.
              </p>
              <MedicationChips items={patient.all_medications ?? []} />
            </div>
          )}

          {tab === "documents" &&
            (documents.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                {documents.map((d) => (
                  <button key={d.id} onClick={() => setLightbox(d)} className="group text-left">
                    <AuthImage
                      src={`/documents/${d.id}/file`}
                      alt={d.original_filename}
                      className="aspect-[3/4] w-full rounded-2xl object-cover shadow-card ring-1 ring-line transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-float group-hover:ring-brand-300"
                    />
                    <p className="mt-1.5 truncate text-xs font-medium text-ink">{d.original_filename}</p>
                    <p className="text-[11px] text-ink-faint">{fmtDate(d.visit.visit_date)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={FileText} title="No documents on file" />
            ))}
        </div>
      </Card>

      {editing && <PatientFormModal patient={patient} onClose={() => setEditing(false)} />}
      {selected && <AppointmentDrawer appointmentId={selected.id} initial={selected} onClose={() => setSelected(null)} />}
      {lightbox && <Lightbox doc={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
