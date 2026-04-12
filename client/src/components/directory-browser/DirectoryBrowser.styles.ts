import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useDirectoryBrowserStyles = makeStyles({
  panel: {
    backgroundColor: tokens.colorSurface3,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    overflow: "hidden",
  },
  breadcrumb: {
    padding: "6px 10px",
    fontSize: "10px",
    fontFamily: tokens.fontMono,
    color: tokens.colorMuted,
    borderBottom: `1px solid ${tokens.colorBorder}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  list: {
    maxHeight: "160px",
    overflowY: "auto",
  },
  entry: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    fontSize: "12px",
    color: tokens.colorMuted,
    cursor: "pointer",
    borderBottom: `1px solid rgba(255,255,255,0.03)`,
    background: "transparent",
    width: "100%",
    textAlign: "left",
    transitionProperty: "background, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.04)",
      color: tokens.colorWhite,
    },
  },
  entryUp: {
    color: tokens.colorMuted2,
    fontStyle: "italic",
  },
  empty: {
    padding: "12px 10px",
    fontSize: "11px",
    color: tokens.colorMuted2,
    textAlign: "center",
  },
  actions: {
    padding: "6px 10px",
    borderTop: `1px solid ${tokens.colorBorder}`,
    display: "flex",
    justifyContent: "flex-end",
  },
  selectBtn: {
    padding: "4px 10px",
    backgroundColor: tokens.colorRed,
    border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorRedDark,
    },
  },
});
