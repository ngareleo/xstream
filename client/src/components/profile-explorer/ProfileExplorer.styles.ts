import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

import { GRID_COMPACT, GRID_FULL } from "./FilmRow.styles.js";

export const useProfileExplorerStyles = makeStyles({
  locationBar: {
    display: "flex",
    alignItems: "center",
    padding: "0 24px",
    height: "38px",
    backgroundColor: tokens.colorSurface,
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
  },
  locSep: {
    margin: "0 6px",
    color: tokens.colorMuted2,
    fontSize: "12px",
  },
  locCurrent: {
    fontSize: "12px",
    fontWeight: "600",
    color: tokens.colorWhite,
  },
  locPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "11px",
    fontWeight: "600",
    color: tokens.colorWhite,
    backgroundColor: tokens.colorRedDim,
    border: `1px solid ${tokens.colorRedBorder}`,
    borderRadius: "4px",
    padding: "1px 7px 1px 8px",
  },
  locPillX: {
    fontSize: "12px",
    cursor: "pointer",
    color: "rgba(255,255,255,0.5)",
    lineHeight: "1",
    background: "none",
    border: "none",
    padding: "0",
    ":hover": { color: tokens.colorWhite },
  },

  // Column header row
  dirHeader: {
    display: "grid",
    gridTemplateColumns: GRID_FULL,
    alignItems: "center",
    padding: "0 24px",
    height: "32px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
  },
  dirHeaderCompact: {
    gridTemplateColumns: GRID_COMPACT,
  },
  dirCol: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  dirList: {
    flex: "1",
    overflowY: "auto",
  },

  dirFooter: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    padding: "0 24px",
    height: "32px",
    borderTop: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
  },
  dirFooterStat: {
    fontSize: "11px",
    color: tokens.colorMuted2,
  },
  dirFooterStatNum: {
    color: tokens.colorMuted,
  },
});
