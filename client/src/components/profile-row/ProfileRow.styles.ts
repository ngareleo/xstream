import { makeStyles } from "@griffel/react";

import { GRID_COMPACT, GRID_FULL } from "~/components/film-row/FilmRow.styles.js";
import { tokens } from "~/styles/tokens";

export const useProfileRowStyles = makeStyles({
  row: {
    display: "grid",
    gridTemplateColumns: GRID_FULL,
    alignItems: "center",
    padding: "0 24px",
    height: "46px",
    borderBottom: `1px solid rgba(255,255,255,0.035)`,
    cursor: "pointer",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    borderLeft: "2px solid transparent",
    position: "relative",
    ":hover": {
      backgroundColor: tokens.colorSurface2,
    },
  },
  // Compact: pane is open — collapse to chevron | name | actions
  rowCompact: {
    gridTemplateColumns: GRID_COMPACT,
  },
  rowSelected: {
    backgroundColor: "rgba(206,17,38,0.05)",
    borderLeftColor: tokens.colorRed,
  },

  chevron: {
    display: "flex",
    alignItems: "center",
    color: tokens.colorMuted2,
    flexShrink: "0",
  },
  chevronInner: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    color: tokens.colorMuted2,
    flexShrink: "0",
    marginRight: "4px",
  },

  nameCell: {
    minWidth: "0",
    paddingRight: "16px",
    paddingLeft: "4px",
  },
  name: {
    fontSize: "13px",
    fontWeight: "600",
    color: tokens.colorWhite,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  path: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    fontFamily: "monospace",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: "1px",
  },

  cell: {
    fontSize: "12px",
    color: tokens.colorMuted,
    whiteSpace: "nowrap",
  },

  actions: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    opacity: "0",
    transitionProperty: "opacity",
    transitionDuration: tokens.transition,
  },
  actionsVisible: {
    opacity: "1",
  },

  scanLabel: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "10px",
    color: tokens.colorGreen,
    marginTop: "1px",
  },
  scanInline: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "10px",
    color: tokens.colorGreen,
  },
  scanSpinner: {
    width: "8px",
    height: "8px",
    border: `1.5px solid rgba(39,174,96,0.25)`,
    borderTopColor: tokens.colorGreen,
    borderRadius: "50%",
    animationName: {
      to: { transform: "rotate(360deg)" },
    },
    animationDuration: "0.8s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    flexShrink: "0",
  },

  matchBar: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  matchTrack: {
    width: "36px",
    height: "3px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "2px",
    overflow: "hidden",
    flexShrink: "0",
  },
  matchFill: {
    height: "100%",
    backgroundColor: tokens.colorGreen,
    borderRadius: "2px",
  },
  matchFillWarn: {
    backgroundColor: tokens.colorYellow,
  },

  children: {
    overflow: "hidden",
    maxHeight: "0",
    transitionProperty: "max-height",
    transitionDuration: "0.25s",
    transitionTimingFunction: "ease",
  },
  childrenOpen: {
    maxHeight: "2000px",
  },

  iconBtn: {
    width: "28px",
    height: "26px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    cursor: "pointer",
    color: tokens.colorMuted,
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },
});
