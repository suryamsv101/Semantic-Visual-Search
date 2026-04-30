import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration for the Visual Search frontend.
 *
 * The proxy setting forwards any request starting with /images or /search
 * from the frontend dev server (port 5173) → the FastAPI backend (port 8000).
 * This avoids CORS issues during development.
 */
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // Forward API calls to FastAPI
      "/upload":  "http://localhost:8000",
      "/search":  "http://localhost:8000",
      "/images":  "http://localhost:8000",
      "/camera":  "http://localhost:8000",
    },
  },
});
