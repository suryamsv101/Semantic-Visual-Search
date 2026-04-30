/**
 * CameraCapture.jsx
 * -----------------
 * Opens the device camera (laptop webcam or phone camera) using the
 * browser's MediaDevices API. The user sees a live viewfinder and can
 * snap a photo which is then used as a search query.
 *
 * Works on:
 *   • Desktop Chrome / Firefox / Edge (webcam)
 *   • iOS Safari 14.3+ (requires HTTPS in production)
 *   • Android Chrome (environment-facing camera)
 *
 * Props:
 *   onCapture(file: File) — called when user takes a photo
 *   onClose()             — called when user dismisses the panel
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Camera, CameraOff, SwitchCamera, Circle,
  X, RotateCcw, Check, ZoomIn,
} from "lucide-react";

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);

  const [status, setStatus]         = useState("idle");    // idle|requesting|streaming|captured|error
  const [errorMsg, setErrorMsg]     = useState("");
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [capturedFile, setCapturedFile] = useState(null);
  const [facingMode, setFacingMode] = useState("environment"); // environment|user
  const [hasMultipleCams, setHasMultipleCams] = useState(false);

  // ── Start the camera stream ─────────────────────────────────────────────────
  const startCamera = useCallback(async (facing = facingMode) => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setStatus("requesting");
    setErrorMsg("");
    setCapturedUrl(null);
    setCapturedFile(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus("streaming");

      // Check if device has multiple cameras (front + back)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoCams = devices.filter((d) => d.kind === "videoinput");
      setHasMultipleCams(videoCams.length > 1);
    } catch (err) {
      setStatus("error");
      if (err.name === "NotAllowedError") {
        setErrorMsg("Camera access denied. Please allow camera permissions and try again.");
      } else if (err.name === "NotFoundError") {
        setErrorMsg("No camera found on this device.");
      } else {
        setErrorMsg(`Camera error: ${err.message}`);
      }
    }
  }, [facingMode]);

  // ── Stop camera on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Snap a photo ───────────────────────────────────────────────────────────
  const handleSnap = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    // Convert canvas → Blob → File
    canvas.toBlob(
      (blob) => {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
        const url  = URL.createObjectURL(blob);
        setCapturedUrl(url);
        setCapturedFile(file);
        setStatus("captured");

        // Pause the stream while reviewing
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.enabled = false);
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedFile(null);
    // Re-enable the stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.enabled = true);
    }
    setStatus("streaming");
  };

  // ── Use the captured photo ─────────────────────────────────────────────────
  const handleUse = () => {
    if (capturedFile) onCapture(capturedFile);
  };

  // ── Flip camera ───────────────────────────────────────────────────────────
  const handleFlip = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  return (
    <div className="space-y-3">
      {/* ── Viewfinder / captured preview ── */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        {/* Live video */}
        <video
          ref={videoRef}
          className={[
            "w-full h-full object-cover",
            status === "captured" ? "hidden" : "block",
          ].join(" ")}
          playsInline
          muted
        />

        {/* Captured photo preview */}
        {capturedUrl && (
          <img
            src={capturedUrl}
            alt="Captured"
            className="w-full h-full object-cover"
          />
        )}

        {/* Idle / error state */}
        {(status === "idle" || status === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
            <CameraOff size={32} className="text-slate-600" />
            {errorMsg ? (
              <p className="text-xs text-red-400 text-center px-4 max-w-xs">{errorMsg}</p>
            ) : (
              <p className="text-xs text-slate-500">Camera not started</p>
            )}
          </div>
        )}

        {/* Requesting permission */}
        {status === "requesting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900">
            <Camera size={28} className="text-accent animate-pulse" />
            <p className="text-xs text-slate-400">Requesting camera…</p>
          </div>
        )}

        {/* Overlay controls (streaming state) */}
        {status === "streaming" && (
          <>
            {/* Crosshair guide */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white/50 rounded-tl" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white/50 rounded-tr" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white/50 rounded-bl" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white/50 rounded-br" />
            </div>

            {/* Flip button (if multiple cameras) */}
            {hasMultipleCams && (
              <button
                onClick={handleFlip}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                title="Flip camera"
              >
                <SwitchCamera size={16} />
              </button>
            )}
          </>
        )}

        {/* Canvas (hidden, used for capture) */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center gap-2">
        {status === "idle" || status === "error" ? (
          <button
            onClick={() => startCamera()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-accent text-white text-sm font-medium hover:bg-accent-glow transition-colors"
          >
            <Camera size={15} />
            Start Camera
          </button>
        ) : status === "streaming" ? (
          <>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              title="Cancel"
            >
              <X size={16} />
            </button>
            <button
              onClick={handleSnap}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
            >
              <Circle size={15} className="fill-slate-900" />
              Capture
            </button>
          </>
        ) : status === "captured" ? (
          <>
            <button
              onClick={handleRetake}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-700
                         text-slate-400 text-sm hover:text-slate-200 transition-colors"
            >
              <RotateCcw size={14} />
              Retake
            </button>
            <button
              onClick={handleUse}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-accent text-white text-sm font-medium hover:bg-accent-glow transition-colors"
            >
              <Check size={15} />
              Use Photo
            </button>
          </>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-600 text-center">
        Works with webcam on desktop · front/back camera on mobile
      </p>
    </div>
  );
}
