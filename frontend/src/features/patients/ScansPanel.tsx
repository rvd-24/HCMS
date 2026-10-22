// Right-hand panel on the patient profile: the radiographs for the tooth picked on the 3D model.
// An intraoral X-ray is filed against the teeth it shows; an OPG shows the whole mouth, so it
// appears for every tooth.
import clsx from "clsx";
import { format } from "date-fns";
import { Expand, ImagePlus, ScanLine, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AuthImage } from "@/components/domain";
import { Modal } from "@/components/ui/overlays";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Notice, Segmented, Spinner } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { useDeleteScan, usePatientScans, useUploadScan } from "@/lib/queries";
import { chartPosition, isTooth, toothName } from "@/lib/teeth";
import type { Scan, ScanKind } from "@/lib/types";

const KIND: Record<ScanKind, { label: string; long: string }> = {
  xray: { label: "X-ray", long: "Intraoral X-ray" },
  opg: { label: "OPG", long: "OPG · full mouth" },
};

const fileUrl = (s: Scan) => `/documents/${s.document_id}/file`;
const shows = (s: Scan, tooth: number) => s.kind === "opg" || s.teeth.some((t) => chartPosition(t) === tooth);

function ScanViewer({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="lg" title={KIND[scan.kind].long} description={describe(scan)}>
      <div className="rounded-2xl bg-black p-2">
        <AuthImage src={fileUrl(scan)} alt={scan.original_filename} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
      </div>
    </Modal>
  );
}

function describe(s: Scan) {
  const when = s.taken_on ? `Taken ${fmtDate(s.taken_on)}` : `Uploaded ${fmtDate(s.created_at)}`;
  return s.kind === "opg" ? when : `${when} · teeth ${s.teeth.join(", ")}`;
}

