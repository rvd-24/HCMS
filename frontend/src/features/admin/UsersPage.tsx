import { ShieldCheck, Stethoscope, UserPlus, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PersonCell } from "@/components/domain";
import { CountUp } from "@/components/ui/motion";
import { Modal } from "@/components/ui/overlays";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, PageLoader, Select } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/app/navigation";
import { useAuth } from "@/lib/auth";
import { doctorName, fmtDateTime } from "@/lib/format";
import { useDoctors, useSaveUser, useUsers } from "@/lib/queries";
import type { Role, User } from "@/lib/types";

function UserModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const save = useSaveUser();
  const { data: doctors } = useDoctors();
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.full_name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "doctor");
  const [doctorId, setDoctorId] = useState(user?.doctor?.id ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const linkable = doctors?.filter((d) => !d.has_login || d.id === user?.doctor?.id) ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { full_name: name, role, doctor_id: role === "doctor" ? doctorId || null : null };
    if (!user) Object.assign(body, { email, password });
    else if (password) body.password = password;
    save.mutate(
      { id: user?.id, ...body },
      { onSuccess: () => (toast.success(user ? "User updated" : "Login created"), onClose()), onError: (err) => setError(err.message) },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? "Edit user" : "Create login"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        <Field label="Email">
          <Input type="email" required disabled={!!user} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Full name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {role === "doctor" && (
          <Field label="Doctor profile" hint="A doctor login sees this doctor's schedule and patients only.">
            <Select required value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Choose…</option>
              {linkable.map((d) => (
                <option key={d.id} value={d.id}>
                  {doctorName(d.full_name)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={user ? "Reset password" : "Password"} hint={user ? "Leave blank to keep the current password" : "At least 8 characters"}>
          <Input type="text" minLength={8} required={!user} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const { data, isLoading } = useUsers();
  const save = useSaveUser();
  const [editing, setEditing] = useState<User | "new" | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Hospital"
        title="Users & access"
        subtitle="Who can sign in, and what they can see"
        actions={
          <Button icon={UserPlus} onClick={() => setEditing("new")}>
            Create login
          </Button>
        }
      />
      {data && (
        <div className="stagger mb-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Hospital admins", value: data.filter((u) => u.role === "admin").length, icon: ShieldCheck, tone: "bg-violet-50 text-violet-600" },
            { label: "Doctor logins", value: data.filter((u) => u.role === "doctor").length, icon: Stethoscope, tone: "bg-brand-50 text-brand-600" },
            { label: "Disabled", value: data.filter((u) => !u.is_active).length, icon: UserX, tone: "bg-coral-50 text-coral-500" },
          ].map((t) => (
            <Card key={t.label} className="flex items-center gap-4 p-5">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t.tone}`}>
                <t.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="num text-3xl leading-none text-ink">
                  <CountUp value={t.value} />
                </p>
                <p className="mt-1 text-sm text-ink-soft">{t.label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card className="overflow-hidden">
        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Linked doctor</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <PersonCell name={u.full_name} sub={u.email} />
                    </td>
                    <td>
                      <Badge tone={u.role === "admin" ? "violet" : "teal"}>
                        {u.role === "admin" && <ShieldCheck className="h-3 w-3" />}
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td className="text-ink-soft">{u.doctor ? doctorName(u.doctor.full_name) : "—"}</td>
                    <td className="whitespace-nowrap text-ink-soft">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Never"}</td>
                    <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}</td>
                    <td className="space-x-1 whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                      {u.id !== me?.id && (
                        <Button
                          size="sm"
                          variant={u.is_active ? "danger" : "secondary"}
                          onClick={() =>
                            save.mutate(
                              { id: u.id, is_active: !u.is_active },
                              { onSuccess: () => toast.success(u.is_active ? "Login disabled" : "Login enabled") },
                            )
                          }
                        >
                          {u.is_active ? "Disable" : "Enable"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <UserModal user={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
