import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useDashboardStyles = makeStyles({
  // ── Page-level layout ────────────────────────────────────────────────────
  pageRoot: {
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

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    position: "relative",
    height: "220px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    overflow: "hidden",
  },
  greeting: {
    position: "absolute",
    left: "0",
    bottom: "0",
    top: "0",
    zIndex: "2",
    width: "380px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    padding: "20px 28px",
    background:
      "linear-gradient(to right, rgba(8,8,8,0.80) 0%, rgba(8,8,8,0.60) 60%, transparent 100%)",
  },
  greetingText: {
    fontFamily: tokens.fontHead,
    fontSize: "32px",
    letterSpacing: "0.06em",
    color: tokens.colorWhite,
    lineHeight: "1",
    marginBottom: "6px",
    textShadow: "0 1px 8px rgba(0,0,0,0.6)",
  },
  greetingName: {
    color: tokens.colorRed,
    textShadow: "0 0 20px rgba(206,17,38,0.5)",
  },
  greetingSub: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.58)",
    letterSpacing: "0.04em",
    textShadow: "0 1px 4px rgba(0,0,0,0.6)",
  },

  // ── Location bar ─────────────────────────────────────────────────────────
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

  // ── Directory column headers ──────────────────────────────────────────────
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

  // ── Scrollable list ───────────────────────────────────────────────────────
  dirList: {
    flex: "1",
    overflowY: "auto",
  },

  // ── Footer ────────────────────────────────────────────────────────────────
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

  // ── Right pane ────────────────────────────────────────────────────────────
  rightPane: {
    borderLeft: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: "0",
    minHeight: "0",
  },
  rightPaneHead: {
    padding: "18px 18px 14px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
  },
  rightPaneBody: {
    flex: "1",
    overflowY: "auto",
  },
  rightPaneFoot: {
    padding: "14px 18px",
    borderTop: `1px solid ${tokens.colorBorder}`,
    display: "flex",
    gap: "8px",
    flexShrink: "0",
  },

  // ── Page title ────────────────────────────────────────────────────────────
  topbarTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: tokens.colorWhite,
  },
});
