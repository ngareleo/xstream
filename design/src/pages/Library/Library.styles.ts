import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useLibraryStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  splitBody: {
    display: "grid", gridTemplateColumns: "1fr 0px 0px", flex: "1", minHeight: "0",
    transitionProperty: "grid-template-columns", transitionDuration: "0.25s", transitionTimingFunction: "ease", overflow: "hidden",
  },
  resizeHandle: {
    cursor: "col-resize", backgroundColor: tokens.colorBorder,
    transitionProperty: "background-color", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRed },
  },
  splitLeft: { overflow: "hidden", display: "flex", flexDirection: "column", minHeight: "0", minWidth: "0" },
  rightPane: { borderLeft: `1px solid ${tokens.colorBorder}`, backgroundColor: tokens.colorSurface, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: "0", minHeight: "0" },

  // ── Topbar ────────────────────────────────────────────────────────────────
  topbarTitle: { fontSize: "15px", fontWeight: "700", color: tokens.colorWhite },

  // ── Search wrap ───────────────────────────────────────────────────────────
  searchWrap:  { position: "relative" },
  searchIcon:  { position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: tokens.colorMuted2, pointerEvents: "none", display: "flex", alignItems: "center" },
  searchInput: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "13px", padding: "8px 12px 8px 34px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", width: "100%",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorBorder2 },
    "::placeholder": { color: tokens.colorMuted2 },
    fontFamily: tokens.fontBody, boxSizing: "border-box",
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "200px", gap: "10px", textAlign: "center", padding: "32px" },
  emptyIcon:  { fontSize: "36px", opacity: "0.25" },
  emptyTitle: { fontSize: "14px", fontWeight: "600", color: tokens.colorMuted },
  emptySub:   { fontSize: "12px", color: tokens.colorMuted2 },

  // ── Filter/view bar ───────────────────────────────────────────────────────
  filterBar: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "10px 20px", borderBottom: `1px solid ${tokens.colorBorder}`, flexShrink: "0", backgroundColor: tokens.colorSurface },
  filterSelect: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "12px", padding: "8px 12px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", cursor: "pointer",
    ":focus": { borderColor: tokens.colorRed },
  },
  iconBtn: {
    width: "32px", height: "32px", backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`, borderRadius: tokens.radiusSm,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: tokens.colorMuted,
    transitionProperty: "color, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },
  },
  iconBtnActive: { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },

  // ── Profile chips ─────────────────────────────────────────────────────────
  profileChips: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", padding: "14px 20px 20px" },
  chip: {
    display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 16px",
    fontSize: "12px", fontFamily: tokens.fontBody, fontWeight: "500", color: tokens.colorMuted,
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusFull, cursor: "pointer", whiteSpace: "nowrap",
    transitionProperty: "color, background, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },
  },
  chipActive: { color: tokens.colorWhite, backgroundColor: "rgba(206,17,38,0.12)", borderColor: "rgba(206,17,38,0.4)" },
  chipCount: { fontSize: "10px", color: tokens.colorMuted2, fontWeight: "400" },

  // ── Scroll wrapper — clips the scrolling area and renders the top fade ────
  scrollWrap: {
    flex: "1",
    minHeight: "0",
    position: "relative",
    "::before": {
      content: '""',
      position: "absolute",
      top: "0",
      left: "0",
      right: "0",
      height: "48px",
      background: "linear-gradient(to bottom, #080808 0%, transparent 100%)",
      zIndex: "1",
      pointerEvents: "none",
      opacity: "0",
      transitionProperty: "opacity",
      transitionDuration: "0.2s",
      transitionTimingFunction: "ease",
    },
  },
  scrollWrapScrolled: {
    "::before": { opacity: "1" },
  },

  // ── Grid view ─────────────────────────────────────────────────────────────
  gridArea: { height: "100%", overflowY: "auto", padding: "20px", boxSizing: "border-box" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px" },
  posterCard: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm, overflow: "hidden", cursor: "pointer",
    transitionProperty: "border-color, transform, box-shadow", transitionDuration: tokens.transition,
    ":hover": { borderColor: tokens.colorBorder2, transform: "translateY(-2px)", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" },
  },
  posterCardSelected: { borderColor: tokens.colorRedBorder, boxShadow: `0 0 0 1px ${tokens.colorRedBorder}` },
  posterImg: { aspectRatio: "2/3", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  posterInfo: { padding: "8px 10px" },
  posterTitle: { fontSize: "12px", fontWeight: "600", color: tokens.colorWhite, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  posterMeta: { fontSize: "10px", color: tokens.colorMuted, marginTop: "1px" },

  // ── List view ─────────────────────────────────────────────────────────────
  listArea: { height: "100%", overflowY: "auto", padding: "0 10px", boxSizing: "border-box" },
  listHeader: {
    display: "grid", gridTemplateColumns: "48px 1fr 110px 60px 72px 64px", gap: "0 12px",
    alignItems: "center", padding: "0 10px 8px 10px",
    borderBottom: `1px solid ${tokens.colorBorder}`, marginBottom: "2px",
  },
  listHeaderCell: { fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: tokens.colorMuted2 },
  listRow: {
    display: "grid", gridTemplateColumns: "48px 1fr 110px 60px 72px 64px", gap: "0 12px",
    alignItems: "center", padding: "6px 10px", borderRadius: tokens.radiusSm,
    cursor: "pointer", transitionProperty: "background", transitionDuration: tokens.transition,
    borderBottom: "1px solid transparent",
    ":hover": { backgroundColor: "rgba(255,255,255,0.04)" },
  },
  listRowSelected: { backgroundColor: "rgba(206,17,38,0.07)", borderBottomColor: "rgba(206,17,38,0.15)" },
  listThumb: { width: "48px", height: "68px", borderRadius: "3px", flexShrink: "0", overflow: "hidden", backgroundColor: tokens.colorSurface2 },
  listInfo: { minWidth: "0" },
  listTitle: { fontSize: "13px", fontWeight: "600", color: "rgba(245,245,245,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "1.3" },
  listMeta: { fontSize: "11px", color: tokens.colorMuted, marginTop: "3px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  listProfile: { fontSize: "10px", color: tokens.colorMuted2, padding: "1px 6px", backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`, borderRadius: tokens.radiusFull },
  listBadges: { display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" },
  listRating:   { fontSize: "12px", fontWeight: "700", color: tokens.colorYellow, textAlign: "right" },
  listDuration: { fontSize: "11px", color: tokens.colorMuted,  textAlign: "right", whiteSpace: "nowrap" },
  listSize:     { fontSize: "11px", color: tokens.colorMuted2, textAlign: "right", whiteSpace: "nowrap" },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge: { display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "3px" },
  badgeRed:  { backgroundColor: tokens.colorRedDim, border: `1px solid ${tokens.colorRedBorder}`, color: "rgba(206,17,38,0.9)" },
  badgeGray: { backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`, color: tokens.colorMuted },

  // ── Detail pane ───────────────────────────────────────────────────────────
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
    backgroundColor: "transparent", borderStyle: "none",
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
    borderRightStyle: "solid", borderRightWidth: "1px", borderRightColor: "rgba(206,17,38,0.20)",
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
    backgroundColor: "transparent", borderStyle: "none",
    borderLeftStyle: "solid", borderLeftWidth: "1px", borderLeftColor: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.38)", cursor: "pointer",
    transitionProperty: "color, text-shadow", transitionDuration: tokens.transition,
    ":hover": {
      color: "rgba(255,255,255,0.9)",
      textShadow: "0 0 6px rgba(255,255,255,0.6), 0 0 12px rgba(255,255,255,0.25)",
    },
  },
  sectionLabel: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em",
    textTransform: "uppercase", color: tokens.colorMuted2, marginBottom: "10px",
  },
  detailCast: { display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "8px" },
  castChip: {
    backgroundColor: tokens.colorSurface3, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted, fontSize: "10px", padding: "3px 8px", borderRadius: "3px",
  },
});
