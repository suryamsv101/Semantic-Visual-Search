/**
 * searchApi.js  (MODIFIED)
 * -------------------------
 * Added:
 *   searchWithFilter()   — structured filter search (new /search/filter endpoint)
 *   getMetadataOptions() — fetch real colors/brands/categories from backend
 */

import axios from "axios";

const api = axios.create({
  baseURL: "/",
  timeout: 60_000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail =
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      "Unknown error";
    error.friendlyMessage = detail;
    return Promise.reject(error);
  }
);

// ── Upload ─────────────────────────────────────────────────────────────────────
export async function uploadImage(file, onProgress) {
  const form = new FormData();
  form.append("file", file);

  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (evt) => { if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100)); }
      : undefined,
  });
  return data;
}

// ── Image search ───────────────────────────────────────────────────────────────
export async function searchByImage(file, topK = 10) {
  const form = new FormData();
  form.append("file", file);
  form.append("top_k", String(topK));

  const { data } = await api.post("/search/image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Text search ────────────────────────────────────────────────────────────────
export async function searchByText(query, topK = 10) {
  const form = new FormData();
  form.append("query", query);
  form.append("top_k", String(topK));

  const { data } = await api.post("/search/text", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Multimodal search ──────────────────────────────────────────────────────────
export async function searchByMultimodal(file, caption, imageWeight = 0.6, topK = 10) {
  const form = new FormData();
  form.append("file", file);
  form.append("caption", caption);
  form.append("image_weight", String(imageWeight));
  form.append("top_k", String(topK));

  const { data } = await api.post("/search/multimodal", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Structured filter search (NEW) ────────────────────────────────────────────
/**
 * Search with explicit structured filters sent to backend.
 *
 * @param {Object} params
 * @param {File}   [params.file]      - Optional query image
 * @param {string} [params.query]     - Optional text query
 * @param {string} [params.color]     - e.g. "Red"
 * @param {string} [params.brand]     - e.g. "Nike"
 * @param {number} [params.maxPrice]  - e.g. 2000
 * @param {number} [params.minPrice]  - e.g. 500
 * @param {number} [params.topK]      - default 10
 */
export async function searchWithFilter({ file, query, color, brand, maxPrice, minPrice, topK = 10 }) {
  const form = new FormData();
  if (file)     form.append("file",      file);
  if (query)    form.append("query",     query);
  if (color)    form.append("color",     color);
  if (brand)    form.append("brand",     brand);
  if (maxPrice != null) form.append("max_price", String(maxPrice));
  if (minPrice != null) form.append("min_price", String(minPrice));
  form.append("top_k", String(topK));

  const { data } = await api.post("/search/filter", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Metadata options (NEW) ─────────────────────────────────────────────────────
/**
 * Fetch available filter options from the backend (populated from styles.xlsx).
 * @returns {{ colors, brands, categories, price_range }}
 */
export async function getMetadataOptions() {
  const { data } = await api.get("/metadata/options");
  return data;
}

// ── Library management ─────────────────────────────────────────────────────────
export async function listImages() {
  const { data } = await api.get("/images");
  return data;
}

export async function deleteImage(filename) {
  const { data } = await api.delete(`/images/${filename}`);
  return data;
}

export async function checkHealth() {
  const { data } = await api.get("/");
  return data;
}
