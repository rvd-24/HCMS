# Prescript

Clinic web app for prescription intake, patient visit history and appointment scheduling.
Upload a photo of a case sheet → AI extracts it → a person reviews it → it's filed in the patient's
history, and the follow-up visit is booked and announced (calendar invite + email/WhatsApp/Slack,
with the full treatment-history PDF attached).

Two logins today: **Hospital admin** (everything) and **Doctor** (own schedule and patients).

## Run it

```bash
# backend (Python 3.14, uv)
uv sync
uv run prescript setup          # tables, logins, doctors, imports data/visits.json — prints the login password
uv run prescript seed-demo      # optional: synthetic DEMO- patients + appointments so every screen has data
uv run prescript serve --reload # http://127.0.0.1:8000

# frontend (Node 22)
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :8000)
```

For a single-process deployment, `npm run build` in `frontend/`; `prescript serve` then serves the built app too.

## Email safety

Email is **off** by default (`PRESCRIPT_EMAIL_ENABLED=false`): no emails and no Google Calendar invites
are sent. While `PRESCRIPT_EMAIL_REDIRECT` is set, every email goes to that address instead of real
patients/doctors/pharmacy. Admin → Settings shows the current mode.

## CLI (replaces the old scripts)

| Command | Was |
|---|---|
| `prescript ingest <image> [--extra-page …] [--schedule]` | `schedule_meet.py from-image` |
| `prescript book --patient-id … --date … --time …` | `schedule_meet.py manual` |
| `prescript process-folder [dir]` | `process_visits.py` |
| `prescript pharmacy --visit-id …` | `pharmacy_request.py` |
| `prescript google-auth` | first run of `google_services.py` |

The originals are kept untouched in `legacy/` for reference — safe to delete once you're happy.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for structure, user flows and how to add features.
