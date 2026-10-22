// Healtho-style stage: 3D bite model in the middle, view controls on the left, one glass callout.
import clsx from "clsx";
import { Move, ZoomIn, ZoomOut } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { doctorName, fmtDate } from "@/lib/format";
import { TOOTH_STATUS, toothChart, toothName, toothRecords, type ToothStatus } from "@/lib/teeth";
import type { Visit } from "@/lib/types";
import type { AnatomyCanvasHandle } from "./AnatomyCanvas";

const AnatomyCanvas = lazy(() => import("./AnatomyCanvas"));

// Chip and swatch colours per charting status; the 3D tints and .tooth-label[data-state] match.
const STATUS_STYLE: Record<ToothStatus, { chip: string; dot: string; badge?: string }> = {
  noted: { chip: "bg-white text-coral-600 ring-1 ring-coral-100", dot: "bg-coral-100 ring-1 ring-coral-400" },
  caries: { chip: "bg-orange-500 text-white", dot: "bg-orange-500" },
  filled: { chip: "bg-sky-500 text-white", dot: "bg-sky-500" },
  rct: { chip: "bg-violet-500 text-white", dot: "bg-violet-500" },
  crown: { chip: "bg-amber-400 text-ink", dot: "bg-amber-400" },
  implant: { chip: "bg-slate-600 text-white", dot: "bg-slate-600" },
  missing: {
    chip: "border border-dashed border-ink/30 bg-white/70 text-ink-faint line-through",
    dot: "border border-dashed border-ink/40 bg-white",
    badge: "border border-dashed border-ink/30 bg-white text-ink-soft", // no strike-through on the word itself
  },
};
const LEGEND: ToothStatus[] = ["caries", "filled", "rct", "crown", "implant", "missing", "noted"];

function ToothIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5.5c-1.6-1.4-4.2-2.2-6 -.6-2 1.8-1.3 5.2-.4 7.6.7 1.9.9 4 1.3 6 .3 1.5 1.9 1.9 2.6.4.6-1.4.8-3.6 2.5-3.6s1.9 2.2 2.5 3.6c.7 1.5 2.3 1.1 2.6-.4.4-2 .6-4.1 1.3-6 .9-2.4 1.6-5.8-.4-7.6-1.8-1.6-4.4-.8-6 .6Z" />
    </svg>
  );
}

