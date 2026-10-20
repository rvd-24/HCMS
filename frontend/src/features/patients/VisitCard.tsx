import { format } from "date-fns";
import { CalendarPlus, Paperclip, Pencil, Pill, Send, Stethoscope } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useQuickActions } from "@/app/QuickActions";
import { AuthImage, MedicationChips } from "@/components/domain";
import { Modal } from "@/components/ui/overlays";
import { Badge, Button, Field, Textarea } from "@/components/ui/primitives";
import { doctorName } from "@/lib/format";
import { useAttachDocument, usePharmacyRequests, useRequestPharmacy, useUpdateVisit } from "@/lib/queries";
import type { DocumentRecord, Visit } from "@/lib/types";

const KIND_LABEL: Record<string, string> = { prescription: "Case sheet", extra_page: "Extra page", pharmacy_receipt: "Pharmacy receipt", other: "Other" };

export function Lightbox({ doc, onClose }: { doc: DocumentRecord; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="lg" title={doc.original_filename} description={KIND_LABEL[doc.kind]}>
      <AuthImage src={`/documents/${doc.id}/file`} alt={doc.original_filename} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
    </Modal>
  );
}

function EditVisitModal({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const update = useUpdateVisit();
  const [diagnosis, setDiagnosis] = useState(visit.diagnosis ?? "");
  const [meds, setMeds] = useState(visit.medications.join("\n"));
  const [summary, setSummary] = useState(visit.summary ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit visit"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: visit.id,
                  diagnosis,
                  summary,
                  medications: meds
                    .split("\n")
                    .map((m) => m.trim())
                    .filter(Boolean),
                },
                { onSuccess: () => (toast.success("Visit updated"), onClose()), onError: (e) => toast.error(e.message) },
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Diagnosis / findings">
          <Textarea rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </Field>
        <Field label="Medications" hint="One per line, with dosage">
          <Textarea rows={4} value={meds} onChange={(e) => setMeds(e.target.value)} />
        </Field>
        <Field label="Summary">
          <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function VisitCard({ visit, canEdit }: { visit: Visit; canEdit: boolean }) {
  const { openBooking } = useQuickActions();
  const attach = useAttachDocument();
  const pharmacy = useRequestPharmacy();
  const { data: requests } = usePharmacyRequests(visit.medications.length ? visit.id : undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("extra_page");
  const [lightbox, setLightbox] = useState<DocumentRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [attachMenu, setAttachMenu] = useState(false);
  const lastRequest = requests?.[0];
  const nv = visit.next_visit_note;
  const today = format(new Date(), "yyyy-MM-dd");
  const followUpBookable = nv && (!nv.date || !/^\d{4}-\d{2}-\d{2}$/.test(nv.date) || nv.date >= today);

  return (
    <div className="group/visit relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-canvas/60 p-5 ring-1 ring-ink/5 transition-all duration-300 hover:bg-white hover:shadow-float hover:ring-brand-200">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-300 to-lime-300 opacity-0 transition-opacity group-hover/visit:opacity-100" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Stethoscope className="h-4 w-4" />
            </span>
            {visit.doctor ? doctorName(visit.doctor.full_name) : (visit.doctor_name_raw ?? "Doctor not recorded")}
          </p>
          {visit.clinic_name && <p className="mt-0.5 truncate text-xs text-ink-faint">{visit.clinic_name}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canEdit && (
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <div className="relative">
            <Button size="sm" variant="ghost" icon={Paperclip} onClick={() => setAttachMenu((o) => !o)} loading={attach.isPending}>
              Attach
            </Button>
            {attachMenu && (
              <div className="absolute right-0 z-20 mt-2 w-52 animate-scale-in rounded-2xl border border-line/70 bg-white p-1.5 shadow-pop">
                {(["extra_page", "pharmacy_receipt", "other"] as const).map((k) => (
                  <button
                    key={k}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-brand-50/70"
                    onClick={() => {
                      setKind(k);
                      setAttachMenu(false);
                      fileInput.current?.click();
                    }}
                  >
                    {k === "extra_page" ? "Extra page (back side)" : KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {visit.medications.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={Send}
              loading={pharmacy.isPending}
              onClick={() =>
                pharmacy.mutate(visit.id, { onSuccess: () => toast.success("Medicines sent to pharmacy"), onError: (e) => toast.error(e.message) })
              }
            >
              Pharmacy
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <p className="text-sm leading-relaxed text-ink">{visit.diagnosis ?? <span className="text-ink-faint">No diagnosis recorded.</span>}</p>
        {visit.summary && visit.summary !== visit.diagnosis && <p className="text-sm text-ink-soft">{visit.summary}</p>}
        {visit.medications.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              <Pill className="h-3.5 w-3.5" /> Prescribed
            </p>
            <MedicationChips items={visit.medications} />
          </div>
        )}
        {lastRequest && (
          <p className="text-xs text-ink-faint">
            Pharmacy request{" "}
            <Badge tone={lastRequest.status === "sent" ? "green" : lastRequest.status === "failed" ? "red" : "slate"}>{lastRequest.status}</Badge>
            {lastRequest.status === "failed" && lastRequest.results?.reason ? ` — ${String(lastRequest.results.reason)}` : ""}
          </p>
        )}
        {nv && (nv.date || nv.reason) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-50/70 px-3.5 py-2.5 text-sm">
            <span className="text-brand-800">
              Next visit on prescription: <b>{nv.date || "no date"}</b>
              {nv.time ? ` ${nv.time}` : ""}
              {nv.reason ? ` · ${nv.reason}` : ""}
            </span>
            {followUpBookable && (
              <Button
                size="sm"
                variant="soft"
                icon={CalendarPlus}
                onClick={() =>
                  openBooking({
                    patient: visit.patient,
                    doctorId: visit.doctor?.id,
                    date: nv.date && /^\d{4}-\d{2}-\d{2}$/.test(nv.date) ? nv.date : undefined,
                    time: nv.time && /^\d{2}:\d{2}$/.test(nv.time) ? nv.time : undefined,
                    reason: nv.reason ?? "Follow-up",
                    originVisitId: visit.id,
                  })
                }
              >
                Book it
              </Button>
            )}
          </div>
        )}
      </div>

      {visit.documents.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {visit.documents.map((d) => (
            <button key={d.id} onClick={() => setLightbox(d)} className="group shrink-0 text-left">
              <AuthImage
                src={`/documents/${d.id}/file`}
                alt={d.original_filename}
                className="h-24 w-20 rounded-xl object-cover ring-1 ring-line transition-all group-hover:-translate-y-0.5 group-hover:ring-brand-300"
              />
              <span className="mt-1 block w-20 truncate text-[10px] text-ink-faint">{KIND_LABEL[d.kind]}</span>
            </button>
          ))}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          attach.mutate(
            { visitId: visit.id, file, kind },
            { onSuccess: () => toast.success(`${KIND_LABEL[kind]} attached`), onError: (err) => toast.error(err.message) },
          );
        }}
      />
      {lightbox && <Lightbox doc={lightbox} onClose={() => setLightbox(null)} />}
      {editing && <EditVisitModal visit={visit} onClose={() => setEditing(false)} />}
    </div>
  );
}
