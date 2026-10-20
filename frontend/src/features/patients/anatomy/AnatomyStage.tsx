// Healtho-style stage: 3D model in the middle, view controls on the left, one glass callout,
// view pills along the bottom.
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Move, PersonStanding, ZoomIn, ZoomOut } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { doctorName, fmtDate } from "@/lib/format";
import { toothName, toothRecords } from "@/lib/teeth";
import type { Visit } from "@/lib/types";
import type { AnatomyCanvasHandle } from "./AnatomyCanvas";
import type { AnatomyView } from "./scene";

const AnatomyCanvas = lazy(() => import("./AnatomyCanvas"));

function ToothIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5.5c-1.6-1.4-4.2-2.2-6 -.6-2 1.8-1.3 5.2-.4 7.6.7 1.9.9 4 1.3 6 .3 1.5 1.9 1.9 2.6.4.6-1.4.8-3.6 2.5-3.6s1.9 2.2 2.5 3.6c.7 1.5 2.3 1.1 2.6-.4.4-2 .6-4.1 1.3-6 .9-2.4 1.6-5.8-.4-7.6-1.8-1.6-4.4-.8-6 .6Z" />
    </svg>
  );
}
function ArchIcon({ flip, className }: { flip?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={clsx(className, flip && "rotate-180")}>
      <path d="M4 19c0-8 3.6-13 8-13s8 5 8 13" />
      <path d="M7.5 18.5c0-5.6 2-9 4.5-9s4.5 3.4 4.5 9" strokeDasharray="1.6 2.6" />
    </svg>
  );
}

const VIEWS: { value: AnatomyView; label: string; icon: (p: { className?: string }) => ReactNode }[] = [
  { value: "body", label: "Full body", icon: (p) => <PersonStanding {...p} /> },
  { value: "arches", label: "Teeth", icon: (p) => <ToothIcon {...p} /> },
  { value: "upper", label: "Upper arch", icon: (p) => <ArchIcon {...p} /> },
  { value: "lower", label: "Lower arch", icon: (p) => <ArchIcon flip {...p} /> },
];

export function AnatomyStage({ visits, dental, header }: { visits: Visit[]; dental: boolean; header: ReactNode }) {
  const records = useMemo(() => toothRecords(visits), [visits]);
  const marked = useMemo(() => [...records.keys()], [records]);
  const latest = marked[0] ?? null; // records are built newest visit first
  const [view, setView] = useState<AnatomyView>(dental ? "arches" : "body");
  const [selected, setSelected] = useState<number | null>(latest);
  const [hover, setHover] = useState<{ fdi: number; x: number; y: number } | null>(null);
  const canvas = useRef<AnatomyCanvasHandle>(null);

  useEffect(() => setSelected(latest), [latest]);
  useEffect(() => setView(dental ? "arches" : "body"), [dental]);

  const idx = VIEWS.findIndex((v) => v.value === view);
  const step = (d: number) => setView(VIEWS[(idx + d + VIEWS.length) % VIEWS.length].value);
  const rec = selected !== null ? records.get(selected) : undefined;
  const hoverRec = hover ? records.get(hover.fdi) : undefined;
  const lastVisit = [...visits].filter((v) => v.visit_date).sort((a, b) => b.visit_date!.localeCompare(a.visit_date!))[0];

  // Float the callout beside the model only when the stage is wide enough to fit both.
  const area = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    if (!area.current) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 680));
    ro.observe(area.current);
    return () => ro.disconnect();
  }, []);

  const callout =
    view === "body" || selected === null ? (
      <>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-card">
            <PersonStanding className="h-5 w-5" />
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
              rec ? "bg-coral-500 text-white" : "bg-white text-brand-600",
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
      {view !== "body" && (
        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            {marked.length ? "In the notes" : "No teeth named in notes yet"}
          </span>
          {marked.map((p) => (
            <button
              key={p}
              onClick={() => setSelected(p)}
              className={clsx(
                "rounded-full px-2.5 py-1 text-xs font-bold transition-all",
                selected === p ? "bg-brand-500 text-white shadow-glow-sm" : "bg-white text-coral-600 ring-1 ring-coral-100 hover:-translate-y-0.5",
              )}
            >
              {records.get(p)!.fdi}
            </button>
          ))}
        </div>
      )}

      <div ref={area} className="relative min-h-[380px] flex-1">
        {/* scan-room panel behind the hologram (body view only) */}
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_45%,#16704b_0%,#0b3f2b_45%,#06241a_100%)] transition-all duration-700",
            view === "body" ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <div className="dot-grid absolute inset-0 opacity-20" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
        </div>

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
              view={view}
              marked={marked}
              selected={view === "body" ? null : selected}
              hotspot={dental ? (marked.length ? `Teeth · ${marked.length} in notes` : "Teeth") : null}
              insetRight={wide ? 236 : 0}
              onHover={(fdi, x, y) => setHover(fdi ? { fdi, x, y } : null)}
              onSelect={(fdi) => setSelected(fdi)}
              onHotspot={(v) => setView(v)}
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

        {wide && (
          <div
            className={clsx(
              "absolute right-0 top-[14%] z-10 w-[220px] animate-fade-up rounded-3xl border p-5 shadow-float backdrop-blur-xl transition-colors duration-700",
              view === "body" ? "dark-glass border-white/15 bg-white/10" : "border-white/80 bg-white/60",
            )}
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
            {hoverRec && <span className="ml-1.5 rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold">{hoverRec.visits.length}×</span>}
          </div>
        )}
      </div>

      {!wide && <div className="callout-bar relative z-10 mt-4 rounded-3xl bg-canvas/80 px-5 py-4 ring-1 ring-ink/5">{callout}</div>}

      {/* view pills */}
      <div className="relative z-10 mt-4 flex items-center justify-center gap-2">
        <button
          onClick={() => step(-1)}
          aria-label="Previous view"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto px-1 py-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              className={clsx(
                "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-300",
                view === v.value ? "bg-brand-500 text-white shadow-glow" : "bg-white text-ink-soft shadow-card hover:-translate-y-0.5 hover:text-ink",
              )}
            >
              {v.icon({ className: "h-[18px] w-[18px]" })}
              {v.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => step(1)}
          aria-label="Next view"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-white"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
