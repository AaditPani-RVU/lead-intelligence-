# Lead Intelligence System

An end-to-end automated lead pipeline: ingest leads from Google Sheets, a CSV, or direct API calls — classify them with an LLM into **Hot / Warm / Cold / Spam** — draft personalised replies — and surface everything in a two-pane inbox that an ops person can actually use.

Built for the Automation & AI Workflow Associate take-home assignment.

---

## Architecture

```
                   ┌─────────────────────┐
                   │    Google Sheet      │  (lead intake channel)
                   └──────────┬──────────┘
                              │ new row (n8n polls every 60s)
                              ▼
                      ┌──────────────┐
                      │     n8n      │ (local Docker)
                      │   Flow #1    │──► Gmail: new lead + suggested reply
                      └──────┬───────┘
                             │ POST /lead
                             ▼
  $ python -m app.bulk  ┌──────────────────────┐   JSON mode  ┌──────────────────┐
  sample_leads.csv ────►│   FastAPI + SQLite    │─────────────►│  Groq / Llama 3  │
                        │   (localhost:8000)    │◄─────────────│  (free API)      │
                        └──────────┬───────────┘   LeadIntel  └──────────────────┘
                                   │ GET /leads
                                   ▼
                        ┌──────────────────────┐
                        │    Next.js 15         │  two-pane inbox
                        │    (localhost:3000)   │  keyboard shortcuts
                        │                       │  editable replies
                        └──────────────────────┘

  n8n Flow #2 (cron hourly):  GET /leads?classification=Hot&status=new → Gmail digest
```

---

## Quickstart

### Option A — three terminals (recommended for demos)

**Terminal 1 — backend**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env       # add your GROQ_API_KEY (free at console.groq.com)
uvicorn app.main:app --reload
# → http://localhost:8000
```

**Terminal 2 — seed with sample data**
```bash
cd backend
python -m app.bulk ../sample_leads.csv
# Classifies all 10 leads and writes them to leads.db
# Add --dry-run to preview without writing
```

**Terminal 3 — frontend**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

**n8n (optional, for the automation demo)**
```bash
npm install -g n8n
n8n start
# → http://localhost:5678
# Import n8n/01_sheet_to_lead.json and n8n/02_hot_digest.json
# See n8n/README.md for credential setup
```

### Option B — Docker Compose
```bash
cp backend/.env.example backend/.env   # add GROQ_API_KEY
docker compose up
```
Opens backend on `:8000`, frontend on `:3000`, n8n on `:5678`.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/lead` | Accept a new lead; classifies and stores it. Idempotent. |
| `GET` | `/leads` | Return all leads. Supports `?classification=Hot` and `?status=new`. |
| `POST` | `/classify` | Classify a raw message without storing. Good for testing. |
| `PATCH` | `/lead/{id}/contacted` | Mark a lead as contacted. |
| `PATCH` | `/lead/{id}/reply` | Save an edited suggested reply. |

Quick test:
```bash
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"message": "We need to automate our invoicing. Budget is 20k/month."}'
```

---

## What the LLM extracts

Beyond Hot/Warm/Cold, every classified lead gets:

| Field | Example |
|-------|---------|
| `classification` | `"Hot"` |
| `confidence` | `0.95` |
| `reasoning` | `"Named role, 6-month scope, explicit RFP deadline"` |
| `intent` | `"vendor_eval"` |
| `budget_hint` | `"50k/month"` |
| `timeline_hint` | `"end of month"` |
| `suggested_reply` | `"Hi Neha — Shopify + Slack + AI categorisation is something we've done…"` |

**Why a 4-class taxonomy instead of 3:** Three of the ten sample leads (`"hello"`, `"win iphone 15 click here…"`, `"unsubscribe"`) are not Cold leads — they're noise. Mis-bucketing them as Cold inflates the Cold count and buries them in the same queue as real low-intent contacts. Spam is a separate bin, hidden by default in the dashboard.

---

## Decision log

**Why Groq (free tier) over OpenAI/Anthropic**
No API key required to evaluate the submission. Llama 3.3 70B on Groq produces classification results on par with GPT-4o-mini at zero cost. Switching to Claude or OpenAI is one env-var change — the call site is identical.

