import { type FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { user } from "../../data/mock.js";
import { Logo02 } from "../../components/Logo/Logo02.js";

const REDIRECT_DELAY = 4;

export const Goodbye: FC = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);

  useEffect(() => {
    if (countdown <= 0) {
      navigate("/", { replace: true });
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, navigate]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "var(--bg-0)",
        position: "relative",
        overflow: "hidden",
        color: "var(--text)",
      }}
    >
      <div className="grain-layer" style={{ opacity: 0.22 }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, var(--green-soft) 0%, transparent 55%)",
          pointerEvents: "none",
        }}
      />
      {/* Ghost watermark */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-head)",
          fontSize: "30vw",
          color: "var(--text)",
          opacity: 0.03,
          letterSpacing: "-0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        GOODBYE
      </div>

      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: 24,
          textAlign: "center",
          zIndex: 2,
        }}
      >
        <div style={{ opacity: 0.6 }}>
          <Logo02 size={64} showWordmark={false} />
        </div>
        <div className="eyebrow" style={{ color: "var(--green)" }}>
          · SESSION ENDED
        </div>
        <div
          style={{
            fontFamily: "var(--font-head)",
            fontSize: 64,
            lineHeight: 0.95,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          See you next time, {user.name}.
        </div>
        <div style={{ color: "var(--text-dim)", maxWidth: 460 }}>
          Your library will be right here when you get back.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 12,
          }}
        >
          <button
            onClick={() => navigate("/", { replace: true })}
            style={{
              background: "var(--green)",
              color: "var(--green-ink)",
              border: 0,
              padding: "10px 22px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            Back to home
          </button>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
            }}
          >
            Redirecting in {countdown}s…
          </span>
        </div>
      </div>
    </div>
  );
};
