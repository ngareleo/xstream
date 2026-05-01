import { type FC, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
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
import { usePlayerStyles } from "./Player.styles.js";

type PlayState = "idle" | "loading" | "playing";

const INACTIVITY_MS = 3000;

export const Player: FC = () => {
  const { filmId } = useParams<{ filmId: string }>();
  const navigate = useNavigate();
  const film = filmId ? getFilmById(filmId) : films[0];

  const [state, setState] = useState<PlayState>("idle");
  const [chromeHidden, setChromeHidden] = useState(false);
  const inactivityRef = useRef<number | null>(null);

  const styles = usePlayerStyles();

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
    window.setTimeout(() => setState("playing"), 600);
  };

  const togglePlay = (): void => {
    if (state === "idle") startPlay();
    else if (state === "playing") setState("idle");
  };

  const goBackWithTransition = (): void => {
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => navigate(-1));
    } else {
      navigate(-1);
    }
  };

  if (!film) {
    return (
      <div className={styles.unknownFilmBox}>
        <div className="eyebrow">UNKNOWN FILM ID — {filmId}</div>
      </div>
    );
  }

  return (
    <div
      onMouseMove={wakeChrome}
      onClick={wakeChrome}
      onKeyDown={wakeChrome}
      className={mergeClasses(styles.shell, chromeHidden && styles.shellChromeHidden)}
    >
      <VideoArea
        film={film}
        state={state}
        chromeHidden={chromeHidden}
        onPlay={startPlay}
        onTogglePlay={togglePlay}
        onBack={goBackWithTransition}
      />
      <SidePanel
        film={film}
        chromeHidden={chromeHidden}
        onBack={goBackWithTransition}
      />
    </div>
  );
};

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
  const styles = usePlayerStyles();
  const fadeClass = mergeClasses(styles.fade, chromeHidden && styles.fadeHidden);

  return (
    <div className={styles.videoArea}>
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        className={styles.backdrop}
      />
      <div className={mergeClasses("grain-layer", styles.grain)} />

      <div className={mergeClasses(styles.letterTop, fadeClass)} />
      <div className={mergeClasses(styles.letterBottom, fadeClass)} />

      {state !== "playing" && (
        <button
          onClick={onPlay}
          aria-label="Play"
          className={styles.idleOverlay}
        >
          {state === "loading" ? (
            <div className={styles.spinner} />
          ) : (
            <div className={styles.bigPlay}>
              <span className={styles.bigPlayIcon}>
                <IconPlay />
              </span>
            </div>
          )}
        </button>
      )}

      <div className={mergeClasses(styles.topbar, fadeClass)}>
        <button onClick={onBack} className={styles.topbarBtn}>
          <IconBack /> BACK
        </button>
        <div className={styles.flexFill} />
        <div className={mergeClasses("eyebrow", styles.topbarStatus)}>
          {state === "playing" ? "● PLAYING" : "○ PAUSED"} ·{" "}
          {film.resolution} ·{" "}
          {film.hdr && film.hdr !== "—" ? film.hdr : film.codec}
        </div>
      </div>

      <div className={mergeClasses(styles.bottomControls, fadeClass)}>
        <div className={styles.filmTitle}>
          {film.title ?? "Unmatched file"}
        </div>
        <div className={styles.filmMeta}>
          {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
        </div>

        <div className={styles.progressRow}>
          <span className={styles.timeLabel}>01:14:22</span>
          <div className={styles.progressTrack}>
            <div className={styles.progressBuffered} />
            <div className={styles.progressPlayed} />
            <div className={styles.progressKnob} />
          </div>
          <span className={styles.timeLabelDim}>
            {film.duration.replace(/h\s/, ":").replace(/m/, ":00")}
          </span>
        </div>

        <div className={styles.controlsRow}>
          <button className={styles.ctrlBtn}>−10s</button>
          <button
            onClick={onTogglePlay}
            className={mergeClasses(styles.ctrlBtn, styles.ctrlBtnPlay)}
          >
            {state === "playing" ? <IconPause /> : <IconPlay />}
          </button>
          <button className={styles.ctrlBtn}>+10s</button>
          <span className={styles.flexFill} />
          <IconVolume />
          <div className={styles.volumeBar}>
            <div className={styles.volumeFill} />
          </div>
          <span className={mergeClasses("chip", "green", styles.chipSmall)}>
            {film.resolution} ·{" "}
            {film.hdr && film.hdr !== "—" ? film.hdr : film.codec}
          </span>
          <button className={styles.ctrlBtn} aria-label="Fullscreen">
            <IconFullscreen />
          </button>
        </div>
      </div>
    </div>
  );
};

const SidePanel: FC<{
  film: Film;
  chromeHidden: boolean;
  onBack: () => void;
}> = ({ film, chromeHidden, onBack }) => {
  const styles = usePlayerStyles();
  const upNext = films
    .filter((f) => f.profile === film.profile && f.id !== film.id)
    .slice(0, 3);

  return (
    <aside
      className={mergeClasses(
        styles.sidePanel,
        chromeHidden && styles.sidePanelHidden,
      )}
    >
      <div className={styles.sidePanelHeader}>
        <div className={mergeClasses("eyebrow", styles.nowPlayingEyebrow)}>
          ● NOW PLAYING
        </div>
        <div className={styles.sideTitle}>{film.title ?? "Unmatched"}</div>
        <div className={styles.sideMeta}>
          {[film.year, film.genre?.split("·")[0]?.trim(), film.duration]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {film.plot && <div className={styles.sidePlot}>{film.plot}</div>}
      </div>

      <div className={styles.sideBody}>
        <div className={mergeClasses("eyebrow", styles.eyebrowSpace)}>
          UP NEXT
        </div>
        {upNext.length === 0 && (
          <div className={styles.upNextEmpty}>Nothing else queued.</div>
        )}
        {upNext.map((m) => (
          <div key={m.id} className={styles.upNextRow}>
            <Poster
              url={m.posterUrl}
              alt={m.title ?? m.filename}
              className={styles.upNextPoster}
            />
            <div>
              <div className={styles.upNextTitle}>
                {m.title ?? m.filename}
              </div>
              <div className={styles.upNextSub}>
                {(m.genre?.split("·")[0]?.trim() ?? "").toUpperCase()}
              </div>
            </div>
            <Link
              to={`/player/${m.id}`}
              replace
              aria-label={`Play ${m.title ?? m.filename}`}
              className={styles.upNextPlay}
            >
              <IconPlay />
            </Link>
          </div>
        ))}

        <div className={mergeClasses("eyebrow", styles.eyebrowSpaceTop)}>
          FROM YOUR WATCHLIST
        </div>
        {watchlist.slice(0, 3).map((w) => {
          const onDisk = films.some((f) => f.id === w.filmId);
          return (
            <div key={w.id} className={styles.watchlistRow}>
              <div>
                <div className={styles.watchlistTitle}>{w.title}</div>
                <div
                  className={mergeClasses(
                    styles.watchlistStatus,
                    onDisk && styles.watchlistStatusOnDisk,
                  )}
                >
                  {onDisk ? "● ON DISK" : "○ NOT ON DISK YET"}
                </div>
              </div>
              {onDisk && (
                <Link
                  to={`/player/${w.filmId}`}
                  replace
                  className={styles.watchlistPlay}
                >
                  ▶ PLAY
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.footerRow}>
        <button className={styles.vlcBtn}>OPEN IN VLC</button>
        <button onClick={onBack} className={styles.backBtn}>
          ← BACK
        </button>
      </div>
    </aside>
  );
};