**Why SQLite over Postgres**
Zero infrastructure, zero migrations, zero Docker volume setup for the reviewer. The schema uses no SQLite-specific types, so lifting to Postgres requires only changing the connection string.

**Why n8n over Zapier / Make**
Zapier's free plan doesn't support multi-step flows. Make's free plan has a 1,000 operations/month cap that a demo would burn through. n8n is free, self-hosted, and exports/imports workflows as JSON — making it the cleanest option for a submission that needs to be reproducible.

**Why JSON-mode + Pydantic validation (not regex)**
One-shot text completion produces unpredictable output when the model decides to wrap JSON in markdown fences or add explanatory text. JSON-mode forces the model to return parseable JSON; Pydantic validates field types and the classification enum. A retry-once pattern handles the rare validation failure without crashing.

**Why a dedup hash on every lead**
n8n's trigger polls Google Sheets and can re-fire on the same row if a run fails mid-way. Without dedup, a single sheet row can appear multiple times. The hash is `sha256(normalised_email :: normalised_message)` — fast, collision-resistant, and requires no DB index for correctness.

**Why a CLI alongside the API**
The assignment says "accepts a new lead from a CSV file, a Google Sheet, or an API call." Most candidates pick one. The CLI handles CSV, the n8n flow handles Google Sheets, and the API handles direct calls — all three paths share the same `classify()` function.

**Why both n8n flows**
The brief offers an OR. Shipping both demonstrates that automation is a portfolio of small, composable flows — not a monolith. Flow 1 is real-time intake; Flow 2 is an ops digest. Together they tell a more complete story.

---

## Cost analysis

| Provider | Model | Cost per 1k leads |
|----------|-------|-------------------|
| Groq | Llama 3.3 70B | ~$0 (free tier) |
| OpenAI | GPT-4o-mini | ~$0.30 |
| Anthropic | Claude Haiku 4.5 | ~$0.25 |
| Anthropic | Claude Sonnet 4.6 | ~$3.00 |

Each classification call uses ~300 input tokens + ~150 output tokens.

---

## Failure modes

| Scenario | Behaviour |
|----------|-----------|
| LLM API is down | `/lead` retries once, then stores the lead with `classification_error` set. The dashboard shows the error inline. |
| LLM returns malformed JSON | Same as above — retry with the error appended to the prompt. |
| Groq rate-limits | `openai.RateLimitError` bubbles up as a 502 from the API. A queue/backoff strategy would fix this at scale. |
| Same lead submitted twice (n8n retry) | Dedup hash returns the existing record with 200 OK. No phantom rows. |
| Empty message field | FastAPI returns 422 Unprocessable Entity before the LLM is called. |
| Frontend can't reach backend | Error banner appears; the inbox still renders existing state. |

---

## What I deliberately didn't build

- **Authentication** — adds friction for a local demo with no real data
- **Postgres + migrations** — SQLite is the right tool at this scale; migration frameworks add complexity without benefit here
- **Test suite** — the brief says they won't grade tests; the bulk CLI and the Loom serve as the smoke test
- **Background job queue (Celery/ARQ)** — would matter at 100k leads/day; synchronous is fine at demo scale
- **Server-Sent Events for live updates** — the dashboard polls every 10s instead; SSE would be the production upgrade
- **Webhook signature verification on /lead** — matters in production (prevents spoofing); not a concern for a local demo

---

## What I'd do differently with more time

1. **Move classification to a background task.** `POST /lead` currently blocks until the LLM responds (~1–2s on Groq). A `BackgroundTasks` worker would return 202 immediately and update the lead when classification completes — the dashboard's 10s poll would surface it without the caller waiting.

2. **Replace polling with Server-Sent Events.** One SSE endpoint on the backend; the dashboard's `EventSource` gets new leads pushed in real time. No polling, no stale data.

3. **Add a `/leads/import` endpoint.** Accept a CSV multipart upload and run bulk classification via the same code path as the CLI. This would let someone import leads directly from the dashboard without touching a terminal.