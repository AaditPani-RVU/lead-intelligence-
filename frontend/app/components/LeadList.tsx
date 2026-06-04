"use client";
import { Lead } from "../lib/api";
import ClassificationBadge from "./ClassificationBadge";

const SOURCE_ICONS: Record<string, string> = {
  website_form: "🌐",
  whatsapp: "💬",
  email: "📧",
  google_sheet: "📊",
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  leads: Lead[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export default function LeadList({ leads, selectedId, onSelect }: Props) {
  if (leads.length === 0) {
    return (
      <div className="w-72 border-r border-gray-200 bg-white flex items-center justify-center text-gray-400 text-sm">
        No leads match this filter.
      </div>
    );
  }

  return (
    <div className="w-72 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
      {leads.map((lead) => {
        const isSelected = selectedId === lead.id;
        return (
          <button
            key={lead.id}
            onClick={() => onSelect(lead.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors
              ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-50"}
              ${lead.status === "contacted" ? "opacity-50" : ""}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-medium text-sm text-gray-900 truncate flex-1">{lead.name}</span>
              <ClassificationBadge
                classification={lead.classification}
                reasoning={lead.reasoning}
                size="sm"
              />
            </div>
            <p className="text-xs text-gray-500 truncate mb-1.5">{lead.message}</p>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span title={lead.source}>{SOURCE_ICONS[lead.source] ?? "?"}</span>
              <span className="truncate">{lead.source}</span>
              <span>·</span>
              <span className="shrink-0">{timeAgo(lead.created_at)}</span>
              {lead.status === "contacted" && (
                <span className="ml-auto text-green-600 font-medium shrink-0">✓</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
