export interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  classification: string | null;
  confidence: number | null;
  reasoning: string | null;
  intent: string | null;
  budget_hint: string | null;
  timeline_hint: string | null;
  suggested_reply: string | null;
  status: string;
  classification_error: string | null;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch(`${API}/leads`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch leads: ${res.status}`);
  return res.json();
}

export async function markContacted(id: number): Promise<void> {
  await fetch(`${API}/lead/${id}/contacted`, { method: "PATCH" });
}

export async function updateReply(id: number, suggested_reply: string): Promise<void> {
  await fetch(`${API}/lead/${id}/reply`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggested_reply }),
  });
}
