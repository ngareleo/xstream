import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useAppHeaderStyles = makeStyles({
  root: {
    gridArea: "header",
    display: "flex",
    alignItems: "stretch",
    position: "sticky",
    top: "0",
    zIndex: 100,
    background: `linear-gradient(160deg, rgba(235,45,60,0.30) 0%, rgba(190,12,28,0.42) 45%, rgba(130,5,18,0.52) 100%)`,
    backdropFilter: "blur(28px) saturate(2.8) brightness(0.72)",
    WebkitBackdropFilter: "blur(28px) saturate(2.8) brightness(0.72)",
    boxShadow:
      "inset 0 1px 0 rgba(255,160,150,0.22), inset 0 -1px 0 rgba(206,17,38,0.30), 0 2px 16px rgba(0,0,0,0.45)",
    borderBottom: `1px solid ${tokens.colorRedBorder}`,
  },
  brand: {
    width: tokens.sidebarWidth,
    display: "flex",
    alignItems: "center",
    gap: tokens.space2,
    paddingLeft: tokens.space4,
    paddingRight: tokens.space4,
    overflow: "hidden",
    flexShrink: "0",
    whiteSpace: "nowrap",
    transitionProperty: "width",
    transitionDuration: "0.22s",
    transitionTimingFunction: "ease",
  },
  brandCollapsed: {
    width: tokens.sidebarCollapsedWidth,
  },
  brandText: {
    overflow: "hidden",
  },
  logoMark: {
    fontFamily: tokens.fontHead,
    fontSize: "21px",
    letterSpacing: "0.12em",
    color: tokens.colorWhite,
    lineHeight: "1",
  },
  navToggleBtn: {
    width: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    background: "transparent",
    border: "none",
    borderRight: "1px solid rgba(206,17,38,0.15)",
    color: "rgba(255,255,255,0.45)",
    cursor: "pointer",
    transitionProperty: "color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
      backgroundColor: "rgba(255,255,255,0.05)",
    },
  },
  content: {
    flex: "1",
    display: "flex",
    alignItems: "center",
    paddingLeft: tokens.space5,
    paddingRight: tokens.space5,
    gap: tokens.space3,
    minWidth: "0",
  },
  actionsSlot: {
    display: "flex",
    alignItems: "stretch",
    alignSelf: "stretch",
    marginLeft: "auto",
    backgroundColor: "rgba(206,17,38,0.07)",
    clipPath:
      "polygon(22px 0%, calc(100% - 5px) 0%, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%)",
    overflow: "hidden",
  },
});

export const useHeaderActionStyles = makeStyles({
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    paddingLeft: tokens.space5,
    paddingRight: tokens.space5,
    alignSelf: "stretch",
    backgroundColor: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.48)",
    fontFamily: tokens.fontBody,
    fontSize: "12px",
    fontWeight: "600",
    letterSpacing: "0.03em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transitionProperty: "color, text-shadow",
    transitionDuration: tokens.transition,
    ":hover": {
      color: "rgba(255,255,255,0.92)",
      textShadow: "0 0 6px rgba(255,255,255,0.75), 0 0 14px rgba(255,255,255,0.35)",
    },
  },
  btnPrimary: {
    color: "rgba(255,200,200,0.82)",
    ":hover": {
      color: "#fff",
      textShadow:
        "0 0 5px #fff, 0 0 10px rgba(255,80,80,0.95), 0 0 22px rgba(206,17,38,0.8), 0 0 42px rgba(206,17,38,0.4)",
    },
  },
  sep: {
    width: "14px",
    flexShrink: "0",
    position: "relative",
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sepLine: {
    width: "1px",
    height: "64%",
    backgroundColor: "rgba(206,17,38,0.30)",
    transform: "skewX(-15deg)",
  },
});
