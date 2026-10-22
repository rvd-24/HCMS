// One hook per endpoint. Query keys are grouped by resource so a mutation can
// invalidate everything that might show the record it changed.
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, qs } from "./api";
import type {
  AdminDashboard,
  Appointment,
  AppointmentStatus,
  AuditEvent,
  Doctor,
  DoctorDashboard,
  DoctorStatus,
  DocumentRecord,
  Patient,
  PharmacyRequest,
  Scan,
  ScanKind,
  SystemStatus,
  User,
  Visit,
} from "./types";

export const keys = {
  dashboard: ["dashboard"] as const,
  appointments: ["appointments"] as const,
  patients: ["patients"] as const,
  documents: ["documents"] as const,
  doctors: ["doctors"] as const,
  visits: ["visits"] as const,
  scans: ["scans"] as const,
  users: ["users"] as const,
  audit: ["audit"] as const,
  system: ["system"] as const,
};

function useInvalidate() {
  const qc = useQueryClient();
  return (...groups: QueryKey[]) => groups.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

// Dashboards
export const useAdminDashboard = () =>
  useQuery({ queryKey: [...keys.dashboard, "admin"], queryFn: () => api.get<AdminDashboard>("/dashboard/admin"), refetchInterval: 60_000 });
export const useDoctorDashboard = () =>
  useQuery({ queryKey: [...keys.dashboard, "doctor"], queryFn: () => api.get<DoctorDashboard>("/dashboard/doctor"), refetchInterval: 60_000 });

// Appointments
export interface AppointmentFilters {
  start?: string;
  end?: string;
  doctor_id?: string;
  patient_id?: string;
  status?: string;
  q?: string;
}
export const useAppointments = (f: AppointmentFilters) =>
  useQuery({
    queryKey: [...keys.appointments, f],
    queryFn: () => api.get<Appointment[]>(`/appointments${qs({ ...f })}`),
  });

export interface BookingInput {
  patient_id: string;
  doctor_id?: string | null;
  start_at: string;
  duration_minutes: number;
  reason?: string;
  location?: string;
  notify: boolean;
  allow_overlap?: boolean;
  origin_visit_id?: string | null;
  /** File as a request for the doctor to approve rather than booking outright. */
  request?: boolean;
}
export function useBookAppointment() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: BookingInput) => api.post<Appointment>("/appointments", body as unknown as Record<string, unknown>),
    onSuccess: () => inv(keys.appointments, keys.dashboard, keys.patients),
  });
}
export function useUpdateAppointment() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch<Appointment>(`/appointments/${id}`, body),
    onSuccess: () => inv(keys.appointments, keys.dashboard, keys.patients),
  });
}
export function useAppointmentStatus() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status, reason, notify = true }: { id: string; status: AppointmentStatus; reason?: string; notify?: boolean }) =>
      api.post<Appointment>(`/appointments/${id}/status`, { status, reason, notify }),
    onSuccess: () => inv(keys.appointments, keys.dashboard, keys.patients),
  });
}
// Requests: approve (optionally at another slot, e.g. dropped on the grid) or decline.
export function useApproveRequest() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; start_at?: string; notify?: boolean; allow_overlap?: boolean }) =>
      api.post<Appointment>(`/appointments/${id}/approve`, body),
    onSuccess: () => inv(keys.appointments, keys.dashboard, keys.patients),
  });
}
export function useDeclineRequest() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason, notify = true }: { id: string; reason?: string; notify?: boolean }) =>
      api.post<Appointment>(`/appointments/${id}/decline`, { reason, notify }),
    onSuccess: () => inv(keys.appointments, keys.dashboard, keys.patients),
  });
}
export const useResendNotification = () =>
  useMutation({ mutationFn: (id: string) => api.post(`/appointments/${id}/notify`) });

// Patients
export const usePatients = (q: string, limit = 50, offset = 0) =>
  useQuery({
    queryKey: [...keys.patients, "list", q, limit, offset],
    queryFn: () => api.get<{ total: number; items: Patient[] }>(`/patients${qs({ q, limit, offset })}`),
    placeholderData: (prev) => prev,
  });
export const usePatient = (id: string | undefined) =>
  useQuery({ queryKey: [...keys.patients, id], queryFn: () => api.get<Patient>(`/patients/${id}`), enabled: !!id });
export const usePatientVisits = (id: string | undefined) =>
  useQuery({ queryKey: [...keys.visits, "patient", id], queryFn: () => api.get<Visit[]>(`/patients/${id}/visits`), enabled: !!id });
export const usePatientAppointments = (id: string | undefined) =>
  useQuery({
    queryKey: [...keys.appointments, "patient", id],
    queryFn: () => api.get<Appointment[]>(`/patients/${id}/appointments`),
    enabled: !!id,
  });
