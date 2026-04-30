/**
 * SearchResults.jsx
 * -----------------
 * Renders the results grid. Supports all query types:
 *   image · text · multimodal · camera
 * Also shows filter badge when results are narrowed.
 *
 * Props:
 *   results            Array<{filename, url, score, similarity_pct}>
 *   allResultsCount    number — total before client-side filtering
 *   isFiltered         boolean — true when a filter is active
 *   isSearching        boolean
 *   queryType          "image" | "text" | "multimodal" | "camera" | null
 *   queryText          string
 *   queryCaption       string (multimodal caption modifier)
 *   queryPreview       string | null
 *   totalIndexed       number
 *   error              string | null
 */

import React from "react";
import { Layers, SearchX, Info, Loader2, Blend, Camera, Type, Search } from "lucide-react";
import ImageCard from "./ImageCard";

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard({ delay = 0 }) {
  return (
    <div
      className="rounded-2xl overflow-hidden bg-surface-raised border border-slate-800"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="aspect-square skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-4 skeleton w-3/4 rounded" />
        <div className="h-1.5 skeleton w-full rounded-full" />
        <div className="h-3 skeleton w-1/2 rounded" />
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ queryType, totalIndexed }) {
  if (totalIndexed === 0) {
    return (
      <div className="col-span-full flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
          <Layers size={28} className="text-slate-600" />
        </div>
        <div>
          <p className="font-semibold text-slate-300">Library is empty</p>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            Upload images via <strong className="text-slate-400">"Add to Library"</strong> or run{" "}
            <code className="text-accent font-mono text-xs">python seed_images.py</code>.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="col-span-full flex flex-col items-center gap-4 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
        <SearchX size={28} className="text-slate-600" />
      </div>
      <div>
        <p className="font-semibold text-slate-300">No results found</p>
        <p className="text-sm text-slate-500 mt-1">
          Try a different query, adjust filters, or add more images to the library.
        </p>
      </div>
    </div>
  );
}

// ── Query type badge config ────────────────────────────────────────────────────
const TYPE_META = {
  text:       { label: "Text query",       cls: "border-violet-500/40 text-violet-400 bg-violet-500/10",  icon: Type },
  image:      { label: "Image query",      cls: "border-cyan-500/40 text-cyan-400 bg-cyan-500/10",         icon: Search },
  multimodal: { label: "Multimodal",       cls: "border-amber-500/40 text-amber-400 bg-amber-500/10",      icon: Blend },
  camera:     { label: "Camera capture",   cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10", icon: Camera },
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function SearchResults({
  results,
  allResultsCount,
  isFiltered,
  isSearching,
  queryType,
  queryText,
  queryCaption,
  queryPreview,
  totalIndexed,
  error,
}) {
  const hasResults = results && results.length > 0;
  const meta = queryType ? TYPE_META[queryType] : null;

  return (
    <div className="w-full space-y-4">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-300">
            {isSearching ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-accent" />
                Searching…
              </span>
            ) : hasResults ? (
              <>
                {isFiltered
                  ? `${results.length} of ${allResultsCount} result${allResultsCount !== 1 ? "s" : ""}`
                  : `${results.length} result${results.length !== 1 ? "s" : ""}`
                }
              </>
            ) : queryType ? "No results" : "Results"}
          </h2>

          {/* Query type badge */}
          {meta && !isSearching && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
              <meta.icon size={10} />
              {meta.label}
            </span>
          )}

          {/* Filter active badge */}
          {isFiltered && !isSearching && (
            <span className="px-2 py-0.5 rounded-full text-xs border border-accent/40 text-accent bg-accent/10">
              filtered
            </span>
          )}
        </div>

        {totalIndexed > 0 && (
          <span className="text-xs text-slate-600 font-mono">
            {totalIndexed} image{totalIndexed !== 1 ? "s" : ""} indexed
          </span>
        )}
      </div>

      {/* ── Query info banner ── */}
      {!isSearching && queryType === "text" && queryText && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Info size={13} className="text-violet-400 mt-0.5 shrink-0" />
          <p className="text-xs text-violet-300">
            Searching for: <span className="font-semibold">"{queryText}"</span>
          </p>
        </div>
      )}

      {!isSearching && queryType === "multimodal" && (queryPreview || queryCaption) && (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          {queryPreview && (
            <img
              src={queryPreview}
              alt="Query"
              className="w-10 h-10 rounded-lg object-cover shrink-0 border border-amber-500/20"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
              <Blend size={11} /> Multimodal query
            </p>
            {queryCaption && (
              <p className="text-xs text-amber-300/80 mt-0.5 italic">"{queryCaption}"</p>
            )}
          </div>
        </div>
      )}

      {!isSearching && queryType === "camera" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Camera size={13} className="text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300">Searching with camera capture</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !isSearching && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {isSearching ? (
          Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} delay={i * 50} />
          ))
        ) : hasResults ? (
          results.map((result, i) => (
            <ImageCard key={`${result.filename}-${i}`} result={result} rank={i + 1} />
          ))
        ) : (
          queryType && (
            <EmptyState queryType={queryType} totalIndexed={totalIndexed} />
          )
        )}
      </div>

      {/* ── Idle state ── */}
      {!queryType && !isSearching && !error && (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-slate-600">
          <div className="w-24 h-24 rounded-3xl bg-surface-raised border border-slate-800 flex items-center justify-center">
            <span className="text-4xl">🔍</span>
          </div>
          <div>
            <p className="font-semibold text-slate-400">No search yet</p>
            <p className="text-sm mt-1 max-w-xs">
              Drop an image with a caption, type a description, or use the camera to start searching.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
