import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useFlagsTabStyles = makeStyles({
  categoryBlock: {
    marginBottom: "28px",
  },
  categoryHeader: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    marginBottom: "10px",
    paddingBottom: "4px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  flagRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    padding: "10px 0",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    ":last-child": {
      borderBottom: "0px solid transparent",
    },
  },
  flagMeta: {
    flex: "1 1 auto",
    minWidth: "0",
  },
  flagName: {
    fontSize: "13px",
    fontWeight: "600",
    color: tokens.colorWhite,
    marginBottom: "2px",
  },
  flagDesc: {
    fontSize: "11px",
    color: tokens.colorMuted,
    lineHeight: "1.5",
  },
  defaultHint: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    marginLeft: "6px",
    fontWeight: "400",
    letterSpacing: "0.04em",
  },
  flagControl: {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
  },
  numberInput: {
    width: "80px",
    padding: "6px 8px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    outlineStyle: "none",
    textAlign: "right",
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
    boxSizing: "border-box",
  },
  toggle: {
    position: "relative",
    width: "36px",
    height: "20px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: "10px",
    cursor: "pointer",
    padding: "0",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
  },
  toggleOn: {
    backgroundColor: tokens.colorRed,
    border: `1px solid ${tokens.colorRed}`,
  },
  toggleThumb: {
    position: "absolute",
    top: "1px",
    left: "1px",
    width: "16px",
    height: "16px",
    backgroundColor: tokens.colorWhite,
    borderRadius: "50%",
    transitionProperty: "transform",
    transitionDuration: tokens.transition,
  },
  toggleThumbOn: {
    transform: "translateX(16px)",
  },
});
