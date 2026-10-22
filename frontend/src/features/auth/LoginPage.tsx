import { ArrowLeft, ArrowRight, CalendarCheck2, FileScan, HeartPulse, Lock, Mail, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BodyFigure } from "@/components/BodyFigure";
import { Logo } from "@/components/brand";
import { EcgLine } from "@/components/viz";
import { Button, Field, Input, Notice } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // One sign-in for everyone: the account's role decides what they see (the clinic's
      // doctors get their own workspace; the admin login still gets the admin tools).
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-backdrop relative grid min-h-screen gap-3 p-3 lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 p-10 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 animate-blob rounded-full bg-lime-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-[28rem] w-[28rem] animate-blob rounded-full bg-sky-300/20 blur-3xl [animation-delay:-7s]" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

        <Link to="/welcome" className="relative">
          <Logo light />
        </Link>

        {/* scan stage */}
        <div className="relative mx-auto my-6 flex w-full max-w-lg flex-1 items-center justify-center">
          <div className="absolute h-[22rem] w-[22rem] animate-spin-slow rounded-full border border-dashed border-white/20" />
          <div className="absolute h-64 w-64 rounded-full bg-brand-400/30 blur-3xl" />
          <BodyFigure className="relative h-[min(52vh,440px)] drop-shadow-[0_30px_40px_rgba(0,0,0,0.35)]" />

          <div className="glass-dark absolute left-0 top-[12%] w-52 animate-float rounded-3xl p-4 shadow-pop">
            <p className="flex items-center gap-2 text-xs text-white/70">
              <FileScan className="h-3.5 w-3.5" /> Prescription read
            </p>
            <p className="mt-1 font-display text-lg font-semibold">4 fields extracted</p>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="h-1.5 flex-1 origin-left animate-grow-x rounded-full bg-lime-300" style={{ animationDelay: `${0.4 + i * 0.25}s` }} />
              ))}
            </div>
          </div>
          <div className="glass-dark absolute right-0 top-[38%] w-56 animate-float rounded-3xl p-4 shadow-pop [animation-delay:-2s]">
            <p className="flex items-center gap-2 text-xs text-white/70">
              <HeartPulse className="h-3.5 w-3.5 animate-beat" /> Clinic pulse
            </p>
            <EcgLine className="mt-2 h-10 w-full text-lime-300" beats={3} />
          </div>
          <div className="absolute bottom-[6%] left-[4%] flex w-[17rem] animate-float items-center gap-3 rounded-3xl bg-white p-3.5 text-ink shadow-pop [animation-delay:-4s]">
            <span className="flex h-12 w-11 flex-col items-center justify-center rounded-2xl bg-brand-50">
              <span className="text-[9px] font-bold text-coral-500">THU</span>
              <span className="num text-lg font-semibold leading-none">24</span>
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-faint">Follow-up booked</p>
              <p className="truncate text-sm font-semibold">10:30 AM · invite sent</p>
            </div>
            <CalendarCheck2 className="ml-auto h-5 w-5 shrink-0 text-brand-500" />
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight">Prescriptions in. Follow-ups booked. Everyone informed.</h1>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm">
            {[
              [FileScan, "AI extraction + human review"],
              [CalendarCheck2, "Invites & reminders"],
              [Users, "One continuous history"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof FileScan;
              return (
                <li key={text as string} className="glass-dark flex items-center gap-2 rounded-full px-3.5 py-2">
                  <I className="h-4 w-4 text-lime-300" />
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="relative flex items-center justify-center rounded-[2.5rem] px-4 py-16 sm:px-8">
        <Link
          to="/welcome"
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-ink-soft shadow-card transition-colors hover:text-ink sm:left-6 sm:top-6"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="font-display text-[44px] font-medium leading-none tracking-tight text-ink">Welcome back</h2>
          <p className="mt-3 text-ink-soft">Sign in to your clinic workspace.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {error && <Notice tone="red">{error}</Notice>}
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  type="email"
                  autoComplete="username"
                  required
                  className="h-12 rounded-2xl pl-11"
                  placeholder="you@yourclinic.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-12 rounded-2xl pl-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </Field>
            <Button type="submit" size="lg" className="group w-full" loading={busy}>
              Sign in
              {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </Button>
          </form>
          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
            <ShieldCheck className="h-3.5 w-3.5" /> Accounts are set up by your clinic.
          </p>
        </div>
      </section>
    </div>
  );
}
