import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useDashboardStyles = makeStyles({
  pageRoot: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },

  // ── Split layout ──────────────────────────────────────────────────────────
  splitBody: {
    display: "grid",
    gridTemplateColumns: "1fr 0px 0px",
    flex: "1", minHeight: "0",
    transitionProperty: "grid-template-columns",
    transitionDuration: "0.25s", transitionTimingFunction: "ease",
    overflow: "hidden",
  },
  resizeHandle: {
    cursor: "col-resize", backgroundColor: tokens.colorBorder,
    transitionProperty: "background-color", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRed },
  },
  splitLeft: { overflow: "hidden", display: "flex", flexDirection: "column", minHeight: "0", minWidth: "0" },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: { position: "relative", height: "220px", borderBottom: `1px solid ${tokens.colorBorder}`, flexShrink: "0", overflow: "hidden" },
  greeting: {
    position: "absolute", left: "0", bottom: "0", top: "0", zIndex: "2",
    width: "380px", display: "flex", flexDirection: "column", justifyContent: "flex-end",
    padding: "20px 28px",
    background: "linear-gradient(to right, rgba(8,8,8,0.80) 0%, rgba(8,8,8,0.60) 60%, transparent 100%)",
  },
  greetingText: {
    fontFamily: tokens.fontHead, fontSize: "32px", letterSpacing: "0.06em",
    color: tokens.colorWhite, lineHeight: "1", marginBottom: "6px",
    textShadow: "0 1px 8px rgba(0,0,0,0.6)",
  },
  greetingName: { color: tokens.colorRed, textShadow: "0 0 20px rgba(206,17,38,0.5)" },
  greetingSub: { fontSize: "11px", color: "rgba(255,255,255,0.58)", letterSpacing: "0.04em", textShadow: "0 1px 4px rgba(0,0,0,0.6)" },

  // ── Dir column headers ────────────────────────────────────────────────────
  dirHeader: {
    display: "grid",
    gridTemplateColumns: "28px 1fr minmax(60px,80px) minmax(80px,1fr) minmax(50px,70px) minmax(80px,110px)",
    alignItems: "center", padding: "0 24px", height: "32px",
    borderBottom: `1px solid ${tokens.colorBorder}`, flexShrink: "0",
  },
  dirHeaderOpen: {
    gridTemplateColumns: "28px 1fr 100px",
  },
  dirCol: {
    fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em",
    textTransform: "uppercase", color: tokens.colorMuted2,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    cursor: "pointer",
    ":hover": { color: tokens.colorMuted },
  },

  // ── Profile (dir) row ─────────────────────────────────────────────────────
  dirRow: {
    display: "grid",
    gridTemplateColumns: "28px 1fr minmax(60px,80px) minmax(80px,1fr) minmax(50px,70px) minmax(80px,110px)",
    alignItems: "center", padding: "0 24px", height: "46px",
    borderBottom: "1px solid rgba(255,255,255,0.035)",
    cursor: "pointer",
    transitionProperty: "background", transitionDuration: tokens.transition,
    borderLeft: "2px solid transparent", position: "relative",
    ":hover": { backgroundColor: tokens.colorSurface2 },
  },
  dirRowOpen: { gridTemplateColumns: "28px 1fr 100px" },
  dirRowSelected: { backgroundColor: "rgba(206,17,38,0.05)", borderLeftColor: tokens.colorRed },
  dirRowScanning: { opacity: "0.8" },
  dirIcon: { display: "flex", alignItems: "center", color: tokens.colorMuted, flexShrink: "0" },
  dirNameCell: { minWidth: "0", paddingRight: "16px" },
  dirName: { fontSize: "13px", fontWeight: "600", color: tokens.colorWhite, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  dirPath: { fontSize: "10px", color: tokens.colorMuted2, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "1px" },
  dirCell: { fontSize: "12px", color: tokens.colorMuted, whiteSpace: "nowrap" },
  dirCellMono: { fontFamily: "monospace", fontSize: "11px" },
  dirCellDim:  { color: tokens.colorMuted2 },
  dirActions: {
    display: "flex", alignItems: "center", gap: "4px", opacity: "0",
    transitionProperty: "opacity", transitionDuration: tokens.transition,
  },
  dirActionsVisible: { opacity: "1" },

  // ── Match bar ─────────────────────────────────────────────────────────────
  matchBar:   { display: "flex", alignItems: "center", gap: "6px" },
  matchTrack: { width: "36px", height: "3px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "2px", overflow: "hidden", flexShrink: "0" },
  matchFill:  { height: "100%", backgroundColor: tokens.colorGreen, borderRadius: "2px" },
  matchFillWarn: { backgroundColor: tokens.colorYellow },

  // ── Scan inline indicator ─────────────────────────────────────────────────
  scanInline: { display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: tokens.colorGreen },
  scanSpinner: {
    width: "8px", height: "8px",
    border: "1.5px solid rgba(39,174,96,0.25)", borderTopColor: tokens.colorGreen,
    borderRadius: "50%", flexShrink: "0",
    animationName: { to: { transform: "rotate(360deg)" } },
    animationDuration: "0.8s", animationTimingFunction: "linear", animationIterationCount: "infinite",
  },

  // ── Children (film rows) ──────────────────────────────────────────────────
  dirChildren: { overflow: "hidden", maxHeight: "0", transitionProperty: "max-height", transitionDuration: "0.25s", transitionTimingFunction: "ease" },
  dirChildrenOpen: { maxHeight: "2000px" },
  dirChildRow: {
    display: "grid",
    gridTemplateColumns: "28px 1fr minmax(60px,80px) minmax(80px,1fr) minmax(50px,70px) minmax(80px,110px)",
    alignItems: "center", padding: "0 24px 0 44px", height: "38px",
    borderBottom: "1px solid rgba(255,255,255,0.025)",
    backgroundColor: "rgba(0,0,0,0.18)",
    transitionProperty: "background", transitionDuration: tokens.transition,
    cursor: "pointer", position: "relative",
    ":hover": { backgroundColor: "rgba(206,17,38,0.04)" },
  },
  dirChildRowOpen: { gridTemplateColumns: "28px 1fr 45px 100px" },
  dirChildRowSelected: { backgroundColor: "rgba(206,17,38,0.07)", borderLeft: `2px solid ${tokens.colorRed}`, paddingLeft: "42px" },
  dirChildLine: {
    position: "absolute", left: "37px", top: "0", bottom: "0",
    width: "1px", background: "rgba(255,255,255,0.06)", pointerEvents: "none",
  },
  dirChildLineEnd: { bottom: "50%" },
  childIcon:     { display: "flex", alignItems: "center", color: tokens.colorMuted2, flexShrink: "0" },
  childIconWarn: { color: "rgba(245,197,24,0.5)" },
  childNameCell: { minWidth: "0", paddingRight: "12px" },
  childName:      { fontSize: "12px", fontWeight: "500", color: "rgba(245,245,245,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  childNameWarn:  { color: tokens.colorYellow },
  childFilename:  { fontSize: "10px", color: tokens.colorMuted2, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "1px" },
  childCell:      { fontSize: "11px", color: tokens.colorMuted2, whiteSpace: "nowrap" },
  childCellMono:  { fontFamily: "monospace" },
  childActions:   { display: "flex", alignItems: "center", gap: "4px", opacity: "0", transitionProperty: "opacity", transitionDuration: tokens.transition },
  childActionsVisible: { opacity: "1" },
  chevron: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", color: tokens.colorMuted2, flexShrink: "0", marginRight: "4px" },

  // ── Dir list (scrollable body) ────────────────────────────────────────────
  dirList: { flex: "1", overflowY: "auto" },

  // ── Footer ────────────────────────────────────────────────────────────────
  dirFooter: { display: "flex", alignItems: "center", gap: "20px", padding: "0 24px", height: "32px", borderTop: `1px solid ${tokens.colorBorder}`, flexShrink: "0" },
  dirFooterStat: { fontSize: "11px", color: tokens.colorMuted2 },
  dirFooterStatNum: { color: tokens.colorMuted },

  // ── Right pane ────────────────────────────────────────────────────────────
  rightPane: {
    borderLeft: `1px solid ${tokens.colorBorder}`, backgroundColor: tokens.colorSurface,
    display: "flex", flexDirection: "column", overflow: "hidden", minWidth: "0", minHeight: "0",
  },

  // ── Extension chips (new profile pane) ───────────────────────────────────
  extChips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  extChip: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted, fontSize: "11px", fontWeight: "600",
    padding: "4px 10px", borderRadius: "3px", cursor: "pointer",
    transitionProperty: "all", transitionDuration: tokens.transition, userSelect: "none",
    ":hover": { borderColor: tokens.colorBorder2, color: tokens.colorWhite },
  },
  extChipOn: { backgroundColor: tokens.colorRedDim, borderColor: tokens.colorRedBorder, color: "rgba(206,17,38,0.9)" },

  // ── New-profile pane header ───────────────────────────────────────────────
  paneHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 18px", borderBottom: `1px solid ${tokens.colorBorder}`, flexShrink: "0",
  },
  paneTitle: { fontFamily: tokens.fontHead, fontSize: "18px", letterSpacing: "0.06em", color: tokens.colorWhite },
  paneCloseBtn: {
    width: "28px", height: "28px", background: "rgba(0,0,0,0.3)", border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm, display: "flex", alignItems: "center", justifyContent: "center",
    color: tokens.colorMuted, cursor: "pointer",
    transitionProperty: "color, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },
  },
  paneBody: { flex: "1", overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: "18px" },
  paneFoot: { padding: "14px 18px", borderTop: `1px solid ${tokens.colorBorder}`, display: "flex", gap: "8px", flexShrink: "0" },
  formGroup: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" },
  formLabel: { fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", color: tokens.colorMuted2 },
  formInput: {
    width: "100%", padding: "8px 12px", backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`, borderRadius: tokens.radiusSm,
    color: tokens.colorWhite, fontSize: "12px", fontFamily: tokens.fontBody, outlineStyle: "none",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorRed }, "::placeholder": { color: tokens.colorMuted2 }, boxSizing: "border-box",
  },
  formSelect: {
    width: "100%", padding: "8px 12px", backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`, borderRadius: tokens.radiusSm,
    color: tokens.colorWhite, fontSize: "12px", fontFamily: tokens.fontBody, outlineStyle: "none",
    cursor: "pointer", appearance: "none", boxSizing: "border-box",
    ":focus": { borderColor: tokens.colorRed },
  },
  formRow: { display: "flex", gap: "8px" },
  formHint: { fontSize: "11px", color: tokens.colorMuted, marginTop: "5px" },

  // ── Buttons ───────────────────────────────────────────────────────────────
  btnRed: {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "9px 0", flex: "1", justifyContent: "center",
    backgroundColor: tokens.colorRed, border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm, color: tokens.colorWhite,
    fontSize: "12px", fontWeight: "700", cursor: "pointer",
    transitionProperty: "background", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRedDark },
  },
  btnSurface: {
    display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px",
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm, color: tokens.colorMuted,
    fontSize: "12px", fontWeight: "600", cursor: "pointer",
    transitionProperty: "color, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },
  },
  btnCancel: {
    display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px",
    backgroundColor: "transparent", border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm, color: tokens.colorMuted,
    fontSize: "12px", fontWeight: "600", cursor: "pointer",
    transitionProperty: "color, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },
  },

  // ── Topbar ────────────────────────────────────────────────────────────────
  topbarTitle: { fontSize: "15px", fontWeight: "700", color: tokens.colorWhite },
  topbarSub:   { fontSize: "12px", color: tokens.colorMuted },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge:    { display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "3px" },
  badgeRed: { backgroundColor: tokens.colorRedDim, borderTop: `1px solid ${tokens.colorRedBorder}`, borderRight: `1px solid ${tokens.colorRedBorder}`, borderBottom: `1px solid ${tokens.colorRedBorder}`, borderLeft: `1px solid ${tokens.colorRedBorder}`, color: "rgba(206,17,38,0.9)" },
  badgeGray:{ backgroundColor: tokens.colorSurface2, borderTop: `1px solid ${tokens.colorBorder}`, borderRight: `1px solid ${tokens.colorBorder}`, borderBottom: `1px solid ${tokens.colorBorder}`, borderLeft: `1px solid ${tokens.colorBorder}`, color: tokens.colorMuted },

  // ── Small (xs) action buttons for child rows ──────────────────────────────
  btnSurfaceXs: {
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "3px 7px",
    backgroundColor: tokens.colorSurface2,
    borderTop: `1px solid ${tokens.colorBorder}`, borderRight: `1px solid ${tokens.colorBorder}`,
    borderBottom: `1px solid ${tokens.colorBorder}`, borderLeft: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm, color: tokens.colorMuted,
    fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: tokens.fontBody,
    transitionProperty: "color, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderTopColor: tokens.colorBorder2, borderRightColor: tokens.colorBorder2, borderBottomColor: tokens.colorBorder2, borderLeftColor: tokens.colorBorder2 },
  },
  btnRedXs: {
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "3px 8px",
    backgroundColor: tokens.colorRed,
    borderTop: `1px solid ${tokens.colorRed}`, borderRight: `1px solid ${tokens.colorRed}`,
    borderBottom: `1px solid ${tokens.colorRed}`, borderLeft: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm, color: tokens.colorWhite,
    fontSize: "11px", fontWeight: "700", cursor: "pointer", textDecorationLine: "none",
    transitionProperty: "background", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRedDark },
  },
  btnYellow: {
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "3px 7px",
    backgroundColor: tokens.colorSurface2,
    borderTop: "1px solid rgba(245,197,24,0.2)", borderRight: "1px solid rgba(245,197,24,0.2)",
    borderBottom: "1px solid rgba(245,197,24,0.2)", borderLeft: "1px solid rgba(245,197,24,0.2)",
    borderRadius: tokens.radiusSm, color: tokens.colorYellow,
    fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: tokens.fontBody,
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":hover": { borderTopColor: "rgba(245,197,24,0.4)", borderRightColor: "rgba(245,197,24,0.4)", borderBottomColor: "rgba(245,197,24,0.4)", borderLeftColor: "rgba(245,197,24,0.4)" },
  },

  // ── FilmDetailPane action bar ─────────────────────────────────────────────
  fdActions: {
    position: "absolute", top: "0", left: "0", right: "0",
    display: "flex", alignItems: "stretch",
    height: "44px",
    backgroundColor: "rgba(0,0,0,0.44)",
    backdropFilter: "blur(10px) saturate(1.5)",
    clipPath: "polygon(0% 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%)",
    zIndex: "2", overflow: "hidden",
  },
  fdActionBtn: {
    display: "inline-flex", alignItems: "center", gap: "8px",
    padding: "0 20px",
    backgroundColor: "transparent",
    borderTopWidth: "0", borderRightWidth: "0", borderBottomWidth: "0", borderLeftWidth: "0",
    color: "rgba(255,255,255,0.48)",
    fontFamily: tokens.fontHead, fontSize: "15px", letterSpacing: "0.1em",
    cursor: "pointer", whiteSpace: "nowrap", textDecorationLine: "none",
    transitionProperty: "color, text-shadow", transitionDuration: tokens.transition,
    ":hover": {
      color: "rgba(255,255,255,0.92)",
      textShadow: "0 0 6px rgba(255,255,255,0.75), 0 0 14px rgba(255,255,255,0.35)",
      backgroundColor: "transparent",
    },
  },
  fdActionBtnPrimary: {
    color: "rgba(255,200,200,0.82)",
    backgroundColor: "rgba(206,17,38,0.28)",
    borderRightWidth: "1px", borderRightStyle: "solid", borderRightColor: "rgba(206,17,38,0.20)",
    ":hover": {
      color: "#fff",
      textShadow: "0 0 5px #fff, 0 0 10px rgba(255,80,80,0.95), 0 0 22px rgba(206,17,38,0.8), 0 0 42px rgba(206,17,38,0.4)",
      backgroundColor: "rgba(206,17,38,0.28)",
    },
  },
  fdActionBtnActive: { color: "rgba(255,255,255,0.9)" },
  fdActionSep: {
    width: "14px", flexShrink: "0", position: "relative",
    "::after": {
      content: '""', position: "absolute", left: "50%", top: "18%", bottom: "18%",
      width: "1px", backgroundColor: "rgba(206,17,38,0.28)", transform: "skewX(-15deg)",
    },
  },
  fdActionClose: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "44px", flexShrink: "0",
    backgroundColor: "transparent",
    borderTopWidth: "0", borderRightWidth: "0", borderBottomWidth: "0",
    borderLeftWidth: "1px", borderLeftStyle: "solid", borderLeftColor: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.38)", cursor: "pointer",
    transitionProperty: "color, text-shadow", transitionDuration: tokens.transition,
    ":hover": {
      color: "rgba(255,255,255,0.9)",
      textShadow: "0 0 6px rgba(255,255,255,0.6), 0 0 12px rgba(255,255,255,0.25)",
    },
  },

  // ── FilmDetailPane body ───────────────────────────────────────────────────
  rightPaneBody: { flex: "1", overflowY: "auto" },
  sectionLabel: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em",
    textTransform: "uppercase", color: tokens.colorMuted2, marginBottom: "10px",
  },
  detailCast: { display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "8px" },
  castChip: {
    backgroundColor: tokens.colorSurface3,
    borderTop: `1px solid ${tokens.colorBorder}`, borderRight: `1px solid ${tokens.colorBorder}`,
    borderBottom: `1px solid ${tokens.colorBorder}`, borderLeft: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted, fontSize: "10px", padding: "3px 8px", borderRadius: "3px",
  },
  fdInfoRow: {
    display: "grid", gridTemplateColumns: "80px 1fr",
    alignItems: "baseline", gap: "8px",
    paddingTop: "5px", paddingBottom: "5px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
});
