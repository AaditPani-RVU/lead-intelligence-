import hashlib
import re


def lead_hash(email: str, message: str) -> str:
    """Stable dedup key: sha256(lowercase-email :: whitespace-normalised message).

    Ensures that n8n retries or duplicate sheet rows don't create phantom leads.
    """
    normalised = re.sub(r"\s+", " ", message.strip().lower())
    key = f"{email.strip().lower()}::{normalised}"
    return hashlib.sha256(key.encode()).hexdigest()
