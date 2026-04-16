import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useVideoPlayerStyles = makeStyles({
  // ── Container ──────────────────────────────────────────────────────────────
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },

  // ── Video element ──────────────────────────────────────────────────────────
  video: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
  },

  // ── Idle overlay (pre-play) ────────────────────────────────────────────────
  idleOverlay: {
    position: "absolute",
    inset: "0",
    zIndex: "5",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    cursor: "pointer",
  },
  playBtn: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    background: "rgba(206,17,38,0.15)",
    border: "1.5px solid rgba(206,17,38,0.5)",
    color: tokens.colorWhite,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    paddingLeft: "4px",
    transitionProperty: "background, border-color, transform",
    transitionDuration: "0.2s",
    transitionTimingFunction: "ease",
    ":hover": {
      background: "rgba(206,17,38,0.3)",
      border: "1.5px solid rgba(206,17,38,0.8)",
    },
  },

  // ── Loading overlay ────────────────────────────────────────────────────────
  loadingOverlay: {
    position: "absolute",
    inset: "0",
    zIndex: "5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  loadingSpinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.12)",
    borderTopColor: "rgba(206,17,38,0.85)",
    animationName: { to: { transform: "rotate(360deg)" } },
    animationDuration: "0.75s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },

  // ── Transcode progress label ───────────────────────────────────────────────
  progressLabel: {
    position: "absolute",
    top: "16px",
    left: "16px",
    right: "16px",
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#aaa",
  },

  // ── Error overlay ──────────────────────────────────────────────────────────
  errorOverlay: {
    position: "absolute",
    top: "16px",
    left: "16px",
    right: "16px",
    backgroundColor: "rgba(206,17,38,0.85)",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    color: tokens.colorWhite,
  },

  // ── Control bar spinner (loading state inside ControlBar) ──────────────────
  ctrlSpinner: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.2)",
    borderTopColor: tokens.colorWhite,
    animationName: { to: { transform: "rotate(360deg)" } },
    animationDuration: "0.75s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
});
