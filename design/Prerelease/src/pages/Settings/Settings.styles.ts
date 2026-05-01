import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useSettingsStyles = makeStyles({
  // ── Topbar ────────────────────────────────────────────────────────────────
  topbarTitle: { fontSize: "15px", fontWeight: "700", color: tokens.colorWhite },

  // ── Content + layout ─────────────────────────────────────────────────────
  content: { flex: "1", padding: "24px", overflowY: "auto" },
  layout:  { display: "grid", gridTemplateColumns: "180px 1fr", gap: "28px" },

  // ── Left nav ──────────────────────────────────────────────────────────────
  nav: { display: "flex", flexDirection: "column", gap: "2px" },
  navItem: {
    display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
    fontSize: "13px", color: tokens.colorMuted, borderRadius: tokens.radiusSm,
    cursor: "pointer", textDecoration: "none",
    transitionProperty: "color, background", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, backgroundColor: tokens.colorSurface2 },
  },
  navItemActive: {
    color: tokens.colorWhite, backgroundColor: tokens.colorSurface2,
    borderLeft: `2px solid ${tokens.colorRed}`, paddingLeft: "10px",
  },

  // ── Panels area ───────────────────────────────────────────────────────────
  panels: { display: "flex", flexDirection: "column", gap: "18px" },

  // ── Setting block ─────────────────────────────────────────────────────────
  block: {
    backgroundColor: tokens.colorSurface, border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusMd, overflow: "hidden",
  },
  blockHead: { padding: "14px 18px", borderBottom: `1px solid ${tokens.colorBorder}` },
  blockTitle:{ fontSize: "14px", fontWeight: "700", color: tokens.colorWhite },
  blockDesc: { fontSize: "11px", color: tokens.colorMuted, marginTop: "2px" },

  // ── Setting row ───────────────────────────────────────────────────────────
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "13px 18px", borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  rowLast: { borderBottom: "none" },
  sLabel:  { fontSize: "13px", color: tokens.colorWhite, fontWeight: "500" },
  sHint:   { fontSize: "11px", color: tokens.colorMuted, marginTop: "2px" },

  // ── Select ────────────────────────────────────────────────────────────────
  sSelect: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "12px", padding: "7px 12px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", cursor: "pointer",
    minWidth: "150px", fontFamily: tokens.fontBody,
  },

  // ── Form input ────────────────────────────────────────────────────────────
  formInput: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "12px", padding: "6px 10px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", fontFamily: tokens.fontBody,
    ":focus": { borderColor: tokens.colorRed },
    "::placeholder": { color: tokens.colorMuted2 },
  },

  // ── Toggle ────────────────────────────────────────────────────────────────
  toggle: {
    width: "38px", height: "21px", backgroundColor: tokens.colorSurface3,
    border: `1px solid ${tokens.colorBorder2}`, borderRadius: "11px",
    position: "relative", cursor: "pointer", flexShrink: "0",
    transitionProperty: "background, border-color", transitionDuration: tokens.transition,
  },
  toggleOn: { backgroundColor: tokens.colorRed, borderColor: tokens.colorRed },
  toggleThumb: {
    position: "absolute", top: "2px", left: "2px",
    width: "15px", height: "15px", backgroundColor: tokens.colorMuted,
    borderRadius: "50%", transitionProperty: "left, background", transitionDuration: tokens.transition,
  },
  toggleThumbOn: { left: "19px", backgroundColor: tokens.colorWhite },

  // ── Danger button ─────────────────────────────────────────────────────────
  btnDanger: {
    display: "inline-flex", alignItems: "center", gap: "6px",
    fontSize: "12px", padding: "7px 16px",
    backgroundColor: "transparent", border: `1px solid rgba(206,17,38,0.25)`,
    borderRadius: tokens.radiusSm, color: "rgba(206,17,38,0.8)", cursor: "pointer",
    fontFamily: tokens.fontBody, fontWeight: "600",
    transitionProperty: "background", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRedDim },
  },
});
