import clsx from "clsx";
import { AlertTriangle, CalendarPlus, ChevronLeft, Loader2, Minus, Plus, RotateCcw, Sparkles, Trash2, UserPlus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthImage, PatientPicker } from "@/components/domain";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Notice, PageLoader, Segmented, Select, Textarea, Toggle } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { doctorName, toLocalIso } from "@/lib/format";
import { useConfirmDocument, useDiscardDocument, useDocument, useDoctors, usePatient, useRetryExtraction } from "@/lib/queries";
import type { DocumentRecord, PatientBrief } from "@/lib/types";

const isDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s?: string | null) => !!s && /^\d{1,2}:\d{2}$/.test(s);

function Viewer({ doc }: { doc: DocumentRecord }) {
  const pages = [doc, ...(doc.children ?? [])];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const page = pages[Math.min(index, pages.length - 1)];
  return (
    <Card className="flex flex-col overflow-hidden xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-112px)]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="truncate text-sm font-medium text-ink">{page.original_filename}</p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={Minus} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
          <span className="w-10 text-center text-xs text-ink-faint">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" icon={Plus} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-canvas p-3">
        <AuthImage
          src={`/documents/${page.id}/file`}
          alt={page.original_filename}
          className="mx-auto rounded-lg shadow-card"
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
        />
      </div>
      {pages.length > 1 && (
        <div className="flex gap-2 border-t border-line p-3">
          {pages.map((p, i) => (
            <button key={p.id} onClick={() => setIndex(i)} className={clsx("rounded-lg border-2", i === index ? "border-brand-400" : "border-transparent")}>
              <AuthImage src={`/documents/${p.id}/file`} alt="" className="h-16 w-12 rounded-md object-cover" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function MatchedPatient({ id, onChange }: { id: string; onChange: () => void }) {
  const { data } = usePatient(id);
  if (!data) return <div className="h-14 animate-pulse rounded-xl bg-canvas" />;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
      <Avatar name={data.full_name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{data.full_name}</p>
        <p className="truncate text-xs text-ink-soft">
          {data.mrn} · {data.visit_count} previous visit{data.visit_count === 1 ? "" : "s"}
        </p>
      </div>
      <button className="text-xs font-medium text-brand-700 hover:underline" onClick={onChange}>
        Change
      </button>
    </div>
  );
}

export function ReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: doc, isLoading } = useDocument(id);
  const { data: doctors } = useDoctors();
  const confirm = useConfirmDocument();
  const retry = useRetryExtraction();
  const discard = useDiscardDocument();

  const [initialised, setInitialised] = useState(false);
  const [patientMode, setPatientMode] = useState<"existing" | "new">("existing");
  const [patient, setPatient] = useState<PatientBrief | null>(null);
  const [matchedId, setMatchedId] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState({ full_name: "", mrn: "", email: "", phone_number: "" });
  const [doctorId, setDoctorId] = useState("");
  const [visit, setVisit] = useState({ visit_date: "", clinic_name: "", diagnosis: "", summary: "", meds: "" });
  const [next, setNext] = useState({ date: "", time: "", reason: "", location: "" });
  const [bookFollowUp, setBookFollowUp] = useState(false);
  const [followDoctorId, setFollowDoctorId] = useState("");
  const [duration, setDuration] = useState(30);
  const [notify, setNotify] = useState(true);
  const [pharmacy, setPharmacy] = useState(false);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = doc && !["uploaded", "processing"].includes(doc.status);

  useEffect(() => {
    if (!doc || !ready || initialised) return;
    const ex = doc.extraction;
    const d = ex?.draft;
    const matched = ex?.matched_patient_id ?? doc.patient_id ?? null;
    setMatchedId(matched);
    setPatientMode(matched || !d?.patient_name ? "existing" : "new");
    setNewPatient({ full_name: d?.patient_name ?? "", mrn: d?.patient_id ?? "", email: "", phone_number: "" });
    const doc_doctor = user?.role === "doctor" ? user.doctor?.id ?? "" : ex?.matched_doctor_id ?? "";
    setDoctorId(doc_doctor);
    setFollowDoctorId(doc_doctor);
    setVisit({
      visit_date: d?.visit_date ?? "",
      clinic_name: d?.clinic_name ?? "",
      diagnosis: d?.diagnosis ?? "",
      summary: d?.summary ?? "",
      meds: (d?.medications ?? []).join("\n"),
    });
    const nv = d?.next_visit;
    setNext({ date: isDate(nv?.date) ? nv!.date! : "", time: isTime(nv?.time) ? nv!.time!.padStart(5, "0") : "", reason: nv?.reason ?? "", location: nv?.location ?? "" });
    setBookFollowUp(isDate(nv?.date));
    setInitialised(true);
  }, [doc, ready, initialised, user]);

  if (isLoading) return <PageLoader />;
  if (!doc) return <EmptyState icon={AlertTriangle} title="Document not found" action={<Link to="/prescriptions"><Button variant="secondary">Back to inbox</Button></Link>} />;
  if (doc.status === "confirmed" || doc.parent_id)
    return (
      <EmptyState
        icon={Sparkles}
        title="Already filed"
        description="This prescription has been confirmed into a patient's history."
        action={doc.patient_id && <Link to={`/patients/${doc.patient_id}`}><Button>Open patient</Button></Link>}
      />
    );

  const draft = doc.extraction?.draft;
  const meds = visit.meds.split("\n").map((m) => m.trim()).filter(Boolean);

  const submit = () => {
    setError(null);
    const patientId = patientMode === "existing" ? matchedId ?? patient?.id : undefined;
    if (patientMode === "existing" && !patientId) return setError("Choose the patient this prescription belongs to, or create a new one.");
    if (patientMode === "new" && !newPatient.full_name.trim()) return setError("Enter the new patient's name.");
    if (bookFollowUp && (!isDate(next.date) || !isTime(next.time || "10:00"))) return setError("The follow-up needs a valid date.");
    confirm.mutate(
      {
        id: doc.id,
        patient_id: patientId ?? null,
        new_patient: patientMode === "new" ? newPatient : null,
        doctor_id: doctorId || null,
        doctor_name_raw: draft?.doctor_name ?? null,
        clinic_name: visit.clinic_name || null,
        visit_date: visit.visit_date || null,
        diagnosis: visit.diagnosis || null,
        medications: meds,
        summary: visit.summary || null,
        next_visit: next.date || next.reason ? next : null,
        follow_up: bookFollowUp
          ? {
              start_at: toLocalIso(next.date, next.time || "10:00"),
              duration_minutes: duration,
              doctor_id: followDoctorId || doctorId || null,
              reason: next.reason || "Follow-up",
              location: next.location || null,
              notify,
              allow_overlap: allowOverlap,
            }
          : null,
        send_to_pharmacy: pharmacy,
      },
      {
        onSuccess: (res) => {
          toast.success("Visit saved to the patient's history", {
            description: [res.appointment && "Follow-up booked", res.pharmacy_request_id && "medicines sent to pharmacy"].filter(Boolean).join(" · ") || undefined,
          });
          navigate(`/patients/${res.visit.patient.id}`);
        },
        onError: (e) => {
          setError(e.message);
          if (e instanceof ApiError && e.status === 409) setAllowOverlap(false);
        },
      },
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/prescriptions" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ChevronLeft className="h-4 w-4" /> Prescriptions
        </Link>
        <div className="flex gap-2">
          {doc.status === "failed" && (
            <Button variant="secondary" size="sm" icon={RotateCcw} loading={retry.isPending} onClick={() => (retry.mutate(doc.id), setInitialised(false))}>
              Retry extraction
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => window.confirm("Discard this upload?") && discard.mutate(doc.id, { onSuccess: () => navigate("/prescriptions") })}
          >
            Discard
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <Viewer doc={doc} />
        </div>

        <div className="space-y-4">
          {!ready ? (
            <Card className="flex items-center gap-3 p-6">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              <div>
                <p className="font-medium text-ink">Reading the prescription…</p>
                <p className="text-sm text-ink-faint">Handwritten notes, medicines and the next visit are being extracted. This usually takes 10–30 seconds.</p>
              </div>
            </Card>
          ) : (
            <>
              {doc.status === "failed" && (
                <Notice tone="red" icon={AlertTriangle}>
                  Automatic extraction failed — {doc.error}. Fill in the details below by hand, or retry.
                </Notice>
              )}
              {doc.extraction?.warnings.map((w) => (
                <Notice key={w} tone="amber" icon={AlertTriangle}>
                  {w}
                </Notice>
              ))}

              <Card>
                <CardHeader icon={UserRound} title="Patient" actions={
                  <Segmented value={patientMode} onChange={setPatientMode} options={[{ value: "existing", label: "Existing" }, { value: "new", label: "New patient" }]} />
                } />
                <div className="space-y-3 px-5 pb-5">
                  {draft?.patient_name && (
                    <p className="text-xs text-ink-faint">
                      Read from sheet: <span className="font-medium text-ink-soft">{draft.patient_name}</span>
                      {draft.patient_id && <> · ID <span className="font-medium text-ink-soft">{draft.patient_id}</span></>}
                    </p>
                  )}
                  {patientMode === "existing" ? (
                    matchedId ? (
                      <MatchedPatient id={matchedId} onChange={() => setMatchedId(null)} />
                    ) : (
                      <PatientPicker value={patient} onChange={setPatient} />
                    )
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Full name">
                        <Input value={newPatient.full_name} onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })} />
                      </Field>
                      <Field label="Patient ID / MRN">
                        <Input value={newPatient.mrn} onChange={(e) => setNewPatient({ ...newPatient, mrn: e.target.value })} />
                      </Field>
                      <Field label="Email" hint="For appointment invites">
                        <Input type="email" value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} />
                      </Field>
                      <Field label="Phone">
                        <Input value={newPatient.phone_number} onChange={(e) => setNewPatient({ ...newPatient, phone_number: e.target.value })} />
                      </Field>
                    </div>
                  )}
                  {patientMode === "new" && <p className="flex items-center gap-1.5 text-xs text-ink-faint"><UserPlus className="h-3.5 w-3.5" /> A new patient record will be created on save.</p>}
                </div>
              </Card>

              <Card>
                <CardHeader icon={Sparkles} title="Visit details" subtitle="Check against the image — extraction can misread handwriting" />
                <div className="space-y-4 px-5 pb-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Doctor" hint={draft?.doctor_name ? `Read as "${draft.doctor_name}"` : undefined}>
                      <Select value={doctorId} disabled={user?.role === "doctor"} onChange={(e) => setDoctorId(e.target.value)}>
                        <option value="">Not linked to a doctor</option>
                        {doctors?.map((d) => (
                          <option key={d.id} value={d.id}>
                            {doctorName(d.full_name)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Visit date">
                      <Input type="date" value={visit.visit_date} onChange={(e) => setVisit({ ...visit, visit_date: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Clinic / department">
                    <Input value={visit.clinic_name} onChange={(e) => setVisit({ ...visit, clinic_name: e.target.value })} />
                  </Field>
                  <Field label="Diagnosis / clinical findings">
                    <Textarea rows={3} value={visit.diagnosis} onChange={(e) => setVisit({ ...visit, diagnosis: e.target.value })} />
                  </Field>
                  <Field label="Medications" hint="One per line, with dosage">
                    <Textarea rows={Math.max(3, meds.length + 1)} value={visit.meds} onChange={(e) => setVisit({ ...visit, meds: e.target.value })} />
                  </Field>
                  <Field label="Summary">
                    <Textarea rows={2} value={visit.summary} onChange={(e) => setVisit({ ...visit, summary: e.target.value })} />
                  </Field>
                </div>
              </Card>

              <Card>
                <CardHeader icon={CalendarPlus} title="Next visit" subtitle={draft?.next_visit ? "Mentioned on the prescription" : "None mentioned — add one if needed"} />
                <div className="space-y-4 px-5 pb-5">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date">
                      <Input type="date" value={next.date} onChange={(e) => setNext({ ...next, date: e.target.value })} />
                    </Field>
                    <Field label="Time" hint={!next.time ? "Not on sheet — 10:00 AM if booked" : undefined}>
                      <Input type="time" step={300} value={next.time} onChange={(e) => setNext({ ...next, time: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Reason">
                    <Input value={next.reason} onChange={(e) => setNext({ ...next, reason: e.target.value })} placeholder="Follow-up" />
                  </Field>
                  <div className="rounded-xl border border-line p-3.5">
                    <Toggle checked={bookFollowUp} onChange={setBookFollowUp} label="Book this follow-up now" description="Creates the appointment when you save." />
                    {bookFollowUp && (
                      <div className="mt-4 space-y-3 pl-12">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="With">
                            <Select value={followDoctorId} disabled={user?.role === "doctor"} onChange={(e) => setFollowDoctorId(e.target.value)}>
                              <option value="">Same as visit</option>
                              {doctors?.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {doctorName(d.full_name)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Duration">
                            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                              {[15, 20, 30, 45, 60].map((m) => (
                                <option key={m} value={m}>
                                  {m} min
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <Toggle checked={notify} onChange={setNotify} label="Send invites & notifications" description="Patient and doctor get the visit summary and full history PDF." />
                        {error?.includes("already has") && <Toggle checked={allowOverlap} onChange={setAllowOverlap} label="Double-book anyway" />}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {meds.length > 0 && (
                <Card className="p-5">
                  <Toggle checked={pharmacy} onChange={setPharmacy} label="Send medicines to the pharmacy" description={`Emails the pharmacy the ${meds.length} medication(s) above with the case sheet attached.`} />
                </Card>
              )}

              {error && <Notice tone="red">{error}</Notice>}
              <div className="flex justify-end gap-2 pb-6">
                <Link to="/prescriptions">
                  <Button variant="secondary">Save for later</Button>
                </Link>
                <Button loading={confirm.isPending} onClick={submit}>
                  Confirm & save visit
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
