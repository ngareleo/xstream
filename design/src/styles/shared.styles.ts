/**
 * Shared Griffel styles — common UI primitives used across multiple pages.
 *
 * Import the hook you need and call it inside your component:
 *   const ui = useUiStyles();
 *   <button className={mergeClasses(ui.btn, ui.btnRed, ui.btnMd)}>...</button>
 */

import { makeStyles } from "@griffel/react";

import { tokens } from "./tokens.js";

// ── Buttons ───────────────────────────────────────────────────────────────────
export const useBtnStyles = makeStyles({
  btn: {
    display: "inline-flex", alignItems: "center", gap: "7px",
    fontFamily: tokens.fontBody, fontWeight: "600", letterSpacing: "0.03em",
    borderRadius: tokens.radiusSm, border: "1px solid transparent",
    transitionProperty: "all", transitionDuration: tokens.transition,
    cursor: "pointer", whiteSpace: "nowrap",
  },
  btnXs: { fontSize: "11px", padding: "5px 12px" },
  btnSm: { fontSize: "12px", padding: "7px 16px" },
  btnMd: { fontSize: "13px", padding: "10px 22px" },
  btnLg: { fontSize: "15px", padding: "14px 30px" },
  btnRed: {
    backgroundColor: tokens.colorRed, color: tokens.colorWhite, borderColor: tokens.colorRed,
    ":hover": { backgroundColor: tokens.colorRedDark, borderColor: tokens.colorRedDark },
  },
  btnOutline: {
    backgroundColor: "transparent", color: tokens.colorWhite, borderColor: tokens.colorBorder2,
    ":hover": { borderColor: tokens.colorMuted },
  },
  btnGhost: {
    backgroundColor: "transparent", color: tokens.colorMuted, borderColor: "transparent",
    ":hover": { color: tokens.colorWhite, backgroundColor: tokens.colorSurface2, borderColor: tokens.colorBorder2 },
  },
  btnSurface: {
    backgroundColor: tokens.colorSurface2, color: tokens.colorWhite, borderColor: tokens.colorBorder,
    ":hover": { borderColor: tokens.colorBorder2 },
  },
  btnDanger: {
    backgroundColor: "transparent", color: "rgba(206,17,38,0.8)", borderColor: "rgba(206,17,38,0.25)",
    ":hover": { backgroundColor: tokens.colorRedDim },
  },
  btnDisabled: { opacity: "0.45", cursor: "not-allowed" },
});

// ── Badges ────────────────────────────────────────────────────────────────────
export const useBadgeStyles = makeStyles({
  badge: {
    display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: "700",
    letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "3px",
  },
  badgeRed:    { backgroundColor: tokens.colorRedDim, border: `1px solid ${tokens.colorRedBorder}`, color: "rgba(206,17,38,0.9)" },
  badgeGray:   { backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`, color: tokens.colorMuted },
  badgeGreen:  { backgroundColor: "rgba(39,174,96,0.12)", border: "1px solid rgba(39,174,96,0.25)", color: tokens.colorGreen },
  badgeYellow: { backgroundColor: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.2)", color: tokens.colorYellow },
});

// ── Topbar sub-elements ───────────────────────────────────────────────────────
export const useTopbarStyles = makeStyles({
  title: { fontSize: "15px", fontWeight: "700", color: tokens.colorWhite },
  sub:   { fontSize: "12px", color: tokens.colorMuted },
  sep:   { width: "1px", height: "16px", backgroundColor: "rgba(206,17,38,0.30)", flexShrink: "0" },
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" },
});

// ── Card ──────────────────────────────────────────────────────────────────────
export const useCardStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorSurface, border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusMd, overflow: "hidden",
  },
  cardPad: { padding: "18px" },
});

// ── Forms ─────────────────────────────────────────────────────────────────────
export const useFormStyles = makeStyles({
  group: { marginBottom: "16px" },
  label: {
    display: "block", fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em",
    textTransform: "uppercase", color: tokens.colorMuted, marginBottom: "7px",
  },
  input: {
    width: "100%", backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "13px", padding: "9px 13px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", boxSizing: "border-box",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorRed },
    "::placeholder": { color: tokens.colorMuted2 },
    fontFamily: tokens.fontBody,
  },
  textarea: {
    width: "100%", backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "13px", padding: "9px 13px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", boxSizing: "border-box",
    resize: "vertical", lineHeight: "1.6", minHeight: "100px",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorRed },
    "::placeholder": { color: tokens.colorMuted2 },
    fontFamily: tokens.fontBody,
  },
  hint: { fontSize: "11px", color: tokens.colorMuted, marginTop: "5px" },
  row:  { display: "flex", gap: "8px" },
});

// ── Search wrap ───────────────────────────────────────────────────────────────
export const useSearchStyles = makeStyles({
  wrap:  { position: "relative" },
  icon:  { position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: tokens.colorMuted2, pointerEvents: "none", display: "flex", alignItems: "center" },
  input: {
    backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite, fontSize: "13px", padding: "8px 12px 8px 34px",
    borderRadius: tokens.radiusSm, outlineStyle: "none", width: "100%",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":focus": { borderColor: tokens.colorBorder2 },
    "::placeholder": { color: tokens.colorMuted2 },
    fontFamily: tokens.fontBody,
    boxSizing: "border-box",
  },
});

// ── Empty state ───────────────────────────────────────────────────────────────
export const useEmptyStateStyles = makeStyles({
  root:  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "200px", gap: "10px", textAlign: "center", padding: "32px" },
  icon:  { fontSize: "36px", opacity: "0.25" },
  title: { fontSize: "14px", fontWeight: "600", color: tokens.colorMuted },
  sub:   { fontSize: "12px", color: tokens.colorMuted2 },
});

// ── Content area ─────────────────────────────────────────────────────────────
export const useContentStyles = makeStyles({
  content: { flex: "1", padding: "24px", overflowY: "auto" },
});

// ── Page header ───────────────────────────────────────────────────────────────
export const usePageHeaderStyles = makeStyles({
  root:  { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" },
  title: { fontSize: "20px", fontWeight: "700", color: tokens.colorWhite, marginBottom: "2px" },
  desc:  { fontSize: "12px", color: tokens.colorMuted, lineHeight: "1.5" },
});

// ── Section label ─────────────────────────────────────────────────────────────
export const useSectionLabelStyles = makeStyles({
  label: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em",
    textTransform: "uppercase", color: tokens.colorMuted2, marginBottom: "10px",
  },
});

// ── Toggle ────────────────────────────────────────────────────────────────────
export const useToggleStyles = makeStyles({
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
});
