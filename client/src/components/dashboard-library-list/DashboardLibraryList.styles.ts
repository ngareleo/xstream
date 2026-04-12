import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useDashboardLibraryListStyles = makeStyles({
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
  dirHeader: {
    display: "grid",
    gridTemplateColumns:
      "28px 1fr minmax(60px,80px) minmax(80px,1fr) minmax(50px,70px) minmax(80px,110px)",
    alignItems: "center",
    padding: "0 24px",
    height: "32px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
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
