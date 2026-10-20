import clsx from "clsx";

/** Four-petal medical cross. Two-tone so it reads at favicon size. */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("shrink-0", className)} aria-hidden>
      <rect x="12" y="1.5" width="8" height="13.5" rx="4" fill={light ? "#ffffff" : "#1ea468"} />
      <rect x="17" y="12" width="13.5" height="8" rx="4" fill={light ? "#d2ec5c" : "#39bb80"} />
      <rect x="12" y="17" width="8" height="13.5" rx="4" fill={light ? "#ffffff" : "#148653"} opacity={light ? 0.85 : 1} />
      <rect x="1.5" y="12" width="13.5" height="8" rx="4" fill={light ? "#a2e6c4" : "#6dd3a3"} />
      <circle cx="16" cy="16" r="2.6" fill={light ? "#136a45" : "#fff"} />
    </svg>
  );
}

export function Logo({ collapsed, light, className }: { collapsed?: boolean; light?: boolean; className?: string }) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <LogoMark className="h-9 w-9 transition-transform duration-500 hover:rotate-90" light={light} />
      {!collapsed && <span className={clsx("font-display text-[22px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>Prescript</span>}
    </span>
  );
}
