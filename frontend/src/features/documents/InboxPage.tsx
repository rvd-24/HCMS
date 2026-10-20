import clsx from "clsx";
import { AlertTriangle, CheckCircle2, FileScan, Loader2, RotateCcw, ScanLine, Sparkles, Trash2, UploadCloud, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQuickActions } from "@/app/QuickActions";
import { AuthImage } from "@/components/domain";
import { CountUp } from "@/components/ui/motion";
import { Button, Card, EmptyState, Notice, PageHeader, PageLoader } from "@/components/ui/primitives";
import { fmtDateTime } from "@/lib/format";
import { useDiscardDocument, useInbox, useRetryExtraction, useSystemStatus } from "@/lib/queries";
import type { DocumentRecord } from "@/lib/types";

const reading = (d: DocumentRecord) => d.status === "uploaded" || d.status === "processing";

function StatusPill({ doc }: { doc: DocumentRecord }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-card backdrop-blur";
  if (reading(doc))
    return (
      <span className={clsx(base, "bg-ink/80 text-white")}>
        <Loader2 className="h-3 w-3 animate-spin text-brand-300" /> Reading…
      </span>
    );
  if (doc.status === "extracted")
    return (
      <span className={clsx(base, "bg-white/90 text-brand-700")}>
        <CheckCircle2 className="h-3 w-3" /> Ready to review
      </span>
    );
  if (doc.status === "failed")
    return (
      <span className={clsx(base, "bg-coral-500 text-white")}>
        <AlertTriangle className="h-3 w-3" /> Extraction failed
      </span>
    );
  return <span className={clsx(base, "bg-white/90 text-ink-soft")}>{doc.status}</span>;
}

