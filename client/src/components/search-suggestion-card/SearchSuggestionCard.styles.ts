import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useSearchSuggestionCardStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "10px 14px",
    background: "none",
    border: "none",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    cursor: "pointer",
    textAlign: "left",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    fontFamily: tokens.fontBody,
    ":hover": { backgroundColor: "rgba(255,255,255,0.05)" },
  },
  thumb: {
    width: "36px",
    height: "52px",
    borderRadius: "3px",
    flexShrink: "0",
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundColor: tokens.colorSurface2,
  },
  info: { display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" },
  title: {
    fontSize: "13px",
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  year: { fontSize: "11px", color: tokens.colorMuted2 },
});
