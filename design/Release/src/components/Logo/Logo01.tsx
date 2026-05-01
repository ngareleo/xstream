import { type FC } from "react";

/** L-01 — Anton wordmark with chevron-X mark inside a square frame. */
export const Logo01: FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
      <rect x="0.5" y="0.5" width="45" height="45" rx="2" stroke="var(--green)" strokeWidth="1" />
      <path d="M14 14 L23 23 L14 32" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="square" fill="none" />
      <path d="M22 14 L31 23 L22 32" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="square" fill="none" />
    </svg>
    <div
      style={{
        fontFamily: "var(--font-head)",
        fontSize: 56,
        lineHeight: 0.85,
        letterSpacing: "0.01em",
        color: "var(--text)",
      }}
    >
      XSTREAM
    </div>
  </div>
);
