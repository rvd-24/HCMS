import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { TrendPoint } from "@/lib/types";

// Stacked per-day composition. Lines overlapped here (past bookings ≈ completions),
// so each day is one bar split into what happened to its appointments.
// Palette validated with the dataviz checker: all six checks pass on white.
const SERIES = [
  { key: "completed", label: "Completed", color: "#4a6fd1" },
  { key: "open", label: "Booked, not yet seen", color: "#2e9e78" },
  { key: "missed", label: "Cancelled / no-show", color: "#c4702a" },
] as const;

type Row = TrendPoint & { open: number };

function TrendTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Row;
  return (
    <div className="min-w-[190px] rounded-xl border border-line bg-white px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 border-b border-line pb-1.5 font-semibold text-ink">{format(parseISO(label as string), "EEE, d MMM yyyy")}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4 py-0.5 text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="font-semibold text-ink">{point[s.key]}</span>
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const rows: Row[] = useMemo(() => data.map((d) => ({ ...d, open: Math.max(0, d.booked - d.completed) })), [data]);
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 14, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#eef0f3" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(parseISO(d), "d MMM")}
              tick={{ fontSize: 11, fill: "#8b93a3" }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8b93a3" }} axisLine={false} tickLine={false} />
            <ReferenceLine x={today} stroke="#9aa3b2" strokeDasharray="4 4" label={{ value: "Today", position: "top", fontSize: 10, fill: "#8b93a3" }} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(46,158,120,0.06)" }} />
            {SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="day"
                fill={s.color}
                stroke="#fff"
                strokeWidth={1}
                radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : 0}
                maxBarSize={18}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-ink-soft">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
