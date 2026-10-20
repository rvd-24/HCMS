import { format, parseISO } from "date-fns";
import { History } from "lucide-react";
import { useMemo } from "react";
import { Card, EmptyState, PageHeader, PageLoader } from "@/components/ui/primitives";
import { ActivityTimeline } from "@/features/dashboard/AdminDashboard";
import { fmtRelativeDay } from "@/lib/format";
import { useAudit } from "@/lib/queries";
import type { AuditEvent } from "@/lib/types";

export function ActivityPage() {
  const { data, isLoading } = useAudit(300);
  const days = useMemo(() => {
    const groups: { day: string; events: AuditEvent[] }[] = [];
    for (const e of data ?? []) {
      const day = format(parseISO(e.created_at), "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last?.day === day) last.events.push(e);
      else groups.push({ day, events: [e] });
    }
    return groups;
  }, [data]);

  return (
    <>
      <PageHeader eyebrow="Audit log" title="Activity" subtitle="Every booking, status change, upload and edit — who did it and when" />
      {isLoading ? (
        <PageLoader />
      ) : days.length ? (
        <div className="space-y-4">
          {days.map((g) => (
            <Card key={g.day} className="grid gap-2 p-2 md:grid-cols-[200px_1fr]">
              <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-canvas p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{fmtRelativeDay(`${g.day}T12:00:00`)}</p>
                <p className="num mt-1 text-4xl font-normal text-ink">{format(parseISO(g.day), "d MMM")}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {g.events.length} event{g.events.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="pt-3">
                <ActivityTimeline events={g.events} />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={History} title="No activity yet" description="Bookings, uploads and edits will be recorded here." />
        </Card>
      )}
    </>
  );
}
