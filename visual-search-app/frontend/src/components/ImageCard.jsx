/**
 * ImageCard.jsx  (MODIFIED)
 * --------------------------
 * Changes from original:
 *   - Shows product metadata: price, color, brand, category (if available)
 *   - Displays combined final_score + attr_score alongside similarity_pct
 *   - Lightbox now includes full product metadata panel
 *   - All metadata fields are optional — gracefully hidden if null
 */

import React, { useState } from "react";
import { X, ExternalLink, Award, Tag, Palette, IndianRupee, ShoppingBag } from "lucide-react";

function scoreColour(pct) {
  if (pct >= 75) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (pct >= 55) return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  return "text-slate-400 border-slate-600/40 bg-slate-700/20";
}

function scoreLabel(pct) {
  if (pct >= 80) return "Excellent";
  if (pct >= 65) return "Good";
  if (pct >= 50) return "Fair";
  return "Low";
}

// ── Metadata pill ─────────────────────────────────────────────────────────────
function MetaPill({ icon: Icon, value, className = "" }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5
                      rounded-md bg-slate-800 text-slate-400 border border-slate-700
                      truncate max-w-full ${className}`}>
      <Icon size={9} className="shrink-0" />
      {value}
    </span>
  );
}

export default function ImageCard({ result, rank }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError,     setImgError]     = useState(false);
  const [imgLoaded,    setImgLoaded]    = useState(false);

  const {
    url, filename, score, similarity_pct, final_score, attr_score,
    price, color, category, brand, id,
  } = result;

  const colourClass  = scoreColour(similarity_pct);
  const staggerClass = rank <= 10 ? `stagger-${rank}` : "";
  const hasMetadata  = price != null || color || brand || category;

  return (
    <>
      {/* ── Card ── */}
      <div
        className={[
          "group relative rounded-2xl overflow-hidden bg-surface-raised border border-slate-800",
          "hover:border-accent/40 transition-all duration-300 cursor-pointer",
          "fade-in", staggerClass,
          "hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/10",
        ].join(" ")}
        onClick={() => setLightboxOpen(true)}
        role="button"
        aria-label={`Open ${filename}`}
      >
        {/* ── Image ── */}
        <div className="aspect-square relative overflow-hidden bg-surface">
          {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}

          <div className="absolute top-2 left-2 z-10">
            <span className="px-1.5 py-0.5 rounded-md text-xs font-mono font-semibold bg-slate-900/80 text-slate-400">
              #{rank}
            </span>
          </div>

          {rank === 1 && (
            <div className="absolute top-2 right-2 z-10">
              <Award size={18} className="text-amber-400 drop-shadow-md" />
            </div>
          )}

          {/* Price badge — shown on image if available */}
          {price != null && (
            <div className="absolute bottom-2 right-2 z-10">
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold
                               bg-slate-900/90 text-emerald-400 border border-emerald-500/30">
                ₹{price.toLocaleString()}
              </span>
            </div>
          )}

          {imgError ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm">
              Failed to load
            </div>
          ) : (
            <img
              src={url}
              alt={filename}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={[
                "w-full h-full object-cover transition-all duration-500",
                imgLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
                "group-hover:scale-105",
              ].join(" ")}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent
                          opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>

        {/* ── Card footer ── */}
        <div className="p-3 space-y-2">
          {/* Score row */}
          <div className="flex items-center justify-between">
            <span className={[
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold border",
              colourClass,
            ].join(" ")}>
              {similarity_pct.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-600">{scoreLabel(similarity_pct)}</span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${similarity_pct}%`,
                background:
                  similarity_pct >= 75 ? "linear-gradient(90deg,#22c55e,#4ade80)"
                  : similarity_pct >= 55 ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                  : "linear-gradient(90deg,#6366f1,#818cf8)",
              }}
            />
          </div>

          {/* Metadata pills */}
          {hasMetadata && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              <MetaPill icon={Palette}      value={color}    />
              <MetaPill icon={Tag}          value={category} />
              <MetaPill icon={ShoppingBag}  value={brand}    />
            </div>
          )}

          {/* Filename fallback */}
          {!hasMetadata && (
            <p className="text-xs text-slate-600 font-mono truncate" title={filename}>
              {filename}
            </p>
          )}
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] w-full rounded-2xl overflow-hidden glass border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>

            <img src={url} alt={filename} className="w-full max-h-[65vh] object-contain" />

            {/* Footer with metadata */}
            <div className="px-4 py-3 bg-surface-raised border-t border-slate-800 space-y-2">
              {/* Product info row */}
              {hasMetadata && (
                <div className="flex flex-wrap gap-3 text-sm">
                  {price != null && (
                    <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <IndianRupee size={14} />
                      {price.toLocaleString()}
                    </div>
                  )}
                  {brand && (
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <ShoppingBag size={14} className="text-slate-500" />
                      {brand}
                    </div>
                  )}
                  {category && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Tag size={14} className="text-slate-500" />
                      {category}
                    </div>
                  )}
                  {color && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Palette size={14} className="text-slate-500" />
                      {color}
                    </div>
                  )}
                </div>
              )}

              {/* Score row */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-500 font-mono">{id || filename}</p>
                  <p className="text-sm font-semibold">
                    Visual:{" "}
                    <span className={colourClass.split(" ")[0]}>
                      {similarity_pct.toFixed(1)}%
                    </span>
                    {attr_score != null && (
                      <span className="text-slate-500 text-xs ml-2 font-mono">
                        · attr: {(attr_score * 100).toFixed(0)}%
                      </span>
                    )}
                    {final_score != null && (
                      <span className="text-slate-500 text-xs ml-2 font-mono">
                        · final: {(final_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </p>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                             bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                >
                  <ExternalLink size={12} />
                  Open
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