/** Upload hero: an animated drop zone with a page being scanned. */
function DropHero({ onUpload, counts }: { onUpload: () => void; counts: { icon: LucideIcon; label: string; value: number; tone: string }[] }) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-4xl bg-gradient-to-br from-lime-200 via-brand-50 to-brand-100 p-6 shadow-card ring-1 ring-white sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 animate-float-slow rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-800 opacity-80" />
      <div className="pointer-events-none absolute -right-4 top-2 h-36 w-36 animate-spin-slow rounded-full border-[12px] border-white/40 border-l-transparent" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[auto_1fr_auto]">
        <button onClick={onUpload} className="group relative mx-auto flex h-44 w-40 items-center justify-center" aria-label="Upload prescription">
          <svg className="absolute inset-0 h-full w-full" fill="none">
            <rect
              x="2"
              y="2"
              width="calc(100% - 4px)"
              height="calc(100% - 4px)"
              rx="26"
              stroke="#1ea468"
              strokeWidth="2"
              strokeDasharray="8 8"
              className="animate-dash"
            />
          </svg>
          <div className="relative h-32 w-24 -rotate-6 overflow-hidden rounded-2xl bg-white p-3 shadow-float transition-transform duration-500 group-hover:rotate-0 group-hover:scale-105">
            {[70, 90, 60, 85, 50, 75].map((w, i) => (
              <span key={i} className="mb-2 block h-1.5 rounded-full bg-ink/10" style={{ width: `${w}%` }} />
            ))}
            <div className="pointer-events-none absolute inset-x-0 h-10 animate-scan">
              <div className="h-full bg-gradient-to-b from-transparent to-brand-300/40" />
              <div className="h-[2px] bg-brand-400 shadow-[0_0_12px_3px_rgba(57,187,128,0.7)]" />
            </div>
          </div>
          <span className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-pop transition-transform group-hover:scale-110">
            <UploadCloud className="h-5 w-5" />
          </span>
        </button>
        <div className="text-center lg:text-left">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
            <Sparkles className="h-3.5 w-3.5" /> AI inbox
          </p>
          <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">Drop a case sheet. We'll do the typing.</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            Photos or scans, extra pages included. Patient, diagnosis, medicines and the next visit are read for you — confirm them and the visit is filed.
          </p>
          <Button size="lg" variant="dark" icon={UploadCloud} className="mt-5" onClick={onUpload}>
            Upload prescription
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[300px] lg:grid-cols-1">
          {counts.map((c) => (
            <div key={c.label} className="flex flex-col items-center gap-1 rounded-3xl bg-white/75 p-3 backdrop-blur lg:flex-row lg:gap-3">
              <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", c.tone)}>
                <c.icon className="h-5 w-5" />
              </span>
              <span className="text-center text-xs text-ink-soft lg:flex-1 lg:text-left">{c.label}</span>
              <span className="num text-2xl font-semibold text-ink">
                <CountUp value={c.value} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function InboxPage() {
  const { data, isLoading } = useInbox();
  const { data: system } = useSystemStatus();
  const { openUpload } = useQuickActions();
  const retry = useRetryExtraction();
  const discard = useDiscardDocument();
  const docs = data ?? [];

  return (
    <>
      <PageHeader eyebrow="Prescriptions" title="Review & file" subtitle="Uploaded case sheets waiting to be checked and filed into a patient's history" />
      <DropHero
        onUpload={() => openUpload()}
        counts={[
          { icon: ScanLine, label: "Being read", value: docs.filter(reading).length, tone: "bg-sky-50 text-sky-600" },
          { icon: CheckCircle2, label: "Ready to review", value: docs.filter((d) => d.status === "extracted").length, tone: "bg-brand-50 text-brand-600" },
          { icon: AlertTriangle, label: "Need attention", value: docs.filter((d) => d.status === "failed").length, tone: "bg-coral-50 text-coral-500" },
        ]}
      />
      {system && !system.extraction_configured && (
        <div className="mb-5">
          <Notice tone="amber" icon={AlertTriangle}>
            Automatic extraction isn't configured (OPENAI_API_KEY or AZURE_OPENAI_* in .env). Uploads still work — you'll fill in the details by hand on the
            review screen.
          </Notice>
        </div>
      )}
      {isLoading ? (
        <PageLoader />
      ) : docs.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {docs.map((doc, i) => {
            const draft = doc.extraction?.draft;
            return (
              <Card key={doc.id} className="lift group flex animate-fade-up flex-col overflow-hidden" style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
                <Link to={`/prescriptions/${doc.id}`} className="relative m-2 mb-0 block h-48 overflow-hidden rounded-[1.25rem] bg-canvas">
                  <AuthImage
                    src={`/documents/${doc.id}/file`}
                    alt={doc.original_filename}
                    className="h-48 w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent" />
                  {reading(doc) && (
                    <div className="pointer-events-none absolute inset-x-0 h-16 animate-scan">
                      <div className="h-full bg-gradient-to-b from-transparent to-brand-300/50" />
                      <div className="h-[2px] bg-brand-300 shadow-[0_0_14px_4px_rgba(57,187,128,0.8)]" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3">
                    <StatusPill doc={doc} />
                  </span>
                  {!!doc.children?.length && (
                    <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink shadow-card">
                      +{doc.children.length} page(s)
                    </span>
                  )}
                  <span className="absolute bottom-3 left-3 text-[11px] font-medium text-white">{fmtDateTime(doc.uploaded_at)}</span>
                </Link>
                <div className="flex flex-1 flex-col p-5 pt-4">
                  <p className="truncate font-display text-lg font-semibold text-ink">{draft?.patient_name ?? doc.original_filename}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {draft ? [draft.patient_id, draft.doctor_name, draft.visit_date].filter(Boolean).join(" · ") : doc.original_filename}
                  </p>
                  {draft?.medications?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {draft.medications.slice(0, 2).map((m) => (
                        <span
                          key={m}
                          className="max-w-full truncate rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-800 ring-1 ring-brand-100"
                        >
                          {m}
                        </span>
                      ))}
                      {draft.medications.length > 2 && (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-faint">+{draft.medications.length - 2}</span>
                      )}
                    </div>
                  ) : null}
                  {doc.status === "failed" && <p className="mt-3 line-clamp-2 rounded-2xl bg-coral-50 px-3 py-2 text-xs text-coral-600">{doc.error}</p>}
                  {!!doc.extraction?.warnings.length && (
                    <p className="mt-3 flex items-center gap-1.5 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> {doc.extraction.warnings.length} thing(s) to check
                    </p>
                  )}
                  <div className="mt-auto flex gap-2 pt-4">
                    <Link to={`/prescriptions/${doc.id}`} className="flex-1">
                      <Button size="sm" className="w-full" disabled={reading(doc)}>
                        {doc.status === "failed" ? "Enter manually" : "Review"}
                      </Button>
                    </Link>
                    {doc.status === "failed" && (
                      <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => retry.mutate(doc.id)}>
                        Retry
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      aria-label="Discard"
                      onClick={() => confirm(`Discard ${doc.original_filename}?`) && discard.mutate(doc.id, { onSuccess: () => toast("Discarded") })}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={FileScan}
            title="Inbox is clear"
            description="Nothing waiting for review. New uploads appear here while they're read, then wait for you to confirm."
          />
        </Card>
      )}
    </>
  );
}
