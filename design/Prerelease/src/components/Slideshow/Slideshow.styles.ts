import { makeStyles } from "@griffel/react";

export const useSlideshowStyles = makeStyles({
  root: {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
  },
  slide: {
    position: "absolute",
    inset: "0",
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: "0",
    transitionProperty: "opacity",
    transitionDuration: "0.8s",
    transitionTimingFunction: "ease",
  },
  slideActive:  { opacity: "1" },
  slideFading:  { opacity: "0" },
  overlay: {
    position: "absolute",
    inset: "0",
    background:
      "linear-gradient(to bottom, rgba(8,8,8,0.25) 0%, transparent 40%, rgba(8,8,8,0.55) 100%)",
    pointerEvents: "none",
  },
  caption: {
    position: "absolute",
    bottom: "36px",
    right: "20px",
    fontSize: "11px",
    fontWeight: "500",
    color: "rgba(255,255,255,0.48)",
    letterSpacing: "0.04em",
    textShadow: "0 1px 4px rgba(0,0,0,0.6)",
    pointerEvents: "none",
  },
  dots: {
    position: "absolute",
    bottom: "14px",
    right: "20px",
    display: "flex",
    gap: "5px",
  },
  dot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    border: "none",
    backgroundColor: "rgba(255,255,255,0.35)",
    cursor: "pointer",
    padding: "0",
    transitionProperty: "background, transform",
    transitionDuration: "0.2s",
    ":hover": { backgroundColor: "rgba(255,255,255,0.65)" },
  },
  dotActive: {
    backgroundColor: "rgba(206,17,38,0.9)",
    transform: "scale(1.3)",
  },
});
