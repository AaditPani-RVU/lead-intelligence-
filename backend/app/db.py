import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.getenv("DB_PATH", "leads.db")

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS leads (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    email               TEXT    NOT NULL,
    phone               TEXT    DEFAULT '',
    message             TEXT    NOT NULL,
    source              TEXT    NOT NULL,
    classification      TEXT,
    confidence          REAL,
    reasoning           TEXT,
    intent              TEXT,
    budget_hint         TEXT,
    timeline_hint       TEXT,
    suggested_reply     TEXT,
    status              TEXT    NOT NULL DEFAULT 'new',
    dedup_hash          TEXT    UNIQUE,
    classification_error TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


@contextmanager
def get_conn():
    """Yield a SQLite connection that auto-commits on success and rolls back on error."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(_CREATE_TABLE)
