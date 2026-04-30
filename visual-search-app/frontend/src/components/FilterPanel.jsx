/**
 * FilterPanel.jsx  (MODIFIED)
 * ----------------------------
 * Changes from original:
 *   1. Loads real colors/brands/price_range from /metadata/options on mount
 *   2. "Apply Filters" now calls /search/filter (structured) instead of appending text
 *   3. Client-side similarity threshold filter kept as-is
 *   4. Falls back to hardcoded options if metadata endpoint fails
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  SlidersHorizontal, X, ChevronDown, ChevronUp,
  Tag, Palette, BadgeDollarSign, Zap, Loader2,
} from "lucide-react";
import { getMetadataOptions, searchWithFilter } from "../api/searchApi";

// ── Fallback options (used if backend has no metadata) ───────────────────────
const FALLBACK_COLORS = [
  { label: "Red",    value: "Red",    hex: "#ef4444" },
  { label: "Blue",   value: "Blue",   hex: "#3b82f6" },
  { label: "Green",  value: "Green",  hex: "#22c55e" },
  { label: "Black",  value: "Black",  hex: "#1f2937" },
  { label: "White",  value: "White",  hex: "#f1f5f9" },
  { label: "Navy Blue", value: "Navy Blue", hex: "#1e3a5f" },
  { label: "Pink",   value: "Pink",   hex: "#ec4899" },
  { label: "Yellow", value: "Yellow", hex: "#eab308" },
  { label: "Brown",  value: "Brown",  hex: "#92400e" },
  { label: "Grey",   value: "Grey",   hex: "#6b7280" },
];

const COLOR_HEX_MAP = {
  red: "#ef4444", blue: "#3b82f6", green: "#22c55e", black: "#1f2937",
  white: "#f1f5f9", yellow: "#eab308", pink: "#ec4899", orange: "#f97316",
  purple: "#a855f7", brown: "#92400e", grey: "#6b7280", gray: "#6b7280",
  "navy blue": "#1e3a5f", beige: "#d4b896", olive: "#6b7c3c", teal: "#0d9488",
  maroon: "#7f1d1d", coral: "#fb7185", cream: "#fefce8", "sea green": "#2e8b57",
};

function colorToHex(name) {
  return COLOR_HEX_MAP[(name || "").toLowerCase()] || "#6b7280";
}

// ── Collapsible section ───────────────────────────────────────────────────────
function FilterSection({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-800 pb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-2 text-xs font-semibold
                   text-slate-400 uppercase tracking-widest hover:text-slate-300 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Icon size={11} className="text-accent" />
          {title}
        </div>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FilterPanel({
  results,
  onFilterChange,
  onSearchWithFilters,   // (filters) => void  — triggers a new backend search
  isSearching,
  currentQueryFile,      // File | null — the active query image (for image+filter)
  currentQueryText,      // string     — the active text query (for text+filter)
  topK = 10,
}) {
  // ── Dynamic options from backend ──────────────────────────────────────────
  const [colorOptions,  setColorOptions]  = useState(FALLBACK_COLORS);
  const [brandOptions,  setBrandOptions]  = useState([]);
  const [priceRange,    setPriceRange]    = useState({ min: 0, max: 10000 });
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  useEffect(() => {
    getMetadataOptions()
      .then((opts) => {
        if (opts.colors?.length) {
          setColorOptions(
            opts.colors.map((c) => ({ label: c, value: c, hex: colorToHex(c) }))
          );
        }
        if (opts.brands?.length) setBrandOptions(opts.brands);
        if (opts.price_range)   setPriceRange(opts.price_range);
        setOptionsLoaded(true);
      })
      .catch(() => {
        // Silently fall back to hardcoded options — metadata not loaded yet
        setOptionsLoaded(true);
      });
  }, []);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedColor,  setSelectedColor]  = useState(null);
  const [selectedBrand,  setSelectedBrand]  = useState(null);
  const [maxPrice,       setMaxPrice]       = useState(null);
  const [minScore,       setMinScore]       = useState(0);   // client-side similarity %
  const [isOpen,         setIsOpen]         = useState(false);
  const [isFiltering,    setIsFiltering]    = useState(false);

  // Dynamic price steps
  const priceSteps = buildPriceSteps(priceRange.min, priceRange.max);

  const activeCount =
    (selectedColor ? 1 : 0) +
    (selectedBrand ? 1 : 0) +
    (maxPrice     ? 1 : 0) +
    (minScore > 0 ? 1 : 0);

  // ── Client-side similarity filter (instant, no backend call) ─────────────
  useEffect(() => {
    if (!results?.length) return;
    const filtered = results.filter((r) => r.similarity_pct >= minScore);
    onFilterChange(filtered);
  }, [minScore, results]); // eslint-disable-line

  // ── Backend structured filter search ─────────────────────────────────────
  const handleApplyFilters = useCallback(async () => {
    if (!currentQueryFile && !currentQueryText) return;
    setIsFiltering(true);
    try {
      const data = await searchWithFilter({
        file:     currentQueryFile  || undefined,
        query:    currentQueryText  || undefined,
        color:    selectedColor     || undefined,
        brand:    selectedBrand     || undefined,
        maxPrice: maxPrice          || undefined,
        topK,
      });
      if (data?.results) {
        onFilterChange(data.results);
        if (onSearchWithFilters) onSearchWithFilters(data);
      }
    } catch (e) {
      console.error("Filter search failed:", e);
    } finally {
      setIsFiltering(false);
    }
  }, [currentQueryFile, currentQueryText, selectedColor, selectedBrand, maxPrice, topK, onFilterChange, onSearchWithFilters]);

  const clearAll = () => {
    setSelectedColor(null);
    setSelectedBrand(null);
    setMaxPrice(null);
    setMinScore(0);
    onFilterChange(results);
  };

  const hasStructuredFilters = selectedColor || selectedBrand || maxPrice;

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={[
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all",
          activeCount > 0
            ? "border-accent/60 text-accent bg-accent/10"
            : "border-slate-700 text-slate-400 hover:border-accent/50 hover:text-accent",
        ].join(" ")}
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-accent text-white text-xs font-mono">
            {activeCount}
          </span>
        )}
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300">Refine Results</h3>
            {activeCount > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={11} /> Clear all
              </button>
            )}
          </div>

          {/* ── Similarity threshold (client-side) ── */}
          <FilterSection title="Min Similarity" icon={Zap} defaultOpen>
            <div className="space-y-1">
              <input
                type="range" min="0" max="90" step="5" value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                <span>0%</span>
                <span className="text-accent">{minScore}%+ similarity</span>
                <span>90%</span>
              </div>
            </div>
          </FilterSection>

          {/* ── Color (from real dataset) ── */}
          <FilterSection title={`Color${optionsLoaded ? "" : " …"}`} icon={Palette}>
            <div className="flex flex-wrap gap-2">
              {colorOptions.slice(0, 20).map(({ label, value, hex }) => (
                <button
                  key={value}
                  onClick={() => setSelectedColor(selectedColor === value ? null : value)}
                  title={label}
                  className={[
                    "w-7 h-7 rounded-full border-2 transition-all",
                    selectedColor === value
                      ? "border-white scale-110 shadow-md"
                      : "border-transparent hover:border-slate-400",
                  ].join(" ")}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            {selectedColor && (
              <p className="text-[11px] text-accent mt-1.5">{selectedColor}</p>
            )}
          </FilterSection>

          {/* ── Price (dynamic steps) ── */}
          <FilterSection title="Price (₹)" icon={BadgeDollarSign}>
            <div className="flex flex-col gap-1.5">
              {priceSteps.map((step) => (
                <button
                  key={step.label}
                  onClick={() => setMaxPrice(maxPrice === step.max ? null : step.max)}
                  className={[
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-left transition-all",
                    maxPrice === step.max
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "bg-surface-high text-slate-400 hover:text-slate-200 border border-transparent",
                  ].join(" ")}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* ── Brand (from real dataset) ── */}
          {brandOptions.length > 0 && (
            <FilterSection title="Brand" icon={Tag} defaultOpen={false}>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {brandOptions.slice(0, 30).map((brand) => (
                  <label key={brand} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedBrand === brand}
                      onChange={() => setSelectedBrand(selectedBrand === brand ? null : brand)}
                      className="accent-indigo-500"
                    />
                    <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors truncate">
                      {brand}
                    </span>
                  </label>
                ))}
              </div>
            </FilterSection>
          )}

          {/* ── Apply to backend ── */}
          {hasStructuredFilters && (currentQueryFile || currentQueryText) && (
            <div className="pt-2 border-t border-slate-800">
              <p className="text-[11px] text-slate-500 mb-2">
                Re-search with filters applied server-side:
              </p>
              <div className="px-2 py-1.5 rounded-lg bg-surface text-[11px] text-slate-400 font-mono mb-2 break-words">
                {[
                  selectedColor && `color: ${selectedColor}`,
                  maxPrice      && `max ₹${maxPrice.toLocaleString()}`,
                  selectedBrand && `brand: ${selectedBrand}`,
                ].filter(Boolean).join(" · ")}
              </div>
              <button
                onClick={handleApplyFilters}
                disabled={isSearching || isFiltering}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl
                           bg-accent text-white text-xs font-medium hover:bg-accent-glow
                           disabled:opacity-50 transition-all"
              >
                {isFiltering
                  ? <><Loader2 size={12} className="animate-spin" /> Filtering…</>
                  : <><Zap size={12} /> Apply filters</>
                }
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper: build dynamic price steps from actual dataset range ───────────────
function buildPriceSteps(min, max) {
  if (max <= 1000) {
    return [
      { label: `Under ₹${Math.round(max * 0.25).toLocaleString()}`, max: Math.round(max * 0.25) },
      { label: `Under ₹${Math.round(max * 0.5).toLocaleString()}`,  max: Math.round(max * 0.5)  },
      { label: `Under ₹${Math.round(max * 0.75).toLocaleString()}`, max: Math.round(max * 0.75) },
      { label: "All prices", max: max },
    ];
  }
  // Fixed Myntra-appropriate tiers
  const steps = [500, 1000, 2000, 5000].filter((p) => p <= max);
  const result = steps.map((p) => ({ label: `Under ₹${p.toLocaleString()}`, max: p }));
  result.push({ label: "All prices", max: max });
  return result;
}
