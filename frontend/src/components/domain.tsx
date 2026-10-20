import clsx from "clsx";
import { ImageOff, Search, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchBlobUrl } from "@/lib/api";
import { APPOINTMENT_STATUS, DOCTOR_STATUS } from "@/lib/format";
import { usePatients } from "@/lib/queries";
import type { AppointmentStatus, DoctorStatus, PatientBrief } from "@/lib/types";
import { CountUp } from "./ui/motion";
import { Avatar, Badge, Card, IconBadge, Input, Spinner } from "./ui/primitives";
import { EcgLine } from "./viz";

export function AppointmentBadge({ status }: { status: AppointmentStatus }) {
  const s = APPOINTMENT_STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function DoctorStatusBadge({ status }: { status: DoctorStatus }) {
  const s = DOCTOR_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** KPI tile in the "vitals card" style: label + icon on top, big light number, optional chart below. */
export function StatCard({
  icon,
  label,
  value,
  hint,
  featured,
  onClick,
  chart,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  featured?: boolean;
  onClick?: () => void;
  /** Sparkline / bars / ring rendered under the number. */
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      onClick={onClick}
      className={clsx(
        "group relative flex flex-col overflow-hidden p-5",
        featured && "border-transparent bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 text-white shadow-glow",
        onClick && "lift cursor-pointer",
        className,
      )}
    >
      {featured && (
        <>
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-lime-300/30 blur-2xl" />
          <EcgLine className="pointer-events-none absolute inset-x-0 bottom-3 h-16 w-full text-white/40" beats={3} ghost={false} />
        </>
      )}
      <div className="relative flex items-start justify-between gap-3">
        <span className={clsx("text-sm font-medium", featured ? "text-white/85" : "text-ink-soft")}>{label}</span>
        <IconBadge
          icon={icon}
          tone={featured ? "white" : "brand"}
          className="transition-transform duration-500 group-hover:rotate-[8deg] group-hover:scale-110"
        />
      </div>
      <div className={clsx("num relative mt-1 text-[44px] font-normal leading-none", featured ? "text-white" : "text-ink")}>
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {hint && <div className={clsx("relative mt-2 text-sm", featured ? "text-white/85" : "text-ink-soft")}>{hint}</div>}
      {chart && <div className="relative mt-auto pt-4">{chart}</div>}
    </Card>
  );
}

export function Delta({ value, featured }: { value: number; featured?: boolean }) {
  if (value === 0) return <span>Same as yesterday</span>;
  return (
    <span>
      <span className={clsx("font-semibold", featured ? "text-lime-300" : value > 0 ? "text-brand-600" : "text-coral-500")}>
        {value > 0 ? "+" : ""}
        {value}
      </span>{" "}
      from yesterday
    </span>
  );
}

/** Images are behind auth, so they're fetched with the token and shown via an object URL. */
export function AuthImage({
  src,
  alt,
  className,
  style,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    fetchBlobUrl(src)
      .then((u) => {
        objectUrl = u;
        if (!revoked) setUrl(u);
      })
      .catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (failed)
    return (
      <div className={clsx("flex items-center justify-center bg-canvas text-ink-faint", className)}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  if (!url)
    return (
      <div className={clsx("flex items-center justify-center bg-canvas", className)}>
        <Spinner />
      </div>
    );
  return <img src={url} alt={alt} style={style} className={clsx(className, onClick && "cursor-zoom-in")} onClick={onClick} />;
}

export function PersonCell({ name, sub, href }: { name: string; sub?: ReactNode; href?: string }) {
  const content = (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{name}</span>
        {sub && <span className="block truncate text-xs text-ink-faint">{sub}</span>}
      </span>
    </span>
  );
  return href ? (
    <Link to={href} className="hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}

/** Typeahead over /patients (already scoped to the doctor's patients for doctor logins). */
export function PatientPicker({ value, onChange, autoFocus }: { value: PatientBrief | null; onChange: (p: PatientBrief | null) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isFetching } = usePatients(q, 8);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (value)
    return (
      <div className="flex h-11 items-center justify-between rounded-xl border border-brand-200 bg-brand-50/60 px-3">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Avatar name={value.full_name} size="sm" />
          <span className="truncate font-medium text-ink">{value.full_name}</span>
          {value.mrn && <span className="truncate text-xs text-ink-faint">{value.mrn}</span>}
        </span>
        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <Input
        autoFocus={autoFocus}
        className="pl-9"
        placeholder="Search by name, patient ID or phone"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-20 mt-2 max-h-64 w-full animate-scale-in overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-pop">
          {isFetching && !data && <div className="px-3 py-2 text-sm text-ink-faint">Searching…</div>}
          {data?.items.length === 0 && <div className="px-3 py-2 text-sm text-ink-faint">No matching patients</div>}
          {data?.items.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50/70"
            >
              <Avatar name={p.full_name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{p.full_name}</span>
                <span className="block truncate text-xs text-ink-faint">{p.mrn ?? "No patient ID"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MedicationChips({ items, empty = "None recorded" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="text-sm text-ink-faint">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((m) => (
        <span
          key={m}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-50 to-white px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
          {m}
        </span>
      ))}
    </div>
  );
}