export function AnatomyStage({
  visits,
  dental,
  header,
  onSelectedChange,
}: {
  visits: Visit[];
  dental: boolean;
  header: ReactNode;
  /** The tooth picked on the model or from the chips (FDI), so the page can show its scans. */
  onSelectedChange?: (fdi: number | null) => void;
}) {
  const records = useMemo(() => toothRecords(visits), [visits]);
  const marked = useMemo(() => [...records.keys()], [records]);
  const chart = useMemo(() => toothChart(visits), [visits]);
  const statuses = useMemo(() => [...chart].map(([pos, e]) => [records.get(pos)?.fdi ?? pos, e.status] as [number, ToothStatus]), [chart, records]);
  const present = LEGEND.filter((st) => [...chart.values()].some((e) => e.status === st));
  const anyPlanned = [...chart.values()].some((e) => e.planned);
  const latest = marked[0] ?? null; // records are built newest visit first
  const [selected, setSelected] = useState<number | null>(latest);
  const [hover, setHover] = useState<{ fdi: number; x: number; y: number } | null>(null);
  const canvas = useRef<AnatomyCanvasHandle>(null);

  useEffect(() => setSelected(latest), [latest]);
  useEffect(() => onSelectedChange?.(selected), [selected, onSelectedChange]);

  const rec = selected !== null ? records.get(selected) : undefined;
  const hoverRec = hover ? records.get(hover.fdi) : undefined;
  const entry = selected !== null ? chart.get(selected) : undefined;
  const hoverEntry = hover ? chart.get(hover.fdi) : undefined;
  const lastVisit = [...visits].filter((v) => v.visit_date).sort((a, b) => b.visit_date!.localeCompare(a.visit_date!))[0];

  // Float the callout beside the model only when the stage is wide enough to fit both.
  const area = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  const floating = wide;
  useEffect(() => {
    if (!area.current) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 680));
    ro.observe(area.current);
    return () => ro.disconnect();
  }, []);

  const callout =
    selected === null ? (
      <>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-card">
            <ToothIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">Overview</p>
            <p className="text-xs text-ink-faint">{dental ? "Dental care" : "General care"}</p>
          </div>
        </div>
        <p className="mt-5 font-display text-6xl font-normal leading-none tracking-tight text-ink">
          {visits.length}
          <span className="ml-1.5 text-base font-medium tracking-normal text-ink-soft">visits</span>
        </p>
        {lastVisit && <p className="mt-2 text-xs text-ink-faint">Last seen {fmtDate(lastVisit.visit_date)}</p>}
      </>
    ) : (
      <div key={selected} className="animate-fade-in">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-card",
              entry ? STATUS_STYLE[entry.status].chip : rec ? "bg-coral-500 text-white" : "bg-white text-brand-600",
            )}
          >
            <ToothIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">Tooth {rec?.fdi ?? selected}</p>
            <p className="truncate text-xs capitalize text-ink-faint">{toothName(rec?.fdi ?? selected)}</p>
          </div>
        </div>
        <p className="mt-5 font-display text-6xl font-normal leading-none tracking-tight text-ink">
          {rec?.visits.length ?? 0}
          <span className="ml-1.5 text-base font-medium tracking-normal text-ink-soft">{rec?.visits.length === 1 ? "visit" : "visits"}</span>
        </p>
        {entry && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_STYLE[entry.status].badge ?? STATUS_STYLE[entry.status].chip)}>
              {TOOTH_STATUS[entry.status].done}
            </span>
            {entry.since && <span className="text-[11px] text-ink-faint">{fmtDate(entry.since, "d MMM yyyy")}</span>}
            {entry.planned && (
              <span className="rounded-full border border-dashed border-brand-400 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                {entry.planned === "noted" ? "Further care advised" : `${TOOTH_STATUS[entry.planned].label} planned`}
              </span>
            )}
          </div>
        )}
        <p className="mt-2 truncate text-xs text-ink-faint">
          {rec
            ? `Last noted ${fmtDate(rec.visits[0].visit_date, "d MMM")} · ${doctorName(rec.visits[0].doctor?.full_name ?? rec.visits[0].doctor_name_raw)}`
            : "Not in any visit notes"}
        </p>
      </div>
    );

  return (
    <div className="relative flex h-full min-h-[640px] min-w-0 flex-col overflow-hidden rounded-4xl bg-gradient-to-b from-white via-white to-canvas/70 p-6 shadow-card ring-1 ring-white sm:p-8">
      <div className="pointer-events-none absolute left-1/2 top-[45%] h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-lime-200/50 via-brand-100/50 to-sky-100/60 blur-3xl" />
      <div className="relative z-10">{header}</div>
      <div className="relative z-10 mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          {marked.length ? "In the notes" : "No teeth named in notes yet"}
        </span>
        {marked.map((p) => {
          const e = chart.get(p);
          return (
            <button
              key={p}
              onClick={() => setSelected(p)}
              title={e ? `${TOOTH_STATUS[e.status].done}${e.planned ? ` · ${e.planned === "noted" ? "further care advised" : `${TOOTH_STATUS[e.planned].label.toLowerCase()} planned`}` : ""}` : undefined}
              className={clsx(
                "relative rounded-full px-2.5 py-1 text-xs font-bold transition-all hover:-translate-y-0.5",
                STATUS_STYLE[e?.status ?? "noted"].chip,
                selected === p && "ring-2 ring-brand-500 ring-offset-2 ring-offset-white",
              )}
            >
              {records.get(p)!.fdi}
              {e?.planned && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />}
            </button>
          );
        })}
      </div>
      {present.length > 0 && (
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
          {present.map((st) => (
            <span key={st} className="flex items-center gap-1.5">
              <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_STYLE[st].dot)} />
              {TOOTH_STATUS[st].label}
            </span>
          ))}
          {anyPlanned && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              Work planned
            </span>
          )}
        </div>
      )}

      <div ref={area} className="relative min-h-[380px] flex-1">
        {/* model */}
        <div className="absolute inset-0">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <span className="h-40 w-40 animate-pulse rounded-full bg-brand-100/60 blur-xl" />
              </div>
            }
          >
            <AnatomyCanvas
              ref={canvas}
              view="bite"
              statuses={statuses}
              selected={selected}
              insetRight={floating ? 236 : 0}
              onHover={(fdi, x, y) => setHover(fdi ? { fdi, x, y } : null)}
              onSelect={(fdi) => setSelected(fdi)}
            />
          </Suspense>
        </div>

        {/* zoom controls */}
        <div className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3">
          {[
            { icon: ZoomIn, label: "Zoom in", on: () => canvas.current?.zoom(0.8) },
            { icon: Move, label: "Reset view", on: () => canvas.current?.reset() },
            { icon: ZoomOut, label: "Zoom out", on: () => canvas.current?.zoom(1.25) },
          ].map((b) => (
            <button
              key={b.label}
              onClick={b.on}
              title={b.label}
              aria-label={b.label}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink-soft shadow-float ring-1 ring-line/50 transition-all hover:scale-105 hover:text-ink"
            >
              <b.icon className="h-5 w-5" />
            </button>
          ))}
        </div>

        {floating && (
          <div
            className="absolute right-0 top-[14%] z-10 w-[220px] animate-fade-up rounded-3xl border border-white/80 bg-white/60 p-5 shadow-float backdrop-blur-xl"
          >
            {callout}
          </div>
        )}

        {/* hover tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-2xl bg-ink px-3 py-2 text-xs text-white shadow-pop"
            style={{ left: hover.x, top: hover.y }}
          >
            <span className="font-bold">{hoverRec?.fdi ?? hover.fdi}</span>{" "}
            <span className="capitalize text-white/75">{toothName(hoverRec?.fdi ?? hover.fdi)}</span>
            {hoverEntry && <span className={clsx("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", STATUS_STYLE[hoverEntry.status].badge ?? STATUS_STYLE[hoverEntry.status].chip)}>{TOOTH_STATUS[hoverEntry.status].label}</span>}
            {hoverRec && <span className="ml-1.5 text-[10px] text-white/70">{hoverRec.visits.length}×</span>}
          </div>
        )}
      </div>

      {!floating && <div className="callout-bar relative z-10 mt-4 rounded-3xl bg-canvas/80 px-5 py-4 ring-1 ring-ink/5">{callout}</div>}
    </div>
  );
}
