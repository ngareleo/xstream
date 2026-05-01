import { type CSSProperties, type FC, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  type Film,
  films,
  getFilmById,
  watchlist,
} from "../../data/mock.js";
import {
  IconBack,
  IconFullscreen,
  IconPause,
  IconPlay,
  IconVolume,
} from "../../lib/icons.js";
import { Poster } from "../../components/Poster/Poster.js";

type PlayState = "idle" | "loading" | "playing";

const INACTIVITY_MS = 3000;

export const Player: FC = () => {
  const { filmId } = useParams<{ filmId: string }>();
  const navigate = useNavigate();
  const film = filmId ? getFilmById(filmId) : films[0];

  const [state, setState] = useState<PlayState>("idle");
  const [chromeHidden, setChromeHidden] = useState(false);
  const inactivityRef = useRef<number | null>(null);

  const armInactivity = (): void => {
    if (inactivityRef.current) window.clearTimeout(inactivityRef.current);
    inactivityRef.current = window.setTimeout(() => {
      setChromeHidden(true);
    }, INACTIVITY_MS);
  };

  const wakeChrome = (): void => {
    setChromeHidden(false);
    if (state === "playing") armInactivity();
  };

  useEffect(() => {
    if (state !== "playing") {
      if (inactivityRef.current) window.clearTimeout(inactivityRef.current);
      setChromeHidden(false);
      return;
    }
    armInactivity();
    return () => {
      if (inactivityRef.current) window.clearTimeout(inactivityRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const startPlay = (): void => {
    setState("loading");
    // Simulate decoder warmup before "playing" event fires.
    window.setTimeout(() => setState("playing"), 600);
  };

  const togglePlay = (): void => {
    if (state === "idle") startPlay();
    else if (state === "playing") setState("idle");
  };

  if (!film) {
    return (
      <div style={{ padding: 32 }}>
        <div className="eyebrow">UNKNOWN FILM ID — {filmId}</div>
      </div>
    );
  }

  return (
    <div
      onMouseMove={wakeChrome}
      onClick={wakeChrome}
      onKeyDown={wakeChrome}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        position: "relative",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: chromeHidden ? "1fr 0px" : "1fr 290px",
        transition: "grid-template-columns 0.3s ease",
        cursor: chromeHidden ? "none" : "default",
      }}
    >
      <VideoArea
        film={film}
        state={state}
        chromeHidden={chromeHidden}
        onPlay={startPlay}
        onTogglePlay={togglePlay}
        onBack={() => navigate(-1)}
      />
      <SidePanel
        film={film}
        chromeHidden={chromeHidden}
        onBack={() => navigate(-1)}
      />
    </div>
  );
};

/* ---------------- Video area ---------------- */

interface VideoAreaProps {
  film: Film;
  state: PlayState;
  chromeHidden: boolean;
  onPlay: () => void;
  onTogglePlay: () => void;
  onBack: () => void;
}

const VideoArea: FC<VideoAreaProps> = ({
  film,
  state,
  chromeHidden,
  onPlay,
  onTogglePlay,
  onBack,
}) => {
  const fadeStyle: CSSProperties = chromeHidden
    ? { opacity: 0, pointerEvents: "none", transition: "opacity 0.3s" }
    : { opacity: 1, transition: "opacity 0.3s" };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.85) contrast(1.05)",
        }}
      />
      <div
        className="grain-layer"
        style={{ opacity: 0.18, mixBlendMode: "overlay" }}
      />

      {/* Letterbox */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 80,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.85), transparent)",
          ...fadeStyle,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 220,
          background:
            "linear-gradient(0deg, rgba(0,0,0,0.92), transparent)",
          ...fadeStyle,
        }}
      />

      {/* Idle / loading overlay */}
      {state !== "playing" && (
        <button
          onClick={onPlay}
          aria-label="Play"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 8,
            border: 0,
            color: "var(--text)",
          }}
        >
          {state === "loading" ? (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                border: "3px solid rgba(255,255,255,0.3)",
                borderTopColor: "var(--green)",
                animation: "spin 0.9s linear infinite",
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                background: "var(--green)",
                color: "var(--green-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 60px var(--green-glow)",
              }}
            >
              <span style={{ transform: "scale(2)" }}>
                <IconPlay />
              </span>
            </div>
          )}
        </button>
      )}

      {/* Topbar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "16px 26px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          zIndex: 10,
          color: "#fff",
          ...fadeStyle,
        }}
      >
        <button onClick={onBack} style={topbarBtn}>
          <IconBack /> BACK
        </button>
        <div style={{ flex: 1 }} />
        <div className="eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
          {state === "playing" ? "● PLAYING" : "○ PAUSED"} ·{" "}
          {film.resolution} ·{" "}
          {film.hdr && film.hdr !== "—" ? film.hdr : film.codec}
        </div>
      </div>

      {/* Bottom controls */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "20px 26px 24px",
          zIndex: 10,
          ...fadeStyle,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-head)",
            fontSize: 64,
            lineHeight: 0.92,
            color: "#fff",
            letterSpacing: "-0.01em",
            marginBottom: 6,
            textShadow: "0 4px 24px rgba(0,0,0,0.6)",
            textTransform: "uppercase",
          }}
        >
          {film.title ?? "Unmatched file"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "rgba(255,255,255,0.7)",
            letterSpacing: "0.18em",
            marginBottom: 18,
            textTransform: "uppercase",
          }}
        >
          {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
        </div>

        {/* Progress bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            01:14:22
          </span>
          <div
            style={{
              flex: 1,
              height: 3,
              background: "rgba(255,255,255,0.18)",
              borderRadius: 2,
              position: "relative",
            }}
          >
            <div
              style={{
                width: "62%",
                height: "100%",
                background: "rgba(255,255,255,0.4)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "53%",
                height: "100%",
                background: "var(--green)",
                boxShadow: "0 0 8px var(--green-glow)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "53%",
                top: "50%",
                width: 12,
                height: 12,
                borderRadius: 50,
                background: "var(--green)",
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 12px var(--green-glow)",
              }}
            />
          </div>
          <span
            style={{
              color: "rgba(255,255,255,0.6)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            {film.duration.replace(/h\s/, ":").replace(/m/, ":00")}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#fff",
          }}
        >
          <button style={ctrlBtn}>−10s</button>
          <button
            onClick={onTogglePlay}
            style={{
              ...ctrlBtn,
              width: 48,
              height: 48,
              borderRadius: 50,
              background: "var(--green)",
              color: "var(--green-ink)",
              border: 0,
            }}
          >
            {state === "playing" ? <IconPause /> : <IconPlay />}
          </button>
          <button style={ctrlBtn}>+10s</button>
          <span style={{ flex: 1 }} />
          <IconVolume />
          <div
            style={{
              width: 80,
              height: 3,
              background: "rgba(255,255,255,0.2)",
            }}
          >
            <div style={{ width: "70%", height: "100%", background: "#fff" }} />
          </div>
          <span className="chip green" style={{ fontSize: 9 }}>
            {film.resolution} ·{" "}
            {film.hdr && film.hdr !== "—" ? film.hdr : film.codec}
          </span>
          <button style={ctrlBtn} aria-label="Fullscreen">
            <IconFullscreen />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Side panel ---------------- */

const SidePanel: FC<{
  film: Film;
  chromeHidden: boolean;
  onBack: () => void;
}> = ({ film, chromeHidden, onBack }) => {
  const upNext = films
    .filter((f) => f.profile === film.profile && f.id !== film.id)
    .slice(0, 3);

  return (
    <aside
      style={{
        background: "var(--bg-1)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: chromeHidden ? 0 : 1,
        pointerEvents: chromeHidden ? "none" : "auto",
        transition: "opacity 0.3s",
      }}
    >
      <div
        style={{
          padding: "20px 18px 14px",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <div className="eyebrow" style={{ color: "var(--green)" }}>
          ● NOW PLAYING
        </div>
        <div
          style={{
            fontFamily: "var(--font-head)",
            fontSize: 26,
            color: "var(--text)",
            marginTop: 8,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          {film.title ?? "Unmatched"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            marginTop: 6,
            textTransform: "uppercase",
          }}
        >
          {[film.year, film.genre?.split("·")[0]?.trim(), film.duration]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {film.plot && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              marginTop: 10,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {film.plot}
          </div>
        )}
      </div>

      <div style={{ padding: "16px 18px", flex: 1, overflow: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          UP NEXT
        </div>
        {upNext.length === 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Nothing else queued.
          </div>
        )}
        {upNext.map((m) => (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 22px",
              gap: 10,
              padding: "8px 0",
              alignItems: "center",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <Poster
              url={m.posterUrl}
              alt={m.title ?? m.filename}
              style={{ width: 44, height: 62, objectFit: "cover" }}
            />
            <div>
              <div style={{ fontSize: 12, color: "var(--text)" }}>
                {m.title ?? m.filename}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}
              >
                {(m.genre?.split("·")[0]?.trim() ?? "").toUpperCase()}
              </div>
            </div>
            <Link
              to={`/player/${m.id}`}
              replace
              aria-label={`Play ${m.title ?? m.filename}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: 50,
                background: "var(--green-soft)",
                color: "var(--green)",
                border: "1px solid var(--green-deep)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
              }}
            >
              <IconPlay />
            </Link>
          </div>
        ))}

        <div className="eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>
          FROM YOUR WATCHLIST
        </div>
        {watchlist.slice(0, 3).map((w) => {
          const onDisk = films.some((f) => f.id === w.filmId);
          return (
            <div
              key={w.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                padding: "6px 0",
                alignItems: "center",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--text)" }}>
                  {w.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: onDisk ? "var(--green)" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                    letterSpacing: "0.08em",
                  }}
                >
                  {onDisk ? "● ON DISK" : "○ NOT ON DISK YET"}
                </div>
              </div>
              {onDisk && (
                <Link
                  to={`/player/${w.filmId}`}
                  replace
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    color: "var(--green)",
                    textDecoration: "none",
                  }}
                >
                  ▶ PLAY
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: "12px 18px",
          borderTop: "1px solid var(--border-soft)",
          display: "flex",
          gap: 8,
        }}
      >
        <button
          style={{
            flex: 1,
            padding: "10px",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            borderRadius: 2,
          }}
        >
          OPEN IN VLC
        </button>
        <button
          onClick={onBack}
          style={{
            padding: "10px 14px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            borderRadius: 2,
            textTransform: "uppercase",
          }}
        >
          ← BACK
        </button>
      </div>
    </aside>
  );
};

/* ---------------- Style helpers ---------------- */

const ctrlBtn: CSSProperties = {
  background: "transparent",
  border: 0,
  color: "#fff",
  padding: "8px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.12em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  borderRadius: 2,
};

const topbarBtn: CSSProperties = {
  background: "rgba(0,0,0,0.45)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#fff",
  padding: "6px 12px",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.18em",
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};
