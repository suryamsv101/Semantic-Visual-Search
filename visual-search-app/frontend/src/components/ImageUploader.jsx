/**
 * ImageUploader.jsx
 * -----------------
 * Drag-and-drop (or click) file picker for uploading query images.
 *
 * Props:
 *   onSearch(file)   — called when the user picks a file (triggers image search)
 *   onUpload(file)   — called when user explicitly clicks "Add to Library"
 *   isSearching      — boolean; disables input while searching
 *   isUploading      — boolean; shows upload progress
 *   uploadProgress   — number 0-100
 */

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  ImagePlus,
  Search,
  X,
  CheckCircle2,
  Loader2,
} from "lucide-react";

// ── Allowed MIME types ─────────────────────────────────────────────────────────
const ACCEPTED = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png":  [".png"],
  "image/webp": [".webp"],
  "image/gif":  [".gif"],
  "image/bmp":  [".bmp"],
};

export default function ImageUploader({
  onSearch,
  onUpload,
  isSearching,
  isUploading,
  uploadProgress,
}) {
  // Local preview of the chosen file before any API call
  const [preview, setPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);

  // ── Handle file selection ──────────────────────────────────────────────────
  const handleFileDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Revoke previous object URL to avoid memory leaks
      if (preview) URL.revokeObjectURL(preview);

      const url = URL.createObjectURL(file);
      setPreview(url);
      setSelectedFile(file);
      setUploadDone(false);

      // Automatically trigger the visual search
      onSearch(file);
    },
    [preview, onSearch]
  );

  // ── Clear selection ────────────────────────────────────────────────────────
  const handleClear = (e) => {
    e.stopPropagation();        // don't re-open file picker
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    setUploadDone(false);
  };

  // ── Add to library ─────────────────────────────────────────────────────────
  const handleAddToLibrary = async (e) => {
    e.stopPropagation();
    if (!selectedFile) return;
    try {
      await onUpload(selectedFile);
      setUploadDone(true);
    } catch {
      // error is surfaced by the hook
    }
  };

  // ── react-dropzone setup ───────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: isSearching || isUploading,
    noClick: !!preview,      // once a file is chosen, don't reopen picker on card click
  });

  const busy = isSearching || isUploading;

  return (
    <div className="w-full">
      {/* ── Dropzone card ── */}
      <div
        {...getRootProps()}
        className={[
          "relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer",
          "min-h-[220px] flex flex-col items-center justify-center overflow-hidden",
          isDragActive
            ? "border-accent bg-accent/10 dropzone-active"
            : preview
            ? "border-slate-700 bg-surface-raised cursor-default"
            : "border-slate-700 bg-surface-raised hover:border-accent/60 hover:bg-surface-high",
          busy ? "opacity-70 pointer-events-none" : "",
        ].join(" ")}
      >
        <input {...getInputProps()} />

        {preview ? (
          /* ── Preview of selected image ── */
          <div className="relative w-full h-full min-h-[220px]">
            <img
              src={preview}
              alt="Query"
              className="w-full h-full object-contain max-h-64 p-2"
            />

            {/* Clear button */}
            <button
              onClick={handleClear}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 hover:bg-red-600 transition-colors"
              title="Remove image"
            >
              <X size={16} />
            </button>

            {/* Status overlay while uploading */}
            {isUploading && (
              <div className="absolute inset-x-0 bottom-0 bg-surface/80 backdrop-blur-sm p-3">
                <div className="flex items-center gap-2 mb-1 text-sm text-slate-300">
                  <Loader2 size={14} className="animate-spin" />
                  Uploading… {uploadProgress}%
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Searching overlay */}
            {isSearching && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm rounded-2xl">
                <div className="flex flex-col items-center gap-3 text-accent">
                  <Loader2 size={36} className="animate-spin" />
                  <span className="text-sm font-medium text-slate-300">
                    Finding similar images…
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Empty state drop prompt ── */
          <div className="flex flex-col items-center gap-4 p-8 text-center select-none">
            <div
              className={[
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-all",
                isDragActive
                  ? "bg-accent text-white scale-110"
                  : "bg-slate-800 text-slate-400",
              ].join(" ")}
            >
              {isDragActive ? (
                <ImagePlus size={28} />
              ) : (
                <Upload size={28} />
              )}
            </div>

            <div>
              <p className="text-base font-semibold text-slate-200">
                {isDragActive ? "Drop to search" : "Drop an image here"}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                or click to browse — JPG, PNG, WebP, GIF
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Search size={12} />
              <span>Searches by visual similarity · powered by CLIP</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Action buttons shown after an image is selected ── */}
      {preview && !busy && (
        <div className="flex gap-3 mt-3">
          {/* Re-search button */}
          <button
            onClick={() => selectedFile && onSearch(selectedFile)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-accent hover:bg-accent-glow text-white text-sm font-medium
                       transition-colors animate-pulseGlow"
          >
            <Search size={15} />
            Search Similar
          </button>

          {/* Add to library button */}
          <button
            onClick={handleAddToLibrary}
            disabled={uploadDone}
            className={[
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl",
              "text-sm font-medium transition-colors border",
              uploadDone
                ? "border-success/40 text-success bg-success/10 cursor-default"
                : "border-slate-600 text-slate-300 hover:border-accent hover:text-accent bg-surface-raised",
            ].join(" ")}
          >
            {uploadDone ? (
              <>
                <CheckCircle2 size={15} />
                Added to Library
              </>
            ) : (
              <>
                <ImagePlus size={15} />
                Add to Library
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Hint when no image is selected ── */}
      {!preview && (
        <p className="text-center text-xs text-slate-600 mt-3">
          Dropping an image will instantly search the indexed library
        </p>
      )}
    </div>
  );
}
