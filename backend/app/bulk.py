"""
CLI for bulk-importing leads from a CSV file.

Usage:
    python -m app.bulk sample_leads.csv
    python -m app.bulk sample_leads.csv --dry-run   # preview without writing
"""

import asyncio
import csv
import sys
from pathlib import Path

from .db import get_conn, init_db
from .dedup import lead_hash
from .llm import classify
from .schemas import LeadIn, LeadIntel


async def _process_row(row: dict) -> tuple[LeadIn, LeadIntel | None, str | None]:
    lead = LeadIn(
        name=row["name"],
        email=row["email"],
        phone=row.get("phone", ""),
        message=row["message"],
        source=row["source"],
    )
    try:
        intel = await classify(lead.message)
        return lead, intel, None
    except ValueError as exc:
        return lead, None, str(exc)


async def main(csv_path: str, dry_run: bool) -> None:
    path = Path(csv_path)
    if not path.exists():
        print(f"Error: file not found — {csv_path}")
        sys.exit(1)

    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if not dry_run:
        init_db()

    mode_tag = "[DRY RUN] " if dry_run else ""
    print(f"\n{mode_tag}Processing {len(rows)} leads from {csv_path} ...\n")
    print(f"{'Name':<22} {'Class':<8} {'Conf':>5}  {'Budget':<16} {'Timeline':<20} {'Intent'}")
    print("─" * 90)

    counts: dict[str, int] = {"Hot": 0, "Warm": 0, "Cold": 0, "Spam": 0, "Error": 0}
    tasks = [_process_row(row) for row in rows]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for lead, intel, error in results:  # type: ignore[misc]
        if isinstance(lead, Exception):
            print(f"  UNEXPECTED ERROR: {lead}")
            counts["Error"] += 1
            continue

        if intel:
            cls = intel.classification
            print(
                f"{lead.name:<22} {cls:<8} {intel.confidence:>4.0%}  "
                f"{(intel.budget_hint or '—'):<16} "
                f"{(intel.timeline_hint or '—'):<20} "
                f"{intel.intent}"
            )
            counts[cls] = counts.get(cls, 0) + 1
        else:
            print(f"{lead.name:<22} ERROR    —     {error}")
            counts["Error"] += 1

        if not dry_run and intel:
            dedup = lead_hash(lead.email, lead.message)
            with get_conn() as conn:
                exists = conn.execute(
                    "SELECT id FROM leads WHERE dedup_hash = ?", (dedup,)
                ).fetchone()
                if not exists:
                    conn.execute(
                        """INSERT INTO leads
                           (name, email, phone, message, source,
                            classification, confidence, reasoning, intent,
                            budget_hint, timeline_hint, suggested_reply,
                            dedup_hash, classification_error)
                           VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?)""",
                        (
                            lead.name, lead.email, lead.phone, lead.message, lead.source,
                            intel.classification, intel.confidence, intel.reasoning, intel.intent,
                            intel.budget_hint, intel.timeline_hint, intel.suggested_reply,
                            dedup, None,
                        ),
                    )

    print("─" * 90)
    summary = "  ".join(f"{k}: {v}" for k, v in counts.items() if v > 0)
    print(f"\n{summary}")
    if dry_run:
        print("Dry run — nothing written to the database.")
    else:
        print("Done. Run `uvicorn app.main:app --reload` to start the API.")


if __name__ == "__main__":
    _dry_run = "--dry-run" in sys.argv
    _args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not _args:
        print("Usage: python -m app.bulk <path/to/leads.csv> [--dry-run]")
        sys.exit(1)
    asyncio.run(main(_args[0], _dry_run))
