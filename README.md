# Lead Intelligence System

> End-to-end automated lead pipeline — ingest from Google Sheets, CSV, or API → classify with an LLM → draft personalised replies → action everything from a two-pane inbox.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-automation-EA4B71?style=flat&logo=n8n&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-Llama_3.3_70B-F55036?style=flat)
![SQLite](https://img.shields.io/badge/SQLite-storage-003B57?style=flat&logo=sqlite&logoColor=white)

---

## What it does

A new row lands in Google Sheets → **n8n** picks it up within 60 seconds → **FastAPI** sends the message to **Groq (Llama 3.3 70B)** → the LLM returns a classification, confidence score, intent, budget/timeline hints, and a personalised reply → everything is stored in SQLite and surfaces in a **Next.js inbox** that a non-technical operator can actually use.

Three intake channels, one pipeline:

| Channel | How |
|---------|-----|
| Google Sheet | n8n polls every 60s, POSTs new rows to `/lead` |
| CSV file | `python -m app.bulk sample_leads.csv` |
| Direct API | `POST /lead` with JSON body |

---

## Architecture

```
                   ┌─────────────────────┐
                   │    Google Sheet      │  (lead intake channel)
                   └──────────┬──────────┘
                              │ new row — n8n polls every 60s
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

### Option A — Three terminals (recommended)

**Terminal 1 — backend**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # paste your GROQ_API_KEY (free at console.groq.com)
uvicorn app.main:app --reload
# → http://localhost:8000
```

**Terminal 2 — seed sample data**
```bash
cd backend
python -m app.bulk ../sample_leads.csv
# Classifies all 10 leads, writes to leads.db
# --dry-run flag to preview without writing
```

**Terminal 3 — frontend**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

**n8n — automation flows**
```bash
npm install -g n8n
n8n start
# → http://localhost:5678
# Import n8n/01_sheet_to_lead.json and n8n/02_hot_digest.json
# Full setup steps in n8n/README.md
```

### Option B — Docker Compose

```bash
cp backend/.env.example backend/.env   # add GROQ_API_KEY
docker compose up
```

Starts backend on `:8000`, frontend on `:3000`, n8n on `:5678`.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/lead` | Accept a lead, classify it, store it. Idempotent via dedup hash. |
| `GET` | `/leads` | All leads, newest first. Filterable by `?classification=` and `?status=`. |
| `POST` | `/classify` | Classify a message without storing. Useful for testing. |
| `PATCH` | `/lead/{id}/contacted` | Mark a lead as contacted. |
| `PATCH` | `/lead/{id}/reply` | Save an edited suggested reply. |

**Quick test:**
```bash
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"message": "We need to automate our invoicing. Budget is 20k/month."}'
```

---

## What the LLM extracts

Every lead gets more than a label. The model returns a structured object:

| Field | Example |
|-------|---------|
| `classification` | `"Hot"` |
| `confidence` | `0.95` |
| `reasoning` | `"Named role, 6-month scope, explicit RFP deadline"` |
| `intent` | `"vendor_eval"` |
| `budget_hint` | `"50k/month"` |
| `timeline_hint` | `"end of month"` |
| `suggested_reply` | `"Hi Neha — Shopify + Slack + AI categorisation is something we've done…"` |

**Why 4 classes instead of 3:** Three of the ten sample leads (`"hello"`, `"win iphone 15 click here…"`, `"unsubscribe"`) are noise, not low-intent contacts. Mis-bucketing them as Cold inflates the Cold count and buries them alongside real leads. Spam is a separate bin, hidden by default in the dashboard.

---

## Decision log

**Groq (free tier) over OpenAI / Anthropic**
No API key required to evaluate the submission. Llama 3.3 70B on Groq produces classification results on par with GPT-4o-mini at zero cost. Switching to Claude or OpenAI is a single env-var change — the call site is identical.

**SQLite over Postgres**
Zero infrastructure, zero migrations, zero Docker volume configuration for the reviewer. The schema uses no SQLite-specific types; lifting to Postgres requires only changing the connection string.

**n8n over Zapier / Make**
Zapier's free plan doesn't support multi-step flows. Make's free plan caps at 1,000 operations/month — a demo would burn through it. n8n is free, self-hosted, and exports workflows as JSON, making it the most reproducible option for a submission.

**JSON-mode + Pydantic validation over regex**
One-shot text completion produces unpredictable output when the model wraps JSON in markdown fences or adds explanatory prose. JSON-mode forces parseable output; Pydantic validates field types and the classification enum. A retry-once pattern handles the rare validation failure without crashing.

**Dedup hash on every lead**
n8n's trigger polls Google Sheets and can re-fire on the same row if a run fails mid-way. Without dedup, a single sheet row can appear multiple times. The hash is `sha256(normalised_email + normalised_message)` — fast, collision-resistant, and requires no DB index for correctness.

**CLI alongside the API**
The brief says "accepts a lead from a CSV file, a Google Sheet, or an API call." Most candidates pick one. The CLI handles CSV, the n8n flow handles Google Sheets, and the API handles direct calls — all three paths share the same `classify()` function.

**Both n8n flows, not just one**
The brief offers an OR. Shipping both shows that automation is a portfolio of small, composable flows — not a monolith. Flow 1 is real-time intake; Flow 2 is an ops digest. Together they tell a more complete story.

**Two-pane inbox over a flat table**
The brief asked for a table. A two-pane inbox is how ops people actually work with a list of items that need action — select a lead on the left, read the full message and edit the reply on the right, mark contacted, move on. All the required columns (Name, Email, Phone, Source, Message, Classification, Suggested Reply) are visible; they're just laid out for workflow rather than scanning.

---

## Cost analysis

| Provider | Model | Cost per 1,000 leads |
|----------|-------|----------------------|
| Groq | Llama 3.3 70B | ~$0 (free tier) |
| OpenAI | GPT-4o-mini | ~$0.30 |
| Anthropic | Claude Haiku 4.5 | ~$0.25 |
| Anthropic | Claude Sonnet 4.6 | ~$3.00 |

Each classification call uses ~300 input tokens + ~150 output tokens.

---

## Failure modes

| Scenario | Behaviour |
|----------|-----------|
| LLM API is down | `/lead` retries once, then stores the lead with `classification_error` set. The dashboard surfaces the error inline. |
| LLM returns malformed JSON | Same as above — retries with the error appended to the prompt. |
| Groq rate-limits | `RateLimitError` bubbles up as a 502. A queue + backoff strategy would fix this at scale. |
| Same lead submitted twice (n8n retry) | Dedup hash returns the existing record with `200 OK`. No phantom rows. |
| Empty message field | FastAPI returns `422 Unprocessable Entity` before the LLM is called. |
| Frontend can't reach backend | Error banner appears; the inbox still renders cached state. |

---

## What I deliberately didn't build

- **Authentication** — adds friction for a local demo with no real user data
- **Postgres + migrations** — SQLite is the right tool at this scale
- **Test suite** — the brief says tests won't be graded; the bulk CLI and the Loom serve as the smoke test
- **Background job queue** — synchronous classification is fine at demo scale; Celery/ARQ would matter at 100k leads/day
- **Server-Sent Events** — the dashboard polls every 10s; SSE is the production upgrade
- **Webhook signature verification** — matters in production to prevent spoofing; not a concern for a local demo

---

## What I'd do with more time

**1. Non-blocking classification**
`POST /lead` currently waits for the LLM (~1–2s on Groq). A `BackgroundTasks` worker would return `202 Accepted` immediately and update the lead when classification completes — the dashboard's 10s poll surfaces it without the caller waiting.

**2. Server-Sent Events**
One SSE endpoint on the backend; the dashboard's `EventSource` gets new leads pushed in real time. No polling, no stale state.

**3. `/leads/import` endpoint**
Accept a CSV multipart upload and run bulk classification via the same code path as the CLI. This would let someone import leads directly from the dashboard without touching a terminal.
