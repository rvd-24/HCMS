import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui/primitives";
import { useSavePatient } from "@/lib/queries";
import type { Patient } from "@/lib/types";

const FIELDS = ["full_name", "mrn", "email", "phone_number", "whatsapp_number", "slack_user_id", "teams_upn", "date_of_birth", "sex", "address", "notes"] as const;
type Form = Record<(typeof FIELDS)[number], string>;

export function PatientFormModal({ patient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved?: (p: Patient) => void }) {
  const save = useSavePatient();
  const [form, setForm] = useState<Form>(() => Object.fromEntries(FIELDS.map((f) => [f, (patient?.[f] as string | null) ?? ""])) as Form);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]));
    save.mutate(
      { id: patient?.id, ...body },
      {
        onSuccess: (p) => {
          toast.success(patient ? "Patient updated" : "Patient added");
          onSaved?.(p);
          onClose();
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={patient ? "Edit patient" : "Add patient"}
      description="Contact details are what appointment invites and reminders are sent to."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="patient-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={submit} className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input required value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Patient ID / MRN" hint="As printed on the hospital's prescriptions">
            <Input value={form.mrn} onChange={set("mrn")} placeholder="e.g. KIMS22512260127" />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} />
          </Field>
          <Field label="Sex">
            <Select value={form.sex} onChange={set("sex")}>
              <option value="">—</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
        </div>
        <p className="pt-2 text-sm font-semibold text-ink">Contact & notifications</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone (SMS)">
            <Input value={form.phone_number} onChange={set("phone_number")} placeholder="+91…" />
          </Field>
          <Field label="WhatsApp number">
            <Input value={form.whatsapp_number} onChange={set("whatsapp_number")} placeholder="91XXXXXXXXXX" />
          </Field>
          <Field label="Slack member ID">
            <Input value={form.slack_user_id} onChange={set("slack_user_id")} />
          </Field>
        </div>
        <Field label="Address">
          <Textarea rows={2} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
      </form>
    </Modal>
  );
}
