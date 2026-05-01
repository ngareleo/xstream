import { type FC } from "react";

/** L-06 — Slashed condensed wordmark with version slug. */
export const Logo06: FC = () => (
  <div style={{ position: "relative" }}>
    <div
      style={{
        fontFamily: "var(--font-head)",
        fontSize: 80,
        lineHeight: 0.82,
        letterSpacing: "-0.04em",
        color: "var(--text)",
        display: "flex",
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          color: "var(--green)",
          textShadow: "0 0 22px var(--green-glow)",
        }}
      >
        X
      </span>
      <span>stream</span>
      <span
        style={{
          color: "var(--green)",
          marginLeft: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 16,
          letterSpacing: 0,
        }}
      >
        /
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-muted)",
          letterSpacing: "0.2em",
          marginLeft: 4,
          textTransform: "uppercase",
        }}
      >
        v1.0
      </span>
    </div>
  </div>
);
