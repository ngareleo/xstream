import { makeStyles } from "@griffel/react";

export const useDevPanelStyles = makeStyles({
  root: {
    position: "fixed", bottom: "20px", right: "20px", zIndex: "9980",
    display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px",
  },
  popup: {
    width: "280px", background: "#0f0f0f", border: "1px solid #2e2e2e",
    borderRadius: "8px", overflow: "hidden",
    boxShadow: "0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,197,24,0.08)",
    animationName: {
      from: { opacity: "0", transform: "translateY(8px) scale(0.97)" },
      to:   { opacity: "1", transform: "translateY(0) scale(1)" },
    },
    animationDuration: "0.15s", animationTimingFunction: "ease", animationFillMode: "both",
  },
  header: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    padding: "10px 14px 8px", borderBottom: "1px solid #222",
    background: "rgba(245,197,24,0.04)",
  },
  title: { fontSize: "10px", fontWeight: "800", letterSpacing: "0.16em", textTransform: "uppercase", color: "#f5c518" },
  route: { fontSize: "10px", fontFamily: "'SF Mono', 'Fira Code', monospace", color: "#666" },
  sectionLabel: { padding: "8px 14px 4px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", color: "#3e3e3e" },
  targets: { padding: "2px 0 6px" },
  targetRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px",
    transitionProperty: "background", transitionDuration: "0.15s", transitionTimingFunction: "ease",
    ":hover": { background: "#161616" },
  },
  targetLabel: { fontSize: "12px", color: "#fff", fontWeight: "500" },
  targetId: { fontSize: "10px", fontFamily: "'SF Mono', 'Fira Code', monospace", color: "#3e3e3e", marginTop: "1px" },
  throwBtn: {
    fontSize: "11px", fontWeight: "600", fontFamily: "inherit",
    padding: "4px 10px", borderRadius: "4px",
    background: "rgba(206,17,38,0.10)", color: "rgba(206,17,38,0.8)",
    border: "1px solid rgba(206,17,38,0.25)", cursor: "pointer",
    transitionProperty: "background, color, border-color", transitionDuration: "0.15s", transitionTimingFunction: "ease",
    whiteSpace: "nowrap", flexShrink: "0",
    ":hover": { background: "rgba(206,17,38,0.20)", color: "#CE1126", borderColor: "rgba(206,17,38,0.4)" },
  },
  footer: { padding: "8px 14px 10px", fontSize: "10px", color: "#3e3e3e", borderTop: "1px solid #222", lineHeight: "1.5" },
  footerCode: { fontSize: "10px", color: "#666", background: "#161616", padding: "1px 4px", borderRadius: "3px" },
  pill: {
    fontSize: "9px", fontWeight: "800", letterSpacing: "0.18em",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    padding: "4px 9px", borderRadius: "20px",
    background: "#161616", color: "#666", border: "1px solid #2e2e2e",
    cursor: "pointer", opacity: "0.55",
    transitionProperty: "background, color, border-color, opacity", transitionDuration: "0.15s", transitionTimingFunction: "ease",
    ":hover": { opacity: "1", background: "#1c1c1c", color: "#f5c518", borderColor: "rgba(245,197,24,0.35)" },
  },
  pillActive: { opacity: "1", background: "#1c1c1c", color: "#f5c518", borderColor: "rgba(245,197,24,0.35)" },
});
