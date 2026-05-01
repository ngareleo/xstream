import { type FC } from "react";

/** L-02 — Stacked X monogram inside a circle. The default mark for header + app icon. */
export const Logo02: FC<{ size?: number; showWordmark?: boolean }> = ({
  size = 120,
  showWordmark = true,
}) => (
  <div style={{ textAlign: "center" }}>
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      style={{ marginBottom: showWordmark ? 10 : 0 }}
    >
      <circle cx="60" cy="60" r="58" stroke="var(--green-deep)" strokeWidth="1" />
      <path
        d="M30 30 L90 90 M90 30 L30 90"
        stroke="var(--green)"
        strokeWidth="6"
        strokeLinecap="square"
      />
      <circle cx="60" cy="60" r="6" fill="var(--bg-0)" stroke="var(--green)" strokeWidth="1.5" />
    </svg>
    {showWordmark && (
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.45em",
          color: "var(--text-dim)",
          textTransform: "uppercase",
          paddingLeft: "0.45em",
        }}
      >
        XSTREAM
      </div>
    )}
  </div>
);
