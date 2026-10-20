import { AlertCircle, ArrowUpRight, CalendarClock, Search, Stethoscope, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PersonCell } from "@/components/domain";
import { Avatar, Button, Card, EmptyState, PageHeader, PageLoader, Segmented } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { age, doctorName, fmtDate, fmtDateTime } from "@/lib/format";
import { usePatients } from "@/lib/queries";
import type { Patient } from "@/lib/types";
import { PatientFormModal } from "./PatientFormModal";

const PAGE = 24;

function PatientCard({ p, onOpen, index }: { p: Patient; onOpen: () => void; index: number }) {
  const contact = p.email ?? p.whatsapp_number ?? p.phone_number;
  const years = age(p.date_of_birth);
  return (
    <button
      onClick={onOpen}
      className="lift group relative flex animate-fade-up flex-col overflow-hidden rounded-3xl bg-white p-5 text-left shadow-card ring-1 ring-white"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-100/0 blur-2xl transition-colors duration-500 group-hover:bg-brand-100/80" />
      <div className="relative flex items-start gap-3">
        <span className="rounded-full bg-gradient-to-br from-brand-300 via-lime-300 to-sky-300 p-[2px]">
          <Avatar name={p.full_name} size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold text-ink">{p.full_name}</p>
          <p className="truncate text-xs font-medium text-ink-faint">{p.mrn ?? "No patient ID"}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5 text-ink-soft transition-all duration-300 group-hover:bg-brand-500 group-hover:text-white">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          [years ?? "—", p.sex ? `yrs · ${p.sex}` : "Age"],
          [p.visit_count ?? 0, "Visits"],
          [p.last_visit_date ? fmtDate(p.last_visit_date, "d MMM") : "—", "Last visit"],
        ].map(([v, l]) => (
          <div key={l as string} className="rounded-2xl bg-canvas/80 px-2 py-2">
            <p className="num truncate text-base font-semibold text-ink">{v}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-ink-faint">{l}</p>
          </div>
        ))}
      </div>
      <div className="relative mt-3">
        {p.next_appointment ? (
          <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-50 to-transparent px-3 py-2 text-xs">
            <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="min-w-0 truncate">
              <span className="font-semibold text-ink">{fmtDateTime(p.next_appointment.start_at)}</span>
              <span className="text-ink-faint"> · {doctorName(p.next_appointment.doctor?.full_name)}</span>
            </span>
          </div>
        ) : !contact ? (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            <AlertCircle className="h-4 w-4" /> No contact details
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-ink-faint">
            <Stethoscope className="h-4 w-4" /> No upcoming appointment
          </div>
        )}
      </div>
    </button>
  );
}

export function PatientsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [layout, setLayout] = useState<"grid" | "table">(() => {
    try {
      return localStorage.getItem("prescript.patients.layout") === "table" ? "table" : "grid";
    } catch {
      return "grid";
    }
  });
  const switchLayout = (v: "grid" | "table") => {
    setLayout(v);
    try {
      localStorage.setItem("prescript.patients.layout", v);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = usePatients(debounced, PAGE, page * PAGE);

  return (
    <>
      <PageHeader
        eyebrow={data ? `${data.total} on record` : "Patients"}
        title={isAdmin ? "Patients" : "My patients"}
        subtitle={isAdmin ? "Everyone registered at the clinic" : "Patients you've treated or have booked"}
        actions={
          isAdmin && (
            <Button icon={UserPlus} onClick={() => setAdding(true)}>
              Add patient
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="group relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint transition-colors group-focus-within:text-brand-500" />
          <input
            className="h-12 w-full rounded-full border border-white/80 bg-white pl-11 pr-4 text-sm shadow-card placeholder:text-ink-faint focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100"
            placeholder="Name, patient ID, phone or email"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setParams(e.target.value ? { q: e.target.value } : {}, { replace: true });
            }}
          />
        </div>
        <div className="ml-auto">
          <Segmented
            value={layout}
            onChange={switchLayout}
            options={[
              { value: "grid", label: "Cards" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </div>
      <div className={layout === "table" ? "overflow-hidden rounded-3xl bg-white shadow-card" : ""}>
        {isLoading ? (
          <PageLoader />
        ) : data?.items.length ? (
          <>
            {layout === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {data.items.map((p, i) => (
                  <PatientCard key={p.id} p={p} index={i} onOpen={() => navigate(`/patients/${p.id}`)} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Age / sex</th>
                      <th>Last visit</th>
                      <th>Visits</th>
                      <th>Next appointment</th>
                      <th>Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                        <td>
                          <PersonCell name={p.full_name} sub={p.mrn ?? "No patient ID"} />
                        </td>
                        <td className="text-ink-soft">
                          {age(p.date_of_birth) ?? "—"}
                          {p.sex ? ` · ${p.sex}` : ""}
                        </td>
                        <td className="whitespace-nowrap text-ink-soft">{fmtDate(p.last_visit_date)}</td>
                        <td className="text-ink-soft">{p.visit_count}</td>
                        <td className="whitespace-nowrap">
                          {p.next_appointment ? (
                            <span>
                              <span className="block text-sm text-ink">{fmtDateTime(p.next_appointment.start_at)}</span>
                              <span className="text-xs text-ink-faint">{doctorName(p.next_appointment.doctor?.full_name)}</span>
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td>
                          {p.email || p.whatsapp_number || p.phone_number ? (
                            <span className="text-sm text-ink-soft">{p.email ?? p.whatsapp_number ?? p.phone_number}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="Notifications can't reach this patient">
                              <AlertCircle className="h-3.5 w-3.5" /> Missing
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.total > PAGE && (
              <div
                className={
                  layout === "table"
                    ? "flex items-center justify-between border-t border-line px-6 py-3 text-sm text-ink-soft"
                    : "mt-5 flex items-center justify-between rounded-full bg-white px-6 py-2.5 text-sm text-ink-soft shadow-card"
                }
              >
                <span>
                  {page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.total)} of {data.total}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </Button>
                  <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Card>
            <EmptyState
              icon={Users}
              title={debounced ? "No patients match" : "No patients yet"}
              description={debounced ? "Try a different name or ID." : "Patients are created automatically when a prescription is confirmed."}
            />
          </Card>
        )}
      </div>
      {adding && <PatientFormModal onClose={() => setAdding(false)} onSaved={(p) => navigate(`/patients/${p.id}`)} />}
    </>
  );
}
