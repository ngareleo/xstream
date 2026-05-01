import { makeStyles } from "@griffel/react";

export const useLoadingBarStyles = makeStyles({
  root: {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    height: "3px",
    zIndex: "9990",
    pointerEvents: "none",
    overflow: "visible",
  },
  track: {
    position: "absolute",
    inset: "0",
    transformOrigin: "left center",
    background: "#CE1126",
    boxShadow:
      "0 0 6px 1px rgba(206,17,38,0.7), 0 0 16px 2px rgba(206,17,38,0.35)",
  },
  trackLoading: {
    animationName: {
      "0%":   { transform: "scaleX(0)" },
      "12%":  { transform: "scaleX(0.28)" },
      "30%":  { transform: "scaleX(0.50)" },
      "52%":  { transform: "scaleX(0.66)" },
      "72%":  { transform: "scaleX(0.76)" },
      "88%":  { transform: "scaleX(0.82)" },
      "100%": { transform: "scaleX(0.88)" },
    },
    animationDuration: "2.4s",
    animationTimingFunction: "cubic-bezier(0.05, 0, 0.02, 1)",
    animationFillMode: "forwards",
  },
  trackCompleting: {
    animationName: {
      "0%":   { transform: "scaleX(0.88)", opacity: "1" },
      "45%":  { transform: "scaleX(1)", opacity: "1" },
      "65%":  { transform: "scaleX(1)", opacity: "1" },
      "100%": { transform: "scaleX(1)", opacity: "0" },
    },
    animationDuration: "0.65s",
    animationTimingFunction: "ease",
    animationFillMode: "forwards",
  },
  sheen: {
    position: "absolute",
    inset: "0",
    background:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 40%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.30) 60%, transparent 100%)",
    backgroundSize: "60px 100%",
    backgroundRepeat: "no-repeat",
    animationName: {
      "0%":   { backgroundPosition: "-60px 0" },
      "100%": { backgroundPosition: "200% 0" },
    },
    animationDuration: "1.1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  spark: {
    position: "absolute",
    right: "0",
    top: "50%",
    transform: "translateY(-50%)",
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "#ff8899",
    boxShadow:
      "0 0 4px 2px rgba(255,80,100,0.9), 0 0 10px 4px rgba(206,17,38,0.6), 0 0 20px 6px rgba(206,17,38,0.25)",
    animationName: {
      from: { opacity: "0.8", transform: "translateY(-50%) scale(1)" },
      to:   { opacity: "1",   transform: "translateY(-50%) scale(1.4)" },
    },
    animationDuration: "0.7s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationDirection: "alternate",
  },
});
