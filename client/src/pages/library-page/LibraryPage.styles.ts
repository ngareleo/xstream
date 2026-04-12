import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

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

  // ── Library chips ──────────────────────────────────────────────────────────
  profileChips: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
    padding: "10px 20px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    fontWeight: "500",
    color: tokens.colorMuted,
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: "100px",
    cursor: "pointer",
    transitionProperty: "color, background, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },
  chipActive: {
    color: tokens.colorWhite,
    backgroundColor: "rgba(206,17,38,0.12)",
    border: `1px solid rgba(206,17,38,0.4)`,
  },
  chipCount: {
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

  // ── List view container ────────────────────────────────────────────────────
  listArea: {
    flex: "1",
    overflowY: "auto",
    padding: "0 10px",
  },
  listHeader: {
    display: "grid",
    gridTemplateColumns: "48px 1fr 110px 60px 72px 64px",
    gap: "0 12px",
    alignItems: "center",
    padding: "0 10px 8px 10px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    marginBottom: "2px",
  },
  listHeaderCell: {
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
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