function UploadScanModal({ patientId, tooth, onClose }: { patientId: string; tooth: number | null; onClose: () => void }) {
  const upload = useUploadScan();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<ScanKind>("xray");
  const [teeth, setTeeth] = useState(tooth ? String(tooth) : "");
  const [takenOn, setTakenOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = () => {
    if (!file) return setError("Choose the scan image");
    const numbers = teeth.split(/[\s,;]+/).filter(Boolean);
    const bad = numbers.find((n) => !/^\d{2}$/.test(n) || !isTooth(Number(n)));
    if (kind === "xray" && (!numbers.length || bad)) return setError(bad ? `${bad} isn't an FDI tooth number (11–48)` : "Say which teeth the X-ray shows");
    setError(null);
    upload.mutate(
      { patientId, file, kind, teeth: kind === "xray" ? numbers.map(Number) : [], takenOn: takenOn || undefined, note: note.trim() || undefined },
      {
        onSuccess: () => (toast.success(`${KIND[kind].label} added`), onClose()),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add scan"
      description="An intraoral X-ray is filed against the teeth it shows; an OPG appears for every tooth."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Upload} loading={upload.isPending} onClick={submit}>
            Add scan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-line bg-canvas/60 p-4 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40">
          {preview ? (
            <img src={preview} alt="" className="max-h-48 rounded-lg bg-black object-contain" />
          ) : (
            <>
              <ImagePlus className="h-7 w-7 text-brand-500" />
              <span className="text-sm font-medium text-ink">Choose the X-ray or OPG image</span>
              <span className="text-xs text-ink-faint">JPG, PNG or WebP, up to 20 MB</span>
            </>
          )}
          <input type="file" accept=".jpg,.jpeg,.png,.webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <span className="truncate text-xs text-ink-soft">{file.name}</span>}
        </label>
        {/* not a Field: its <label> wrapper would forward clicks to the first segment */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-soft">Type</p>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "xray", label: "Intraoral X-ray" },
              { value: "opg", label: "OPG (full mouth)" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {kind === "xray" && (
            <Field label="Teeth shown" hint="FDI numbers, e.g. 36, 37">
              <Input value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="36, 37" />
            </Field>
          )}
          <Field label="Date taken" className={kind === "opg" ? "col-span-2" : undefined}>
            <Input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pre-op, periapical lesion on 36" />
        </Field>
      </div>
    </Modal>
  );
}

export function ScansPanel({ patientId, tooth }: { patientId: string; tooth: number | null }) {
  const { data, isLoading } = usePatientScans(patientId);
  const remove = useDeleteScan();
  const [filter, setFilter] = useState<"all" | ScanKind>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Scan | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The tooth's own X-rays first (newest first), then the full-mouth OPGs.
  const forTooth = useMemo(() => {
    const all = (data ?? []).filter((s) => tooth === null || shows(s, tooth));
    return [...all.filter((s) => s.kind === "xray"), ...all.filter((s) => s.kind === "opg")];
  }, [data, tooth]);
  const list = filter === "all" ? forTooth : forTooth.filter((s) => s.kind === filter);
  const active = list.find((s) => s.id === activeId) ?? list[0];
  const count = (k: ScanKind) => forTooth.filter((s) => s.kind === k).length;

  useEffect(() => {
    setActiveId(null);
    setConfirmDelete(false);
  }, [tooth, filter]);

  return (
    <Card className="flex min-h-[640px] min-w-0 flex-col">
      <CardHeader
        icon={ScanLine}
        title="Scans"
        subtitle={tooth !== null ? `Tooth ${tooth} · ${toothName(tooth)}` : "All teeth — pick a tooth on the model"}
        actions={
          <Button size="sm" icon={Upload} onClick={() => setAdding(true)}>
            Add scan
          </Button>
        }
      />
      <div className="px-6 pb-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${forTooth.length}` },
            { value: "xray", label: `X-ray ${count("xray")}` },
            { value: "opg", label: `OPG ${count("opg")}` },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : !active ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={ScanLine}
            title={tooth !== null ? `No scans of tooth ${tooth}` : "No scans on file"}
            description="Add an intraoral X-ray of this tooth, or an OPG of the whole mouth."
            action={
              <Button icon={Upload} onClick={() => setAdding(true)}>
                Add scan
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
          {/* Radiographs read best on black. */}
          <button
            type="button"
            onClick={() => setViewing(active)}
            className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl bg-black"
          >
            <AuthImage key={active.id} src={fileUrl(active)} alt={active.original_filename} className="max-h-full max-w-full object-contain" />
            <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <Expand className="h-4 w-4" />
            </span>
          </button>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={active.kind === "opg" ? "violet" : "blue"}>{KIND[active.kind].long}</Badge>
                {active.kind === "xray" &&
                  active.teeth.map((t) => (
                    <span
                      key={t}
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold",
                        tooth !== null && chartPosition(t) === tooth ? "bg-brand-500 text-white" : "bg-canvas text-ink-soft ring-1 ring-line",
                      )}
                    >
                      {t}
                    </span>
                  ))}
              </div>
              <p className="mt-2 text-sm text-ink-soft">{active.taken_on ? `Taken ${fmtDate(active.taken_on)}` : `Uploaded ${fmtDate(active.created_at)}`}</p>
              {active.note && <p className="mt-1 text-sm text-ink">{active.note}</p>}
            </div>
            {confirmDelete ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => remove.mutate(active.id, { onSuccess: () => (toast("Scan deleted"), setConfirmDelete(false)), onError: (e) => toast.error(e.message) })}
                >
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete scan"
                aria-label="Delete scan"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-coral-50 hover:text-coral-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {list.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-2 overflow-y-auto p-1">
              {list.map((s) => (
                <button
                  key={s.id}
                  onClick={() => (setActiveId(s.id), setConfirmDelete(false))}
                  className={clsx(
                    "overflow-hidden rounded-2xl bg-black text-left ring-2 ring-offset-2 ring-offset-white transition-all",
                    s.id === active.id ? "ring-brand-500" : "ring-transparent hover:ring-brand-200",
                  )}
                >
                  <AuthImage src={fileUrl(s)} alt={s.original_filename} className="aspect-[4/3] w-full object-cover opacity-90" />
                  <span className="block bg-white px-2 py-1 text-[11px]">
                    <span className="font-semibold text-ink">{KIND[s.kind].label}</span>
                    <span className="text-ink-faint"> · {fmtDate(s.taken_on ?? s.created_at, "d MMM yy")}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {adding && <UploadScanModal patientId={patientId} tooth={tooth} onClose={() => setAdding(false)} />}
      {viewing && <ScanViewer scan={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}
