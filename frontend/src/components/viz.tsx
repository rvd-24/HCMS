// Small hand-rolled visuals: decorative ECG trace, data sparklines/bars, and the queue gauge.
import clsx from "clsx";
import { useId, useState, type ReactNode } from "react";
import { useInView } from "./ui/motion";

/** Same three series as TrendChart (validated palette) — colour means the same thing everywhere. */
export const SERIES_COLORS = { completed: "#4a6fd1", open: "#2e9e78", missed: "#c4702a" } as const;

const BEAT = "h22 l6 -6 l6 6 h8 l4 6 l7 -40 l7 50 l5 -16 h10 q8 -12 16 0 h18";
/** Decorative heartbeat line (illustration, not data). */
export function EcgLine({
  className,
  color = "currentColor",
  beats = 4,
  strokeWidth = 2,
  ghost = true,
  duration = 2.8,
}: {
  className?: string;
  color?: string;
  beats?: number;
  strokeWidth?: number;
  ghost?: boolean;
  duration?: number;
}) {
  const width = beats * 109;
  const d = `M0 40 ${Array.from({ length: beats }, () => BEAT).join(" ")}`;
  return (
    <svg viewBox={`0 0 ${width} 70`} preserveAspectRatio="none" className={className} aria-hidden fill="none">
      {ghost && (
        <path
          d={d}
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={d}
        pathLength={1000}
        className="ecg-path"
        style={{ animationDuration: `${duration}s` }}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Single-series area sparkline with a hover crosshair. */
export function Sparkline({
  data,
  labels,
  color = "#1ea468",
  height = 56,
  className,
  format = (v) => String(v),
}: {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
  className?: string;
  format?: (v: number) => string;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const [ref, inView] = useInView<HTMLDivElement>();
  if (data.length < 2) return <div style={{ height }} className={className} />;
  const max = Math.max(...data, 1);
  const W = 100;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, height - 4 - (v / max) * (height - 10)] as const);
  // Smooth with a light cardinal curve.
  const line = pts.reduce((acc, [x, y], i, arr) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = arr[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  const area = `${line} L${W},${height} L0,${height} Z`;
  const h = hover !== null ? pts[hover] : null;

  return (
    <div
      ref={ref}
      className={clsx("relative", className)}
      style={{ height }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)));
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`sg-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#sg-${id})`} className={clsx("transition-opacity duration-700", inView ? "opacity-100" : "opacity-0")} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={inView ? 0 : 1}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      {h && hover !== null && (
        <>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-ink/15" style={{ left: `${h[0]}%` }} />
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${h[0]}%`, top: h[1], background: color }}
          />
          <span
            className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-pop"
            style={{ left: `${Math.min(88, Math.max(12, h[0]))}%` }}
          >
            {labels?.[hover] ? `${labels[hover]} · ` : ""}
            {format(data[hover])}
          </span>
        </>
      )}
    </div>
  );
}

/** Thin rounded bars (Blood-Status style), one per point; `highlight` marks a bar (e.g. today). */
export function BarSpark({
  data,
  labels,
  highlight,
  height = 64,
  color = "#1ea468",
  className,
}: {
  data: number[];
  labels?: string[];
  highlight?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data, 1);
  return (
    <div ref={ref} className={clsx("relative flex items-end gap-[6px]", className)} style={{ height }} onMouseLeave={() => setHover(null)}>
      {data.map((v, i) => {
        const pct = Math.max(6, (v / max) * 100);
        const active = hover === i || (hover === null && highlight === i);
        return (
          <div key={i} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)}>
            <span className="absolute inset-x-0 bottom-0 top-0 mx-auto w-full max-w-[10px] rounded-full bg-ink/[0.05]" />
            <span
              className="relative w-full max-w-[10px] origin-bottom rounded-full transition-[transform,background] duration-700"
              style={{
                height: `${pct}%`,
                background: active ? color : `${color}66`,
                transform: inView ? "scaleY(1)" : "scaleY(0)",
                transitionDelay: `${i * 40}ms`,
              }}
            />
            {hover === i && (
              <span className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-pop">
                {labels?.[i] ? `${labels[i]} · ` : ""}
                {v}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface GaugeSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Semicircle composition gauge (DocTrack "Queue status"). Hover a segment to read it in the centre. */
export function QueueGauge({ segments, center }: { segments: GaugeSegment[]; center?: ReactNode }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const GAP = total ? 1.2 : 0;
  let start = 0;
  const arcs = segments.map((s) => {
    const len = total ? (s.value / total) * 100 : 0;
    const arc = { ...s, start, len };
    start += len;
    return arc;
  });
  const active = arcs.find((a) => a.key === hover);
  const path = "M 22 104 A 82 82 0 0 1 186 104";
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[300px]">
      <svg viewBox="0 0 208 116" className="w-full overflow-visible">
        <path d={path} fill="none" stroke="#eef1f5" strokeWidth={24} strokeLinecap="round" />
        {arcs.map((a) =>
          a.len > 0 ? (
            <path
              key={a.key}
              d={path}
              fill="none"
              stroke={a.color}
              strokeWidth={hover === a.key ? 28 : 24}
              pathLength={100}
              strokeDasharray={`${inView ? Math.max(0.01, a.len - GAP) : 0} 200`}
              strokeDashoffset={-a.start}
              className="cursor-pointer"
              style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1), stroke-width .2s" }}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
            />
          ) : null,
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
        {active ? (
          <>
            <p className="num text-4xl font-medium text-ink">{active.value}</p>
            <p className="text-xs text-ink-soft">{active.label}</p>
          </>
        ) : (
          center
        )}
      </div>
    </div>
  );
}

/** Circular progress ring for a single ratio. */
export function Ring({
  value,
  max,
  size = 64,
  stroke = 7,
  color = "#1ea468",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const r = (size - stroke) / 2;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <div ref={ref} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${inView ? pct * 100 : 0} 100`}
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </div>
  );
}

/** Pulsing "live" dot. */
export function LiveDot({ className, color = "bg-brand-400" }: { className?: string; color?: string }) {
  return (
    <span className={clsx("relative inline-flex h-2.5 w-2.5", className)}>
      <span className={clsx("absolute inset-0 animate-pulse-ring rounded-full", color)} />
      <span className={clsx("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}
