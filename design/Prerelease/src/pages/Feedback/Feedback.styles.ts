import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useFeedbackStyles = makeStyles({
  // ── Topbar ────────────────────────────────────────────────────────────────
  topbarTitle: { fontSize: "15px", fontWeight: "700", color: tokens.colorWhite },

  // ── Content + layout ─────────────────────────────────────────────────────
  content: { flex: "1", padding: "24px", overflowY: "auto" },
  layout: { display: "grid", gridTemplateColumns: "1fr 320px", gap: "28px" },

  // ── Page header ───────────────────────────────────────────────────────────
  pageHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" },
  pageTitle:  { fontSize: "20px", fontWeight: "700", color: tokens.colorWhite, marginBottom: "2px" },
  pageDesc:   { fontSize: "12px", color: tokens.colorMuted, lineHeight: "1.5" },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: tokens.colorSurface, border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusMd, overflow: "hidden",
  },
  cardPad: { padding: "18px" },

  // ── Form elements ─────────────────────────────────────────────────────────
  formGroup: { marginBottom: "16px" },
  formLabel: {
    display: "block", fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em",
    textTransform: "uppercase", color: tokens.colorMuted, marginBottom: "7px",
  },
  formInput: {
    width: "100%", backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "13px", padding: "9px 13px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", boxSizing: "border-box",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorRed },
    "::placeholder": { color: tokens.colorMuted2 },
    fontFamily: tokens.fontBody,
  },
  formTextarea: {
    width: "100%", backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "13px", padding: "9px 13px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", boxSizing: "border-box",
    resize: "vertical", lineHeight: "1.6", minHeight: "100px",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorRed },
    "::placeholder": { color: tokens.colorMuted2 },
    fontFamily: tokens.fontBody,
  },

  // ── Type chips ────────────────────────────────────────────────────────────
  typeChips: { display: "flex", flexWrap: "wrap", gap: "7px" },
  typeChip: {
    display: "inline-flex", alignItems: "center", gap: "5px",
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorMuted, fontSize: "12px", fontWeight: "500",
    padding: "6px 12px", borderRadius: tokens.radiusFull, cursor: "pointer",
    fontFamily: tokens.fontBody,
    transitionProperty: "color, border-color, background", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, borderColor: tokens.colorBorder2 },
  },
  typeChipActive: { backgroundColor: "rgba(255,255,255,0.04)" },

  // ── Submit button ─────────────────────────────────────────────────────────
  submitBtn: {
    display: "inline-flex", alignItems: "center", gap: "7px",
    padding: "10px 22px", backgroundColor: tokens.colorRed, border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm, color: tokens.colorWhite, fontSize: "13px", fontWeight: "700",
    cursor: "pointer", fontFamily: tokens.fontBody,
    transitionProperty: "background", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRedDark },
    ":disabled": { opacity: "0.45", cursor: "not-allowed" },
  },

  // ── Recent feedback list label ────────────────────────────────────────────
  recentLabel: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.16em",
    textTransform: "uppercase", color: tokens.colorMuted2, marginBottom: "12px",
  },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge: { display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "3px" },
  badgeRed:   { backgroundColor: tokens.colorRedDim, border: `1px solid ${tokens.colorRedBorder}`, color: "rgba(206,17,38,0.9)" },
  badgeGray:  { backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`, color: tokens.colorMuted },
  badgeGreen: { backgroundColor: "rgba(39,174,96,0.12)", border: "1px solid rgba(39,174,96,0.25)", color: tokens.colorGreen },
});
