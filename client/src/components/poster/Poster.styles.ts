import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

// `frame` is the outer wrapper; the consumer's `className` gives it its
// dimensions. The placeholder sits absolutely-positioned beneath the img
// so a broken image (img→display:none in onError) reveals it without any
// React state update. Plain CSS layering — no act() boundary trips.
export const usePosterStyles = makeStyles({
  frame: {
    position: "relative",
    overflow: "hidden",
  },
  image: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  placeholder: {
    position: "absolute",
    inset: 0,
    background: `linear-gradient(160deg, ${tokens.colorSurface2}, ${tokens.colorBg0})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorTextFaint,
    fontFamily: tokens.fontMono,
    fontSize: "10px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    textAlign: "center",
    paddingLeft: "8px",
    paddingRight: "8px",
    boxSizing: "border-box",
  },
  // Standalone placeholder for the "no URL" case — same gradient as the
  // overlay variant but takes its size from the className (consumer's
  // wrapper) rather than from a relative ancestor.
  placeholderStandalone: {
    background: `linear-gradient(160deg, ${tokens.colorSurface2}, ${tokens.colorBg0})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorTextFaint,
    fontFamily: tokens.fontMono,
    fontSize: "10px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    textAlign: "center",
  },
});
