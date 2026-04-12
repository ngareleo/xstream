import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useNewProfilePaneStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
  },
  headerTitle: {
    fontFamily: tokens.fontHead,
    fontSize: "18px",
    letterSpacing: "0.06em",
    color: tokens.colorWhite,
  },
  closeBtn: {
    width: "28px",
    height: "28px",
    background: "rgba(0,0,0,0.3)",
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorMuted,
    cursor: "pointer",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },

  // ── Form body ─────────────────────────────────────────────────────────────
  body: {
    flex: "1",
    overflowY: "visible",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },

  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    outlineStyle: "none",
    transitionProperty: "border-color",
    transitionDuration: tokens.transition,
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
    "::placeholder": {
      color: tokens.colorMuted2,
    },
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontBody,
    outlineStyle: "none",
    cursor: "pointer",
    transitionProperty: "border-color",
    transitionDuration: tokens.transition,
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
    appearance: "none",
    boxSizing: "border-box",
  },

  // ── Path row + floating browser ───────────────────────────────────────────
  pathSection: {
    position: "relative",
  },
  browserFloat: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "0",
    right: "0",
    zIndex: 50,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    borderRadius: tokens.radiusSm,
    overflow: "hidden",
  },
  pathRow: {
    display: "flex",
    gap: "6px",
    alignItems: "stretch",
  },
  pathInput: {
    flex: "1",
    padding: "8px 12px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontFamily: tokens.fontMono,
    outlineStyle: "none",
    transitionProperty: "border-color",
    transitionDuration: tokens.transition,
    ":focus": {
      border: `1px solid ${tokens.colorRed}`,
    },
    "::placeholder": {
      color: tokens.colorMuted2,
    },
    boxSizing: "border-box",
  },
  browseBtn: {
    padding: "0 10px",
    backgroundColor: tokens.colorSurface2,
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted,
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },
  browseBtnActive: {
    color: tokens.colorWhite,
    border: `1px solid ${tokens.colorBorder2}`,
  },

  // ── Extension chips ───────────────────────────────────────────────────────
  extChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
  },
  extChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: tokens.radiusSm,
    fontSize: "11px",
    fontWeight: "600",
    fontFamily: tokens.fontMono,
    cursor: "pointer",
    border: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface3,
    color: tokens.colorMuted,
    transitionProperty: "background, border-color, color",
    transitionDuration: tokens.transition,
    ":hover": {
      border: `1px solid ${tokens.colorBorder2}`,
      color: tokens.colorWhite,
    },
  },
  extChipActive: {
    backgroundColor: tokens.colorRedDim,
    border: `1px solid ${tokens.colorRedBorder}`,
    color: tokens.colorRed,
  },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorMsg: {
    fontSize: "11px",
    color: tokens.colorRed,
    padding: "8px 12px",
    backgroundColor: tokens.colorRedDim,
    border: `1px solid ${tokens.colorRedBorder}`,
    borderRadius: tokens.radiusSm,
  },

  // ── Footer actions ────────────────────────────────────────────────────────
  footer: {
    padding: "14px 18px",
    borderTop: `1px solid ${tokens.colorBorder}`,
    display: "flex",
    gap: "8px",
    flexShrink: "0",
  },
  btnCancel: {
    flex: "1",
    padding: "9px 0",
    backgroundColor: "transparent",
    border: `1px solid ${tokens.colorBorder}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      border: `1px solid ${tokens.colorBorder2}`,
    },
  },
  btnCreate: {
    flex: "2",
    padding: "9px 0",
    backgroundColor: tokens.colorRed,
    border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorWhite,
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.04em",
    cursor: "pointer",
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
});
