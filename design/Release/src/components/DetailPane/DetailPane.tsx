import { type FC } from "react";
import { Link } from "react-router-dom";
import { ImdbBadge, IconClose } from "../../lib/icons.js";
import { type Film } from "../../data/mock.js";
import { Poster } from "../Poster/Poster.js";

interface DetailPaneProps {
  film: Film;
  onClose: () => void;
}

/**
 * Right-rail film detail. Identical structure on Profiles and Library.
 * Visual treatment ported from `app-mockups.jsx` DetailPane.
 */
export const DetailPane: FC<DetailPaneProps> = ({ film, onClose }) => {
  const hdrLabel = film.hdr && film.hdr !== "—" ? film.hdr.toUpperCase() : null;
  return (
    <div
      style={{
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-1)",
        overflow: "hidden",
        height: "100%",
      }}
    >
      <div style={{ height: 220, position: "relative", flexShrink: 0 }}>
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 50%, var(--bg-1))",
          }}
        />
        <button
          onClick={onClose}
          aria-label="Close detail pane"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 26,
            height: 26,
            border: "1px solid var(--border)",
            background: "rgba(0,0,0,0.6)",
            color: "var(--text-dim)",
            borderRadius: 3,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconClose />
        </button>
      </div>

      <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Link
            to={`/player/${film.id}`}
            style={{
              flex: 1,
              padding: "10px",
              background: "var(--green)",
              color: "var(--green-ink)",
              border: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              borderRadius: 2,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            ▶ Play in {film.resolution}
          </Link>
          <button
            style={{
              padding: "10px 14px",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              borderRadius: 2,
            }}
          >
            RE-LINK
          </button>
        </div>

        <div
          style={{
            fontFamily: "var(--font-head)",
            fontSize: 32,
            lineHeight: 1,
            color: "var(--text)",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            textTransform: "uppercase",
          }}
        >
          {film.title ?? "Unmatched file"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            marginBottom: 14,
            textTransform: "uppercase",
          }}
        >
          {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <span className="chip green">{film.resolution} UHD</span>
          {hdrLabel && <span className="chip">{hdrLabel}</span>}
          <span className="chip">{film.codec}</span>
          <span className="chip">
            {film.audio} {film.audioChannels}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
          }}
        >
          {film.rating !== null && (
            <>
              <ImdbBadge />
              <span style={{ color: "var(--yellow)" }}>{film.rating}</span>
              <span style={{ color: "var(--text-faint)" }}>·</span>
            </>
          )}
          <span>{film.duration}</span>
          <span style={{ color: "var(--text-faint)" }}>·</span>
          <span style={{ color: "var(--green)" }}>● ON DISK</span>
        </div>

        {film.plot && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              lineHeight: 1.55,
              marginBottom: 14,
            }}
          >
            {film.plot}
          </div>
        )}

        {film.cast.length > 0 && (
          <>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.22em",
                color: "var(--text-faint)",
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              CAST
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {film.cast.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          </>
        )}

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "var(--text-faint)",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          FILE
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            padding: 12,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-dim)",
            lineHeight: 1.7,
          }}
        >
          <div>{film.filename}</div>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 6,
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            <span>{film.size}</span>
            <span>·</span>
            <span>{film.bitrate}</span>
            <span>·</span>
            <span>{film.frameRate}</span>
            <span>·</span>
            <span>{film.container}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
