import clsx from "clsx";
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  FileDown,
  FileScan,
  Hash,
  History,
  Lock,
  Mail,
  MessageCircle,
  MousePointerClick,
  Pill,
  Play,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UploadCloud,
  Users,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BodyFigure } from "@/components/BodyFigure";
import { Logo, LogoMark } from "@/components/brand";
import { CountUp, Reveal, useInView } from "@/components/ui/motion";
import { Avatar, Button, Segmented } from "@/components/ui/primitives";
import { EcgLine, LiveDot, QueueGauge, SERIES_COLORS } from "@/components/viz";
import { useAuth } from "@/lib/auth";
import { HeroDemo } from "./HeroDemo";

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function SectionTitle({ eyebrow, title, children, center }: { eyebrow: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <Reveal className={clsx("max-w-2xl", center && "mx-auto text-center")}>
      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-600 shadow-card ring-1 ring-white">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {eyebrow}
      </p>
      <h2 className="font-display text-4xl font-medium leading-[1.05] tracking-tight text-ink sm:text-5xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">{children}</p>}
    </Reveal>
  );
}

function AnimatedHeadline() {
  const lines = [
    { words: ["Prescriptions", "in."], gradient: false },
    { words: ["Follow-ups", "out."], gradient: true },
  ];
  let i = 0;
  return (
    <h1 className="font-display text-[50px] font-medium leading-[0.98] tracking-[-0.03em] text-ink sm:text-[72px] xl:text-[80px]">
      {lines.map((line, li) => (
        <span key={li} className="block whitespace-nowrap">
          {line.words.map((w) => {
            const d = 0.15 + i++ * 0.12;
            return (
              <span key={w} className="mr-[0.22em] inline-block overflow-hidden pb-2 align-bottom">
                <span
                  className={clsx("inline-block animate-fade-up", line.gradient && "text-gradient")}
                  style={{ animationDelay: `${d}s`, animationDuration: "0.9s" }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

function Nav() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6">
      <nav
        className={clsx(
          "mx-auto flex h-16 max-w-6xl items-center gap-6 rounded-full px-3 pl-5 transition-all duration-500",
          scrolled ? "glass shadow-float" : "border border-transparent bg-transparent",
        )}
      >
        <Link to="/welcome">
          <Logo />
        </Link>
        <div className="ml-4 hidden items-center gap-1 text-sm font-medium text-ink-soft md:flex">
          {[
            ["How it works", "#how"],
            ["Features", "#features"],
            ["Workspaces", "#workspaces"],
            ["Safety", "#safety"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-white/80 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link to="/">
              <Button icon={ArrowRight}>Go to dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link to="/login">
                <Button>Open workspace</Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  const { user } = useAuth();
  return (
    <section className="relative overflow-hidden pb-16 pt-32 sm:pt-36">
      {/* living background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] animate-blob rounded-full bg-brand-200/50 blur-3xl" />
        <div className="absolute -right-40 top-10 h-[32rem] w-[32rem] animate-blob rounded-full bg-sky-200/60 blur-3xl [animation-delay:-5s]" />
        <div className="absolute bottom-0 left-1/3 h-[26rem] w-[26rem] animate-blob rounded-full bg-lime-200/50 blur-3xl [animation-delay:-10s]" />
        <div className="dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <EcgLine className="absolute inset-x-0 top-[62%] h-40 w-full text-brand-400/40" beats={10} strokeWidth={1.5} duration={6} />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1.12fr_1fr]">
        <div>
          <Link
            to="/login"
            className="group relative mb-7 inline-flex animate-fade-up items-center gap-2 overflow-hidden rounded-full bg-white/90 py-1.5 pl-1.5 pr-4 text-sm font-medium text-ink shadow-card ring-1 ring-white"
          >
            <span className="rounded-full bg-gradient-to-r from-brand-500 to-brand-400 px-2.5 py-0.5 text-xs font-bold text-white">NEW</span>
            AI reads handwritten case sheets
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          </Link>
          <AnimatedHeadline />
          <p className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-ink-soft [animation-delay:.6s]">
            Snap a photo of a case sheet. Prescript reads it, files it into the patient's history, books the next visit and tells everyone who needs to know —
            doctor, patient and pharmacy.
          </p>
          <div className="mt-9 flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:.75s]">
            <Link to={user ? "/" : "/login"}>
              <Button size="lg" className="group">
                {user ? "Go to dashboard" : "Open your workspace"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="secondary" className="group">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white transition-transform group-hover:scale-110">
                  <Play className="h-3 w-3 fill-current" />
                </span>
                See how it works
              </Button>
            </a>
          </div>
          <div className="mt-10 flex animate-fade-up items-center gap-4 [animation-delay:.9s]">
            <div className="flex -space-x-2.5">
              {["Meera Shah", "Arjun Rao", "Lena Park", "Omar Haddad"].map((n) => (
                <Avatar key={n} name={n} size="md" className="ring-[3px]" />
              ))}
            </div>
            <p className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">Two workspaces, one record.</span>
              <br />
              Hospital admins and doctors, side by side.
            </p>
          </div>
        </div>
        <div className="animate-fade-in [animation-delay:.3s]">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}

const MARQUEE: [LucideIcon, string][] = [
  [ScanLine, "Handwriting extraction"],
  [CalendarCheck2, "Google Calendar invites"],
  [MessageCircle, "WhatsApp reminders"],
  [FileDown, "Treatment-history PDF"],
  [Pill, "Pharmacy requests"],
  [ShieldCheck, "Role-based access"],
  [History, "Full audit log"],
  [Hash, "Slack & Teams pings"],
  [Mail, "Gmail & Outlook"],
];

function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="relative overflow-hidden py-6 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
        {items.map(([Icon, label], i) => (
          <span
            key={i}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white/80 px-5 py-3 text-sm font-semibold text-ink shadow-card ring-1 ring-white"
          >
            <Icon className="h-4 w-4 text-brand-500" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATS: [number, string, string][] = [
  [3, "steps", "from photo to a booked follow-up"],
  [5, "channels", "email, WhatsApp, Slack, Teams, Outlook"],
  [2, "workspaces", "hospital admin and doctor"],
  [1, "history", "per patient, across every doctor"],
];

function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map(([n, unit, text], i) => (
          <Reveal key={unit} delay={i * 90} className="lift rounded-3xl bg-white/80 p-6 shadow-card ring-1 ring-white">
            <p className="font-display text-6xl font-light tracking-tight text-ink">
              <CountUp value={n} duration={900 + i * 200} />
              <span className="ml-2 text-xl font-medium text-ink-faint">{unit}</span>
            </p>
            <p className="mt-2 text-sm text-ink-soft">{text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function StepIllustration({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-white">
        <svg className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]" fill="none">
          <rect x="1" y="1" width="99%" height="98%" rx="16" stroke="#39bb80" strokeWidth="2" strokeDasharray="8 8" className="animate-dash" />
        </svg>
        <span className="flex h-16 w-16 animate-float items-center justify-center rounded-2xl bg-white shadow-float">
          <UploadCloud className="h-8 w-8 text-brand-500" />
        </span>
      </div>
    );
  if (step === 1)
    return (
      <div className="relative h-40 space-y-2 overflow-hidden rounded-2xl bg-gradient-to-br from-lime-200/60 to-white p-4">
        {["Ananya Rao", "Acute pharyngitis", "Amoxicillin 500 mg"].map((t, i) => (
          <div key={t} className="flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-ink shadow-card">
            <Wand2 className="h-3.5 w-3.5 text-brand-500" />
            <span className="overflow-hidden whitespace-nowrap">{t}</span>
            {i === 2 && <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">check</span>}
          </div>
        ))}
        <div className="pointer-events-none absolute inset-x-0 h-10 animate-scan bg-gradient-to-b from-transparent to-brand-300/30" />
      </div>
    );
  return (
    <div className="relative flex h-40 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-white">
      <div className="flex h-20 w-16 flex-col items-center justify-center rounded-2xl bg-white shadow-float">
        <span className="text-[10px] font-bold text-coral-500">THU</span>
        <span className="num text-3xl font-semibold text-ink">24</span>
      </div>
      <div className="space-y-1.5">
        {[MessageCircle, Mail, BellRing].map((I, i) => (
          <span
            key={i}
            className="flex h-8 w-8 animate-float items-center justify-center rounded-full bg-brand-500 text-white shadow-glow-sm"
            style={{ animationDelay: `${i * -1.5}s` }}
          >
            <I className="h-4 w-4" />
          </span>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const steps = [
    { title: "Snap", icon: UploadCloud, text: "Upload a photo or scan of the case sheet — extra pages too. From the front desk or the doctor's phone." },
    { title: "Check", icon: Sparkles, text: "AI fills in patient, diagnosis, medicines and the next visit. Anything uncertain is flagged for you to confirm." },
    {
      title: "Done",
      icon: CalendarCheck2,
      text: "It's filed in the patient's history, the follow-up is booked and invites go out with the full history attached.",
    },
  ];
  return (
    <section id="how" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24">
      <SectionTitle
        eyebrow="How it works"
        title={
          <>
            From paper to booked follow-up in <span className="text-gradient">three steps</span>
          </>
        }
        center
      >
        No retyping. No forgotten follow-ups. A person still checks every record before it's filed.
      </SectionTitle>
      <div ref={ref} className="relative mt-16 grid gap-5 md:grid-cols-3">
        <svg className="pointer-events-none absolute -top-14 left-0 hidden h-16 w-full md:block" viewBox="0 0 1000 60" preserveAspectRatio="none" fill="none">
          <path
            d="M160 40 C 300 -10, 360 70, 500 30 S 720 -10, 840 40"
            stroke="#39bb80"
            strokeWidth="2"
            strokeDasharray="6 8"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: inView ? 0 : 1, transition: "stroke-dashoffset 1.8s cubic-bezier(.2,.7,.2,1)" }}
          />
        </svg>
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 150} className="lift relative rounded-4xl bg-white p-6 shadow-card">
            <div className="mb-5 flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-white">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="font-display text-5xl font-light text-ink/10">0{i + 1}</span>
            </div>
            <StepIllustration step={i} />
            <h3 className="mt-5 font-display text-2xl font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function TimelineCard() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const visits = [
    ["12 Oct", "Dr. Mehra", "Follow-up — throat clear", ["Paracetamol 650 mg"]],
    ["03 Oct", "Dr. Mehra", "Acute pharyngitis", ["Amoxicillin 500 mg", "Gargle"]],
    ["14 Aug", "Dr. Iyer", "Routine dental check", ["Chlorhexidine rinse"]],
  ] as const;
  return (
    <div ref={ref} className="relative flex h-full flex-col overflow-hidden rounded-4xl bg-white p-7 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-3xl font-medium text-ink">One continuous history</h3>
          <p className="mt-1 text-sm text-ink-soft">Every visit, medicine and scanned page — across every doctor.</p>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-white shadow-glow-sm">
          <History className="h-5 w-5" />
        </span>
      </div>
      <ol className="relative mt-7 space-y-4 pl-8">
        <span
          className={clsx(
            "absolute bottom-2 left-[11px] top-2 w-0.5 origin-top rounded bg-gradient-to-b from-brand-400 to-brand-100 transition-transform duration-[1.4s]",
            inView ? "scale-y-100" : "scale-y-0",
          )}
        />
        {visits.map(([date, doc, dx, meds], i) => (
          <li
            key={date}
            className={clsx("relative transition-all duration-700", inView ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0")}
            style={{ transitionDelay: `${300 + i * 220}ms` }}
          >
            <span className="absolute -left-8 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-4 ring-brand-100">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
            </span>
            <div className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-ink/5">
              <div className="flex items-center justify-between text-xs text-ink-faint">
                <span className="font-semibold text-ink">{date}</span>
                <span>{doc}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-ink">{dx}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meds.map((m) => (
                  <span key={m} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-6">
        <div className="group flex items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-brand-700 to-brand-400 p-5 text-white shadow-glow-sm">
          <div>
            <p className="font-display text-lg font-semibold">Treatment-history PDF</p>
            <p className="text-xs text-white/80">Every visit on one document — attached to each follow-up invite.</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 transition-transform duration-300 group-hover:-translate-y-1">
            <FileDown className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function ChannelsOrbit() {
  const icons = [MessageCircle, Mail, Hash, Users, CalendarCheck2];
  return (
    <div className="relative mx-auto h-48 w-48">
      <div className="absolute inset-0 rounded-full border border-dashed border-white/30" />
      <div className="absolute inset-0 animate-spin-slow">
        {icons.map((I, i) => {
          const a = (i / icons.length) * Math.PI * 2;
          return (
            <span
              key={i}
              className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-600 shadow-float"
              style={{ left: `calc(50% + ${Math.cos(a) * 96}px - 20px)`, top: `calc(50% + ${Math.sin(a) * 96}px - 20px)` }}
            >
              <I className="h-4 w-4 animate-spin-slow [animation-direction:reverse]" />
            </span>
          );
        })}
      </div>
      <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-white shadow-float">
        <LogoMark className="h-9 w-9" />
      </span>
    </div>
  );
}

const PASTEL = [
  "from-violet-100 to-fuchsia-50 text-violet-800",
  "from-emerald-100 to-lime-50 text-emerald-800",
  "from-amber-100 to-yellow-50 text-amber-800",
  "from-sky-100 to-indigo-50 text-sky-800",
  "from-rose-100 to-pink-50 text-rose-800",
];

function MiniSchedule() {
  const grid = [
    [0, 1, null, 3, 4],
    [3, null, 4, 0, 1],
    [1, 2, 0, null, 3],
    [null, 4, 3, 1, null],
  ];
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
        <span key={d} className="pb-1 text-center text-[10px] font-semibold text-ink-faint">
          {d}
        </span>
      ))}
      {grid.flatMap((row, r) =>
        row.map((c, i) =>
          c === null ? (
            <span key={`${r}${i}`} className="h-12 rounded-xl border border-dashed border-ink/10" />
          ) : (
            <span
              key={`${r}${i}`}
              className={clsx("flex h-12 flex-col justify-between rounded-xl bg-gradient-to-br p-1.5 text-[9px] font-semibold", PASTEL[c])}
            >
              <span className="truncate">Patient</span>
              <span className="flex items-center gap-0.5 opacity-70">
                {c % 2 ? <Video className="h-2.5 w-2.5" /> : <Stethoscope className="h-2.5 w-2.5" />}
              </span>
            </span>
          ),
        ),
      )}
    </div>
  );
}

function Bento() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
      <SectionTitle
        eyebrow="Features"
        title={
          <>
            Everything the front desk and the doctor need. <span className="text-ink-faint">Nothing they don't.</span>
          </>
        }
      />
      <div className="mt-12 grid gap-4 md:grid-cols-6">
        <Reveal className="md:col-span-3 md:row-span-2">
          <TimelineCard />
        </Reveal>

        <Reveal delay={100} className="md:col-span-3">
          <div className="relative h-full overflow-hidden rounded-4xl bg-gradient-to-br from-lime-200 via-brand-50 to-brand-100 p-7 shadow-card">
            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 animate-float-slow rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-800 opacity-90" />
            <div className="pointer-events-none absolute -right-2 top-4 h-28 w-28 animate-spin-slow rounded-full border-[10px] border-white/40 border-l-transparent" />
            <h3 className="relative max-w-[70%] font-display text-3xl font-medium text-ink">AI reads it. You stay in charge.</h3>
            <div className="relative mt-5 max-w-sm rounded-3xl bg-white/70 p-4 backdrop-blur">
              <p className="text-sm font-semibold text-ink">Human review, every time</p>
              <p className="mt-1 text-xs text-ink-soft">Fields the model is unsure about are flagged. Nothing is filed until someone confirms it.</p>
              <EcgLine className="mt-3 h-10 w-full text-brand-500" beats={4} />
            </div>
            <Link to="/login" className="relative mt-4 inline-block">
              <Button variant="dark">Try the review screen</Button>
            </Link>
          </div>
        </Reveal>

        <Reveal delay={200} className="md:col-span-3">
          <div className="grid h-full gap-4 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-4xl bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold text-ink">Today's queue</h3>
                <LiveDot />
              </div>
              <div className="mt-4">
                <QueueGauge
                  segments={[
                    { key: "c", label: "Completed", value: 12, color: SERIES_COLORS.completed },
                    { key: "o", label: "Not yet seen", value: 9, color: SERIES_COLORS.open },
                    { key: "m", label: "Missed", value: 2, color: SERIES_COLORS.missed },
                  ]}
                  center={
                    <>
                      <p className="num text-4xl text-ink">23</p>
                      <p className="text-xs text-ink-soft">visits today</p>
                    </>
                  }
                />
              </div>
              <p className="mt-3 text-center text-[11px] text-ink-faint">Sample data · hover the arcs</p>
            </div>
            <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 p-6 text-white shadow-card">
              <h3 className="font-display text-xl font-semibold">Everyone informed</h3>
              <p className="mt-1 text-xs text-white/75">Every configured channel, automatically.</p>
              <div className="mt-4">
                <ChannelsOrbit />
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={100} className="md:col-span-2">
          <div className="relative h-full overflow-hidden rounded-4xl bg-white p-6 shadow-card">
            <h3 className="font-display text-xl font-semibold text-ink">Patient insights</h3>
            <p className="mt-1 text-xs text-ink-soft">A profile that feels like a chart, not a spreadsheet.</p>
            <BodyFigure className="mx-auto mt-2 h-64" />
          </div>
        </Reveal>

        <Reveal delay={180} className="md:col-span-4">
          <div className="relative h-full overflow-hidden rounded-4xl bg-white p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">A schedule you can read at a glance</h3>
                <p className="mt-1 text-xs text-ink-soft">Week, day-by-doctor and list views. Click any empty slot to book it.</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                <MousePointerClick className="h-3.5 w-3.5" /> Click to book
              </span>
            </div>
            <div className="mt-5">
              <MiniSchedule />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AdminPreview() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Today", "24", true],
          ["Checked in", "6", false],
          ["To review", "3", false],
        ].map(([l, v, f]) => (
          <div
            key={l as string}
            className={clsx("rounded-2xl p-4", f ? "bg-gradient-to-br from-brand-600 to-brand-400 text-white shadow-glow-sm" : "bg-canvas")}
          >
            <p className={clsx("text-xs", f ? "text-white/80" : "text-ink-soft")}>{l}</p>
            <p className="num text-3xl">{v}</p>
          </div>
        ))}
      </div>
      {[
        ["Dr. Sarah Mehra", "Cardiology", "Available", "bg-emerald-50 text-emerald-700"],
        ["Dr. Vikram Iyer", "Dentistry", "In session", "bg-amber-50 text-amber-700"],
        ["Dr. Lena Park", "Dermatology", "Off", "bg-coral-50 text-coral-600"],
      ].map(([n, s, st, c]) => (
        <div key={n} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink/5">
          <Avatar name={n} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{n}</p>
            <p className="text-xs text-ink-faint">{s}</p>
          </div>
          <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold", c)}>{st}</span>
        </div>
      ))}
    </div>
  );
}

function DoctorPreview() {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 to-brand-500 p-5 text-white">
        <EcgLine className="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full text-white/25" beats={4} ghost={false} />
        <p className="text-xs uppercase tracking-wider text-white/70">Next patient</p>
        <p className="num text-5xl font-light">10:30</p>
        <p className="font-semibold">Ananya Rao · follow-up</p>
        <p className="mt-2 text-xs text-white/75">Last visit: acute pharyngitis · Amoxicillin 500 mg</p>
      </div>
      {[
        ["11:00", "Rahul Verma", "Checked in", "bg-amber-50 text-amber-700"],
        ["11:30", "Fatima Khan", "Confirmed", "bg-emerald-50 text-emerald-700"],
      ].map(([t, n, st, c]) => (
        <div key={n} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink/5">
          <span className="w-12 text-sm font-bold text-ink">{t}</span>
          <Avatar name={n} size="sm" />
          <p className="flex-1 truncate text-sm font-semibold text-ink">{n}</p>
          <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold", c)}>{st}</span>
        </div>
      ))}
    </div>
  );
}

function Workspaces() {
  const [role, setRole] = useState<"admin" | "doctor">("admin");
  const content = {
    admin: {
      icon: Building2,
      title: "For the hospital admin",
      points: [
        "Live dashboard of every doctor and every booking",
        "AI prescription inbox with one-click review",
        "Doctors, logins, notification channels and an audit log",
      ],
    },
    doctor: {
      icon: Stethoscope,
      title: "For the doctor",
      points: [
        "Your day as a queue — check in, start, complete",
        "Walk in prepared: last visit and medicines up front",
        "Your patients' full history, downloadable as a PDF",
      ],
    },
  }[role];
  return (
    <section id="workspaces" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Two workspaces" title="Built for the desk and the doctor">
            Same records, different days. Each login sees exactly what it needs.
          </SectionTitle>
          <Reveal delay={150} className="mt-8">
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                { value: "admin", label: "Hospital admin" },
                { value: "doctor", label: "Doctor" },
              ]}
            />
            <div key={role} className="mt-6 animate-fade-up">
              <p className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <content.icon className="h-5 w-5 text-brand-500" /> {content.title}
              </p>
              <ul className="mt-4 space-y-3">
                {content.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-ink-soft">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
        <Reveal delay={100}>
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-brand-200/60 via-lime-200/40 to-sky-200/60 blur-2xl" />
            <div className="glass rounded-[2.25rem] p-5 shadow-float">
              <div className="mb-4 flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-coral-400" />
                <span className="h-3 w-3 rounded-full bg-amber-300" />
                <span className="h-3 w-3 rounded-full bg-brand-400" />
                <span className="ml-3 rounded-full bg-white/80 px-3 py-1 text-[11px] text-ink-faint">
                  prescript · {role === "admin" ? "dashboard" : "my day"}
                </span>
              </div>
              <div key={role} className="animate-scale-in">
                {role === "admin" ? <AdminPreview /> : <DoctorPreview />}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Safety() {
  const items: [LucideIcon, string, string][] = [
    [Lock, "Safe by default", "Email and calendar invites stay off until you switch them on — and can be redirected to one test inbox."],
    [ShieldCheck, "Role-based access", "Doctors see their own schedule and patients. Admins see the whole clinic."],
    [History, "Every action logged", "Bookings, status changes, uploads and edits — who did it and when."],
    [FileScan, "Source kept on file", "The original scan stays attached to the visit it created, page by page."],
  ];
  return (
    <section id="safety" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
      <SectionTitle eyebrow="Safety" title="Careful by design" center />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([Icon, title, text], i) => (
          <Reveal key={title} delay={i * 100} className="lift group rounded-4xl bg-white p-6 shadow-card">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-all duration-500 group-hover:rotate-6 group-hover:bg-brand-500 group-hover:text-white group-hover:shadow-glow-sm">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-5 font-display text-xl font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="mx-auto max-w-6xl px-5 pb-16 pt-10">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 px-8 py-16 text-center text-white shadow-float sm:px-16">
          <div className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 animate-blob rounded-full bg-lime-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-10 h-80 w-80 animate-blob rounded-full bg-sky-300/25 blur-3xl [animation-delay:-7s]" />
          <EcgLine
            className="pointer-events-none absolute inset-x-0 top-1/2 h-32 w-full -translate-y-1/2 text-white/20"
            beats={10}
            strokeWidth={2}
            duration={5}
          />
          <div className="relative">
            <LogoMark light className="mx-auto h-14 w-14 animate-float" />
            <h2 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
              Your next follow-up is one photo away.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/80">Sign in with the account your hospital admin created for you.</p>
            <Link to={user ? "/" : "/login"} className="mt-8 inline-block">
              <Button size="lg" className="!bg-none !bg-white !text-brand-800 !shadow-none hover:!bg-lime-200">
                {user ? "Go to dashboard" : "Open your workspace"} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Reveal>
      <footer className="mt-10 flex flex-col items-center justify-between gap-4 px-2 text-sm text-ink-faint sm:flex-row">
        <Logo />
        <p>Prescription intake, patient history and scheduling for clinics.</p>
      </footer>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="app-backdrop relative min-h-screen overflow-x-hidden">
      <Nav />
      <Hero />
      <Marquee />
      <Stats />
      <HowItWorks />
      <Bento />
      <Workspaces />
      <Safety />
      <FinalCta />
    </div>
  );
}
