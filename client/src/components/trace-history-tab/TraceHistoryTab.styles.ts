import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useTraceHistoryStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  description: {
    fontSize: "12px",
    color: tokens.colorMuted,
    lineHeight: "1.6",
  },
  empty: {
    fontSize: "12px",
    color: tokens.colorMuted2,
    fontStyle: "italic",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "11px",
  },
  th: {
    textAlign: "left",
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    paddingBottom: "8px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  td: {
    paddingTop: "10px",
    paddingBottom: "10px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted,
    verticalAlign: "middle",
  },
  tdTitle: {
    color: tokens.colorWhite,
    fontWeight: "500",
    maxWidth: "160px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  traceCell: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  traceCode: {
    fontFamily: "monospace",
    fontSize: "10px",
    color: tokens.colorMuted,
    maxWidth: "110px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copyBtn: {
    flexShrink: "0",
    padding: "3px 8px",
    fontSize: "10px",
    fontWeight: "600",
    backgroundColor: "transparent",
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
  copyBtnDone: {
    color: tokens.colorGreen,
    border: `1px solid ${tokens.colorGreen}`,
    ":hover": {
      color: tokens.colorGreen,
      border: `1px solid ${tokens.colorGreen}`,
    },
  },
});
