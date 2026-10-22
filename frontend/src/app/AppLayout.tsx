import clsx from "clsx";
import { format } from "date-fns";
import { Bell, CalendarDays, ChevronDown, ChevronLeft, KeyRound, LogOut, Menu, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand";
import { Avatar, Button } from "@/components/ui/primitives";
import { EcgLine } from "@/components/viz";
import { ChangePasswordModal } from "@/features/account/ChangePasswordModal";
import { useAuth } from "@/lib/auth";
import { DOCTOR_STATUS } from "@/lib/format";
import { useDoctorDashboard, useInbox, useSetMyStatus } from "@/lib/queries";
import type { DoctorStatus } from "@/lib/types";
import { NAV, ROLE_LABEL, navLabel } from "./navigation";

const STATUS_DOT: Record<DoctorStatus, string> = { available: "bg-emerald-500", in_session: "bg-amber-500", off: "bg-coral-500" };

function usePendingReview() {
  const { data: inbox } = useInbox();
  return inbox?.filter((d) => d.status === "extracted" || d.status === "failed").length ?? 0;
}

/** The DocuVerse-style "AI Health Update" card, repurposed as the AI prescription inbox. */
function AiInboxCard({ pending }: { pending: number }) {
  return (
    <div className="relative mx-3 mb-3 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-lime-200 via-brand-50 to-brand-100 p-4 ring-1 ring-inset ring-white [@media(max-height:760px)]:hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 animate-float-slow rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 opacity-90 blur-[1px]" />
      <div className="pointer-events-none absolute -right-2 top-6 h-14 w-14 animate-spin-slow rounded-full border-[6px] border-white/40 border-t-transparent" />
      <p className="relative flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
        <Sparkles className="h-4 w-4 text-brand-600" /> AI Inbox
      </p>
      <div className="relative mt-3 rounded-2xl bg-white/70 p-3 backdrop-blur [@media(max-height:980px)]:hidden">
        <p className="text-sm font-semibold text-ink">{pending ? `${pending} prescription${pending === 1 ? "" : "s"} read` : "All caught up"}</p>
        <p className="text-xs text-ink-soft">{pending ? "Extracted and waiting for your check." : "Upload a case sheet and AI does the typing."}</p>
        <EcgLine className="mt-2 h-8 w-full text-brand-500" beats={3} />
      </div>
      <Link to="/prescriptions" className="relative mt-3 block">
        <Button variant="dark" className="w-full">
          {pending ? "Review now" : "Open inbox"}
        </Button>
      </Link>
    </div>
  );
}

function Sidebar({ collapsed, onToggle, mobileOpen, onNavigate }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onNavigate: () => void }) {
  const { user } = useAuth();
  const pending = usePendingReview();
  if (!user) return null;

  return (
    <aside
      className={clsx(
        "fixed inset-y-3 left-3 z-40 flex flex-col rounded-4xl border border-white/80 bg-white/85 shadow-float backdrop-blur-xl transition-all duration-300 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:translate-x-0",
        collapsed ? "lg:w-[88px]" : "lg:w-[264px]",
        mobileOpen ? "w-[264px] translate-x-0" : "w-[264px] -translate-x-[120%]",
      )}
    >
      <div className={clsx("relative flex h-20 shrink-0 items-center", collapsed ? "lg:justify-center lg:px-0" : "px-6")}>
        <Link to="/">
          <Logo collapsed={collapsed} />
        </Link>
        <button
          onClick={onToggle}
          className="absolute -right-3 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink-faint shadow-card ring-1 ring-line transition-colors hover:bg-ink hover:text-white lg:flex"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className={clsx("h-3.5 w-3.5 transition-transform duration-300", collapsed && "rotate-180")} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((section) => {
          const items = section.items.filter((i) => i.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <div key={section.title} className="mt-4 first:mt-1">
              {!collapsed && <p className="mb-1.5 px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint/80">{section.title}</p>}
              <ul className="space-y-1">
                {items.map((item) => {
                  const label = navLabel(item, user.role);
                  const count = item.badge === "pendingReview" ? pending : 0;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === "/"}
                        onClick={onNavigate}
                        title={collapsed ? label : undefined}
                        className={({ isActive }) =>
                          clsx(
                            "group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[15px] font-medium transition-all duration-300",
                            isActive
                              ? "bg-gradient-to-r from-brand-50 via-brand-50/60 to-transparent text-ink"
                              : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
                            collapsed && "lg:justify-center lg:px-0",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute -left-3 top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                            <span
                              className={clsx(
                                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300",
                                isActive ? "bg-brand-500 text-white shadow-glow-sm" : "text-ink-faint group-hover:scale-110 group-hover:text-ink",
                              )}
                            >
                              <item.icon className="h-[18px] w-[18px]" />
                              {collapsed && count > 0 && (
                                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-coral-500 ring-2 ring-white" />
                              )}
                            </span>
                            {!collapsed && <span className="flex-1 truncate">{label}</span>}
                            {!collapsed && count > 0 && (
                              <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-[0_4px_10px_-3px_rgba(239,85,68,0.7)]">
                                {count}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      {!collapsed && (
        <>
          <div className="mx-3 mb-2 flex shrink-0 items-center gap-3 rounded-2xl px-2 py-2 [@media(max-height:640px)]:hidden">
            <Avatar name={user.full_name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.role === "doctor" ? `Dr. ${user.full_name}` : user.full_name}</p>
              <p className="truncate text-xs text-ink-faint">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
          <AiInboxCard pending={pending} />
        </>
      )}
    </aside>
  );
}

function Menu_({ trigger, children }: { trigger: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 z-30 mt-2 min-w-[230px] origin-top-right animate-scale-in rounded-2xl border border-line/70 bg-white/95 p-1.5 shadow-pop backdrop-blur-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick }: { icon: typeof KeyRound; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-brand-50/70"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/[0.04] text-ink-soft transition-colors group-hover:bg-brand-500 group-hover:text-white">
        <Icon className="h-4 w-4" />
      </span>
      {children}
    </button>
  );
}

const pill = "flex h-12 items-center rounded-full border border-white/80 bg-white/90 shadow-card backdrop-blur";

function DoctorStatusSwitch() {
  const { data } = useDoctorDashboard();
  const setStatus = useSetMyStatus();
  const status = data?.doctor?.status;
  if (!status) return null;
  return (
    <Menu_
      trigger={
        <button className={clsx(pill, "hidden gap-2 px-4 text-sm font-semibold text-ink transition-colors hover:bg-white md:flex")}>
          <span className="relative flex h-2.5 w-2.5">
            <span className={clsx("absolute inset-0 animate-pulse-ring rounded-full", STATUS_DOT[status])} />
            <span className={clsx("relative h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />
          </span>
          {DOCTOR_STATUS[status].label}
          <ChevronDown className="h-4 w-4 text-ink-faint" />
        </button>
      }
    >
      {(close) =>
        (Object.keys(DOCTOR_STATUS) as DoctorStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus.mutate(s);
              close();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-brand-50/70"
          >
            <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_DOT[s])} />
            {DOCTOR_STATUS[s].label}
          </button>
        ))
      }
    </Menu_>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pending = usePendingReview();
  const [search, setSearch] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (!user) return null;

  return (
    <header className="sticky top-0 z-30 -mx-1 flex items-center gap-2.5 px-1 py-3 sm:gap-3">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-canvas via-canvas/80 to-transparent" />
      <button onClick={onMenu} className={clsx(pill, "w-12 justify-center text-ink-soft lg:hidden")} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <form
        className="group relative max-w-xl flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/patients?q=${encodeURIComponent(search)}`);
        }}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint transition-colors group-focus-within:text-brand-500" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patients…"
          className="h-12 w-full rounded-full border border-white/80 bg-white/90 pl-11 pr-20 text-sm shadow-card backdrop-blur transition-all placeholder:text-ink-faint focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
        <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-ink-faint sm:block">
          Ctrl K
        </kbd>
      </form>
      <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
        {user.role === "doctor" && <DoctorStatusSwitch />}
        <Link
          to="/prescriptions"
          className={clsx(pill, "relative hidden w-12 justify-center text-ink-soft transition-colors hover:text-ink sm:flex")}
          aria-label="Prescriptions awaiting review"
        >
          <Bell className={clsx("h-[19px] w-[19px]", pending > 0 && "origin-top animate-[beat_2.4s_ease-in-out_infinite]")} />
          {pending > 0 && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-coral-500 ring-2 ring-white" />}
        </Link>
        <span className={clsx(pill, "hidden gap-2.5 px-4 text-sm font-medium text-ink-soft xl:flex")}>
          <CalendarDays className="h-[18px] w-[18px] text-ink" />
          {format(new Date(), "MMMM d, yyyy")}
        </span>
        <Menu_
          trigger={
            <button className="flex items-center rounded-full ring-4 ring-white/80 transition-transform hover:scale-105" aria-label="Account">
              <Avatar name={user.full_name} size="lg" className="!ring-0" />
            </button>
          }
        >
          {(close) => (
            <>
              <div className="mb-1 border-b border-line px-3 pb-2.5 pt-1.5">
                <p className="text-sm font-semibold text-ink">{user.role === "doctor" ? `Dr. ${user.full_name}` : user.full_name}</p>
                <p className="text-xs text-ink-faint">{user.email}</p>
              </div>
              <MenuItem icon={KeyRound} onClick={() => (close(), setPwOpen(true))}>
                Change password
              </MenuItem>
              <MenuItem icon={LogOut} onClick={() => (close(), logout(), navigate("/login"))}>
                Sign out
              </MenuItem>
            </>
          )}
        </Menu_>
      </div>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}

/** Fixed mesh-gradient canvas with two slow drifting blobs. */
export function Backdrop() {
  return (
    <div className="app-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 top-1/3 h-[28rem] w-[28rem] animate-blob rounded-full bg-brand-200/30 blur-3xl" />
      <div className="absolute -right-32 -top-20 h-[26rem] w-[26rem] animate-blob rounded-full bg-sky-200/40 blur-3xl [animation-delay:-6s]" />
    </div>
  );
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("prescript.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("prescript.sidebar", c ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <div className="relative isolate flex min-h-screen gap-4 p-3 lg:p-4">
      <Backdrop />
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <div className="fixed inset-0 z-30 animate-fade-in bg-ink/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main key={location.pathname} className="mx-auto w-full max-w-[1480px] flex-1 animate-fade-up px-0.5 pb-8 pt-3 sm:px-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
