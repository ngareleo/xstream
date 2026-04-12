import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const usePosterCardStyles = makeStyles({
  root: {
    position: "relative",
    width: "160px",
    // 2:3 ratio via paddingBottom trick on inner
    flexShrink: "0",
    borderRadius: tokens.radiusMd,
    overflow: "hidden",
    cursor: "pointer",
    backgroundColor: tokens.colorSurface2,
    transitionProperty: "transform, box-shadow",
    transitionDuration: tokens.transition,
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    },
  },
  rootSelected: {
    transform: "translateY(-2px)",
    boxShadow: `0 0 0 2px rgba(206,17,38,0.7), 0 8px 24px rgba(0,0,0,0.5)`,
  },

  // Aspect-ratio wrapper (2:3)
  inner: {
    width: "100%",
    paddingBottom: "150%",
    position: "relative",
  },

  // Full-cover background (real image or gradient)
  bg: {
    position: "absolute",
    inset: "0",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },

  // Applied only on gradient placeholders — drifts the gradient slowly
  bgAnimated: {
    backgroundSize: "300% 300%",
    animationName: "gradient-drift",
    animationDuration: "12s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },

  // Bottom gradient for text legibility
  bottomGradient: {
    position: "absolute",
    bottom: "0",
    left: "0",
    right: "0",
    height: "60%",
    background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
    zIndex: "1",
  },

  // Hover overlay
  hoverOverlay: {
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(206,17,38,0.0)",
    zIndex: "2",
    transitionProperty: "background-color",
    transitionDuration: tokens.transition,
  },
  hoverOverlayVisible: {
    backgroundColor: "rgba(206,17,38,0.18)",
  },

  // ── Badges ───────────────────────────────────────────────────────────────
  badgeTopRight: {
    position: "absolute",
    top: "8px",
    right: "8px",
    zIndex: "3",
  },
  badgeTopLeft: {
    position: "absolute",
    top: "8px",
    left: "8px",
    zIndex: "3",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    padding: "2px 5px",
    borderRadius: "3px",
  },
  badgeRed: {
    backgroundColor: tokens.colorRedDim,
    border: `1px solid ${tokens.colorRedBorder}`,
    color: "rgba(206,17,38,0.9)",
  },
  badgeGray: {
    backgroundColor: "rgba(0,0,0,0.55)",
    border: `1px solid rgba(255,255,255,0.12)`,
    color: "rgba(255,255,255,0.6)",
  },
  badgeYellow: {
    backgroundColor: "rgba(245,197,24,0.15)",
    border: `1px solid rgba(245,197,24,0.3)`,
    color: tokens.colorYellow,
  },

  // ── Bottom info ───────────────────────────────────────────────────────────
  bottomInfo: {
    position: "absolute",
    bottom: "0",
    left: "0",
    right: "0",
    padding: "10px 10px 9px",
    zIndex: "3",
  },
  title: {
    fontSize: "11px",
    fontWeight: "600",
    color: tokens.colorWhite,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "1.2",
  },
  year: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "2px",
  },

  // Rating (bottom right)
  rating: {
    position: "absolute",
    bottom: "9px",
    right: "10px",
    zIndex: "3",
    fontSize: "10px",
    fontWeight: "700",
    color: tokens.colorYellow,
  },

  // ── Play chip (hover) ─────────────────────────────────────────────────────
  playChip: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: "4",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "7px 14px",
    backgroundColor: tokens.colorRed,
    border: "none",
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.04em",
    textDecoration: "none",
    opacity: "0",
    pointerEvents: "none",
    transitionProperty: "opacity",
    transitionDuration: tokens.transition,
    cursor: "pointer",
  },
  playChipVisible: {
    opacity: "1",
    pointerEvents: "auto",
  },
});
