import { CalendarDays, CheckCircle2, CircleSlash, KeyRound, MessageSquare, Sparkles } from "lucide-react";
import { useState } from "react";
import { Avatar, Button, Card, CardHeader, KeyValue, Notice, PageHeader, PageLoader } from "@/components/ui/primitives";
import { ChangePasswordModal } from "@/features/account/ChangePasswordModal";
import { useAuth } from "@/lib/auth";
import { useSystemStatus } from "@/lib/queries";

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl p-3 transition-colors hover:bg-canvas/70">
      <span
        className={
          ok
            ? "relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
            : "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-faint"
        }
      >
        {ok ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <CircleSlash className="h-[18px] w-[18px]" />}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          {label}
          <span
            className={
              ok ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700" : "rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-faint"
            }
          >
            {ok ? "Connected" : "Not configured"}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">{detail}</p>
      </div>
    </li>
  );
}

const CHANNEL_HELP: Record<string, string> = {
  gmail: "Needs PRESCRIPT_EMAIL_ENABLED=true, and `uv run prescript google-auth` once to authorise Gmail + Calendar.",
  outlook: "MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET / SENDER_UPN in .env.",
  slack: "SLACK_BOT_TOKEN in .env; set each person's Slack member ID on their profile.",
  teams: "Uses the same Microsoft Graph app as Outlook.",
  whatsapp: "WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (and an approved template) in .env.",
};

export function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useSystemStatus();
  const [pw, setPw] = useState(false);
  if (isLoading || !data) return <PageLoader />;

  return (
    <>
      <PageHeader eyebrow={data.clinic_name} title="Settings" subtitle={isAdmin ? "Clinic configuration and integrations" : "Your account"} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={KeyRound} title="Your account" />
          <div className="mx-5 mb-4 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-brand-50 to-transparent p-4">
            <Avatar name={user?.full_name ?? "?"} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-ink">{user?.full_name}</p>
              <p className="truncate text-xs text-ink-faint">{user?.email}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
            <KeyValue label="Name">{user?.full_name}</KeyValue>
            <KeyValue label="Email">{user?.email}</KeyValue>
            <div className="col-span-2">
              <Button variant="secondary" onClick={() => setPw(true)}>
                Change password
              </Button>
            </div>
          </dl>
        </Card>
        <Card>
          <CardHeader icon={CalendarDays} title="Clinic" />
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
            <div className="col-span-2">
              <KeyValue label="Name">{data.clinic_name}</KeyValue>
            </div>
            <KeyValue label="Timezone">{data.timezone}</KeyValue>
            <KeyValue label="Default slot">{data.default_slot_minutes} minutes</KeyValue>
          </dl>
          <p className="px-5 pb-5 text-xs text-ink-faint">Set CLINIC_NAME, CLINIC_TIMEZONE and DEFAULT_SLOT_MINUTES in .env.</p>
        </Card>
        {isAdmin && (
          <>
            <Card>
              <CardHeader icon={Sparkles} title="Automation" />
              <ul className="space-y-1 px-3 pb-3">
                <Status
                  ok={data.extraction_configured}
                  label="Prescription extraction"
                  detail="OpenAI vision model reads uploaded case sheets (OPENAI_API_KEY / OPENAI_MODEL, or AZURE_OPENAI_* as a fallback)."
                />
                <Status ok={data.google_calendar_configured} label="Google Calendar" detail="Creates calendar events with invites for every booking." />
              </ul>
            </Card>
            <Card>
              <CardHeader icon={MessageSquare} title="Notification channels" subtitle="Every configured channel is tried for each recipient" />
              <div className="px-5">
                <Notice tone={data.email_enabled ? "brand" : "amber"}>
                  {data.email_enabled
                    ? data.email_redirect
                      ? `Email is on, but every email and calendar invite is redirected to ${data.email_redirect}.`
                      : "Email is on and goes to real patient/doctor addresses."
                    : `Email is off — no emails or calendar invites are sent (PRESCRIPT_EMAIL_ENABLED=false).${data.email_redirect ? ` When enabled, all email goes to ${data.email_redirect}.` : ""}`}
                </Notice>
              </div>
              <ul className="space-y-1 px-3 pb-3">
                {Object.entries(data.channels).map(([ch, ok]) => (
                  <Status key={ch} ok={ok} label={ch[0].toUpperCase() + ch.slice(1)} detail={CHANNEL_HELP[ch] ?? ""} />
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
      {pw && <ChangePasswordModal onClose={() => setPw(false)} />}
    </>
  );
}
