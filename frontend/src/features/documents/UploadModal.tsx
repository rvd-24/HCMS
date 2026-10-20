import clsx from "clsx";
import { FileImage, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Modal } from "@/components/ui/overlays";
import { Button, Notice, Toggle } from "@/components/ui/primitives";
import { useUploadDocuments } from "@/lib/queries";

export function UploadModal({ patientId, onClose }: { patientId?: string; onClose: () => void }) {
  const upload = useUploadDocuments();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [sameSheet, setSameSheet] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const images = Array.from(list).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (images.length < list.length) toast.warning("Only JPG, PNG and WebP images are supported");
    setFiles((prev) => [...prev, ...images]);
  };

  const submit = () =>
    upload.mutate(
      { files, sameSheet, patientId },
      {
        onSuccess: (res) => {
          if (res.duplicates.length) toast.warning(`${res.duplicates.length} file(s) were already uploaded and were skipped`);
          if (res.documents.length) {
            toast.success("Uploaded — reading the prescription now", { description: "You'll review the extracted details before anything is saved." });
            navigate(res.documents.length === 1 ? `/prescriptions/${res.documents[0].id}` : "/prescriptions");
          }
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload prescription"
      description="Photos or scans of case sheets. Details are extracted automatically, then you review them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!files.length} loading={upload.isPending} onClick={submit}>
            Upload {files.length > 0 && `(${files.length})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={clsx(
            "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-brand-400 bg-brand-50" : "border-line hover:border-brand-300 hover:bg-canvas",
          )}
        >
          <UploadCloud className="h-9 w-9 text-brand-500" />
          <p className="mt-2 font-medium text-ink">Drop images here or click to browse</p>
          <p className="text-xs text-ink-faint">JPG, PNG or WebP · up to 20 MB each</p>
        </button>
        <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
                <FileImage className="h-4 w-4 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                {sameSheet && <span className="text-xs text-ink-faint">{i === 0 ? "Front" : `Page ${i + 1}`}</span>}
                <span className="text-xs text-ink-faint">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} className="text-ink-faint hover:text-red-500" aria-label="Remove">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 1 && (
          <div className="rounded-xl border border-line p-3.5">
            <Toggle
              checked={sameSheet}
              onChange={setSameSheet}
              label="These are pages of one case sheet"
              description="e.g. front and back. They're read together as one visit instead of separate prescriptions."
            />
          </div>
        )}
        {patientId && <Notice tone="brand">These will be suggested for the current patient during review.</Notice>}
      </div>
    </Modal>
  );
}