export function useSavePatient() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id ? api.patch<Patient>(`/patients/${id}`, body) : api.post<Patient>("/patients", body),
    onSuccess: () => inv(keys.patients, keys.dashboard),
  });
}

// Scans (X-rays / OPGs)
export const usePatientScans = (patientId: string | undefined) =>
  useQuery({ queryKey: [...keys.scans, patientId], queryFn: () => api.get<Scan[]>(`/patients/${patientId}/scans`), enabled: !!patientId });
export function useUploadScan() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ patientId, file, kind, teeth, takenOn, note }: { patientId: string; file: File; kind: ScanKind; teeth: number[]; takenOn?: string; note?: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      form.append("teeth", teeth.join(","));
      if (takenOn) form.append("taken_on", takenOn);
      if (note) form.append("note", note);
      return api.post<Scan>(`/patients/${patientId}/scans`, form);
    },
    onSuccess: () => inv(keys.scans),
  });
}
export function useDeleteScan() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/scans/${id}`), onSuccess: () => inv(keys.scans) });
}

// Visits
export function useUpdateVisit() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch<Visit>(`/visits/${id}`, body),
    onSuccess: () => inv(keys.visits, keys.patients),
  });
}
export function useAttachDocument() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ visitId, file, kind }: { visitId: string; file: File; kind: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      return api.post<DocumentRecord>(`/visits/${visitId}/documents`, form);
    },
    onSuccess: () => inv(keys.visits),
  });
}
export const usePharmacyRequests = (visitId: string | undefined) =>
  useQuery({
    queryKey: [...keys.visits, visitId, "pharmacy"],
    queryFn: () => api.get<PharmacyRequest[]>(`/visits/${visitId}/pharmacy-requests`),
    enabled: !!visitId,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "pending") ? 2000 : false),
  });
export function useRequestPharmacy() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (visitId: string) => api.post<PharmacyRequest>(`/visits/${visitId}/pharmacy-requests`),
    onSuccess: () => inv(keys.visits, keys.audit),
  });
}

// Documents / prescription inbox
export const useInbox = () =>
  useQuery({
    queryKey: [...keys.documents, "inbox"],
    queryFn: () => api.get<DocumentRecord[]>("/documents"),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "processing" || d.status === "uploaded") ? 2500 : false),
  });
export const useDocument = (id: string | undefined) =>
  useQuery({
    queryKey: [...keys.documents, id],
    queryFn: () => api.get<DocumentRecord>(`/documents/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ["processing", "uploaded"].includes(q.state.data.status) ? 2000 : false),
  });
export function useUploadDocuments() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ files, sameSheet, patientId }: { files: File[]; sameSheet: boolean; patientId?: string }) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      form.append("same_sheet", String(sameSheet));
      if (patientId) form.append("patient_id", patientId);
      return api.post<{ documents: DocumentRecord[]; duplicates: { filename: string; existing: DocumentRecord }[] }>("/documents", form);
    },
    onSuccess: () => inv(keys.documents, keys.dashboard),
  });
}
export function useRetryExtraction() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.post(`/documents/${id}/extract`), onSuccess: () => inv(keys.documents) });
}
export function useConfirmDocument() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.post<{ visit: Visit; appointment: Appointment | null; pharmacy_request_id: string | null }>(`/documents/${id}/confirm`, body),
    onSuccess: () => inv(keys.documents, keys.visits, keys.patients, keys.appointments, keys.dashboard),
  });
}
export function useDiscardDocument() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/documents/${id}`), onSuccess: () => inv(keys.documents, keys.dashboard) });
}

// Doctors
export const useDoctors = (includeInactive = false) =>
  useQuery({
    queryKey: [...keys.doctors, includeInactive],
    queryFn: () => api.get<Doctor[]>(`/doctors${qs({ include_inactive: includeInactive || undefined })}`),
  });
export function useSaveDoctor() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id ? api.patch<Doctor>(`/doctors/${id}`, body) : api.post<Doctor>("/doctors", body),
    onSuccess: () => inv(keys.doctors, keys.dashboard, keys.users),
  });
}
export function useSetMyStatus() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (status: DoctorStatus) => api.post<Doctor>("/doctors/me/status", { status }),
    onSuccess: () => inv(keys.doctors, keys.dashboard),
  });
}

// Admin
export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => api.get<User[]>("/users") });
export function useSaveUser() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id ? api.patch<User>(`/users/${id}`, body) : api.post<User>("/users", body),
    onSuccess: () => inv(keys.users, keys.doctors),
  });
}
export const useAudit = (limit = 100) =>
  useQuery({ queryKey: [...keys.audit, limit], queryFn: () => api.get<AuditEvent[]>(`/audit?limit=${limit}`) });
export const useSystemStatus = () =>
  useQuery({ queryKey: keys.system, queryFn: () => api.get<SystemStatus>("/system/status"), staleTime: 5 * 60_000 });
