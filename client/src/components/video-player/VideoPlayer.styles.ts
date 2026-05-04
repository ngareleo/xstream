import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useVideoPlayerStyles = makeStyles({
  // ── Container ──────────────────────────────────────────────────────────────
  // Transparent so VideoArea's backdrop poster shows through before playback.
  // Once the <video> element receives frames it paints its own pixels.
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },

  // ── Video element ──────────────────────────────────────────────────────────
  video: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    backgroundColor: "transparent",
  },

  // ── Idle overlay (pre-play) ────────────────────────────────────────────────
  // Full-area click-to-play scrim — no visible button. The primary play
  // affordance is the green disc in the ControlBar.
  idleOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    cursor: "pointer",
  },

  // ── Transcode progress label ───────────────────────────────────────────────
  progressLabel: {
    position: "absolute",
    top: "16px",
    left: "16px",
    right: "16px",
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingTop: "8px",
    paddingBottom: "8px",
    paddingLeft: "12px",
    paddingRight: "12px",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#aaa",
    fontFamily: tokens.fontMono,
    zIndex: 6,
  },

  // ── Error overlay ──────────────────────────────────────────────────────────
  errorOverlay: {
    position: "absolute",
    top: "16px",
    left: "16px",
    right: "16px",
    backgroundColor: "rgba(206,17,38,0.85)",
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingLeft: "14px",
    paddingRight: "14px",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#fff",
    zIndex: 6,
  },

  // ── Control bar spinner (loading state inside ControlBar) ──────────────────
  ctrlSpinner: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    borderTopWidth: "2px",
    borderRightWidth: "2px",
    borderBottomWidth: "2px",
    borderLeftWidth: "2px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: "#fff",
    borderRightColor: "rgba(255,255,255,0.2)",
    borderBottomColor: "rgba(255,255,255,0.2)",
    borderLeftColor: "rgba(255,255,255,0.2)",
    animationName: { to: { transform: "rotate(360deg)" } },
    animationDuration: "0.75s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
});
