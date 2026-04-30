/**
 * LibraryPanel.jsx
 * ----------------
 * Shows all images currently indexed in the vector store.
 * Users can delete images from both the vector index and disk.
 *
 * Props:
 *   isOpen:   boolean
 *   onClose:  () => void
 */

import React, { useEffect, useState, useCallback } from "react";
import { X, Trash2, Loader2, RefreshCw, ImageOff, Library } from "lucide-react";
import { listImages, deleteImage } from "../api/searchApi";

export default function LibraryPanel({ isOpen, onClose }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState(null);
  const [error, setError] = useState(null);

  // ── Fetch library ──────────────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listImages();
      setImages(data.images || []);
    } catch (err) {
      setError(err.friendlyMessage || "Failed to load library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadLibrary();
  }, [isOpen, loadLibrary]);

  // ── Delete image ───────────────────────────────────────────────────────────
  const handleDelete = async (filename) => {
    if (!window.confirm(`Remove "${filename}" from the library?`)) return;
    setDeletingFile(filename);
    try {
      await deleteImage(filename);
      setImages((prev) => prev.filter((img) => img.filename !== filename));
    } catch (err) {
      alert(err.friendlyMessage || "Delete failed.");
    } finally {
      setDeletingFile(null);
    }
  };

  if (!isOpen) return null;

  return (
    /* ── Backdrop ── */
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      {/* ── Slide-in panel ── */}
      <div
        className="relative w-full max-w-sm h-full bg-surface-raised border-l border-slate-800
                   flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Library size={16} className="text-accent" />
            <h2 className="font-semibold text-slate-200 text-sm">
              Image Library
            </h2>
            <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-xs font-mono">
              {images.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLibrary}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-600">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-600">
              <ImageOff size={32} />
              <div>
                <p className="font-medium text-slate-500">No images indexed</p>
                <p className="text-xs mt-1">
                  Upload images or run seed_images.py to populate the library.
                </p>
              </div>
            </div>
          ) : (
            images.map((img) => (
              <div
                key={img.filename}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-high
                           border border-transparent hover:border-slate-700 transition-all group"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface shrink-0">
                  <img
                    src={img.url}
                    alt={img.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Filename */}
                <p
                  className="text-xs text-slate-400 font-mono truncate flex-1"
                  title={img.filename}
                >
                  {img.filename}
                </p>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(img.filename)}
                  disabled={deletingFile === img.filename}
                  className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10
                             opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  title="Remove from library"
                >
                  {deletingFile === img.filename ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-600">
          Deleting an image removes it from both disk and the FAISS index.
        </div>
      </div>
    </div>
  );
}
