import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useLibraryFilterBarStyles = makeStyles({
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0 20px",
    height: "48px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  searchInput: {
    flex: "1",
    maxWidth: "300px",
    padding: "6px 12px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    outlineStyle: "none",
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
    "::placeholder": {
      color: tokens.colorMuted2,
    },
  },
  filterSep: {
    width: "1px",
    height: "16px",
    backgroundColor: tokens.colorBorder,
    flexShrink: "0",
  },
  filterSelect: {
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    padding: "6px 10px",
    borderRadius: tokens.radiusSm,
    outlineStyle: "none",
    cursor: "pointer",
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
  },
  toggleBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "28px",
    background: "transparent",
    border: `1px solid transparent`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted,
    cursor: "pointer",
    transitionProperty: "color, border-color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      backgroundColor: tokens.colorSurface2,
    },
  },
  toggleBtnActive: {
    color: tokens.colorWhite,
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
  },
  filterCount: {
    marginLeft: "auto",
    fontSize: "11px",
    color: tokens.colorMuted2,
  },
});
