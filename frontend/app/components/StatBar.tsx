"use client";
import { Lead } from "../lib/api";

type Filter = "All" | "Hot" | "Warm" | "Cold" | "Spam";

interface Props {
  leads: Lead[];
  showSpam: boolean;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
}

const CATEGORIES: { key: Filter; label: string; active: string; inactive: string }[] = [
  { key: "All",  label: "All",     active: "ring-2 ring-gray-400 bg-gray-200 text-gray-800",   inactive: "bg-gray-100 text-gray-600 hover:bg-gray-200"   },
  { key: "Hot",  label: "🔥 Hot",  active: "ring-2 ring-red-400 bg-red-100 text-red-800",      inactive: "bg-red-50 text-red-700 hover:bg-red-100"       },
  { key: "Warm", label: "🌤 Warm", active: "ring-2 ring-amber-400 bg-amber-100 text-amber-800", inactive: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { key: "Cold", label: "🧊 Cold", active: "ring-2 ring-blue-400 bg-blue-100 text-blue-800",   inactive: "bg-blue-50 text-blue-700 hover:bg-blue-100"    },
  { key: "Spam", label: "🚫 Spam", active: "ring-2 ring-gray-300 bg-gray-100 text-gray-600",   inactive: "bg-gray-50 text-gray-500 hover:bg-gray-100"    },
];

export default function StatBar({ leads, showSpam, filter, onFilterChange }: Props) {
  const counts: Record<string, number> = { Hot: 0, Warm: 0, Cold: 0, Spam: 0 };
  let pipelineValue = 0;

  leads.forEach((l) => {
    if (l.classification) counts[l.classification] = (counts[l.classification] || 0) + 1;
    if (l.budget_hint) {
      const match = l.budget_hint.match(/[\d,]+/);
      if (match) pipelineValue += parseInt(match[0].replace(/,/g, ""), 10);
    }
  });
  counts["All"] = leads.filter((l) => showSpam || l.classification !== "Spam").length;

  const visible = showSpam ? CATEGORIES : CATEGORIES.filter((c) => c.key !== "Spam");

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-2 flex-wrap">
      {visible.map(({ key, label, active, inactive }) => {
        const count = key === "All" ? counts["All"] : (counts[key] || 0);
        const isActive = filter === key;
        return (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all ${isActive ? active : inactive}`}
          >
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? "bg-white/60" : "bg-black/10"}`}>
              {count}
            </span>
          </button>
        );
      })}

      {pipelineValue > 0 && (
        <div className="ml-auto text-xs text-gray-500">
          Identified pipeline:{" "}
          <span className="font-semibold text-green-700">
            ₹{pipelineValue.toLocaleString()}/mo
          </span>
        </div>
      )}
    </div>
  );
}
