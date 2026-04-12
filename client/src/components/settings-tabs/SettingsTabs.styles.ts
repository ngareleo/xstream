import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useSettingsTabStyles = makeStyles({
  section: {
    marginBottom: "32px",
  },
  sectionTitle: {
    fontSize: "13px",
    fontWeight: "700",
    color: tokens.colorWhite,
    marginBottom: "4px",
  },
  sectionDesc: {
    fontSize: "12px",
    color: tokens.colorMuted,
    lineHeight: "1.6",
    marginBottom: "14px",
  },
  label: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    marginBottom: "6px",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
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
    boxSizing: "border-box",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    backgroundColor: tokens.colorRed,
    border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "10px",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorRedDark,
    },
    ":disabled": {
      opacity: "0.5",
      cursor: "default",
    },
  },
  successMsg: {
    fontSize: "11px",
    color: tokens.colorGreen,
    marginTop: "8px",
  },
  dangerZone: {
    border: `1px solid rgba(206,17,38,0.3)`,
    borderRadius: tokens.radiusMd,
    padding: "16px",
    backgroundColor: "rgba(206,17,38,0.04)",
  },
  dangerTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: tokens.colorRed,
    marginBottom: "8px",
  },
  dangerDesc: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.5)",
    lineHeight: "1.6",
    marginBottom: "12px",
  },
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 14px",
    backgroundColor: "transparent",
    border: `1px solid ${tokens.colorRedBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorRed,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "not-allowed",
    opacity: "0.5",
  },
});
