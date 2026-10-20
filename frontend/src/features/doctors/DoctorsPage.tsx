import clsx from "clsx";
import { AlertCircle, KeyRound, Mail, Pencil, Stethoscope, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DoctorStatusBadge } from "@/components/domain";
import { EcgLine } from "@/components/viz";
import { Modal } from "@/components/ui/overlays";
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Notice, PageHeader, PageLoader, Select, Toggle } from "@/components/ui/primitives";
import { DOCTOR_STATUS, doctorName } from "@/lib/format";
import { useDoctors, useSaveDoctor } from "@/lib/queries";
import type { Doctor, DoctorStatus } from "@/lib/types";

function DoctorFormModal({ doctor, onClose }: { doctor?: Doctor; onClose: () => void }) {
  const save = useSaveDoctor();
  const [form, setForm] = useState({
    full_name: doctor?.full_name ?? "",
    specialty: doctor?.specialty ?? "",
    department: doctor?.department ?? "",
    email: doctor?.email ?? "",
    phone_number: doctor?.phone_number ?? "",
    whatsapp_number: doctor?.whatsapp_number ?? "",
    slack_user_id: doctor?.slack_user_id ?? "",
    teams_upn: doctor?.teams_upn ?? "",
    aliases: (doctor?.aliases ?? []).join("\n"),
    status: doctor?.status ?? "available",
  });
  const [createLogin, setCreateLogin] = useState(!doctor);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = (v: string) => v.trim() || null;
    const body: Record<string, unknown> = {
      full_name: form.full_name.trim().replace(/^dr\.?\s+/i, ""),
      specialty: clean(form.specialty),
      department: clean(form.department),
      email: clean(form.email),
      phone_number: clean(form.phone_number),
      whatsapp_number: clean(form.whatsapp_number),
      slack_user_id: clean(form.slack_user_id),
      teams_upn: clean(form.teams_upn),
      aliases: form.aliases
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean),
    };
    if (doctor) body.status = form.status;
    else if (createLogin) Object.assign(body, { create_login: true, login_email: clean(form.email), login_password: password });
    save.mutate(
      { id: doctor?.id, ...body },
      { onSuccess: () => (toast.success(doctor ? "Doctor updated" : "Doctor added"), onClose()), onError: (err) => setError(err.message) },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={doctor ? `Edit ${doctorName(doctor.full_name)}` : "Add doctor"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="doctor-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="doctor-form" onSubmit={submit} className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" hint="Without the Dr. prefix">
            <Input required value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Specialty">
            <Input value={form.specialty} onChange={set("specialty")} placeholder="e.g. Orthodontics" />
          </Field>
          <Field label="Department">
            <Input value={form.department} onChange={set("department")} />
          </Field>
          {doctor && (
            <Field label="Availability">
              <Select value={form.status} onChange={set("status")}>
                {(Object.keys(DOCTOR_STATUS) as DoctorStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {DOCTOR_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <p className="pt-2 text-sm font-semibold text-ink">Contact & notifications</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" hint="Receives appointment invites">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone_number} onChange={set("phone_number")} />
          </Field>
          <Field label="WhatsApp number">
            <Input value={form.whatsapp_number} onChange={set("whatsapp_number")} />
          </Field>
          <Field label="Slack member ID">
            <Input value={form.slack_user_id} onChange={set("slack_user_id")} />
          </Field>
          <Field label="Teams UPN" className="sm:col-span-2">
            <Input value={form.teams_upn} onChange={set("teams_upn")} />
          </Field>
        </div>
        <Field
          label="Name variants on prescriptions"
          hint="One per line. Extracted names matching any of these link to this doctor; confirmed reviews add new ones automatically."
        >
          <textarea
            rows={3}
            className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
            value={form.aliases}
            onChange={set("aliases")}
          />
        </Field>
        {!doctor && (
          <div className="space-y-3 rounded-2xl bg-canvas/70 p-4">
            <Toggle
              checked={createLogin}
              onChange={setCreateLogin}
              label="Create a doctor login"
              description="Signs in with the email above to see their own schedule and patients."
            />
            {createLogin && (
              <Field label="Temporary password" hint="At least 8 characters — share it securely; they can change it after signing in.">
                <Input type="text" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

const BANNERS = [
  "from-brand-400 via-brand-300 to-lime-300",
  "from-sky-400 via-indigo-300 to-violet-300",
  "from-amber-300 via-orange-300 to-coral-400",
  "from-teal-400 via-cyan-300 to-sky-300",
  "from-violet-400 via-fuchsia-300 to-rose-300",
];
const STATUS_RING: Record<DoctorStatus, string> = { available: "bg-emerald-500", in_session: "bg-amber-500", off: "bg-coral-500" };

function DoctorCard({ d, onEdit, index }: { d: Doctor; onEdit: () => void; index: number }) {
  const banner = BANNERS[[...d.full_name].reduce((a, c) => a + c.charCodeAt(0), 0) % BANNERS.length];
  return (
    <Card
      className={clsx("lift group relative animate-fade-up overflow-hidden", !d.is_active && "opacity-60")}
      style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
    >
      <div className={clsx("relative h-24 bg-gradient-to-br", banner)}>
        <EcgLine className="absolute inset-x-0 bottom-1 h-12 w-full text-white/50" beats={4} ghost={false} duration={3.4} />
        <span className="absolute right-4 top-4">
          <DoctorStatusBadge status={d.status} />
        </span>
      </div>
      <div className="relative px-5 pb-5">
        <div className="-mt-10 flex items-end justify-between">
          <span className="relative rounded-full bg-white p-1 shadow-float">
            <Avatar name={d.full_name} size="xl" className="!ring-0" />
            <span className="absolute bottom-1.5 right-1.5 flex h-4 w-4">
              {d.status === "available" && <span className={clsx("absolute inset-0 animate-pulse-ring rounded-full", STATUS_RING[d.status])} />}
              <span className={clsx("relative h-4 w-4 rounded-full ring-[3px] ring-white", STATUS_RING[d.status])} />
            </span>
          </span>
          <Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit}>
            Edit
          </Button>
        </div>
        <p className="mt-3 truncate font-display text-xl font-semibold text-ink">{doctorName(d.full_name)}</p>
        <p className="truncate text-sm text-ink-faint">{d.specialty ?? d.department ?? "Specialty not set"}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-canvas/80 p-3">
            <p className="num text-3xl font-normal leading-none text-ink">{d.today_count ?? 0}</p>
            <p className="mt-1 text-xs text-ink-faint">appointments today</p>
          </div>
          <div className="rounded-2xl bg-canvas/80 p-3">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <KeyRound className="h-4 w-4 text-brand-500" />
              {d.has_login ? "Active" : "None"}
            </p>
            <p className="mt-1 text-xs text-ink-faint">doctor login</p>
          </div>
        </div>
        <div className="mt-3">
          {d.email ? (
            <span className="flex min-w-0 items-center gap-2 rounded-2xl px-1 text-xs text-ink-soft">
              <Mail className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="truncate">{d.email}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" /> No email — won't get invites
            </span>
          )}
        </div>
        {!d.is_active && <Badge className="mt-2">Inactive</Badge>}
      </div>
    </Card>
  );
}

export function DoctorsPage() {
  const { data, isLoading } = useDoctors(true);
  const [editing, setEditing] = useState<Doctor | "new" | null>(null);
  const count = (s: DoctorStatus) => data?.filter((d) => d.is_active && d.status === s).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Hospital"
        title="Doctors"
        subtitle="Profiles, availability and where their notifications go"
        actions={
          <Button icon={UserPlus} onClick={() => setEditing("new")}>
            Add doctor
          </Button>
        }
      />
      {!!data?.length && (
        <div className="stagger mb-5 flex flex-wrap gap-2">
          {(Object.keys(DOCTOR_STATUS) as DoctorStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-2.5 rounded-full bg-white py-2 pl-3 pr-4 text-sm shadow-card">
              <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_RING[s])} />
              <span className="text-ink-soft">{DOCTOR_STATUS[s].label}</span>
              <span className="num text-base font-semibold text-ink">{count(s)}</span>
            </span>
          ))}
        </div>
      )}
      {isLoading ? (
        <PageLoader />
      ) : data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.map((d, i) => (
            <DoctorCard key={d.id} d={d} index={i} onEdit={() => setEditing(d)} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Stethoscope} title="No doctors yet" action={<Button onClick={() => setEditing("new")}>Add doctor</Button>} />
        </Card>
      )}
      {editing && <DoctorFormModal doctor={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
