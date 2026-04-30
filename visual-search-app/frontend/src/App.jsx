/**
 * App.jsx  (MODIFIED)
 * --------------------
 * Change from original:
 *   FilterPanel now receives currentQueryFile + currentQueryText props
 *   so it can fire a real /search/filter call with structured filters.
 *   The handleFilterRefine (text re-query) is kept as fallback for text-only queries.
 *
 * All other logic is unchanged.
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Search, Library, Github, Zap, History,
  SlidersHorizontal, ChevronRight, Camera, Blend, Type,
} from "lucide-react";

import { useSearch }          from "./hooks/useSearch";
import { useSearchHistory }   from "./components/SearchHistory";
import MultimodalSearch       from "./components/MultimodalSearch";
import TextSearch             from "./components/TextSearch";
import CameraCapture          from "./components/CameraCapture";
import FilterPanel            from "./components/FilterPanel";
import SearchResults          from "./components/SearchResults";
import StatsBar               from "./components/StatsBar";
import LibraryPanel           from "./components/LibraryPanel";
import SearchHistory          from "./components/SearchHistory";

const TOP_K_OPTIONS = [5, 10, 15, 20];

const TABS = [
  { id: "multimodal", label: "Visual",  icon: Blend,  tip: "Image + caption" },
  { id: "text",       label: "Text",    icon: Type,   tip: "Describe in words" },
  { id: "camera",     label: "Camera",  icon: Camera, tip: "Use webcam/phone" },
];

async function buildThumbnail(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas  = document.createElement("canvas");
      const scale   = Math.min(1, 80 / img.width);
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default function App() {
  const {
    state,
    handleUpload,
    handleImageSearch,
    handleTextSearch,
    handleMultimodalSearch,
    handleCameraSearch,
  } = useSearch();

  const { history, addEntry, clearHistory, deleteEntry } = useSearchHistory();

  const [topK,            setTopK]            = useState(10);
  const [activeTab,       setActiveTab]       = useState("multimodal");
  const [libraryOpen,     setLibraryOpen]     = useState(false);
  const [historyOpen,     setHistoryOpen]     = useState(false);
  const [filteredResults, setFilteredResults] = useState(null);

  const {
    results, isSearching, isUploading, uploadProgress,
    error, queryPreviewUrl, lastQueryType, lastTextQuery,
    lastCaption, totalIndexed,
    queryFile,   // ← the actual File object for the current query
  } = state;

  const displayResults = filteredResults ?? results;

  const recordHistory = useCallback(async (type, query, caption, file, data) => {
    if (!data) return;
    const topScore = data.results?.[0]?.similarity_pct ?? null;
    const thumb    = file ? await buildThumbnail(file) : null;
    addEntry({
      type,
      query:          query || null,
      caption:        caption || null,
      previewDataUrl: thumb,
      timestamp:      Date.now(),
      resultCount:    data.results?.length ?? 0,
      topScore,
    });
  }, [addEntry]);

  const onMultimodalSearch = useCallback(async (file, caption, imageWeight) => {
    setFilteredResults(null);
    const data = await handleMultimodalSearch(file, caption, imageWeight, topK);
    await recordHistory("multimodal", caption, caption, file, data);
  }, [handleMultimodalSearch, topK, recordHistory]);

  const onTextSearch = useCallback(async (query) => {
    setFilteredResults(null);
    const data = await handleTextSearch(query, topK);
    await recordHistory("text", query, null, null, data);
  }, [handleTextSearch, topK, recordHistory]);

  const onCameraCapture = useCallback(async (file) => {
    setFilteredResults(null);
    const data = await handleCameraSearch(file, topK);
    await recordHistory("camera", null, null, file, data);
  }, [handleCameraSearch, topK, recordHistory]);

  const onImageSearch = useCallback(async (file) => {
    setFilteredResults(null);
    const data = await handleImageSearch(file, topK);
    await recordHistory("image", null, null, file, data);
  }, [handleImageSearch, topK, recordHistory]);

  const handleReplay = useCallback((entry) => {
    setHistoryOpen(false);
    if (entry.type === "text" && entry.query) {
      onTextSearch(entry.query);
    }
    if (entry.type === "multimodal" || entry.type === "camera") {
      setActiveTab(entry.type === "camera" ? "camera" : "multimodal");
    }
  }, [onTextSearch]);

  // ── MODIFIED: filter panel now also receives the active query ─────────────
  const handleFilterSearchResult = useCallback((data) => {
    if (data?.results) setFilteredResults(data.results);
  }, []);

  const filterBadge = useMemo(() => {
    if (!filteredResults || !results.length) return null;
    if (filteredResults.length === results.length) return null;
    return `${filteredResults.length}/${results.length}`;
  }, [filteredResults, results]);

  const showFilters = results.length > 0 || isSearching;

  return (
    <div className="min-h-screen bg-surface text-slate-100 flex flex-col">

      {/* Header */}
      <header className="border-b border-slate-800 bg-surface-raised/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Search size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-100 tracking-tight">Visual Search</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             text-[10px] font-mono font-semibold border border-accent/30
                             bg-accent/10 text-accent">
              <Zap size={9} />
              CLIP + FAISS
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                         border border-slate-700 text-slate-400
                         hover:border-accent/50 hover:text-accent transition-colors"
            >
              <History size={14} />
              <span className="hidden sm:inline">History</span>
              {history.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-mono">
                  {history.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setLibraryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                         border border-slate-700 text-slate-300
                         hover:border-accent/60 hover:text-accent transition-colors"
            >
              <Library size={14} />
              <span className="hidden sm:inline">Library</span>
              {totalIndexed > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs font-mono">
                  {totalIndexed}
                </span>
              )}
            </button>

            <a href="https://github.com" target="_blank" rel="noopener noreferrer"
               className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
              <Github size={16} />
            </a>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="border-b border-slate-800/60 bg-surface-raised/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <StatsBar />
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Left sidebar */}
          <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4">

            {/* Tab switcher */}
            <div className="flex rounded-xl bg-surface-raised border border-slate-800 p-1 gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  title={TABS.find((t) => t.id === id)?.tip}
                  className={[
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg",
                    "text-xs font-medium transition-all duration-150",
                    activeTab === id ? "bg-accent text-white shadow-sm" : "text-slate-500 hover:text-slate-300",
                  ].join(" ")}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "multimodal" && (
              <div className="glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <Blend size={13} className="text-accent" />
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    Image + Caption
                  </h3>
                </div>
                <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
                  Drop a reference image, then describe what you want differently —
                  e.g. <span className="text-slate-500 italic">"like this but in red under ₹2000"</span>
                </p>
                <MultimodalSearch
                  onSearch={onMultimodalSearch}
                  onUpload={handleUpload}
                  isSearching={isSearching}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                />
              </div>
            )}

            {activeTab === "text" && (
              <div className="glass rounded-2xl p-4">
                <TextSearch onSearch={onTextSearch} isSearching={isSearching} />
              </div>
            )}

            {activeTab === "camera" && (
              <div className="glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <Camera size={13} className="text-accent" />
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Camera Search</h3>
                </div>
                <CameraCapture onCapture={onCameraCapture} onClose={() => setActiveTab("multimodal")} />
              </div>
            )}

            {/* ── FILTER PANEL — now passes query context ── */}
            {showFilters && (
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <SlidersHorizontal size={13} className="text-accent" />
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    Filter Results
                  </h3>
                  {filterBadge && (
                    <span className="ml-auto text-[10px] font-mono text-accent bg-accent/10
                                     border border-accent/30 px-1.5 py-0.5 rounded-full">
                      {filterBadge}
                    </span>
                  )}
                </div>
                <FilterPanel
                  results={results}
                  onFilterChange={setFilteredResults}
                  onSearchWithFilters={handleFilterSearchResult}
                  isSearching={isSearching}
                  currentQueryFile={queryFile || null}
                  currentQueryText={lastTextQuery || lastCaption || null}
                  topK={topK}
                />
              </div>
            )}

            {/* Top-K selector */}
            <div className="glass rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ChevronRight size={13} className="text-accent" />
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Results Count</h3>
              </div>
              <div className="flex gap-2">
                {TOP_K_OPTIONS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setTopK(k)}
                    className={[
                      "flex-1 py-1.5 rounded-lg text-sm font-mono font-medium transition-all",
                      topK === k ? "bg-accent text-white" : "bg-surface-high text-slate-500 hover:text-slate-300",
                    ].join(" ")}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-600">Top {topK} most similar images</p>
            </div>

            {/* How it works */}
            <div className="glass rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">How It Works</h3>
              <ol className="space-y-2 text-xs text-slate-500">
                {[
                  "CLIP encodes image+text into shared 512-dim space",
                  "Multimodal: weighted blend of both embeddings",
                  "FAISS finds nearest neighbours by cosine similarity",
                  "Ranker: 70% visual + 30% attribute match score",
                  "Filters: re-search backend with color/price/brand",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-slate-800 text-slate-500
                                     flex items-center justify-center text-[10px] font-mono">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* Results */}
          <section className="flex-1 min-w-0">
            <SearchResults
              results={displayResults}
              allResultsCount={results.length}
              isFiltered={filteredResults !== null && filteredResults.length !== results.length}
              isSearching={isSearching}
              queryType={lastQueryType}
              queryText={lastTextQuery}
              queryCaption={lastCaption}
              queryPreview={queryPreviewUrl}
              totalIndexed={totalIndexed}
              error={error}
            />
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap
                        items-center justify-between gap-2 text-xs text-slate-600">
          <span>Visual Search · CLIP + FAISS · Myntra Dataset</span>
          <span>Multimodal · Filters · Metadata · Ranking</span>
        </div>
      </footer>

      <LibraryPanel isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} />
      <SearchHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={history}
        onReplay={handleReplay}
        onClear={clearHistory}
        onDelete={deleteEntry}
      />
    </div>
  );
}
