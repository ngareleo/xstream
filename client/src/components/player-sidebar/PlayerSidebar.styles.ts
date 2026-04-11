import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const usePlayerSidebarStyles = makeStyles({
  // ── Root ───────────────────────────────────────────────────────────────────
  root: {
    backgroundColor: "rgba(8,8,8,0.96)",
    borderLeft: "1px solid rgba(255,255,255,0.07)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transitionProperty: "opacity",
    transitionDuration: "0.4s",
    transitionTimingFunction: "ease",
  },
  rootHidden: {
    opacity: "0",
    pointerEvents: "none",
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    padding: "16px 15px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    flexShrink: "0",
  },
  sectionLabel: {
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.22)",
    marginBottom: "8px",
  },

  // ── Now Playing ────────────────────────────────────────────────────────────
  title: {
    fontSize: "14px",
    fontWeight: "700",
    color: tokens.colorWhite,
    lineHeight: "1.3",
  },
  meta: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.4)",
    marginTop: "3px",
  },
  plot: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.35)",
    lineHeight: "1.6",
    marginTop: "8px",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: "3",
    WebkitBoxOrient: "vertical",
  },

  // ── Scrollable body ────────────────────────────────────────────────────────
  body: {
    flex: "1",
    overflowY: "auto",
  },

  // ── Up Next items ─────────────────────────────────────────────────────────
  upNextSection: {
    padding: "12px 15px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  upNextItem: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "8px 0",
    textDecoration: "none",
    transitionProperty: "opacity",
    transitionDuration: tokens.transition,
    ":hover": {
      opacity: "0.75",
    },
  },
  upNextThumb: {
    width: "54px",
    height: "30px",
    borderRadius: "3px",
    flexShrink: "0",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundImage: "linear-gradient(135deg, #1a0a0a 0%, #2d0d10 100%)",
    overflow: "hidden",
  },
  upNextInfo: {
    flex: "1",
    minWidth: "0",
  },
  upNextTitle: {
    fontSize: "12px",
    fontWeight: "500",
    color: tokens.colorWhite,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "1.3",
  },
  upNextYear: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.3)",
    marginTop: "1px",
  },
  upNextPlay: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(206,17,38,0.12)",
    border: "1px solid rgba(206,17,38,0.22)",
    color: tokens.colorRed,
    padding: "3px 9px",
    borderRadius: "3px",
    cursor: "pointer",
    flexShrink: "0",
    textDecoration: "none",
    transitionProperty: "background, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(206,17,38,0.25)",
      border: "1px solid rgba(206,17,38,0.45)",
    },
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    padding: "10px 15px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flexShrink: "0",
  },
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "7px 14px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: tokens.radiusSm,
    color: "rgba(255,255,255,0.5)",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "inherit",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: "1px solid rgba(255,255,255,0.25)",
    },
  },
});
