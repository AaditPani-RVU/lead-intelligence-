from pydantic import BaseModel, Field
from typing import Literal, Optional


class LeadIn(BaseModel):
    name: str
    email: str
    phone: str = ""
    message: str
    source: str


class LeadIntel(BaseModel):
    classification: Literal["Hot", "Warm", "Cold", "Spam"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    intent: str
    budget_hint: Optional[str] = None
    timeline_hint: Optional[str] = None
    suggested_reply: str
