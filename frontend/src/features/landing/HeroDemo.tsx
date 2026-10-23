// Looping illustration of the core flow: scan → extract → book → notify. Sample data only.
import { Check, Hash, Mail, MessageCircle, Pill, ScanLine, Sparkles } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { EcgLine } from "@/components/viz";

const CYCLE_MS = 9000;

function useCycle() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((c) => c + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, []);
  return n;
}

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** Wavy pen strokes that read as handwriting at a glance. */
function Scribble({ y, length, indent = 0 }: { y: number; length: number; indent?: number }) {
  const waves = Array.from({ length }, (_, i) => (i % 3 === 2 ? "t 9 1" : "t 8 0")).join(" ");
  return <path d={`M${14 + indent} ${y} q 4 -5 8 0 ${waves}`} fill="none" stroke="#2f3d6b" strokeOpacity={0.55} strokeWidth={1.6} strokeLinecap="round" />;
}

function CaseSheet() {
  return (
    <div className="absolute left-0 top-10 w-[230px] -rotate-6 animate-float-slow sm:w-[250px]">
      <div className="relative overflow-hidden rounded-3xl bg-[#fffdf7] p-4 shadow-float ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-dashed border-ink/15 pb-2">
          <span className="font-display text-xs font-bold tracking-wide text-[#2f3d6b]">SMILE CARE DENTAL</span>
          <span className="h-6 w-6 rounded-full border-2 border-coral-400/60" />
        </div>
        <svg viewBox="0 0 220 250" className="mt-2 w-full">
          <text x="14" y="22" fontFamily="Georgia, serif" fontStyle="italic" fontSize="20" fill="#2f3d6b" fillOpacity="0.8">
            Rx
          </text>
          <Scribble y={50} length={12} />
          <Scribble y={72} length={9} indent={10} />
          <Scribble y={94} length={13} />
          <Scribble y={116} length={7} indent={10} />
          <Scribble y={146} length={11} />
          <Scribble y={168} length={8} indent={10} />
          <Scribble y={198} length={6} />
          <path d="M140 228 q 10 -18 22 -4 t 18 -6 t 16 4" fill="none" stroke="#2f3d6b" strokeOpacity={0.7} strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        {/* scanning beam */}
        <div className="pointer-events-none absolute inset-x-0 h-20 animate-scan">
          <div className="h-full bg-gradient-to-b from-transparent via-brand-300/25 to-brand-400/40" />
          <div className="h-[2px] bg-brand-400 shadow-[0_0_14px_3px_rgba(57,187,128,0.75)]" />
        </div>
      </div>
      <span className="absolute -left-3 -top-4 flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-white shadow-pop">
        <ScanLine className="h-3.5 w-3.5 animate-pulse text-brand-300" /> Reading handwriting
      </span>
    </div>
  );
}

const FIELDS = [
  ["Patient", "Ananya Mishra · PT-2041"],
  ["Diagnosis", "Irreversible pulpitis with 36"],
  ["Medicines", "Amoxicillin 500 mg TDS · Ibuprofen 400 mg SOS"],
  ["Next visit", "Thu, 24 Oct · 10:30 AM"],
];

function ExtractionCard({ cycle }: { cycle: number }) {
  return (
    <div className="glass absolute right-0 top-0 w-[270px] rounded-3xl p-5 shadow-float sm:w-[300px]">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-lime-300 to-brand-400 text-brand-900">
            <Sparkles className="h-4 w-4" />
          </span>
          AI extraction
        </p>
        <span
          key={`b${cycle}`}
          className="animate-fade-in rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 ring-1 ring-brand-100"
          style={delay(2.4)}
        >
          READY
        </span>
      </div>
      <div key={cycle} className="mt-4 space-y-3">
        {FIELDS.map(([k, v], i) => (
          <div key={k} className="animate-fade-up rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-ink/5" style={delay(0.5 + i * 0.45)}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{k}</p>
            <p className="truncate text-[13px] font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookedCard({ cycle }: { cycle: number }) {
  return (
    <div key={cycle} className="absolute bottom-44 right-0 w-[270px] animate-scale-in sm:bottom-16 sm:w-[300px]" style={delay(2.6)}>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-400 p-5 text-white shadow-glow">
        <EcgLine className="pointer-events-none absolute inset-x-0 bottom-1 h-12 w-full text-white/30" beats={3} ghost={false} />
        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-14 flex-col items-center justify-center rounded-2xl bg-white text-ink">
            <span className="text-[10px] font-bold uppercase text-coral-500">Thu</span>
            <span className="num text-2xl font-semibold leading-none">24</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/75">Follow-up booked</p>
            <p className="font-display text-lg font-semibold leading-tight">10:30 AM</p>
            <p className="truncate text-xs text-white/80">Dr. Mehra · Root canal review</p>
          </div>
          <span className="flex h-9 w-9 animate-scale-in items-center justify-center rounded-full bg-lime-300 text-brand-900" style={delay(3.1)}>
            <Check className="h-5 w-5" strokeWidth={3} />
          </span>
        </div>
      </div>
    </div>
  );
}

const CHANNELS = [
  { icon: MessageCircle, label: "WhatsApp sent", tone: "bg-emerald-500" },
  { icon: Mail, label: "Invite + history PDF", tone: "bg-coral-500" },
  { icon: Pill, label: "Medicines sent to pharmacy", tone: "bg-sky-500" },
  { icon: Hash, label: "Doctor pinged on Slack", tone: "bg-violet-500" },
];

function NotifyChips({ cycle }: { cycle: number }) {
  return (
    <div key={cycle} className="absolute bottom-0 left-0 flex flex-col items-start gap-2 sm:bottom-4">
      {CHANNELS.map((c, i) => (
        <span
          key={c.label}
          className="flex animate-scale-in items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3.5 text-xs font-semibold text-ink shadow-float"
          style={delay(3.4 + i * 0.35)}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${c.tone}`}>
            <c.icon className="h-3.5 w-3.5" />
          </span>
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function HeroDemo() {
  const cycle = useCycle();
  return (
    <div className="relative mx-auto h-[600px] w-full max-w-[580px] sm:h-[580px]">
      {/* orbit rings */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border border-dashed border-brand-300/50" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border border-brand-200/60 [animation-direction:reverse]">
        <span className="absolute -top-1.5 left-1/2 h-3 w-3 rounded-full bg-brand-400 shadow-glow-sm" />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-lime-200/70 to-brand-200/60 blur-3xl" />
      <CaseSheet />
      <ExtractionCard cycle={cycle} />
      <NotifyChips cycle={cycle} />
      <BookedCard cycle={cycle} />
    </div>
  );
}
