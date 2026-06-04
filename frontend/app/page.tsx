"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Lead, fetchLeads, markContacted, updateReply } from "./lib/api";
import StatBar from "./components/StatBar";
import LeadList from "./components/LeadList";
import LeadDetail from "./components/LeadDetail";

type Filter = "All" | "Hot" | "Warm" | "Cold" | "Spam";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [showSpam, setShowSpam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadLeads = useCallback(async () => {
    try {
      const data = await fetchLeads();
      setLeads(data);
      setError(null);
    } catch (e) {
      setError("Cannot reach the backend — is it running on :8000?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
    // Poll every 10 s so n8n-triggered leads appear without a manual refresh
    const interval = setInterval(loadLeads, 10_000);
    return () => clearInterval(interval);
  }, [loadLeads]);

  const visibleLeads = leads.filter((l) => {
    if (!showSpam && l.classification === "Spam") return false;
    if (filter !== "All" && l.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;
  const selectedIndex = visibleLeads.findIndex((l) => l.id === selectedId);

  // Keyboard navigation: j/k, c, /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const next = visibleLeads[selectedIndex + 1];
          if (next) setSelectedId(next.id);
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const prev = visibleLeads[selectedIndex - 1];
          if (prev) setSelectedId(prev.id);
          break;
        }
        case "c": {
          if (selectedLead && selectedLead.status !== "contacted") {
            handleMarkContacted(selectedLead.id);
          }
          break;
        }
        case "/": {
          e.preventDefault();
          searchRef.current?.focus();
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleLeads, selectedIndex, selectedLead]);

  async function handleMarkContacted(id: number) {
    await markContacted(id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: "contacted" } : l)));
  }

  async function handleUpdateReply(id: number, reply: string) {
    await updateReply(id, reply);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, suggested_reply: reply } : l)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <p className="text-gray-400 text-sm">Loading leads…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Lead Intelligence</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {leads.filter((l) => l.classification !== "Spam").length} leads
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSpam}
              onChange={(e) => {
                setShowSpam(e.target.checked);
                if (!e.target.checked && selectedLead?.classification === "Spam") {
                  setSelectedId(null);
                }
              }}
              className="rounded"
            />
            Show spam
          </label>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search… (press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Filter / stat bar */}
      <StatBar
        leads={leads}
        showSpam={showSpam}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* Two-pane inbox */}
      <div className="flex flex-1 overflow-hidden">
        <LeadList
          leads={visibleLeads}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <LeadDetail
          lead={selectedLead}
          onMarkContacted={handleMarkContacted}
          onUpdateReply={handleUpdateReply}
        />
      </div>
    </div>
  );
}
