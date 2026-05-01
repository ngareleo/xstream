import { type FC } from "react";

/** L-07 — Bracketed monogram with EST · 2026 footer; quietest variant. */
export const Logo07: FC = () => (
  <div style={{ textAlign: "center" }}>
    <svg width="180" height="120" viewBox="0 0 180 120" fill="none">
      <path d="M20 20 L10 20 L10 100 L20 100" stroke="var(--text-dim)" strokeWidth="1.2" fill="none" />
      <path d="M160 20 L170 20 L170 100 L160 100" stroke="var(--text-dim)" strokeWidth="1.2" fill="none" />
      <g transform="translate(40,30)">
        <path
          d="M0 0 L50 60 M50 0 L0 60"
          stroke="var(--green)"
          strokeWidth="3"
          strokeLinecap="square"
        />
        <line x1="58" y1="6" x2="58" y2="54" stroke="var(--text-dim)" strokeWidth="0.6" />
        <text
          x="68"
          y="38"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--text)"
          letterSpacing="0.18em"
        >
          STREAM
        </text>
      </g>
    </svg>
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.4em",
        color: "var(--text-muted)",
        marginTop: 4,
      }}
    >
      EST · 2026
    </div>
  </div>
);
