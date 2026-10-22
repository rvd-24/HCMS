import clsx from "clsx";
import {
  CalendarPlus,
  ChevronLeft,
  FileScan,
  FileText,
  HeartPulse,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Pill,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuickActions } from "@/app/QuickActions";
import { AppointmentBadge, AuthImage, MedicationChips } from "@/components/domain";
import { avatarTone, Button, Card, EmptyState, KeyValue, PageLoader, Tabs } from "@/components/ui/primitives";
import { AppointmentDrawer } from "@/features/appointments/AppointmentDrawer";
import { useAuth } from "@/lib/auth";
import { age, doctorName, fmtDate, fmtDateTime, initials } from "@/lib/format";
import { usePatient, usePatientAppointments, usePatientVisits } from "@/lib/queries";
import { isDentalCare } from "@/lib/teeth";
import type { Appointment, DocumentRecord, Visit } from "@/lib/types";
import { AnatomyStage } from "./anatomy/AnatomyStage";
import { PatientFormModal } from "./PatientFormModal";
import { ScansPanel } from "./ScansPanel";
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

function RoundAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-card ring-1 ring-line/60 transition-all hover:-translate-y-0.5 hover:bg-ink hover:text-white"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
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
  const [tooth, setTooth] = useState<number | null>(null);

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
  const firstVisit = (visits ?? [])
    .map((v) => v.visit_date)
    .filter((d): d is string => !!d)
    .sort()[0];
  const contacts = [
    { icon: Mail, href: patient.email && `mailto:${patient.email}`, label: patient.email ?? "No email" },
    { icon: Phone, href: patient.phone_number && `tel:${patient.phone_number}`, label: patient.phone_number ?? "No phone" },
    {
      icon: MessageCircle,
      href: patient.whatsapp_number && `https://wa.me/${patient.whatsapp_number.replace(/\D/g, "")}`,
      label: patient.whatsapp_number ? `WhatsApp ${patient.whatsapp_number}` : "No WhatsApp",
    },
  ];


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
          onSelectedChange={setTooth}
          header={
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    className={clsx(
                      "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-display text-xl font-bold",
                      avatarTone(patient.full_name),
                    )}
                  >
                    {initials(patient.full_name)}
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate font-display text-[40px] font-medium leading-none tracking-tight text-ink">{patient.full_name}</h1>
                    <p className="mt-2 text-ink-soft">
                      {dental ? "Dental record" : "Health record"}
                      {firstVisit ? ` · with us since ${fmtDate(firstVisit, "MMM yyyy")}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button icon={CalendarPlus} onClick={() => openBooking({ patient })}>
                    Book
                  </Button>
                  <RoundAction icon={FileScan} label="Upload prescription" onClick={() => openUpload(patient.id)} />
                </div>
              </div>

              {/* Patient details */}
              <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-3xl bg-canvas/70 px-5 py-4 ring-1 ring-inset ring-line/50">
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  <KeyValue label="Patient ID">{patient.mrn ?? "—"}</KeyValue>
                  <KeyValue label="Gender">{{ M: "Male", F: "Female" }[patient.sex?.toUpperCase() ?? ""] ?? patient.sex ?? "—"}</KeyValue>
                  <KeyValue label="Age">{age(patient.date_of_birth) ?? "—"}</KeyValue>
                  <KeyValue label="Born">{fmtDate(patient.date_of_birth)}</KeyValue>
                </dl>
                <div className="ml-auto flex items-center gap-2">
                  {contacts.map((c) =>
                    c.href ? (
                      <a
                        key={c.label}
                        href={c.href}
                        target={c.href.startsWith("http") ? "_blank" : undefined}
                        rel="noreferrer"
                        title={c.label}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow-sm transition-transform hover:scale-110"
                      >
                        <c.icon className="h-4 w-4" />
                      </a>
                    ) : (
                      <span key={c.label} title={c.label} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-faint ring-1 ring-line/60">
                        <c.icon className="h-4 w-4" />
                      </span>
                    ),
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  )}
                </div>
                {(noContact || patient.notes) && (
                  <p className="w-full text-xs text-ink-faint">
                    {[noContact && "No contact details — reminders can't reach them.", patient.notes].filter(Boolean).join(" ")}
                  </p>
                )}
              </div>
            </div>
          }
        />

        <ScansPanel patientId={patient.id} tooth={tooth} />
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
