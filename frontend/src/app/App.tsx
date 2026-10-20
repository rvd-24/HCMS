import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PageLoader } from "@/components/ui/primitives";
import { ActivityPage } from "@/features/admin/ActivityPage";
import { SettingsPage } from "@/features/admin/SettingsPage";
import { UsersPage } from "@/features/admin/UsersPage";
import { AppointmentsPage } from "@/features/appointments/AppointmentsPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { LandingPage } from "@/features/landing/LandingPage";
import { AdminDashboard } from "@/features/dashboard/AdminDashboard";
import { DoctorDashboard } from "@/features/dashboard/DoctorDashboard";
import { DoctorsPage } from "@/features/doctors/DoctorsPage";
import { InboxPage } from "@/features/documents/InboxPage";
import { ReviewPage } from "@/features/documents/ReviewPage";
import { PatientDetailPage } from "@/features/patients/PatientDetailPage";
import { PatientsPage } from "@/features/patients/PatientsPage";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { AppLayout } from "./AppLayout";
import { QuickActionsProvider } from "./QuickActions";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  // Signed-out visitors to the root see the landing page; deep links go straight to sign-in.
  if (!user) return location.pathname === "/" ? <Navigate to="/welcome" replace /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <QuickActionsProvider>{children}</QuickActionsProvider>;
}

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />;
}

function Home() {
  const { user } = useAuth();
  return user?.role === "doctor" ? <DoctorDashboard /> : <AdminDashboard />;
}

export function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="prescriptions" element={<InboxPage />} />
        <Route path="prescriptions/:id" element={<ReviewPage />} />
        <Route path="doctors" element={<RoleGate roles={["admin"]}><DoctorsPage /></RoleGate>} />
        <Route path="users" element={<RoleGate roles={["admin"]}><UsersPage /></RoleGate>} />
        <Route path="activity" element={<RoleGate roles={["admin"]}><ActivityPage /></RoleGate>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
