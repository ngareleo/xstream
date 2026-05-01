import { type FC } from "react";

/** L-03 — Signal-bars X mark with HOME · CINEMA tagline. */
export const Logo03: FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
      <rect x="6" y="22" width="4" height="16" fill="var(--green)" opacity="0.4" />
      <rect x="14" y="18" width="4" height="24" fill="var(--green)" opacity="0.6" />
      <rect x="22" y="12" width="4" height="36" fill="var(--green)" opacity="0.85" />
      <rect x="30" y="20" width="4" height="20" fill="var(--green)" />
      <rect x="38" y="12" width="4" height="36" fill="var(--green)" opacity="0.85" />
      <rect x="46" y="18" width="4" height="24" fill="var(--green)" opacity="0.6" />
      <rect x="54" y="22" width="4" height="16" fill="var(--green)" opacity="0.4" />
    </svg>
    <div>
      <div
        style={{
          fontFamily: "var(--font-head)",
          fontSize: 36,
          lineHeight: 0.9,
          color: "var(--text)",
          letterSpacing: "0.01em",
        }}
      >
        XSTREAM
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.32em",
          color: "var(--green)",
          marginTop: 4,
        }}
      >
        HOME · CINEMA
      </div>
    </div>
  </div>
);
