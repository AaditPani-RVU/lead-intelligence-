from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .db import get_conn, init_db
from .dedup import lead_hash
from .llm import classify
from .schemas import LeadIn, LeadIntel


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Lead Intelligence API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/lead", status_code=201)
async def create_lead(lead: LeadIn):
    """Accept a new lead, classify it with the LLM, and store it.

    Idempotent: if the same (email, message) combination was already processed,
    returns the existing record instead of creating a duplicate.
    """
    dedup = lead_hash(lead.email, lead.message)

    # Return existing record if we've seen this lead before (handles n8n retries)
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT * FROM leads WHERE dedup_hash = ?", (dedup,)
        ).fetchone()
    if existing:
        return dict(existing)

    intel: Optional[LeadIntel] = None
    classification_error: Optional[str] = None
    try:
        intel = await classify(lead.message)
    except ValueError as exc:
        # Store the lead even if classification fails — surface the error in the dashboard
        classification_error = str(exc)

    with get_conn() as conn:
        cursor = conn.execute(
            """INSERT INTO leads
               (name, email, phone, message, source,
                classification, confidence, reasoning, intent,
                budget_hint, timeline_hint, suggested_reply,
                dedup_hash, classification_error)
               VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?)""",
            (
                lead.name, lead.email, lead.phone, lead.message, lead.source,
                intel.classification if intel else None,
                intel.confidence    if intel else None,
                intel.reasoning     if intel else None,
                intel.intent        if intel else None,
                intel.budget_hint   if intel else None,
                intel.timeline_hint if intel else None,
                intel.suggested_reply if intel else None,
                dedup,
                classification_error,
            ),
        )
        row = conn.execute(
            "SELECT * FROM leads WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()

    return dict(row)


@app.get("/leads")
def get_leads(
    classification: Optional[str] = Query(None, description="Filter by Hot / Warm / Cold / Spam"),
    status: Optional[str] = Query(None, description="Filter by new / contacted"),
):
    """Return all leads, newest first. Supports ?classification= and ?status= filters."""
    query = "SELECT * FROM leads"
    conditions, params = [], []

    if classification:
        conditions.append("classification = ?")
        params.append(classification)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at DESC"

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@app.post("/classify")
async def classify_message(body: dict):
    """Classify a raw message string without storing a lead. Useful for testing."""
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=422, detail="'message' field is required")
    try:
        intel = await classify(message)
        return intel.model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.patch("/lead/{lead_id}/contacted")
def mark_contacted(lead_id: int):
    """Mark a lead as contacted."""
    with get_conn() as conn:
        result = conn.execute(
            "UPDATE leads SET status = 'contacted' WHERE id = ?", (lead_id,)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lead not found")
    return {"id": lead_id, "status": "contacted"}


@app.patch("/lead/{lead_id}/reply")
async def update_reply(lead_id: int, body: dict):
    """Save an edited suggested reply from the dashboard."""
    new_reply = body.get("suggested_reply", "")
    with get_conn() as conn:
        result = conn.execute(
            "UPDATE leads SET suggested_reply = ? WHERE id = ?", (new_reply, lead_id)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lead not found")
    return {"id": lead_id, "suggested_reply": new_reply}
