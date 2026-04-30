/**
 * useSearch.js  (MODIFIED)
 * -------------------------
 * Only change: queryFile is now exposed in state so App.jsx can
 * pass it to FilterPanel for image+filter combined searches.
 * Everything else is unchanged.
 */

import { useState, useCallback } from "react";
import {
  uploadImage,
  searchByImage,
  searchByText,
  searchByMultimodal,
} from "../api/searchApi";

const INITIAL_STATE = {
  queryPreviewUrl: null,
  queryFile:       null,    // ← now exposed (was internal only)
  results:         [],
  isUploading:     false,
  isSearching:     false,
  uploadProgress:  0,
  error:           null,
  lastQueryType:   null,
  lastTextQuery:   "",
  lastCaption:     "",
  imageWeight:     0.6,
  totalIndexed:    0,
};

export function useSearch() {
  const [state, setState] = useState(INITIAL_STATE);

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const handleUpload = useCallback(async (file) => {
    update({ isUploading: true, error: null, uploadProgress: 0 });
    try {
      const result = await uploadImage(file, (pct) => update({ uploadProgress: pct }));
      update({ isUploading: false, uploadProgress: 100 });
      return result;
    } catch (err) {
      update({ isUploading: false, error: err.friendlyMessage || err.message });
      throw err;
    }
  }, [update]);

  const handleImageSearch = useCallback(async (file, topK = 10) => {
    const previewUrl = URL.createObjectURL(file);
    update({
      isSearching: true, error: null, results: [],
      queryPreviewUrl: previewUrl, queryFile: file,   // ← store the file
      lastQueryType: "image", lastTextQuery: "", lastCaption: "",
    });
    try {
      const data = await searchByImage(file, topK);
      update({
        isSearching: false,
        results: data.results || [],
        totalIndexed: data.total_indexed ?? 0,
      });
      return data;
    } catch (err) {
      update({ isSearching: false, error: err.friendlyMessage || "Search failed. Is the backend running?" });
    }
  }, [update]);

  const handleTextSearch = useCallback(async (query, topK = 10) => {
    if (!query.trim()) return;
    update({
      isSearching: true, error: null, results: [],
      queryPreviewUrl: null, queryFile: null,
      lastQueryType: "text", lastTextQuery: query, lastCaption: "",
    });
    try {
      const data = await searchByText(query, topK);
      update({
        isSearching: false,
        results: data.results || [],
        totalIndexed: data.total_indexed ?? 0,
      });
      return data;
    } catch (err) {
      update({ isSearching: false, error: err.friendlyMessage || "Text search failed. Is the backend running?" });
    }
  }, [update]);

  const handleMultimodalSearch = useCallback(async (file, caption, imageWeight = 0.6, topK = 10) => {
    const previewUrl = URL.createObjectURL(file);
    update({
      isSearching: true, error: null, results: [],
      queryPreviewUrl: previewUrl, queryFile: file,   // ← store the file
      lastQueryType: "multimodal", lastTextQuery: caption, lastCaption: caption,
      imageWeight,
    });
    try {
      const data = await searchByMultimodal(file, caption, imageWeight, topK);
      update({
        isSearching: false,
        results: data.results || [],
        totalIndexed: data.total_indexed ?? 0,
      });
      return data;
    } catch (err) {
      update({ isSearching: false, error: err.friendlyMessage || "Multimodal search failed." });
    }
  }, [update]);

  const handleCameraSearch = useCallback(async (file, topK = 10) => {
    const previewUrl = URL.createObjectURL(file);
    update({
      isSearching: true, error: null, results: [],
      queryPreviewUrl: previewUrl, queryFile: file,   // ← store the file
      lastQueryType: "camera", lastTextQuery: "", lastCaption: "",
    });
    try {
      const data = await searchByImage(file, topK);
      update({
        isSearching: false,
        results: data.results || [],
        totalIndexed: data.total_indexed ?? 0,
      });
      return data;
    } catch (err) {
      update({ isSearching: false, error: err.friendlyMessage || "Camera search failed." });
    }
  }, [update]);

  return {
    state,
    handleUpload,
    handleImageSearch,
    handleTextSearch,
    handleMultimodalSearch,
    handleCameraSearch,
    reset,
  };
}
