import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useWatchlistStyles = makeStyles({
  // ── Topbar ────────────────────────────────────────────────────────────────
  topbarTitle: { fontSize: "15px", fontWeight: "700", color: tokens.colorWhite },
  topbarSub:   { fontSize: "12px", color: tokens.colorMuted },
  topbarSep:   { width: "1px", height: "16px", backgroundColor: "rgba(206,17,38,0.30)", flexShrink: "0" },

  // ── Content area + empty state ────────────────────────────────────────────
  content: { flex: "1", padding: "24px", overflowY: "auto" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "200px", gap: "10px", textAlign: "center", padding: "32px" },
  emptyIcon:  { fontSize: "36px", opacity: "0.25" },
  emptyTitle: { fontSize: "14px", fontWeight: "600", color: tokens.colorMuted },
  emptySub:   { fontSize: "12px", color: tokens.colorMuted2 },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge: { display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "3px" },
  badgeGray: { backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`, color: tokens.colorMuted },

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
  layout: { display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" },

  stats: { display: "flex", gap: "24px", marginBottom: "24px" },
  statNum: { fontFamily: tokens.fontHead, fontSize: "38px", letterSpacing: "0.04em", color: tokens.colorWhite, lineHeight: "1" },
  statNumGreen: { color: tokens.colorGreen },
  statNumRed: { color: tokens.colorRed },
  statLabel: { fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", color: tokens.colorMuted, marginTop: "3px" },

  sectionHead: { fontSize: "9px", fontWeight: "700", letterSpacing: "0.16em", textTransform: "uppercase", color: tokens.colorMuted2, marginBottom: "8px" },

  items: { display: "flex", flexDirection: "column", gap: "2px", marginBottom: "20px" },
  item: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "11px 14px", background: tokens.colorSurface2,
    borderRadius: tokens.radiusSm, borderLeft: "2px solid transparent",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
  },
  itemAvailable: { borderLeftColor: tokens.colorGreen },

  thumb: { width: "38px", height: "52px", borderRadius: "3px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center" },
  title: { fontSize: "13px", fontWeight: "600", color: tokens.colorWhite },
  meta:  { fontSize: "10px", color: tokens.colorMuted, marginTop: "1px" },
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", flexShrink: "0" },
  play: {
    display: "inline-flex", alignItems: "center", gap: "5px",
    background: tokens.colorRed, color: tokens.colorWhite,
    border: "none", borderRadius: "3px", fontSize: "11px", fontWeight: "700",
    padding: "5px 12px", cursor: "pointer", textDecoration: "none",
    ":hover": { background: tokens.colorRedDark },
  },
  remove: {
    background: "transparent", color: tokens.colorMuted2, border: "none",
    cursor: "pointer", padding: "3px",
    transitionProperty: "color", transitionDuration: tokens.transition,
    display: "flex", alignItems: "center",
    ":hover": { color: tokens.colorRed },
  },

  addPanel: { background: tokens.colorSurface, border: `1px solid ${tokens.colorBorder}`, borderRadius: tokens.radiusMd, overflow: "hidden" },
  addPanelHead: { padding: "14px 16px", borderBottom: `1px solid ${tokens.colorBorder}` },
  addPanelTitle: { fontSize: "13px", fontWeight: "700", color: tokens.colorWhite, marginBottom: "10px" },
  addPanelBody: { padding: "12px 16px" },

  searchResItem: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "9px 8px", borderRadius: tokens.radiusSm, cursor: "pointer",
    transitionProperty: "background", transitionDuration: tokens.transition,
    ":hover": { background: tokens.colorSurface2 },
  },
  searchResThumb: { width: "36px", height: "50px", borderRadius: "3px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center" },
  searchResTitle: { fontSize: "12px", fontWeight: "600", color: tokens.colorWhite },
  searchResMeta:  { fontSize: "10px", color: tokens.colorMuted, marginTop: "1px" },
  onDisk: { color: tokens.colorGreen, fontWeight: "600" },
});
