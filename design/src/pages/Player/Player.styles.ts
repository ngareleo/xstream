import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";

export const usePlayerStyles = makeStyles({
  // ── Root layout ────────────────────────────────────────────────────────────
  root: {
    width: "100vw", height: "100vh", background: "#000",
    display: "grid", gridTemplateColumns: "1fr 290px",
    overflow: "hidden", outlineStyle: "none",
    transitionProperty: "grid-template-columns", transitionDuration: "0.4s", transitionTimingFunction: "ease",
  },
  rootControlsHidden: {
    cursor: "none", gridTemplateColumns: "1fr 0px",
  },

  // ── Video area ────────────────────────────────────────────────────────────
  videoArea: { position: "relative", background: "#000", overflow: "hidden" },
  videoEl: {
    position: "absolute", inset: "0",
    width: "100%", height: "100%",
    objectFit: "cover", zIndex: "1", cursor: "pointer",
  },
  scene: {
    position: "absolute", inset: "0", zIndex: "0",
    background: "linear-gradient(135deg, #050510 0%, #0a0518 25%, #060606 50%, #100808 75%, #050505 100%)",
    "::after": {
      content: "''", position: "absolute", inset: "0",
      background: "radial-gradient(ellipse at 30% 55%, rgba(20,10,40,0.75) 0%, transparent 50%), radial-gradient(ellipse at 68% 38%, rgba(40,10,10,0.45) 0%, transparent 45%)",
    },
  },
  grain: {
    position: "absolute", inset: "0", pointerEvents: "none",
    opacity: "0.35", zIndex: "2",
    backgroundImage: GRAIN_URL,
  },
  letterbox: {
    position: "absolute", inset: "0", zIndex: "3",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 10%, transparent 88%, rgba(0,0,0,0.85) 100%)",
    pointerEvents: "none",
  },

  // ── Top bar ───────────────────────────────────────────────────────────────
  playerTopbar: {
    position: "absolute", top: "0", left: "0", right: "0",
    display: "flex", alignItems: "center",
    padding: "16px 20px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
    zIndex: "10", gap: "12px",
    transitionProperty: "opacity", transitionDuration: "0.4s", transitionTimingFunction: "ease",
  },
  playerTopbarHidden: { opacity: "0", pointerEvents: "none" },
  backBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    color: "rgba(255,255,255,0.55)", fontSize: "13px", fontWeight: "500",
    textDecoration: "none",
    transitionProperty: "color", transitionDuration: tokens.transition,
    background: "none", border: "none", padding: "0", cursor: "pointer",
    fontFamily: "inherit",
    ":hover": { color: tokens.colorWhite },
  },
  playerFilmTitle: { fontSize: "14px", fontWeight: "700", color: tokens.colorWhite },
  playerFilmMeta:  { fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "1px" },

  // ── Controls ─────────────────────────────────────────────────────────────
  playerControls: {
    position: "absolute", bottom: "0", left: "0", right: "0",
    background: "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
    padding: "36px 20px 16px", zIndex: "10",
    transitionProperty: "opacity", transitionDuration: "0.4s", transitionTimingFunction: "ease",
  },
  playerControlsHidden: { opacity: "0", pointerEvents: "none" },
  progressTimes: { display: "flex", justifyContent: "space-between", marginBottom: "5px" },
  progressTime: { fontSize: "11px", color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" },
  progressTrack: {
    height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px",
    position: "relative", cursor: "pointer", marginBottom: "12px",
  },
  progressBuffered: { position: "absolute", top: "0", left: "0", height: "100%", background: "rgba(255,255,255,0.07)", borderRadius: "2px" },
  progressPlayed: {
    position: "absolute", top: "0", left: "0", height: "100%",
    background: tokens.colorRed, borderRadius: "2px",
    transitionProperty: "width", transitionDuration: "0.1s",
  },
  progressThumb: {
    position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
    width: "14px", height: "14px", background: tokens.colorWhite,
    borderRadius: "50%", boxShadow: "0 0 8px rgba(206,17,38,0.55)",
  },
  controlsRow: { display: "flex", alignItems: "center", gap: "14px" },
  ctrl: {
    background: "transparent", border: "none", color: "rgba(255,255,255,0.55)",
    cursor: "pointer", padding: "3px",
    transitionProperty: "color", transitionDuration: tokens.transition,
    display: "flex", alignItems: "center",
    ":hover": { color: tokens.colorWhite },
  },
  ctrlPlay: { color: tokens.colorWhite },
  volWrap: { display: "flex", alignItems: "center", gap: "7px" },
  volTrack: { width: "64px", height: "3px", background: "rgba(255,255,255,0.12)", borderRadius: "2px", cursor: "pointer", position: "relative" },
  volFill: { height: "100%", background: "rgba(255,255,255,0.45)", borderRadius: "2px" },
  ctrlRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" },
  resSelect: {
    background: tokens.colorRedDim, border: `1px solid ${tokens.colorRedBorder}`,
    color: "rgba(206,17,38,0.9)", fontSize: "11px", fontWeight: "700",
    letterSpacing: "0.06em", padding: "4px 10px", borderRadius: "3px",
    cursor: "pointer", outlineStyle: "none",
  },

  // ── Side panel ────────────────────────────────────────────────────────────
  sidePanel: {
    background: "rgba(8,8,8,0.96)", borderLeft: "1px solid rgba(255,255,255,0.07)",
    display: "flex", flexDirection: "column",
    backdropFilter: "blur(20px)", overflow: "hidden",
    transitionProperty: "opacity", transitionDuration: "0.4s", transitionTimingFunction: "ease",
  },
  sidePanelHidden: { opacity: "0", pointerEvents: "none" },
  panelHead: { padding: "16px 15px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: "0" },
  panelNowTitle: { fontSize: "14px", fontWeight: "700", color: tokens.colorWhite, lineHeight: "1.3" },
  panelNowMeta: { fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "3px" },
  panelPlot: {
    fontSize: "11px", color: "rgba(255,255,255,0.35)", lineHeight: "1.6", marginTop: "8px",
    display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  panelBody: { flex: "1", overflowY: "auto" },
  panelSection: { padding: "12px 15px", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  panelSecLabel: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.22)", marginBottom: "8px",
  },
  panelItem: {
    display: "flex", alignItems: "center", gap: "9px", padding: "8px 0",
    cursor: "pointer", textDecoration: "none",
    transitionProperty: "opacity", transitionDuration: tokens.transition,
    ":hover": { opacity: "0.75" },
  },
  panelThumb: { width: "54px", height: "30px", borderRadius: "3px", flexShrink: "0", overflow: "hidden" },
  panelItemTitle: { fontSize: "12px", color: tokens.colorWhite, fontWeight: "500", lineHeight: "1.3" },
  panelItemMeta: { fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "1px" },
  panelPlay: {
    marginLeft: "auto", background: "rgba(206,17,38,0.12)",
    border: "1px solid rgba(206,17,38,0.22)", color: tokens.colorRed,
    fontSize: "11px", fontWeight: "700", padding: "3px 9px", borderRadius: "3px",
    cursor: "pointer", flexShrink: "0",
    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
  },
  panelFoot: {
    padding: "10px 15px", borderTop: "1px solid rgba(255,255,255,0.07)",
    display: "flex", flexDirection: "column", gap: "6px", flexShrink: "0",
  },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge: { display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "3px" },
  badgeRed:  { backgroundColor: tokens.colorRedDim, border: `1px solid ${tokens.colorRedBorder}`, color: "rgba(206,17,38,0.9)" },
  badgeGray: { backgroundColor: tokens.colorSurface2, border: `1px solid ${tokens.colorBorder}`, color: tokens.colorMuted },

  // ── Panel foot buttons ────────────────────────────────────────────────────
  btnSm: { fontSize: "12px", padding: "7px 16px" },
  btnSurface: {
    display: "inline-flex", alignItems: "center", gap: "7px",
    backgroundColor: tokens.colorSurface2, color: tokens.colorWhite, borderColor: tokens.colorBorder,
    borderRadius: tokens.radiusSm, border: `1px solid ${tokens.colorBorder}`,
    fontFamily: tokens.fontBody, fontWeight: "600", cursor: "pointer", justifyContent: "center",
    transitionProperty: "border-color", transitionDuration: tokens.transition,
    ":hover": { borderColor: tokens.colorBorder2 },
  },
  btnGhost: {
    display: "inline-flex", alignItems: "center", gap: "7px",
    backgroundColor: "transparent", color: tokens.colorMuted, borderColor: "transparent",
    borderRadius: tokens.radiusSm, border: "1px solid transparent",
    fontFamily: tokens.fontBody, fontWeight: "600", cursor: "pointer", justifyContent: "center",
    transitionProperty: "color, background, border-color", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, backgroundColor: tokens.colorSurface2, borderColor: tokens.colorBorder2 },
  },

  // ── Idle / loading overlay ────────────────────────────────────────────────
  preOverlay: {
    position: "absolute", inset: "0", zIndex: "5",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  },
  preOverlayLoading: { cursor: "default" },
  prePoster: { position: "absolute", inset: "0" },
  preVignette: {
    position: "absolute", inset: "0",
    background: "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.72) 100%), linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%, transparent 65%, rgba(0,0,0,0.75) 100%)",
  },
  prePlayWrap: {
    position: "relative", zIndex: "1",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "14px", textAlign: "center", padding: "0 40px",
  },
  prePlayBtn: {
    width: "72px", height: "72px", borderRadius: "50%",
    background: "rgba(206,17,38,0.15)", border: "1.5px solid rgba(206,17,38,0.5)",
    color: tokens.colorWhite, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", paddingLeft: "4px",
    transitionProperty: "background, border-color, transform", transitionDuration: "0.2s", transitionTimingFunction: "ease",
    ":hover": { background: "rgba(206,17,38,0.3)", borderColor: "rgba(206,17,38,0.85)", transform: "scale(1.06)" },
    ":active": { transform: "scale(0.97)" },
  },
  preFilmTitle: {
    fontFamily: tokens.fontHead, fontSize: "22px",
    letterSpacing: "0.06em", color: tokens.colorWhite,
    textShadow: "0 2px 12px rgba(0,0,0,0.8)",
  },
  preFilmMeta: { fontSize: "11px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em" },
  preSpinnerWrap: { position: "relative", zIndex: "1" },
  preSpinner: {
    width: "36px", height: "36px",
    border: "2px solid rgba(255,255,255,0.12)",
    borderTopColor: "rgba(206,17,38,0.85)",
    borderRadius: "50%",
    animationName: { to: { transform: "rotate(360deg)" } },
    animationDuration: "0.75s", animationTimingFunction: "linear", animationIterationCount: "infinite",
  },
});
