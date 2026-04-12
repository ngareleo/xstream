import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")";

export const useGoodbyeStyles = makeStyles({
  root: {
    position: "fixed", inset: "0", display: "flex",
    alignItems: "center", justifyContent: "center", backgroundColor: "#000", overflow: "hidden",
  },
  grain: {
    position: "absolute", inset: "0", opacity: "0.18", pointerEvents: "none",
    backgroundImage: GRAIN_URL, backgroundSize: "200px 200px",
  },
  glow: {
    position: "absolute", inset: "0",
    background: "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(206,17,38,0.07) 0%, transparent 65%)",
    pointerEvents: "none",
  },
  ghost: {
    position: "absolute", fontFamily: tokens.fontHead,
    fontSize: "clamp(100px, 20vw, 220px)", letterSpacing: "0.1em",
    color: tokens.colorWhite, opacity: "0.03", userSelect: "none", pointerEvents: "none", whiteSpace: "nowrap",
  },
  body: {
    position: "relative", zIndex: "1",
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
    gap: "16px", padding: "40px 24px",
  },
  title: { fontFamily: tokens.fontHead, fontSize: "28px", letterSpacing: "0.08em", color: tokens.colorWhite, marginTop: "8px" },
  sub:   { fontSize: "13px", color: tokens.colorMuted, maxWidth: "320px", lineHeight: "1.6" },
  actions: { display: "flex", alignItems: "center", gap: "16px", marginTop: "8px", flexWrap: "wrap", justifyContent: "center" },
  btnMd: { fontSize: "13px", padding: "10px 22px" },
  btnRed: {
    display: "inline-flex", alignItems: "center", gap: "7px",
    backgroundColor: tokens.colorRed, border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm, color: tokens.colorWhite, fontWeight: "700",
    cursor: "pointer", fontFamily: tokens.fontBody,
    transitionProperty: "background", transitionDuration: tokens.transition,
    ":hover": { backgroundColor: tokens.colorRedDark },
  },
  countdown: { fontSize: "12px", color: tokens.colorMuted2 },
});
