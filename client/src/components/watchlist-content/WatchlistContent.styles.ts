import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useWatchlistContentStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },

  // ── Stats row ──────────────────────────────────────────────────────────────
  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: "0",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 28px",
    borderRight: `1px solid ${tokens.colorBorder}`,
  },
  statNum: {
    fontSize: "22px",
    fontWeight: "700",
    color: tokens.colorWhite,
    fontFamily: tokens.fontHead,
    letterSpacing: "0.04em",
  },
  statLabel: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    marginTop: "2px",
  },

  // ── Scrollable body ────────────────────────────────────────────────────────
  body: {
    flex: "1",
    overflowY: "auto",
    padding: "24px",
  },

  // ── Section ────────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.colorMuted2,
    marginBottom: "14px",
  },

  // ── Horizontal rail (Continue Watching) ───────────────────────────────────
  rail: {
    display: "flex",
    gap: "12px",
    overflowX: "auto",
    paddingBottom: "4px",
    marginBottom: "28px",
  },
  railCard: {
    width: "160px",
    flexShrink: "0",
    borderRadius: tokens.radiusMd,
    overflow: "hidden",
    cursor: "pointer",
    backgroundColor: tokens.colorSurface2,
    position: "relative",
  },
  railThumb: {
    width: "100%",
    paddingBottom: "150%",
    position: "relative",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundImage: "linear-gradient(135deg, #1a0a0a 0%, #2d0d10 50%, #0f0f0f 100%)",
  },
  railProgress: {
    position: "absolute",
    bottom: "0",
    left: "0",
    right: "0",
    height: "3px",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  railProgressFill: {
    height: "100%",
    backgroundColor: tokens.colorRed,
    borderRadius: "0 2px 2px 0",
  },
  railInfo: {
    padding: "8px 10px",
  },
  railTitle: {
    fontSize: "11px",
    fontWeight: "600",
    color: tokens.colorWhite,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  railYear: {
    fontSize: "10px",
    color: tokens.colorMuted2,
    marginTop: "2px",
  },

  // ── List rows ─────────────────────────────────────────────────────────────
  listRow: {
    display: "grid",
    gridTemplateColumns: "60px 1fr auto auto",
    alignItems: "center",
    gap: "12px",
    padding: "10px 0",
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
    ":last-child": {
      borderBottom: "none",
    },
  },
  listThumb: {
    width: "60px",
    height: "34px",
    borderRadius: "4px",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundImage: "linear-gradient(135deg, #1a0a0a 0%, #2d0d10 100%)",
    flexShrink: "0",
  },
  listInfo: {
    minWidth: "0",
  },
  listTitle: {
    fontSize: "13px",
    fontWeight: "600",
    color: tokens.colorWhite,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  listMeta: {
    fontSize: "11px",
    color: tokens.colorMuted2,
    marginTop: "2px",
  },
  listProgress: {
    width: "80px",
    height: "3px",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: "2px",
    overflow: "hidden",
    flexShrink: "0",
  },
  listProgressFill: {
    height: "100%",
    backgroundColor: tokens.colorRed,
  },
  removeBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    background: "transparent",
    border: `1px solid transparent`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorMuted2,
    cursor: "pointer",
    fontSize: "16px",
    transitionProperty: "color, border-color, background",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorRed,
      border: `1px solid ${tokens.colorRedBorder}`,
      backgroundColor: tokens.colorRedDim,
    },
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "12px",
    color: tokens.colorMuted,
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: tokens.colorWhite,
    fontFamily: tokens.fontHead,
    letterSpacing: "0.04em",
  },
  emptyBody: {
    fontSize: "13px",
    color: tokens.colorMuted,
    textAlign: "center",
    maxWidth: "260px",
    lineHeight: "1.6",
  },
  emptyLink: {
    color: tokens.colorRed,
    textDecoration: "none",
    fontWeight: "600",
    ":hover": {
      textDecoration: "underline",
    },
  },
});
