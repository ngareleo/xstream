import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useControlBarStyles = makeStyles({
  // ── Wrapper ────────────────────────────────────────────────────────────────
  root: {
    position: "absolute",
    bottom: "0",
    left: "0",
    right: "0",
    background: "linear-gradient(transparent, rgba(0,0,0,0.88))",
    padding: "48px 20px 18px",
    transitionProperty: "opacity",
    transitionDuration: "0.3s",
    transitionTimingFunction: "ease",
  },
  rootHidden: {
    opacity: "0",
    pointerEvents: "none",
  },

  // ── Progress track ─────────────────────────────────────────────────────────
  track: {
    position: "relative",
    height: "4px",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: "2px",
    cursor: "pointer",
    marginBottom: "14px",
    transitionProperty: "height",
    transitionDuration: tokens.transition,
    ":hover": {
      height: "6px",
    },
  },
  trackFill: {
    position: "absolute",
    left: "0",
    top: "0",
    height: "100%",
    backgroundColor: tokens.colorRed,
    borderRadius: "2px",
    pointerEvents: "none",
  },

  // ── Controls row ───────────────────────────────────────────────────────────
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    position: "relative",
  },

  // ── Buttons ────────────────────────────────────────────────────────────────
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    cursor: "pointer",
    padding: "6px 8px",
    borderRadius: tokens.radiusSm,
    fontSize: "18px",
    lineHeight: "1",
    transitionProperty: "color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
  },
  btnSmall: {
    fontSize: "13px",
    padding: "4px 10px",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: tokens.radiusSm,
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.2)",
    },
  },

  // ── Time display ───────────────────────────────────────────────────────────
  time: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.55)",
    marginLeft: "4px",
    fontVariantNumeric: "tabular-nums",
    fontFamily: tokens.fontMono,
    letterSpacing: "-0.02em",
  },

  // ── Volume ─────────────────────────────────────────────────────────────────
  volumeGroup: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  volumeSlider: {
    cursor: "pointer",
    transitionProperty: "width, opacity",
    transitionDuration: "0.2s",
    accentColor: tokens.colorRed,
  },

  // ── Title ──────────────────────────────────────────────────────────────────
  title: {
    color: "rgba(255,255,255,0.75)",
    fontSize: "13px",
    fontWeight: "500",
    maxWidth: "260px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginRight: "8px",
  },

  // ── Resolution menu ────────────────────────────────────────────────────────
  resWrapper: {
    position: "relative",
  },
  resMenu: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    right: "0",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusMd,
    overflow: "hidden",
    minWidth: "100px",
    zIndex: "100",
  },
  resItem: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "8px 14px",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.7)",
    fontSize: "12px",
    cursor: "pointer",
    textAlign: "left",
    transitionProperty: "background, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.05)",
      color: tokens.colorWhite,
    },
  },
  resItemActive: {
    color: tokens.colorRed,
    backgroundColor: tokens.colorRedDim,
  },

  // ── Loading spinner (replaces playIcon in loading state) ───────────────────
  loadingSpinner: {
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
