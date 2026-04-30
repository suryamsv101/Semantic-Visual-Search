/**
 * MultimodalSearch.jsx
 * --------------------
 * Combines image upload + a text caption into one CLIP query.
 *
 * The user drops an image, then types a modifier like:
 *   "find something like this but in red and under ₹2000"
 * Both embeddings are blended (weighted average) before FAISS search.
 *
 * Props:
 *   onSearch(file, caption, imageWeight) — fires after user submits
 *   onUpload(file)                       — adds image to library
 *   isSearching: boolean
 *   isUploading: boolean
 *   uploadProgress: number
 */

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, ImagePlus, Search, X, CheckCircle2,
  Loader2, Blend, SlidersHorizontal, Camera,
} from "lucide-react";

const ACCEPTED = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png":  [".png"],
  "image/webp": [".webp"],
  "image/gif":  [".gif"],
  "image/bmp":  [".bmp"],
};

const CAPTION_EXAMPLES = [
  "but in red colour",
  "similar style but under ₹2000",
  "like this but for women",
  "same pattern in blue",
  "more formal version of this",
  "similar but with stripes",
];

export default function MultimodalSearch({
  onSearch,
  onUpload,
  isSearching,
  isUploading,
  uploadProgress,
}) {
  const [preview, setPreview]         = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [caption, setCaption]         = useState("");
  const [imageWeight, setImageWeight] = useState(0.6);
  const [uploadDone, setUploadDone]   = useState(false);
  const [showWeightSlider, setShowWeightSlider] = useState(false);

  const handleFileDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setSelectedFile(file);
    setUploadDone(false);
  }, [preview]);

  const handleClear = (e) => {
    e.stopPropagation();
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    setUploadDone(false);
  };

  const handleSearch = () => {
    if (!selectedFile) return;
    // If no caption — fall back to pure image search via the multimodal endpoint with weight=0.95
    const cap = caption.trim() || "visual similarity";
    const w   = caption.trim() ? imageWeight : 0.95;
    onSearch(selectedFile, cap, w);
  };

  const handleAddToLibrary = async (e) => {
    e.stopPropagation();
    if (!selectedFile) return;
    try {
      await onUpload(selectedFile);
      setUploadDone(true);
    } catch { /* surfaced by hook */ }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: isSearching || isUploading,
    noClick: !!preview,
  });

  const busy = isSearching || isUploading;
  const canSearch = !!selectedFile && !busy;

  // Weight labels
  const weightLabel = imageWeight >= 0.7
    ? "More visual"
    : imageWeight <= 0.4
    ? "More text"
    : "Balanced";

  return (
    <div className="space-y-3">
      {/* ── Drop zone ── */}
      <div
        {...getRootProps()}
        className={[
          "relative rounded-xl border-2 border-dashed transition-all duration-200",
          "min-h-[180px] flex flex-col items-center justify-center overflow-hidden",
          isDragActive
            ? "border-accent bg-accent/10"
            : preview
            ? "border-slate-700 bg-surface cursor-default"
            : "border-slate-700 bg-surface hover:border-accent/60 cursor-pointer",
          busy ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <input {...getInputProps()} />

        {preview ? (
          <div className="relative w-full h-full min-h-[180px]">
            <img
              src={preview}
              alt="Query"
              className="w-full h-full object-contain max-h-52 p-2"
            />
            <button
              onClick={handleClear}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 hover:bg-red-600 transition-colors"
            >
              <X size={14} />
            </button>
            {isSearching && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm rounded-xl">
                <div className="flex flex-col items-center gap-2 text-accent">
                  <Loader2 size={28} className="animate-spin" />
                  <span className="text-xs text-slate-300">Blending + searching…</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 text-center select-none">
            <div className={[
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
              isDragActive ? "bg-accent text-white scale-110" : "bg-slate-800 text-slate-400",
            ].join(" ")}>
              {isDragActive ? <ImagePlus size={22} /> : <Upload size={22} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {isDragActive ? "Drop to set as query" : "Drop reference image"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">JPG · PNG · WebP</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Caption input ── */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
          <Blend size={11} className="text-accent" />
          Modifier caption
        </label>
        <div className="relative">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={'e.g. "find something like this but in red and under ₹2000"'}
            rows={2}
            disabled={busy}
            className={[
              "w-full px-3 py-2.5 rounded-xl text-sm resize-none",
              "bg-surface border border-slate-700 text-slate-100",
              "placeholder:text-slate-600",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40",
              "transition-all",
              busy ? "opacity-60" : "",
            ].join(" ")}
          />
          {caption && (
            <button
              onClick={() => setCaption("")}
              className="absolute top-2 right-2 p-1 text-slate-600 hover:text-slate-400"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Example caption pills */}
        <div className="flex flex-wrap gap-1.5">
          {CAPTION_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setCaption(ex)}
              disabled={busy}
              className="px-2 py-0.5 rounded-full text-[11px] border border-slate-700
                         text-slate-500 hover:border-accent/50 hover:text-accent transition-all"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* ── Weight slider (collapsible) ── */}
      <div>
        <button
          onClick={() => setShowWeightSlider(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <SlidersHorizontal size={11} />
          Image vs text weight
          <span className="ml-1 text-accent">{weightLabel} ({Math.round(imageWeight * 100)}% image)</span>
        </button>

        {showWeightSlider && (
          <div className="mt-2 space-y-1">
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={imageWeight}
              onChange={(e) => setImageWeight(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
              <span>← More text</span>
              <span>More visual →</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex gap-2">
        <button
          onClick={handleSearch}
          disabled={!canSearch}
          className={[
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl",
            "text-sm font-medium transition-all",
            canSearch
              ? "bg-accent hover:bg-accent-glow text-white"
              : "bg-slate-800 text-slate-600 cursor-not-allowed",
          ].join(" ")}
        >
          {isSearching ? (
            <><Loader2 size={14} className="animate-spin" /> Searching…</>
          ) : caption.trim() ? (
            <><Blend size={14} /> Blend & Search</>
          ) : (
            <><Search size={14} /> Search</>
          )}
        </button>

        {selectedFile && (
          <button
            onClick={handleAddToLibrary}
            disabled={uploadDone || isUploading}
            className={[
              "px-3 py-2.5 rounded-xl text-sm border transition-all",
              uploadDone
                ? "border-success/40 text-success bg-success/10 cursor-default"
                : "border-slate-600 text-slate-400 hover:border-accent hover:text-accent",
            ].join(" ")}
            title="Add to library"
          >
            {isUploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : uploadDone ? (
              <CheckCircle2 size={14} />
            ) : (
              <ImagePlus size={14} />
            )}
          </button>
        )}
      </div>

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
