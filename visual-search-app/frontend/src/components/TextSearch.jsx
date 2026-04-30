/**
 * TextSearch.jsx
 * --------------
 * A search bar that lets users describe what they're looking for in plain text.
 * CLIP maps text and images into the same embedding space, so typing
 * "sunset over mountains" retrieves visually matching images from the library.
 *
 * Props:
 *   onSearch(query: string)  — called when user submits a text query
 *   isSearching: boolean     — disables input while a search is in progress
 */

import React, { useState, useRef } from "react";
import { Search, Sparkles, X, Loader2 } from "lucide-react";

// Suggested example queries shown as pill buttons
const EXAMPLE_QUERIES = [
  "a dog running on grass",
  "city lights at night",
  "mountain lake reflection",
  "vintage red car",
  "coffee cup on a wooden table",
  "tropical beach with palm trees",
  "a cat sitting by a window",
  "forest path in autumn",
];

export default function TextSearch({ onSearch, isSearching }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!query.trim() || isSearching) return;
    onSearch(query.trim());
  };

  // ── Use a quick-pick example ───────────────────────────────────────────────
  const handleExample = (example) => {
    setQuery(example);
    onSearch(example);
  };

  // ── Clear the input ────────────────────────────────────────────────────────
  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className="w-full space-y-3">
      {/* ── Label ── */}
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Text-to-Image Search
        </span>
      </div>

      {/* ── Search bar ── */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <Search
            size={17}
            className="absolute left-3.5 text-slate-500 pointer-events-none"
          />

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe the image you're looking for…"
            disabled={isSearching}
            className={[
              "w-full pl-10 pr-24 py-3 rounded-xl text-sm",
              "bg-surface-raised border border-slate-700 text-slate-100",
              "placeholder:text-slate-600",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40",
              "transition-all duration-150",
              isSearching ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          />

          {/* Clear button */}
          {query && !isSearching && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-16 p-1 text-slate-600 hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className={[
              "absolute right-2 px-3 py-1.5 rounded-lg text-xs font-semibold",
              "transition-all duration-150",
              query.trim() && !isSearching
                ? "bg-accent text-white hover:bg-accent-glow"
                : "bg-slate-800 text-slate-600 cursor-not-allowed",
            ].join(" ")}
          >
            {isSearching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </form>

      {/* ── Example query pills ── */}
      <div>
        <p className="text-xs text-slate-600 mb-2">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex}
              onClick={() => handleExample(ex)}
              disabled={isSearching}
              className={[
                "px-3 py-1 rounded-full text-xs border transition-all duration-150",
                isSearching
                  ? "opacity-40 cursor-not-allowed border-slate-800 text-slate-600"
                  : "border-slate-700 text-slate-400 hover:border-accent/60 hover:text-accent",
              ].join(" ")}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
