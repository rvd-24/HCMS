// Single source for the sidebar. To add a feature: add a route in App.tsx and
// an entry here with the roles that may see it — nothing else in the shell changes.
import {
  CalendarDays,
  FileScan,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  to: string;
  label: string | Partial<Record<Role, string>>;
  icon: LucideIcon;
  roles: Role[];
  /** Key into the live counters shown as a pill next to the label. */
  badge?: "pendingReview";
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: "Basics",
    items: [
      // Doctors land on their schedule instead of a dashboard.
      { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
      { to: "/appointments", label: { admin: "Appointments", doctor: "My schedule" }, icon: CalendarDays, roles: ["admin", "doctor"] },
      { to: "/patients", label: { admin: "Patients", doctor: "My patients" }, icon: Users, roles: ["admin", "doctor"] },
      { to: "/prescriptions", label: "Prescriptions", icon: FileScan, roles: ["admin", "doctor"], badge: "pendingReview" },
    ],
  },
  {
    title: "Hospital",
    items: [
      { to: "/doctors", label: "Doctors", icon: Stethoscope, roles: ["admin"] },
      { to: "/users", label: "Users & access", icon: ShieldCheck, roles: ["admin"] },
      { to: "/activity", label: "Activity log", icon: History, roles: ["admin"] },
    ],
  },
  {
    title: "Others",
    items: [{ to: "/settings", label: "Settings", icon: Settings, roles: ["admin", "doctor"] }],
  },
];

export const navLabel = (item: NavItem, role: Role) => (typeof item.label === "string" ? item.label : item.label[role] ?? "");

export const ROLE_LABEL: Record<Role, string> = { admin: "Hospital admin", doctor: "Doctor" };
