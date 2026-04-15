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

  // ── End screen overlay ─────────────────────────────────────────────────────
  endOverlay: {
    position: "absolute",
    inset: "0",
    zIndex: "10",
    backgroundColor: "rgba(8,8,8,0.92)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "28px",
    padding: "24px",
  },
  endLabel: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.3)",
  },
  endCards: {
    display: "flex",
    flexDirection: "row",
    gap: "12px",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  endCard: {
    display: "flex",
    flexDirection: "column",
    width: "120px",
    gap: "6px",
    textDecoration: "none",
    cursor: "pointer",
    transitionProperty: "transform, opacity",
    transitionDuration: tokens.transitionSlow,
    ":hover": {
      transform: "scale(1.04)",
      opacity: "0.9",
    },
  },
  endCardPoster: {
    width: "120px",
    height: "68px",
    borderRadius: tokens.radiusSm,
    backgroundSize: "cover",
    backgroundPosition: "center top",
    backgroundImage: "linear-gradient(135deg, #1a0a0a 0%, #2d0d10 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    flexShrink: "0",
  },
  endCardTitle: {
    fontSize: "11px",
    fontWeight: "600",
    color: tokens.colorWhite,
    lineHeight: "1.3",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: "2",
    WebkitBoxOrient: "vertical",
  },
  endCardYear: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.3)",
  },
  endActions: {
    display: "flex",
    flexDirection: "row",
    gap: "10px",
    alignItems: "center",
  },
  replayBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 20px",
    backgroundColor: "transparent",
    border: `1px solid rgba(255,255,255,0.18)`,
    borderRadius: tokens.radiusSm,
    color: "rgba(255,255,255,0.6)",
    fontSize: "12px",
    fontWeight: "600",
    fontFamily: "inherit",
    cursor: "pointer",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: "1px solid rgba(255,255,255,0.35)",
    },
  },
});
