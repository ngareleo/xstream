import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";

export const usePlayerContentStyles = makeStyles({
  root: {
    position: "fixed",
    inset: "0",
    display: "grid",
    gridTemplateColumns: `1fr ${tokens.playerPanelWidth}`,
    overflow: "hidden",
    backgroundColor: "#000",
    fontFamily: tokens.fontBody,
    outline: "none",
    transitionProperty: "grid-template-columns",
    transitionDuration: "0.4s",
    transitionTimingFunction: "ease",
  },
  rootHidden: {
    gridTemplateColumns: "1fr 0px",
    cursor: "none",
  },
  videoArea: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  scene: {
    position: "absolute",
    inset: "0",
    zIndex: "0",
    pointerEvents: "none",
    background:
      "linear-gradient(135deg, #050510 0%, #0a0518 25%, #060606 50%, #100808 75%, #050505 100%)",
  },
  grain: {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    opacity: "0.35",
    pointerEvents: "none",
    backgroundImage: GRAIN_URL,
  },
  letterbox: {
    position: "absolute",
    inset: "0",
    zIndex: "3",
    pointerEvents: "none",
    background:
      "linear-gradient(to bottom, rgba(0,0,0,0.80) 0%, transparent 10%, transparent 88%, rgba(0,0,0,0.85) 100%)",
  },
  videoWrapper: {
    position: "absolute",
    inset: "0",
    zIndex: "1",
  },
  topBar: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    display: "flex",
    alignItems: "center",
    padding: "16px 20px",
    gap: "12px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
    zIndex: "10",
    transitionProperty: "opacity",
    transitionDuration: "0.4s",
    transitionTimingFunction: "ease",
  },
  topBarHidden: {
    opacity: "0",
    pointerEvents: "none",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "rgba(255,255,255,0.55)",
    fontSize: "13px",
    fontWeight: "500",
    background: "none",
    border: "none",
    padding: "0",
    cursor: "pointer",
    fontFamily: "inherit",
    transitionProperty: "color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
    },
  },
  topDivider: {
    width: "1px",
    height: "14px",
    backgroundColor: "rgba(255,255,255,0.12)",
    flexShrink: "0",
  },
  videoTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: tokens.colorWhite,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  skeleton: {
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: `3px solid rgba(255,255,255,0.12)`,
    borderTopColor: "rgba(206,17,38,0.85)",
    animationName: {
      to: { transform: "rotate(360deg)" },
    },
    animationDuration: "0.75s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
});
