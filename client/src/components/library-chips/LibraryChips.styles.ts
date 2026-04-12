import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useLibraryChipsStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
    padding: "10px 20px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    fontWeight: "500",
    color: tokens.colorMuted,
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: "100px",
    cursor: "pointer",
    transitionProperty: "color, background, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },
  chipActive: {
    color: tokens.colorWhite,
    backgroundColor: "rgba(206,17,38,0.12)",
    border: `1px solid rgba(206,17,38,0.4)`,
  },
  chipCount: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    fontWeight: "400",
  },
});
