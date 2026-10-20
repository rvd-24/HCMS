import clsx from "clsx";
import { Loader2, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { initials, type Tone } from "@/lib/format";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "dark";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-brand-400 to-brand-500 text-white shadow-glow-sm hover:shadow-glow hover:-translate-y-px active:translate-y-0 disabled:from-brand-200 disabled:to-brand-300 disabled:shadow-none",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-canvas hover:ring-ink/10 disabled:text-ink-faint",
  ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink",
  danger: "bg-white text-coral-600 ring-1 ring-inset ring-coral-100 hover:bg-coral-50",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  dark: "bg-ink text-white hover:bg-ink/90 hover:-translate-y-px shadow-[0_10px_24px_-10px_rgba(18,26,38,0.6)] disabled:bg-ink/40",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon: Icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-3.5 text-xs" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

/* ---------- Card ---------- */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-3xl border border-white/80 bg-white shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 px-6 pb-3 pt-5", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <IconBadge icon={Icon} />}
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="truncate text-xs text-ink-faint">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function IconBadge({ icon: Icon, tone = "brand", className }: { icon: LucideIcon; tone?: "brand" | "white" | "coral" | "ink"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
        {
          brand: "bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-inset ring-brand-100",
          white: "bg-white/20 text-white ring-1 ring-inset ring-white/25",
          coral: "bg-coral-50 text-coral-500 ring-1 ring-inset ring-coral-100",
          ink: "bg-ink text-white",
        }[tone],
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

/* ---------- Badge ---------- */
const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  teal: "bg-brand-50 text-brand-700 ring-brand-200/70",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/70",
  red: "bg-coral-50 text-coral-600 ring-coral-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/70",
  slate: "bg-slate-100 text-slate-700 ring-slate-200/70",
  gray: "bg-gray-100 text-gray-500 ring-gray-200/70",
  blue: "bg-sky-50 text-sky-700 ring-sky-200/70",
};

export function Badge({ tone = "slate", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------- Avatar ---------- */
const AVATAR_COLORS = [
  "from-brand-300 to-brand-500 text-white",
  "from-sky-300 to-indigo-400 text-white",
  "from-violet-300 to-fuchsia-400 text-white",
  "from-amber-200 to-orange-400 text-white",
  "from-rose-300 to-coral-500 text-white",
  "from-teal-200 to-cyan-500 text-white",
  "from-lime-300 to-brand-400 text-brand-900",
];

export const avatarTone = (name: string) => AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm", xl: "h-20 w-20 text-2xl" };
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-bold ring-2 ring-white",
        avatarTone(name),
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- Form fields ---------- */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-coral-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink transition-shadow placeholder:text-ink-faint hover:border-ink/15 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-canvas";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputBase, "h-11", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(inputBase, "h-11 pr-9", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(inputBase, "py-2.5 leading-relaxed", className)} {...rest} />;
});

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-300",
          checked ? "bg-brand-500 shadow-glow-sm" : "bg-gray-300",
        )}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-faint">{description}</span>}
      </span>
    </label>
  );
}

/* ---------- Feedback ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-5 w-5 animate-spin text-brand-500", className)} />;
}

/** Heartbeat loader — an ECG trace drawing itself. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3">
      <svg viewBox="0 0 120 40" className="h-12 w-36" fill="none" aria-hidden>
        <path
          d="M0 22h30l6-8 6 8h6l4 6 6-26 7 34 5-14h46"
          stroke="#1ea468"
          strokeOpacity={0.15}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M0 22h30l6-8 6 8h6l4 6 6-26 7 34 5-14h46"
          pathLength={1000}
          className="ecg-path"
          style={{ animationDuration: "1.4s" }}
          stroke="#1ea468"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="relative mb-5 inline-flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-200" />
        <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-brand-500 ring-8 ring-brand-50/60">
          <Icon className="h-7 w-7" />
        </span>
      </span>
      <p className="font-display text-xl font-semibold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-faint">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "amber", children, icon: Icon }: { tone?: "amber" | "red" | "brand" | "slate"; children: ReactNode; icon?: LucideIcon }) {
  const styles = {
    amber: "bg-amber-50/80 text-amber-800 border-amber-200/80",
    red: "bg-coral-50 text-coral-600 border-coral-100",
    brand: "bg-brand-50/80 text-brand-800 border-brand-200/80",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={clsx("flex gap-2.5 rounded-2xl border px-4 py-3 text-sm", styles[tone])}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------- Layout ---------- */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex animate-fade-up flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>}
        <h1 className="font-display text-[32px] font-medium leading-[1.05] tracking-tight text-ink sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div className="relative inline-grid rounded-full bg-ink/[0.05] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        className="absolute bottom-1 top-1 rounded-full bg-white shadow-card transition-transform duration-300 ease-out"
        style={{ width: `calc((100% - 8px) / ${options.length})`, left: 4, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative z-[1] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
            value === o.value ? "text-ink" : "text-ink-faint hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300",
            value === t.value ? "bg-ink text-white shadow-[0_8px_20px_-10px_rgba(18,26,38,0.7)]" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={clsx("rounded-full px-1.5 text-[11px] tabular-nums", value === t.value ? "bg-white/20 text-white" : "bg-ink/5 text-ink-soft")}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{children || "—"}</dd>
    </div>
  );
}
