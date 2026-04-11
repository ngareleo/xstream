import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useSidebarStyles = makeStyles({
  root: {
    gridArea: "sidebar",
    backgroundColor: "#090909",
    borderRight: `1px solid ${tokens.colorBorder}`,
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: tokens.headerHeight,
    height: `calc(100vh - ${tokens.headerHeight})`,
    overflow: "hidden",
    zIndex: 50,
    transitionProperty: "width",
    transitionDuration: "0.22s",
    transitionTimingFunction: "ease",
    width: tokens.sidebarWidth,
    flexShrink: 0,
  },
  rootCollapsed: {
    width: tokens.sidebarCollapsedWidth,
    overflow: "visible",
  },

  // ── Nav items ─────────────────────────────────────────────────────────────
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "0",
    paddingLeft: tokens.space4,
    paddingRight: tokens.space4,
    height: "52px",
    fontSize: "13px",
    color: tokens.colorMuted,
    borderLeft: "2px solid transparent",
    transitionProperty: "background, border-color",
    transitionDuration: tokens.transition,
    cursor: "pointer",
    position: "relative",
    overflow: "hidden",
    textDecoration: "none",
    // CSS custom properties used by children to react to hover/active state
    "--label-color": tokens.colorMuted,
    "--icon-opacity": "0.07",
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.03)",
      "--label-color": tokens.colorOffWhite,
      "--icon-opacity": "0.13",
    },
    "&.active": {
      backgroundColor: tokens.colorRedDim,
      borderLeftColor: tokens.colorRed,
      "--label-color": tokens.colorWhite,
      "--icon-opacity": "0.20",
    },
  },
  navItemCollapsed: {
    paddingLeft: "0",
    paddingRight: "0",
    justifyContent: "center",
    borderLeftWidth: "0",
    height: "44px",
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.03)",
    },
    "&.active": {
      backgroundColor: tokens.colorRedDim,
      // Red bar on left edge via pseudo-element isn't possible in Griffel —
      // handled by the pseudo-after trick below; we rely on borderLeft here.
      borderLeft: `2px solid ${tokens.colorRed}`,
    },
  },

  navLabel: {
    fontFamily: tokens.fontHead,
    fontSize: "15px",
    letterSpacing: "0.08em",
    color: "var(--label-color)",
    transitionProperty: "color",
    transitionDuration: tokens.transition,
    position: "relative",
    zIndex: 1,
    whiteSpace: "nowrap",
  },
  navLabelHidden: {
    display: "none",
  },

  navCardIcon: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "40px",
    height: "40px",
    opacity: "var(--icon-opacity)",
    color: tokens.colorWhite,
    pointerEvents: "none",
    flexShrink: 0,
    transitionProperty: "opacity",
    transitionDuration: tokens.transition,
  },
  navCardIconCollapsed: {
    position: "static",
    transform: "none",
    width: "18px",
    height: "18px",
    opacity: "0.5",
    color: tokens.colorMuted,
    ":hover": {
      opacity: "0.85",
      color: tokens.colorOffWhite,
    },
  },

  navSpacer: {
    flex: "1",
  },

  // ── Collapse button ────────────────────────────────────────────────────────
  collapseBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: tokens.space2,
    paddingLeft: tokens.space4,
    paddingRight: tokens.space4,
    height: "44px",
    border: "none",
    borderTop: `1px solid ${tokens.colorBorder}`,
    background: "transparent",
    color: tokens.colorMuted2,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transitionProperty: "color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorMuted,
      backgroundColor: "rgba(255,255,255,0.02)",
    },
  },
  collapseBtnCollapsed: {
    justifyContent: "center",
    paddingLeft: "0",
    paddingRight: "0",
  },
  collapseBtnIcon: {
    width: "15px",
    height: "15px",
    flexShrink: 0,
    transitionProperty: "transform",
    transitionDuration: "0.22s",
    transitionTimingFunction: "ease",
  },
  collapseBtnIconRotated: {
    transform: "rotate(180deg)",
  },

  // ── User section ───────────────────────────────────────────────────────────
  userSection: {
    display: "flex",
    alignItems: "center",
    gap: tokens.space2,
    paddingTop: "12px",
    paddingBottom: "12px",
    paddingLeft: tokens.space4,
    paddingRight: tokens.space4,
    borderTop: `1px solid ${tokens.colorBorder}`,
    flexShrink: 0,
  },
  userSectionCollapsed: {
    justifyContent: "center",
    paddingLeft: "0",
    paddingRight: "0",
  },
  avatar: {
    width: "30px",
    height: "30px",
    borderRadius: tokens.radiusFull,
    backgroundColor: tokens.colorRedDim,
    border: `1px solid ${tokens.colorRedBorder}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    color: tokens.colorRed,
    flexShrink: 0,
  },
  userName: {
    fontSize: "13px",
    fontWeight: "600",
    color: tokens.colorWhite,
    lineHeight: "1.3",
    whiteSpace: "nowrap",
  },
  userSub: {
    fontSize: "10px",
    color: tokens.colorMuted,
    whiteSpace: "nowrap",
  },
  userTextHidden: {
    display: "none",
  },
});
