import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")";

export const useNotFoundStyles = makeStyles({
  root: {
    position: "relative",
    flex: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    minHeight: "0",
  },
  bg: {
    position: "absolute",
    inset: "0",
    background:
      "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(206,17,38,0.08) 0%, transparent 70%), #000",
    zIndex: "0",
  },
  grain: {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    opacity: "0.25",
    pointerEvents: "none",
    backgroundImage: GRAIN_URL,
    backgroundSize: "200px 200px",
  },
  body: {
    position: "relative",
    zIndex: "2",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "12px",
    padding: "40px 24px",
  },
  code: {
    fontFamily: tokens.fontHead,
    fontSize: "160px",
    lineHeight: "1",
    letterSpacing: "0.04em",
    color: tokens.colorRed,
    opacity: "0.18",
    userSelect: "none",
    marginBottom: "-12px",
  },
  title: {
    fontFamily: tokens.fontHead,
    fontSize: "32px",
    letterSpacing: "0.08em",
    color: tokens.colorWhite,
    textTransform: "uppercase",
  },
  sub: {
    fontSize: "13px",
    color: tokens.colorMuted,
    maxWidth: "340px",
    lineHeight: "1.6",
  },
  actions: {
    display: "flex",
    gap: "10px",
    marginTop: "8px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: `1px solid ${tokens.colorBorder2}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted,
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: tokens.fontBody,
    transitionProperty: "background, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorSurface2,
      color: tokens.colorWhite,
    },
  },
  btnRed: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    backgroundColor: tokens.colorRed,
    border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    fontFamily: tokens.fontBody,
    textDecoration: "none",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorRedDark,
    },
  },
});
