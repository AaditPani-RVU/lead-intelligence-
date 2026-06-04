"use client";
import { useState, useEffect } from "react";
import { Lead } from "../lib/api";
import ClassificationBadge from "./ClassificationBadge";

interface Props {
  lead: Lead | null;
  onMarkContacted: (id: number) => void;
  onUpdateReply: (id: number, reply: string) => void;
}

function MetaChip({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
        highlight
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      <span className="font-normal text-gray-400">{label}:</span>
      {value}
    </span>
  );
}

export default function LeadDetail({ lead, onMarkContacted, onUpdateReply }: Props) {
  const [editReply, setEditReply] = useState("");
  const [copied, setCopied] = useState(false);

  // Sync textarea when selected lead changes
  useEffect(() => {
    setEditReply(lead?.suggested_reply ?? "");
    setCopied(false);
  }, [lead?.id]);

  if (!lead) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm">Select a lead to view details</p>
        <p className="text-xs mt-2 text-gray-300">
          j / k to navigate&nbsp;&nbsp;·&nbsp;&nbsp;/ to search&nbsp;&nbsp;·&nbsp;&nbsp;c to mark contacted
        </p>
      </div>
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(editReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReplyBlur() {
    if (editReply !== (lead?.suggested_reply ?? "")) {
      onUpdateReply(lead!.id, editReply);
    }
  }

  const isSpam = lead.classification === "Spam";

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Top bar */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{lead.name}</h2>
          <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-3">
            <a href={`mailto:${lead.email}`} className="hover:underline hover:text-blue-600">
              {lead.email}
            </a>
            {lead.phone && <span className="text-gray-400">{lead.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ClassificationBadge
            classification={lead.classification}
            reasoning={lead.reasoning}
            size="lg"
          />
          {lead.status === "contacted" ? (
            <span className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-full font-medium">
              ✓ Contacted
            </span>
          ) : (
            <button
              onClick={() => onMarkContacted(lead.id)}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full font-medium transition-colors"
            >
              Mark Contacted
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Metadata chips */}
        <div className="flex flex-wrap gap-2">
          <MetaChip label="source" value={lead.source} />
          {lead.intent && (
            <MetaChip label="intent" value={lead.intent.replace(/_/g, " ")} />
          )}
          {lead.budget_hint && (
            <MetaChip label="budget" value={lead.budget_hint} highlight />
          )}
          {lead.timeline_hint && (
            <MetaChip label="timeline" value={lead.timeline_hint} highlight />
          )}
          {lead.confidence != null && (
            <MetaChip
              label="confidence"
              value={`${Math.round(lead.confidence * 100)}%`}
            />
          )}
        </div>

        {/* Reasoning (if present) */}
        {lead.reasoning && (
          <div className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">
            {lead.reasoning}
          </div>
        )}

        {/* Full message */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Message
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {lead.message}
          </div>
        </div>

        {/* Suggested reply */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Suggested Reply
            </h3>
            {!isSpam && !lead.classification_error && (
              <button
                onClick={handleCopy}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            )}
          </div>

          {isSpam ? (
            <p className="text-sm text-gray-400 italic">No reply needed for spam.</p>
          ) : lead.classification_error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              <span className="font-medium">Classification error:</span>{" "}
              {lead.classification_error}
            </div>
          ) : (
            <textarea
              value={editReply}
              onChange={(e) => setEditReply(e.target.value)}
              onBlur={handleReplyBlur}
              rows={4}
              placeholder="No reply drafted yet"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          )}
          {!isSpam && !lead.classification_error && (
            <p className="text-xs text-gray-400 mt-1">
              Edit above, then click away to save.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
