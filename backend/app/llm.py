"""
Provider-agnostic LLM client for lead classification.

Defaults to Groq (free tier, Llama 3.3 70B). Switch providers via .env:
  LLM_PROVIDER=openai  OPENAI_API_KEY=...
  LLM_PROVIDER=gemini  GEMINI_API_KEY=...
  LLM_PROVIDER=groq    GROQ_API_KEY=...   (default)

To use Anthropic Claude instead, swap this file to use the `anthropic` SDK —
the schemas and call sites don't change.
"""

import json
import os

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import ValidationError

from .schemas import LeadIntel

load_dotenv()

_PROVIDER_CONFIG: dict[str, dict] = {
    "groq":   {"base_url": "https://api.groq.com/openai/v1",                             "key_env": "GROQ_API_KEY",   "default_model": "llama-3.3-70b-versatile"},
    "openai": {"base_url": None,                                                           "key_env": "OPENAI_API_KEY", "default_model": "gpt-4o-mini"},
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",    "key_env": "GEMINI_API_KEY", "default_model": "gemini-2.0-flash"},
}

_provider = os.getenv("LLM_PROVIDER", "groq").lower()
_cfg = _PROVIDER_CONFIG[_provider]
_api_key = os.getenv(_cfg["key_env"], "")
_model = os.getenv("LLM_MODEL") or _cfg["default_model"]

_client = AsyncOpenAI(
    api_key=_api_key,
    **({"base_url": _cfg["base_url"]} if _cfg["base_url"] else {}),
)

# 4-shot prompt calibrated against the actual sample_leads.csv
_SYSTEM_PROMPT = """\
You are a lead qualifier for an automation & AI agency that builds custom workflows, integrations, and AI-powered tools for businesses.

CLASSIFICATION RULES:
• Hot   — Clear buying intent: specific project described, budget or timeline mentioned, decision-maker or founder reaching out. Prioritise for same-day follow-up.
• Warm  — Genuine interest, not yet buying: exploring options, no budget/timeline, formal evaluation inquiries that could convert.
• Cold  — Low-signal real contact: vague greeting with no context, networking with no project, boilerplate brochure requests.
• Spam  — Not a real lead: promotional junk, unsubscribe requests, phishing links, pure noise. Do NOT draft a reply.

Return ONLY a JSON object with exactly these fields (no markdown, no explanation):
{
  "classification": "Hot" | "Warm" | "Cold" | "Spam",
  "confidence": 0.0–1.0,
  "reasoning": "one sentence explaining the classification decision",
  "intent": "automation_setup" | "vendor_eval" | "info_request" | "general_inquiry" | "referral" | "spam_or_noise",
  "budget_hint": "extracted budget string, or null",
  "timeline_hint": "extracted timeline string, or null",
  "suggested_reply": "1–2 sentence personalised reply (empty string for Spam)"
}

EXAMPLES:

Message: "Hi! Saw your post on LinkedIn — we need help automating our customer onboarding workflow. Can we hop on a call this week? Budget is around 50k/month for the right partner."
{"classification":"Hot","confidence":0.97,"reasoning":"Specific use case, explicit ₹50k/month budget, and a call request within the week.","intent":"automation_setup","budget_hint":"50k/month","timeline_hint":"this week","suggested_reply":"Hi Aarav — this is exactly the kind of onboarding automation we love to build. Let me send over a calendar link for this week and we can scope it out."}

Message: "is your service free or paid? just exploring options for now"
{"classification":"Warm","confidence":0.82,"reasoning":"Real interest but early-stage exploration with no project or budget stated.","intent":"info_request","budget_hint":null,"timeline_hint":null,"suggested_reply":"We're a paid service — project-based or retainer, depending on scope. Happy to share more once I know what kind of automation you're exploring. What's the use case?"}

Message: "win iphone 15 click here www.shadydeal.in"
{"classification":"Spam","confidence":0.99,"reasoning":"Promotional spam containing a suspicious external link.","intent":"spam_or_noise","budget_hint":null,"timeline_hint":null,"suggested_reply":""}

Message: "Hi, I'm the Ops Manager at a 200-person company. We're evaluating vendors for a 6-month engagement to streamline our internal ticketing and AI-assisted triage. Could you share case studies and a rough pricing range? Targeting RFP closure by mid-June."
{"classification":"Hot","confidence":0.95,"reasoning":"Named role (Ops Manager), 200-person company, 6-month scope, and explicit RFP deadline of mid-June.","intent":"vendor_eval","budget_hint":null,"timeline_hint":"RFP by mid-June","suggested_reply":"Hi Ananya — ticketing + AI triage is a core use case for us. I'll pull together a case study pack and rough pricing today. Would a 20-minute call this week work to discuss your requirements?"}
"""


async def classify(message: str) -> LeadIntel:
    """Classify a lead message and extract structured metadata.

    Retries once on validation failure, then raises ValueError so the caller
    can store the lead with a classification_error field rather than silently dropping it.
    """
    last_error: str | None = None

    for attempt in range(2):
        user_content = f"Lead message: {message}"
        if last_error:
            user_content += f"\n\n[Previous attempt failed validation — {last_error}. Fix and retry.]"

        try:
            response = await _client.chat.completions.create(
                model=_model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user",   "content": user_content},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=300,
            )
            raw = response.choices[0].message.content.strip()
            return LeadIntel.model_validate_json(raw)

        except (ValidationError, json.JSONDecodeError) as exc:
            last_error = str(exc)

    raise ValueError(f"LLM classification failed after 2 attempts: {last_error}")
