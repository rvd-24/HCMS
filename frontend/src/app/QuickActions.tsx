// App-wide entry points for the two most common actions, so any screen (a
// patient profile, the dashboard, a review page) can open them prefilled.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { BookAppointmentModal, type BookingPrefill } from "@/features/appointments/BookAppointmentModal";
import { UploadModal } from "@/features/documents/UploadModal";

interface QuickActions {
  openBooking: (prefill?: BookingPrefill) => void;
  openUpload: (patientId?: string) => void;
}

const Ctx = createContext<QuickActions | null>(null);

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [booking, setBooking] = useState<BookingPrefill | null>(null);
  const [upload, setUpload] = useState<{ patientId?: string } | null>(null);
  const openBooking = useCallback((prefill: BookingPrefill = {}) => setBooking(prefill), []);
  const openUpload = useCallback((patientId?: string) => setUpload({ patientId }), []);
  const value = useMemo(() => ({ openBooking, openUpload }), [openBooking, openUpload]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {booking && <BookAppointmentModal prefill={booking} onClose={() => setBooking(null)} />}
      {upload && <UploadModal patientId={upload.patientId} onClose={() => setUpload(null)} />}
    </Ctx.Provider>
  );
}

export function useQuickActions() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuickActions outside provider");
  return ctx;
}
