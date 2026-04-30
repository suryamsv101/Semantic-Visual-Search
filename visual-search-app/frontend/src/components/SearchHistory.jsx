/**
 * SearchHistory.jsx
 * -----------------
 * Persists search history in localStorage. Displays previous queries
 * in a slide-in panel. Users can re-run any past search or clear history.
 *
 * Each history entry stores:
 *   { id, type, query/caption/previewDataUrl, timestamp, resultCount, topScore }
 *
 * Props:
 *   isOpen:         boolean
 *   onClose():      void
 *   onReplay(entry) — re-runs a past search
 *   currentEntry    — the latest search (added automatically)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  History, X, Trash2, Search, Type, Blend,
  Camera, RotateCcw, Clock, Star, ChevronRight,
} from "lucide-react";

const STORAGE_KEY = "vs_search_history";
const MAX_ENTRIES = 50;

// ── Persistence helpers ─────────────────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

// ── Icon for each query type ─────────────────────────────────────────────────
function TypeIcon({ type, size = 14 }) {
  const props = { size, className: "shrink-0" };
  switch (type) {
    case "text":        return <Type        {...props} className={props.className + " text-violet-400"} />;
    case "image":       return <Search      {...props} className={props.className + " text-cyan-400"} />;
    case "multimodal":  return <Blend       {...props} className={props.className + " text-amber-400"} />;
    case "camera":      return <Camera      {...props} className={props.className + " text-emerald-400"} />;
    default:            return <Search      {...props} className={props.className + " text-slate-400"} />;
  }
}

// ── Type badge label ─────────────────────────────────────────────────────────
const TYPE_LABELS = {
  text:       { label: "Text",       cls: "border-violet-500/40 text-violet-400 bg-violet-500/10" },
  image:      { label: "Image",      cls: "border-cyan-500/40 text-cyan-400 bg-cyan-500/10" },
  multimodal: { label: "Multimodal", cls: "border-amber-500/40 text-amber-400 bg-amber-500/10" },
  camera:     { label: "Camera",     cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" },
};

// ── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000)        return "just now";
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Single history row ───────────────────────────────────────────────────────
function HistoryRow({ entry, onReplay, onDelete }) {
  const meta = TYPE_LABELS[entry.type] || TYPE_LABELS.image;

  return (
    <div className="group flex items-start gap-3 px-3 py-2.5 rounded-xl
                    hover:bg-surface-high border border-transparent hover:border-slate-700/60
                    transition-all cursor-pointer"
         onClick={() => onReplay(entry)}
    >
      {/* Thumbnail or type icon */}
      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-surface flex items-center justify-center">
        {entry.previewDataUrl ? (
          <img
            src={entry.previewDataUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <TypeIcon type={entry.type} size={20} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${meta.cls}`}>
            {meta.label}
          </span>
          <span className="text-[10px] text-slate-600 font-mono flex items-center gap-0.5">
            <Clock size={9} />
            {relativeTime(entry.timestamp)}
          </span>
        </div>

        <p className="text-xs text-slate-300 truncate font-medium">
          {entry.query || entry.caption || "Image search"}
        </p>

        {entry.type === "multimodal" && entry.caption && (
          <p className="text-[11px] text-slate-500 truncate mt-0.5 italic">
            + "{entry.caption}"
          </p>
        )}

        <div className="flex items-center gap-2 mt-1">
          {entry.resultCount != null && (
            <span className="text-[10px] text-slate-600">
              {entry.resultCount} result{entry.resultCount !== 1 ? "s" : ""}
            </span>
          )}
          {entry.topScore != null && (
            <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
              <Star size={9} />
              {entry.topScore.toFixed(1)}% top
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onReplay(entry); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-accent hover:bg-accent/10 transition-colors"
          title="Re-run search"
        >
          <RotateCcw size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Hook for external use ────────────────────────────────────────────────────
export function useSearchHistory() {
  const [history, setHistory] = useState(loadHistory);

  const addEntry = useCallback((entry) => {
    setHistory((prev) => {
      const newEntry = { ...entry, id: `${Date.now()}_${Math.random()}` };
      const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const deleteEntry = useCallback((id) => {
    setHistory((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  return { history, addEntry, clearHistory, deleteEntry };
}

// ── Main panel component ─────────────────────────────────────────────────────
export default function SearchHistory({ isOpen, onClose, history, onReplay, onClear, onDelete }) {
  if (!isOpen) return null;

  // Group by date
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();

  const groups = history.reduce((acc, entry) => {
    const d = new Date(entry.timestamp).toDateString();
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : d;
    if (!acc[label]) acc[label] = [];
    acc[label].push(entry);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm h-full bg-surface-raised border-l border-slate-800
                   flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History size={16} className="text-accent" />
            <h2 className="font-semibold text-slate-200 text-sm">Search History</h2>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-xs font-mono">
              {history.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={onClear}
                className="text-xs text-slate-600 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-600">
              <History size={32} />
              <div>
                <p className="font-medium text-slate-500">No searches yet</p>
                <p className="text-xs mt-1">Your search history will appear here.</p>
              </div>
            </div>
          ) : (
            Object.entries(groups).map(([label, entries]) => (
              <div key={label} className="mb-4">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-1">
                  {label}
                </p>
                <div className="space-y-1">
                  {entries.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      entry={entry}
                      onReplay={onReplay}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-600">
          Click any entry to re-run that search · stored in localStorage
        </div>
      </div>
    </div>
  );
}
