import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";

export const usePlayerStyles = makeStyles({
  // ── Suspense fallback — mirrors PlayerContent root layout ───────────────────
  rootFallback: {
    position: "fixed",
    inset: "0",
    display: "grid",
    gridTemplateColumns: `1fr ${tokens.playerPanelWidth}`,
    overflow: "hidden",
    backgroundColor: "#000",
    fontFamily: tokens.fontBody,
    alignItems: "center",
    justifyItems: "center",
  },

  // Film-grain for the fallback background
  grain: {
    position: "absolute",
    inset: "0",
    opacity: "0.35",
    pointerEvents: "none",
    backgroundImage: GRAIN_URL,
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

  notFound: {
    padding: "32px",
    color: "#f0f0f5",
  },
});
