import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconBack, IconSearch } from "../../lib/icons.js";

export const NotFound: FC = () => {
  const navigate = useNavigate();
  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "var(--bg-0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="grain-layer" style={{ opacity: 0.2 }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, var(--green-soft) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-head)",
          fontSize: "32vw",
          color: "var(--text)",
          opacity: 0.04,
          letterSpacing: "-0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        404
      </div>

      <div
        style={{
          position: "relative",
          textAlign: "center",
          zIndex: 2,
          padding: 24,
        }}
      >
        <div className="eyebrow" style={{ color: "var(--green)" }}>
          · NOT FOUND
        </div>
        <div
          style={{
            fontFamily: "var(--font-head)",
            fontSize: 64,
            color: "var(--text)",
            letterSpacing: "-0.01em",
            marginTop: 12,
            textTransform: "uppercase",
          }}
        >
          Nothing here.
        </div>
        <div
          style={{
            color: "var(--text-dim)",
            maxWidth: 460,
            marginTop: 8,
            marginInline: "auto",
          }}
        >
          The page you tried to reach has moved or never existed. Head back to
          the library to keep browsing.
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            marginTop: 22,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            <IconBack /> Go back
          </button>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              background: "var(--green)",
              color: "var(--green-ink)",
              border: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              borderRadius: 2,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <IconSearch /> Browse library
          </Link>
        </div>
      </div>
    </div>
  );
};
