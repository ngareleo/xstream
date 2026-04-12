import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useFilmDetailPaneStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },

  // ── Poster area ───────────────────────────────────────────────────────────
  posterArea: {
    height: "200px",
    position: "relative",
    overflow: "hidden",
    flexShrink: "0",
  },
  posterOverlay: {
    position: "absolute",
    inset: "0",
    background:
      "linear-gradient(to bottom, rgba(0,0,0,0.58) 0%, transparent 40%, rgba(0,0,0,0.5) 100%)",
    zIndex: "1",
  },

  // Gradient that bleeds the poster into the body background (#0F0F0F)
  posterFade: {
    position: "absolute",
    bottom: "0",
    left: "0",
    right: "0",
    height: "80px",
    background: `linear-gradient(to bottom, transparent 0%, ${tokens.colorSurface} 100%)`,
    zIndex: "2",
    pointerEvents: "none",
  },

  // ── Actions bar (over poster) ─────────────────────────────────────────────
  actionBar: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "2",
    display: "flex",
    alignItems: "center",
    gap: "0",
    padding: "12px 14px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)",
  },
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 10px",
    background: "rgba(255,255,255,0.08)",
    border: "none",
    borderRadius: tokens.radiusSm,
    color: "rgba(255,255,255,0.7)",
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    textDecoration: "none",
    transitionProperty: "background, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.14)",
      color: tokens.colorWhite,
    },
  },
  actionBtnPrimary: {
    backgroundColor: tokens.colorRed,
    color: tokens.colorWhite,
    ":hover": {
      backgroundColor: tokens.colorRedDark,
    },
  },
  actionBtnActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    color: tokens.colorWhite,
  },
  actionBtnDanger: {
    color: "rgba(206,17,38,0.75)",
    ":hover": {
      backgroundColor: tokens.colorRedDim,
      color: tokens.colorRed,
    },
  },
  actionSep: {
    width: "12px",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  actionSepLine: {
    width: "1px",
    height: "12px",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  actionSpacer: {
    flex: "1",
  },
  closeBtn: {
    width: "30px",
    height: "30px",
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: tokens.radiusSm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.5)",
    cursor: "pointer",
    transitionProperty: "color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
  },

  // ── Title/meta over poster ────────────────────────────────────────────────
  posterMeta: {
    position: "absolute",
    bottom: "0",
    left: "0",
    right: "0",
    padding: "12px 16px",
    zIndex: "3",
  },
  posterTitle: {
    fontFamily: tokens.fontHead,
    fontSize: "22px",
    letterSpacing: "0.06em",
    color: tokens.colorWhite,
    lineHeight: "1",
  },
  posterSub: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.6)",
    marginTop: "3px",
  },

  // ── Body sections ─────────────────────────────────────────────────────────
  body: {
    flex: "1",
    overflowY: "auto",
  },
  section: {
    padding: "12px 16px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  sectionLabel: {
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    marginBottom: "8px",
  },

  // Badges row
  badgesRow: {
    display: "flex",
    gap: "5px",
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    padding: "2px 7px",
    borderRadius: "3px",
  },
  badgeRed: {
    backgroundColor: tokens.colorRedDim,
    border: `1px solid ${tokens.colorRedBorder}`,
    color: "rgba(206,17,38,0.9)",
  },
  badgeGray: {
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted,
  },

  ratingRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  ratingNum: {
    fontSize: "15px",
    fontWeight: "700",
    color: tokens.colorYellow,
  },
  ratingLabel: {
    fontSize: "11px",
    color: tokens.colorMuted,
  },

  plot: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.55)",
    lineHeight: "1.7",
  },

  castChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
    marginTop: "8px",
  },
  castChip: {
    backgroundColor: tokens.colorSurface3,
    border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted,
    fontSize: "10px",
    padding: "3px 8px",
    borderRadius: "3px",
  },

  infoRow: {
    display: "grid",
    gridTemplateColumns: "80px 1fr",
    alignItems: "baseline",
    gap: "8px",
    padding: "5px 0",
    borderBottom: `1px solid rgba(255,255,255,0.03)`,
    ":last-child": {
      borderBottom: "none",
    },
  },
  infoKey: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    fontWeight: "600",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  infoVal: {
    fontSize: "12px",
    color: "rgba(245,245,245,0.75)",
    fontFamily: "monospace",
  },

  // Empty state (no metadata)
  emptyMeta: {
    padding: "24px 16px",
    textAlign: "center",
    color: tokens.colorMuted,
    fontSize: "12px",
  },
});
