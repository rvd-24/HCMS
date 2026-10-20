// Time-grid used for both views: Week (columns = days) and Day (columns = doctors).
import clsx from "clsx";
import { parseISO } from "date-fns";
import type { ReactNode } from "react";
import { fmtTime } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const START_HOUR = 8;
const END_HOUR = 19;
const SLOT_PX = 52; // per 30 minutes

// Pastel gradient blocks (DocTrack-style): colour = status, darker ink of the same hue for text.
const BLOCK: Record<AppointmentStatus, string> = {
  scheduled: "from-sky-100 to-indigo-50 text-sky-900 ring-sky-200/70",
  confirmed: "from-emerald-100 to-lime-50 text-emerald-900 ring-emerald-200/70",
  checked_in: "from-amber-100 to-yellow-50 text-amber-900 ring-amber-200/70",
  in_consultation: "from-violet-200 to-fuchsia-50 text-violet-900 ring-violet-300/70",
  completed: "from-brand-50 to-white text-brand-800 ring-brand-100",
  cancelled: "from-rose-50 to-white text-rose-700 ring-rose-100 line-through decoration-rose-300",
  no_show: "from-gray-100 to-white text-gray-500 ring-gray-200",
};

export interface GridColumn {
  key: string;
  header: ReactNode;
  highlight?: boolean;
  items: Appointment[];
  /** What a click on an empty slot in this column should prefill. */
  slotContext: { date: string; doctorId?: string };
}

/** Side-by-side lanes for overlapping appointments within one column. */
function layout(items: Appointment[]) {
  const sorted = [...items].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const placed: { a: Appointment; lane: number; lanes: number }[] = [];
  let cluster: typeof placed = [];
  let clusterEnd = 0;
  let laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach((c) => (c.lanes = lanes));
    cluster = [];
    laneEnds = [];
  };
  for (const a of sorted) {
    const s = parseISO(a.start_at).getTime();
    const e = parseISO(a.end_at).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = laneEnds.push(e) - 1;
    else laneEnds[lane] = e;
    const item = { a, lane, lanes: 1 };
    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return placed;
}

function minutesFromStart(iso: string) {
  const d = parseISO(iso);
  return (d.getHours() - START_HOUR) * 60 + d.getMinutes();
}

export function ScheduleGrid({
  columns,
  onSelect,
  onSlot,
  showDoctor,
}: {
  columns: GridColumn[];
  onSelect: (a: Appointment) => void;
  onSlot: (ctx: { date: string; time: string; doctorId?: string }) => void;
  showDoctor?: boolean;
}) {
  const slots = Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, i) => i);
  const height = slots.length * SLOT_PX;
  const now = new Date();
  const nowOffset = (((now.getHours() - START_HOUR) * 60 + now.getMinutes()) / 30) * SLOT_PX;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]" style={{ display: "grid", gridTemplateColumns: `72px repeat(${columns.length}, minmax(120px, 1fr))` }}>
        <div className="sticky left-0 z-10 border-b border-r border-line bg-white" />
        {columns.map((c) => (
          <div key={c.key} className={clsx("border-b border-r border-line/70 px-2 py-3 text-center last:border-r-0", c.highlight && "bg-brand-50/70")}>
            {c.header}
          </div>
        ))}

        <div className="sticky left-0 z-10 border-r border-line bg-white" style={{ height }}>
          {slots.map((i) => (
            <div key={i} className="relative border-b border-line/60 text-[11px] text-ink-faint" style={{ height: SLOT_PX }}>
              {i % 2 === 0 && (
                <span className="absolute -top-2 right-2 bg-white px-0.5">{fmtTime(`2000-01-01T${String(START_HOUR + i / 2).padStart(2, "0")}:00:00`)}</span>
              )}
            </div>
          ))}
        </div>

        {columns.map((c) => (
          <div key={c.key} className={clsx("relative border-r border-line last:border-r-0", c.highlight && "bg-brand-50/30")} style={{ height }}>
            {slots.map((i) => {
              const minutes = START_HOUR * 60 + i * 30;
              const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Book at ${time}`}
                  onClick={() => onSlot({ ...c.slotContext, time })}
                  className={clsx(
                    "group/slot relative block w-full border-b transition-colors hover:bg-brand-50",
                    i % 2 ? "border-line/60" : "border-dashed border-line/40",
                  )}
                  style={{ height: SLOT_PX }}
                >
                  <span className="absolute inset-1 hidden items-center justify-center rounded-lg border border-dashed border-brand-300 bg-white/70 text-[11px] font-semibold text-brand-600 group-hover/slot:flex">
                    + {fmtTime(`2000-01-01T${time}:00`)}
                  </span>
                </button>
              );
            })}
            {c.highlight && nowOffset > 0 && nowOffset < height && (
              <div className="pointer-events-none absolute inset-x-0 z-[7] border-t-2 border-coral-500" style={{ top: nowOffset }}>
                <span className="absolute -left-1.5 -top-[7px] h-3 w-3 rounded-full bg-coral-500 ring-4 ring-coral-100" />
                <span className="absolute -left-1.5 -top-[7px] h-3 w-3 animate-pulse-ring rounded-full bg-coral-500" />
              </div>
            )}
            {layout(c.items).map(({ a, lane, lanes }) => {
              const top = Math.max(0, (minutesFromStart(a.start_at) / 30) * SLOT_PX);
              const mins = (parseISO(a.end_at).getTime() - parseISO(a.start_at).getTime()) / 60000;
              const h = Math.max(22, (mins / 30) * SLOT_PX - 3);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a)}
                  title={`${a.patient.full_name} · ${a.reason ?? ""}`}
                  className={clsx(
                    "absolute z-[6] overflow-hidden rounded-xl bg-gradient-to-br px-2.5 py-1.5 text-left ring-1 ring-inset transition-all duration-200 hover:z-10 hover:-translate-y-0.5 hover:shadow-pop",
                    BLOCK[a.status],
                    a.status === "in_consultation" && "shadow-[0_8px_20px_-8px_rgba(139,92,246,0.6)]",
                  )}
                  style={{ top: top + 1, height: h, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                >
                  <p className="truncate text-xs font-bold leading-tight">{a.patient.full_name}</p>
                  {h > 34 && (
                    <p className="mt-0.5 truncate text-[10px] font-medium opacity-70">
                      {fmtTime(a.start_at)}
                      {showDoctor && a.doctor ? ` · Dr. ${a.doctor.full_name.split(" ")[0]}` : a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
