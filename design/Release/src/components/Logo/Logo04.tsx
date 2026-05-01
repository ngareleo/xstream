import { type FC } from "react";

/** L-04 — Cinematic letterform X with separator and "stream" wordmark. */
export const Logo04: FC = () => (
  <div style={{ textAlign: "center" }}>
    <svg width="160" height="100" viewBox="0 0 160 100" fill="none">
      <defs>
        <linearGradient id="grx" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--green)" />
          <stop offset="1" stopColor="var(--green-deep)" />
        </linearGradient>
      </defs>
      <path
        d="M20 10 L50 50 L20 90 L42 90 L62 62 L82 90 L104 90 L74 50 L104 10 L82 10 L62 38 L42 10 Z"
        fill="url(#grx)"
      />
      <rect x="115" y="10" width="2" height="80" fill="var(--green-deep)" />
      <text
        x="125"
        y="55"
        fontFamily="var(--font-head)"
        fontSize="38"
        fill="var(--text)"
        letterSpacing="0.02em"
      >
        stream
      </text>
    </svg>
  </div>
);
