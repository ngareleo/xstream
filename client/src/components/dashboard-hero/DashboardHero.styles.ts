import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useDashboardHeroStyles = makeStyles({
  hero: {
    position: "relative",
    height: "220px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    overflow: "hidden",
  },
  greeting: {
    position: "absolute",
    left: "0",
    bottom: "0",
    top: "0",
    zIndex: "2",
    width: "380px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    padding: "20px 28px",
    background:
      "linear-gradient(to right, rgba(8,8,8,0.80) 0%, rgba(8,8,8,0.60) 60%, transparent 100%)",
  },
  greetingText: {
    fontFamily: tokens.fontHead,
    fontSize: "32px",
    letterSpacing: "0.06em",
    color: tokens.colorWhite,
    lineHeight: "1",
    marginBottom: "6px",
    textShadow: "0 1px 8px rgba(0,0,0,0.6)",
  },
  greetingName: {
    color: tokens.colorRed,
    textShadow: "0 0 20px rgba(206,17,38,0.5)",
  },
  greetingSub: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.58)",
    letterSpacing: "0.04em",
    textShadow: "0 1px 4px rgba(0,0,0,0.6)",
  },
});
