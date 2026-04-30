/**
 * StatsBar.jsx
 * ------------
 * Displays a live connection badge + backend stats (indexed image count, model name).
 * Polls the GET / health endpoint every 10 seconds to stay current.
 *
 * Props: none — fetches its own data independently.
 */

import React, { useEffect, useState, useCallback } from "react";
import { Activity, Database, Cpu, AlertTriangle, RefreshCw } from "lucide-react";
import { checkHealth } from "../api/searchApi";

const POLL_INTERVAL_MS = 10_000;   // re-check every 10 s

export default function StatsBar() {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "ok" | "error"
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setHealth(data);
      setStatus("ok");
    } catch {
      setStatus("error");
      setHealth(null);
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  // ── Connection indicator dot ───────────────────────────────────────────────
  const dot =
    status === "ok"
      ? "bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]"
      : status === "error"
      ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
      : "bg-amber-500 animate-pulse";

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
      {/* ── Connection badge ── */}
      <div
        className={[
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
          status === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : status === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-amber-500/30 bg-amber-500/10 text-amber-400",
        ].join(" ")}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {status === "ok" ? "Backend connected" : status === "error" ? "Backend offline" : "Connecting…"}
      </div>

      {/* ── Stats chips — only when connected ── */}
      {status === "ok" && health && (
        <>
          {/* Indexed image count */}
          <div className="flex items-center gap-1 text-slate-500">
            <Database size={11} className="text-slate-600" />
            <span>{health.indexed_images} image{health.indexed_images !== 1 ? "s" : ""} indexed</span>
          </div>

          {/* Model name */}
          <div className="flex items-center gap-1 text-slate-500">
            <Cpu size={11} className="text-slate-600" />
            <span>{health.model}</span>
          </div>
        </>
      )}

      {/* ── Error hint ── */}
      {status === "error" && (
        <div className="flex items-center gap-1 text-red-500/70">
          <AlertTriangle size={11} />
          <span>Start FastAPI: uvicorn main:app --reload --port 8000</span>
        </div>
      )}

      {/* ── Manual refresh button ── */}
      <button
        onClick={fetchHealth}
        className="flex items-center gap-1 text-slate-600 hover:text-slate-400 transition-colors ml-auto"
        title="Refresh backend status"
      >
        <RefreshCw size={11} />
        {lastChecked && (
          <span className="text-[10px]">
            {lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </button>
    </div>
  );
}
