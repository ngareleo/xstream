import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

// Shared grid template constants so FilmRow, ProfileRow, and the header always align.
export const GRID_FULL = "28px 1fr 80px 1fr 70px 110px";
export const GRID_COMPACT = "28px 1fr 70px 110px";

export const useFilmRowStyles = makeStyles({
  row: {
    display: "grid",
    gridTemplateColumns: GRID_FULL,
    alignItems: "center",
    padding: "0 24px 0 44px",
    height: "38px",
    borderBottom: `1px solid rgba(255,255,255,0.025)`,
    backgroundColor: "rgba(0,0,0,0.18)",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    cursor: "pointer",
    position: "relative",
    ":hover": {
      backgroundColor: "rgba(206,17,38,0.04)",
    },
  },
  // Compact: pane is open — collapse to icon | name | actions
  rowCompact: {
    gridTemplateColumns: GRID_COMPACT,
  },
  rowSelected: {
    backgroundColor: "rgba(206,17,38,0.07)",
    borderLeft: `2px solid ${tokens.colorRed}`,
    paddingLeft: "42px",
  },

  // First column: 28px — contains both the tree line and the icon
  iconCol: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorMuted2,
    flexShrink: "0",
  },
  treeLineEl: {
    position: "absolute",
    left: "50%",
    top: "0",
    bottom: "0",
    width: "1px",
    background: "rgba(255,255,255,0.06)",
    pointerEvents: "none",
    transform: "translateX(-50%)",
  },

  nameCell: {
    minWidth: "0",
    paddingRight: "16px",
  },
  name: {
    fontSize: "12px",
    fontWeight: "500",
    color: "rgba(245,245,245,0.8)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nameUnmatched: {
    color: tokens.colorYellow,
  },
  filename: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    fontFamily: "monospace",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: "1px",
  },

  cell: {
    fontSize: "11px",
    color: tokens.colorMuted2,
    whiteSpace: "nowrap",
  },
  cellMono: {
    fontFamily: "monospace",
  },

  actions: {
    display: "flex",
    alignItems: "center",
    gap: "3px",
    opacity: "0",
    transitionProperty: "opacity",
    transitionDuration: tokens.transition,
  },
  actionsVisible: {
    opacity: "1",
  },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    padding: "1px 5px",
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

  btnSurface: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    fontWeight: "600",
    padding: "3px 7px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted,
    cursor: "pointer",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },
  btnRed: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    fontWeight: "600",
    padding: "3px 8px",
    backgroundColor: tokens.colorRed,
    border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    cursor: "pointer",
    textDecoration: "none",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorRedDark,
    },
  },
  btnYellow: {
    color: tokens.colorYellow,
    border: `1px solid rgba(245,197,24,0.2)`,
  },
});
