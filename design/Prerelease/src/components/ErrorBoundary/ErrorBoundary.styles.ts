import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")";

export const useErrorBoundaryStyles = makeStyles({
  // ── Shared root ───────────────────────────────────────────────────────────
  root: {
    position: "fixed", inset: "0", zIndex: "9999",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    overflowY: "auto", background: tokens.colorBlack, padding: "40px 16px",
  },
  grain: {
    position: "fixed", inset: "0", zIndex: "0", opacity: "0.2",
    pointerEvents: "none", backgroundImage: GRAIN_URL, backgroundSize: "200px 200px",
  },

  // ── DEV mode ──────────────────────────────────────────────────────────────
  dev: {
    alignItems: "flex-start",
    background: `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(206,17,38,0.06) 0%, transparent 60%), ${tokens.colorBlack}`,
  },
  panel: {
    position: "relative", zIndex: "1", width: "100%", maxWidth: "900px",
    display: "flex", flexDirection: "column", gap: "0",
    border: "1px solid rgba(206,17,38,0.3)", borderRadius: tokens.radiusMd, overflow: "hidden",
  },
  head: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "16px", padding: "14px 18px",
    background: "rgba(206,17,38,0.08)", borderBottom: "1px solid rgba(206,17,38,0.2)",
    flexWrap: "wrap",
  },
  headLeft: { display: "flex", alignItems: "center", gap: "12px" },
  iconWrap: {
    width: "32px", height: "32px", borderRadius: "50%",
    background: "rgba(206,17,38,0.15)", border: "1px solid rgba(206,17,38,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: tokens.colorRed, flexShrink: "0",
  },
  label: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em",
    textTransform: "uppercase", color: tokens.colorRed, marginBottom: "2px",
  },
  errorName: { fontSize: "13px", fontWeight: "600", color: tokens.colorWhite, fontFamily: tokens.fontMono },
  headActions: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  actionBtn: {
    display: "inline-flex", alignItems: "center", gap: "5px",
    padding: "5px 12px", fontSize: "11px", fontWeight: "600",
    fontFamily: tokens.fontBody, borderRadius: tokens.radiusSm,
    border: `1px solid ${tokens.colorBorder2}`, background: tokens.colorSurface2,
    color: tokens.colorMuted, cursor: "pointer", letterSpacing: "0.02em",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset",
    transitionProperty: "background, color, border-color, box-shadow", transitionDuration: tokens.transition,
    ":hover": {
      background: tokens.colorSurface3, color: tokens.colorWhite, borderColor: tokens.colorBorder2,
      boxShadow: "0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
    },
  },
  actionPrimary: {
    background: "rgba(206,17,38,0.12)", color: tokens.colorRed,
    borderColor: "rgba(206,17,38,0.3)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(206,17,38,0.08) inset",
    ":hover": {
      background: "rgba(206,17,38,0.2)", color: tokens.colorRed,
      boxShadow: "0 2px 8px rgba(206,17,38,0.2), 0 1px 0 rgba(206,17,38,0.1) inset",
    },
  },
  actionPreview: {
    color: "rgba(245,197,24,0.7)", borderColor: "rgba(245,197,24,0.2)", background: "rgba(245,197,24,0.06)",
    ":hover": { color: tokens.colorYellow, borderColor: "rgba(245,197,24,0.35)", background: "rgba(245,197,24,0.12)" },
  },
  message: {
    padding: "16px 18px", fontSize: "14px", fontWeight: "500", color: tokens.colorOffWhite,
    background: tokens.colorSurface, borderBottom: `1px solid ${tokens.colorBorder}`,
    fontFamily: tokens.fontMono, lineHeight: "1.5", wordBreak: "break-word",
  },
  sectionLabel: {
    padding: "8px 18px 0", fontSize: "9px", fontWeight: "700",
    letterSpacing: "0.14em", textTransform: "uppercase", color: tokens.colorMuted2,
    background: tokens.colorSurface,
  },
  code: {
    padding: "12px 18px 16px", fontFamily: tokens.fontMono,
    fontSize: "11px", lineHeight: "1.65", color: "rgba(255,255,255,0.5)",
    background: tokens.colorSurface, overflowX: "auto",
    whiteSpace: "pre", tabSize: "2", borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  componentStack: { color: "rgba(255,255,255,0.3)", fontSize: "10.5px" },

  // ── Dev preview banner ────────────────────────────────────────────────────
  previewBanner: {
    position: "fixed", top: "0", left: "0", right: "0", zIndex: "10000",
    display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px",
    background: "rgba(245,197,24,0.12)", borderBottom: "1px solid rgba(245,197,24,0.25)",
    fontSize: "11px",
  },
  previewLabel: {
    fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase",
    color: tokens.colorYellow, flexShrink: "0",
  },
  previewSub: { color: "rgba(245,197,24,0.55)", flex: "1" },
  previewBack: {
    marginLeft: "auto", flexShrink: "0",
    color: `${tokens.colorYellow} !important`,
    borderColor: "rgba(245,197,24,0.25) !important",
    background: "rgba(245,197,24,0.08) !important",
    ":hover": { background: "rgba(245,197,24,0.15) !important" },
  },

  // ── PROD mode ─────────────────────────────────────────────────────────────
  prod: {
    alignItems: "center", justifyContent: "center",
    background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(206,17,38,0.06) 0%, transparent 70%), ${tokens.colorBlack}`,
  },
  prodBody: {
    position: "relative", zIndex: "1",
    display: "flex", flexDirection: "column", alignItems: "center",
    textAlign: "center", gap: "14px", padding: "48px 32px", maxWidth: "440px",
  },
  prodTitle: {
    fontFamily: tokens.fontHead, fontSize: "28px",
    letterSpacing: "0.08em", color: tokens.colorWhite, textTransform: "uppercase",
  },
  prodSub: { fontSize: "13px", color: tokens.colorMuted, lineHeight: "1.6" },
  prodSteps: {
    width: "100%", marginTop: "4px",
    border: `1px solid ${tokens.colorBorder}`, borderRadius: tokens.radiusMd,
    overflow: "hidden", textAlign: "left",
  },
  prodStepLabel: {
    padding: "8px 16px", fontSize: "9px", fontWeight: "700",
    letterSpacing: "0.14em", textTransform: "uppercase", color: tokens.colorMuted2,
    background: tokens.colorSurface, borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  prodStep: {
    display: "flex", alignItems: "flex-start", gap: "12px",
    padding: "10px 16px", borderBottom: `1px solid ${tokens.colorBorder}`,
    ":last-child": { borderBottom: "none" },
  },
  prodStepNum: {
    width: "18px", height: "18px", borderRadius: "50%",
    background: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder2}`,
    fontSize: "10px", fontWeight: "700", color: tokens.colorMuted,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: "0", marginTop: "1px",
  },
  prodStepBody: { fontSize: "12px", color: "rgba(255,255,255,0.5)", lineHeight: "1.5" },
  prodActions: { display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap", justifyContent: "center" },
  prodContact: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: tokens.colorMuted2, marginTop: "4px" },
  prodLink: {
    color: tokens.colorMuted, textDecoration: "underline", textUnderlineOffset: "2px",
    textDecorationColor: "rgba(255,255,255,0.2)",
    transitionProperty: "color", transitionDuration: "0.12s", transitionTimingFunction: "ease",
    ":hover": { color: tokens.colorWhite, textDecorationColor: "rgba(255,255,255,0.5)" },
  },
  btnGhost: {
    background: "transparent", color: tokens.colorMuted, borderColor: tokens.colorBorder2,
    ":hover": { background: tokens.colorSurface2, color: tokens.colorWhite },
  },
});
