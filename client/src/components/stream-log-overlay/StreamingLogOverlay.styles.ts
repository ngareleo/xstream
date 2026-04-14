import { makeStyles, shorthands } from "@griffel/react";

export const useStreamingLogOverlayStyles = makeStyles({
  overlay: {
    position: "fixed",
    bottom: "70px",
    right: "20px",
    width: "480px",
    maxHeight: "60vh",
    zIndex: "9970",
    display: "flex",
    flexDirection: "column",
    background: "#0f0f0f",
    border: "1px solid #2e2e2e",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,222,128,0.06)",
    animationName: {
      from: { opacity: "0", transform: "translateY(8px) scale(0.97)" },
      to: { opacity: "1", transform: "translateY(0) scale(1)" },
    },
    animationDuration: "0.15s",
    animationTimingFunction: "ease",
    animationFillMode: "both",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: "1px solid #222",
    background: "rgba(74,222,128,0.04)",
    flexShrink: "0",
  },

  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  title: {
    fontSize: "10px",
    fontWeight: "800",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#4ade80",
  },

  count: {
    fontSize: "10px",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: "#3e3e3e",
    background: "#1a1a1a",
    padding: "1px 6px",
    borderRadius: "10px",
  },

  clearBtn: {
    fontSize: "10px",
    fontWeight: "600",
    fontFamily: "inherit",
    padding: "3px 8px",
    borderRadius: "4px",
    background: "transparent",
    color: "#3e3e3e",
    border: "1px solid #2e2e2e",
    cursor: "pointer",
    transitionProperty: "color, border-color",
    transitionDuration: "0.15s",
    transitionTimingFunction: "ease",
    ":hover": {
      color: "#666",
      ...shorthands.borderColor("#444"),
    },
  },

  list: {
    overflowY: "auto",
    flexGrow: "1",
    padding: "4px 0",
  },

  emptyState: {
    padding: "20px 14px",
    fontSize: "11px",
    color: "#3e3e3e",
    textAlign: "center",
    fontStyle: "italic",
  },

  entryRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "6px",
    padding: "2px 12px",
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
    transitionProperty: "background",
    transitionDuration: "0.1s",
    transitionTimingFunction: "ease",
    ":hover": {
      background: "#161616",
    },
  },

  entryRowError: {
    borderLeftColor: "#CE1126",
    background: "rgba(206,17,38,0.04)",
    ":hover": {
      background: "rgba(206,17,38,0.08)",
    },
  },

  timestamp: {
    fontSize: "9px",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: "#3e3e3e",
    whiteSpace: "nowrap",
    flexShrink: "0",
    paddingTop: "2px",
    minWidth: "80px",
  },

  categoryPill: {
    fontSize: "8px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    padding: "2px 5px",
    borderRadius: "3px",
    whiteSpace: "nowrap",
    flexShrink: "0",
    marginTop: "1px",
  },

  categoryStream: {
    color: "#4ade80",
    background: "rgba(74,222,128,0.12)",
  },

  categoryBuffer: {
    color: "#4A9EFF",
    background: "rgba(74,158,255,0.12)",
  },

  categoryPlayback: {
    color: "#f5c518",
    background: "rgba(245,197,24,0.12)",
  },

  message: {
    fontSize: "11px",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: "#aaa",
    lineHeight: "1.45",
    wordBreak: "break-all",
    paddingTop: "1px",
  },

  messageError: {
    color: "#e88",
  },
});
