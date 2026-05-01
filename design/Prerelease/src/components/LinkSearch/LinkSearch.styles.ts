import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useLinkSearchStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", flex: "1", overflow: "hidden" },

  fileRow: {
    padding: "12px 16px 10px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface2,
  },
  fileLabel: {
    fontSize: "9px", fontWeight: "700", letterSpacing: "0.12em",
    textTransform: "uppercase", color: tokens.colorMuted2, marginBottom: "3px",
  },
  fileName: {
    fontSize: "11px", color: tokens.colorMuted, fontFamily: tokens.fontMono,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },

  inputWrap: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "10px 14px", borderBottom: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface, position: "relative",
  },
  searchIcon: { color: tokens.colorMuted2, flexShrink: "0" },
  input: {
    flex: "1", background: "none", border: "none", outlineStyle: "none",
    fontSize: "13px", fontFamily: tokens.fontBody, color: tokens.colorWhite, minWidth: "0",
    "::placeholder": { color: tokens.colorMuted2 },
  },
  spinner: { color: tokens.colorMuted2, flexShrink: "0" },
  clearBtn: {
    background: "none", border: "none", color: tokens.colorMuted2, cursor: "pointer",
    display: "flex", alignItems: "center", padding: "2px",
    borderRadius: "50%", flexShrink: "0",
    transitionProperty: "color, background", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorWhite, backgroundColor: "rgba(255,255,255,0.08)" },
  },

  suggestions: {
    flex: "1",
    overflowY: "auto",
    animationName: {
      from: { opacity: "0", transform: "translateY(-6px)" },
      to:   { opacity: "1", transform: "translateY(0)" },
    },
    animationDuration: "0.15s",
    animationTimingFunction: "ease",
    animationFillMode: "both",
  },

  item: {
    display: "flex", alignItems: "center", gap: "12px",
    width: "100%", padding: "10px 14px",
    background: "none", border: "none",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    cursor: "pointer", textAlign: "left",
    transitionProperty: "background", transitionDuration: tokens.transition,
    fontFamily: tokens.fontBody,
    ":hover": { backgroundColor: "rgba(255,255,255,0.05)" },
  },
  thumb: { width: "36px", height: "52px", borderRadius: "3px", flexShrink: "0", overflow: "hidden" },
  info:  { display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" },
  title: {
    fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.85)",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    transitionProperty: "color", transitionDuration: tokens.transition,
  },
  year: { fontSize: "11px", color: tokens.colorMuted2 },

  cancelBtn: {
    padding: "10px 16px", background: "none", border: "none",
    borderTop: `1px solid ${tokens.colorBorder}`,
    fontSize: "12px", fontFamily: tokens.fontBody, color: tokens.colorMuted2,
    cursor: "pointer", textAlign: "left", marginTop: "auto",
    transitionProperty: "color, background", transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorMuted, backgroundColor: "rgba(255,255,255,0.03)" },
  },
});
