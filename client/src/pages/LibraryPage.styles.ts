import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useLibraryStyles = makeStyles({
  // ── Page layout ────────────────────────────────────────────────────────────
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  splitBody: {
    display: "grid",
    gridTemplateColumns: "1fr 0px 0px",
    flex: "1",
    minHeight: "0",
    transitionProperty: "grid-template-columns",
    transitionDuration: "0.25s",
    transitionTimingFunction: "ease",
    overflow: "hidden",
  },
  resizeHandle: {
    width: "4px",
    cursor: "col-resize",
    backgroundColor: tokens.colorBorder,
    transitionProperty: "background-color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorRed,
    },
  },
  splitLeft: {
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: "0",
    minWidth: "0",
  },
  rightPane: {
    borderLeft: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: "0",
    minHeight: "0",
  },

  // ── Filter bar ─────────────────────────────────────────────────────────────
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0 20px",
    height: "48px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  searchInput: {
    flex: "1",
    maxWidth: "300px",
    padding: "6px 12px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    outlineStyle: "none",
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
    "::placeholder": {
      color: tokens.colorMuted2,
    },
  },
  filterSep: {
    width: "1px",
    height: "16px",
    backgroundColor: tokens.colorBorder,
    flexShrink: "0",
  },
  toggleBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "28px",
    background: "transparent",
    border: `1px solid transparent`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted,
    cursor: "pointer",
    transitionProperty: "color, border-color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      backgroundColor: tokens.colorSurface2,
    },
  },
  toggleBtnActive: {
    color: tokens.colorWhite,
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
  },
  filterCount: {
    marginLeft: "auto",
    fontSize: "11px",
    color: tokens.colorMuted2,
  },

  // ── Library tabs ───────────────────────────────────────────────────────────
  tabs: {
    display: "flex",
    alignItems: "center",
    gap: "0",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    overflowX: "auto",
    backgroundColor: tokens.colorSurface,
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "0 16px",
    height: "36px",
    fontSize: "12px",
    fontWeight: "600",
    color: tokens.colorMuted,
    cursor: "pointer",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    whiteSpace: "nowrap",
    ":hover": {
      color: tokens.colorWhite,
    },
  },
  tabActive: {
    color: tokens.colorWhite,
    borderBottom: `2px solid ${tokens.colorRed}`,
  },
  tabCount: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    fontWeight: "400",
  },

  // ── Grid ───────────────────────────────────────────────────────────────────
  gridArea: {
    flex: "1",
    overflowY: "auto",
    padding: "20px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
  },

  // ── Empty states ───────────────────────────────────────────────────────────
  empty: {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    color: tokens.colorMuted,
  },
  emptyTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: tokens.colorWhite,
  },
  emptyBody: {
    fontSize: "13px",
    textAlign: "center",
    maxWidth: "260px",
    lineHeight: "1.6",
  },
});
