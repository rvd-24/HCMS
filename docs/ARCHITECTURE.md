# Architecture

## Layout

```
backend/prescript/
  config.py          settings from .env; all paths anchored to the project root
  pipeline/          domain logic carried over from the original scripts — storage-agnostic
    extraction.py      LLM reads a case sheet → PrescriptionSummary
    history.py         visit grouping + the combined treatment-history PDF
    messages.py        email / calendar bodies
    notify.py          calendar event + multi-channel notification, pharmacy request
    text.py            date/name helpers (OCR name normalisation, filename dates)
  integrations/      notifiers (Gmail, Outlook, Slack, Teams, WhatsApp, SMS) + Google APIs
    dispatch.py        the single exit point for messages — email on/off + redirect live here
  db/                SQLAlchemy models (SQLite by default; PRESCRIPT_DATABASE_URL for Postgres/Supabase —
                       init_db also enables RLS on every table so Supabase's REST API can't read them)
  services/          use-cases joining DB + pipeline: documents, appointments, pharmacy, matching
  api/               FastAPI: deps.py (auth + role scoping), schemas, serializers, routes/
  cli.py, seed.py    `prescript …` commands, setup/import/demo data
frontend/src/
  app/               shell: routes (App.tsx), sidebar config (navigation.ts), layout, quick actions
  components/        ui/ primitives (Button, Card, Modal…) + domain.tsx (badges, stat tiles, pickers)
  features/<area>/   one folder per area: dashboard, appointments, patients, documents, doctors, admin
  lib/               api client, auth, types (mirror api/serializers.py), react-query hooks, formatters
tools/download_blobs.py   unrelated Azure blob backup utility (not part of the app)
legacy/                   the original scripts, kept for reference
```

## Data model

`Patient` (MRN from prescriptions) · `Doctor` (+ OCR name aliases) · `User` (role admin|doctor, doctor
logins link to a Doctor) · `Visit` (one per case sheet: diagnosis, meds, summary, next-visit note) ·
`Document` (every image: prescription, extra page, pharmacy receipt; content-hashed) · `Appointment` ·
`PharmacyRequest` · `AuditEvent`. Statuses are strings validated in the API, so adding one needs no migration.

## User flows

**Prescription intake (admin or doctor)**
Upload (one sheet, or several pages of the same sheet) → background extraction → *Prescriptions* inbox
shows "Ready to review" → Review screen: image beside an editable form, patient/doctor pre-matched, warnings
for anything doubtful → **Confirm** creates the visit, optionally books the follow-up (with notifications)
and sends medicines to the pharmacy → lands on the patient's timeline. If extraction fails or isn't
configured, the same screen is filled by hand.

**Scheduling (admin)**
Appointments → Week (days × time) or Day (doctors × time) or List → click an empty slot or *Add appointment*
→ pick patient/doctor/time → clash with the doctor's existing booking is flagged (can override) → invite +
notifications go out in the background → drawer to confirm, check in, reschedule, cancel or resend.

**Doctor's day**
Doctors land on My schedule (Day view; OPD hours 9 am–1 pm and 4–6 pm, the rest hatched) → Requests
panel: approve at the patient's preferred time, decline with a reason, or drag a request onto the grid to
approve it at that slot (booked appointments can be dragged to reschedule too) → drawer: Check in → Start
consultation → Complete → patient profile with the full cross-doctor history; set own availability
(Available / In session / Off). The front desk files requests from *Add appointment* with "Ask the doctor
to approve" (status `requested`, which holds no slot and sends nothing until approved).

**Patient profile**
Details and a 3D mouth (Bite / Teeth / Upper / Lower, FDI numbering) in the centre; picking a tooth
shows its radiographs on the right. Scans live in the `scans` table (the image is a `Document` of kind
`scan`): an intraoral X-ray lists the teeth it shows, an OPG shows every tooth. Below: timeline,
appointments, medications and documents tabs.

**File storage**
With `PRESCRIPT_SUPABASE_URL` / `_SERVICE_KEY` / `PRESCRIPT_STORAGE_BUCKET` set, uploads go to a private
Supabase Storage bucket and the document's `stored_path` is `storage://<key>`; otherwise they stay under
`data/uploads`. `services.records.resolve_path` hides the difference (bucket files are cached under
`data/storage-cache` on first use), so the file route, extraction, pharmacy and PDF code read local paths
either way. Files are only ever served through `GET /api/documents/{id}/file`, after the access check.

**Admin housekeeping**
Doctors (profiles, contact for notifications, name variants, logins) · Users & access · Activity log ·
Settings (integration + email-mode status).

## Access rules

Admin sees everything. A doctor sees appointments booked with them, and any patient they've treated or
have booked — including that patient's full history across other doctors (the whole case travels together,
as the original emails did). Enforced server-side in `api/deps.py`; the UI only hides what the API refuses.

## Adding a feature

1. Backend: model fields in `db/models.py`, a route module in `api/routes/`, register it in `api/__init__.py`;
   use `require_role(...)` / `doctor_scope(...)` from `deps.py` for access.
2. Frontend: types in `lib/types.ts`, hooks in `lib/queries.ts`, a folder under `features/`, one `<Route>` in
   `app/App.tsx` and one entry in `app/navigation.ts` (with the roles that see it).
3. Build screens from `components/ui` and `components/domain` so they match the rest.

A new role (e.g. reception, pharmacy) = add it to `ROLES`, give routes `require_role(...)`, and list it on
the nav entries it should see.

## Not done yet

- Schema migrations (Alembic) — tables are created with `create_all`; fine until the schema changes on a live DB.
- Background jobs run in-process (FastAPI BackgroundTasks); move to a queue before running multiple workers.
- Backfill of null diagnoses (`process_visits.py --backfill-null-diagnoses`) has no UI yet.
