import { type FC } from "react";

/** L-05 — Frame-strip lockup; each letter is a numbered film frame. */
export const Logo05: FC = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "flex",
        border: "1px solid var(--border)",
        background: "var(--bg-0)",
      }}
    >
      {["X", "S", "T", "R", "E", "A", "M"].map((ch, i) => (
        <div
          key={i}
          style={{
            width: 38,
            height: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-head)",
            fontSize: 30,
            color: i === 0 ? "var(--green)" : "var(--text)",
            borderRight: i < 6 ? "1px solid var(--border)" : "none",
            background: i === 0 ? "var(--green-soft)" : "transparent",
            position: "relative",
          }}
        >
          {ch}
          <div
            style={{
              position: "absolute",
              top: 3,
              left: 3,
              fontFamily: "var(--font-mono)",
              fontSize: 7,
              color: "var(--text-faint)",
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.32em",
        color: "var(--text-muted)",
      }}
    >
      FRAME · BY · FRAME
    </div>
  </div>
);
