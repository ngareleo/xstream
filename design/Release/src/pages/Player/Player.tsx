import { type FC, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  type Episode,
  type Film,
  type Season,
  films,
  getFilmById,
  watchlist,
} from "../../data/mock.js";
import {
  IconBack,
  IconClose,
  IconFullscreen,
  IconPause,
  IconPlay,
  IconVolume,
} from "../../lib/icons.js";
import { Poster } from "../../components/Poster/Poster.js";
import { EdgeHandle } from "../../components/EdgeHandle/EdgeHandle.js";
import { SeasonsPanel } from "../../components/SeasonsPanel/SeasonsPanel.js";
import { usePlayerStyles } from "./Player.styles.js";

type PlayState = "idle" | "loading" | "playing";

const INACTIVITY_MS = 3000;

interface SeriesPick {
  season: Season;
  episode: Episode;
}

/**
 * For a series film, resolve the active season+episode from the URL
 * (`?s=2&e=4`) with safe fallbacks: out-of-range or missing params
 * resolve to the first available episode (or the first episode if every
 * episode is missing). Returns null for movies.
 */
function resolveSeriesPick(
  film: Film,
  s: number | null,
  e: number | null,
): SeriesPick | null {
  if (film.kind !== "series" || !film.seasons || film.seasons.length === 0)
    return null;
  if (s !== null && e !== null) {
    const season = film.seasons.find((ss) => ss.number === s);
    const episode = season?.episodes.find((ee) => ee.number === e);
    if (season && episode) return { season, episode };
  }
  for (const season of film.seasons) {
    const episode = season.episodes.find((ee) => ee.available);
    if (episode) return { season, episode };
  }
  const season = film.seasons[0];
  return { season, episode: season.episodes[0] };
}

function formatEpisodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export const Player: FC = () => {
  const { filmId } = useParams<{ filmId: string }>();
  const navigate = useNavigate();
  const film = filmId ? getFilmById(filmId) : films[0];
  const [searchParams, setSearchParams] = useSearchParams();

  const seasonParam = searchParams.get("s");
  const episodeParam = searchParams.get("e");
  const seriesPick = useMemo<SeriesPick | null>(() => {
    if (!film) return null;
    return resolveSeriesPick(
      film,
      seasonParam ? Number(seasonParam) : null,
      episodeParam ? Number(episodeParam) : null,
    );
  }, [film, seasonParam, episodeParam]);

  const [state, setState] = useState<PlayState>("idle");
  const [chromeHidden, setChromeHidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number }>(() => ({
    x: typeof window === "undefined" ? 0 : window.innerWidth,
    y: typeof window === "undefined" ? 0 : window.innerHeight / 2,
  }));
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

  const handleMouseMove = (e: MouseEvent): void => {
    wakeChrome();
    setCursor({ x: e.clientX, y: e.clientY });
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

  const selectEpisode = (sNum: number, eNum: number): void => {
    setSearchParams(
      { s: String(sNum), e: String(eNum) },
      { replace: true },
    );
    setState("loading");
    window.setTimeout(() => setState("playing"), 600);
  };

  if (!film) {
    return (
      <div className={styles.unknownFilmBox}>
        <div className="eyebrow">UNKNOWN FILM ID — {filmId}</div>
      </div>
    );
  }

  const handleEligible = !panelOpen && !chromeHidden;

  return (
    <div
      onMouseMove={handleMouseMove}
      onClick={wakeChrome}
      onKeyDown={wakeChrome}
      className={mergeClasses(styles.shell, chromeHidden && styles.shellChromeHidden)}
    >
      <VideoArea
        film={film}
        seriesPick={seriesPick}
        state={state}
        chromeHidden={chromeHidden}
        onPlay={startPlay}
        onTogglePlay={togglePlay}
        onBack={goBackWithTransition}
      />

      {handleEligible && (
        <EdgeHandle
          cursorX={cursor.x}
          cursorY={cursor.y}
          onActivate={() => setPanelOpen(true)}
        />
      )}

      {panelOpen && !chromeHidden && (
        <div
          aria-hidden="true"
          className={styles.panelScrim}
          onClick={(e) => {
            e.stopPropagation();
            setPanelOpen(false);
          }}
        />
      )}

      <SidePanel
        film={film}
        seriesPick={seriesPick}
        open={panelOpen && !chromeHidden}
        onClose={() => setPanelOpen(false)}
        onBack={goBackWithTransition}
        onSelectEpisode={selectEpisode}
      />
    </div>
  );
};

interface VideoAreaProps {
  film: Film;
  seriesPick: SeriesPick | null;
  state: PlayState;
  chromeHidden: boolean;
  onPlay: () => void;
  onTogglePlay: () => void;
  onBack: () => void;
}

const VideoArea: FC<VideoAreaProps> = ({
  film,
  seriesPick,
  state,
  chromeHidden,
  onPlay,
  onTogglePlay,
  onBack,
}) => {
  const styles = usePlayerStyles();
  const fadeClass = mergeClasses(styles.fade, chromeHidden && styles.fadeHidden);
  const episodeCode = seriesPick
    ? formatEpisodeCode(seriesPick.season.number, seriesPick.episode.number)
    : null;

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
          {state === "loading" && <div className={styles.spinner} />}
        </button>
      )}

      <div className={mergeClasses(styles.topbar, fadeClass)}>
        <button
          onClick={onBack}
          aria-label="Back"
          className={styles.topbarBtn}
        >
          <IconBack />
        </button>
        <div className={styles.flexFill} />
        <div className={mergeClasses("eyebrow", styles.topbarStatus)}>
          {state === "playing" ? "● PLAYING" : "○ PAUSED"}
          {episodeCode && ` · ${episodeCode}`} · {film.resolution} ·{" "}
          {film.hdr && film.hdr !== "—" ? film.hdr : film.codec}
        </div>
      </div>

      <div className={mergeClasses(styles.bottomControls, fadeClass)}>
        {seriesPick && (
          <div className={styles.episodeBadge}>
            <span className={styles.episodeBadgeCode}>{episodeCode}</span>
            <span className={styles.episodeBadgeTitle}>{seriesPick.episode.title}</span>
          </div>
        )}
        <div className={styles.filmTitle}>
          {film.title ?? "Unmatched file"}
        </div>
        <div className={styles.filmMeta}>
          {seriesPick
            ? [
                `Season ${seriesPick.season.number}`,
                film.genre,
                seriesPick.episode.duration,
              ]
                .filter(Boolean)
                .join(" · ")
            : [film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
        </div>

        <div className={styles.progressRow}>
          <span className={styles.timeLabel}>01:14:22</span>
          <div className={styles.progressTrack}>
            <div className={styles.progressBuffered} />
            <div className={styles.progressPlayed} />
            <div className={styles.progressKnob} />
          </div>
          <span className={styles.timeLabelDim}>
            {(seriesPick?.episode.duration ?? film.duration)
              .replace(/h\s/, ":")
              .replace(/m/, ":00")}
          </span>
        </div>

        <div className={styles.controlsRow}>
          <button className={styles.ctrlBtn}>−10s</button>
          <button
            onClick={onTogglePlay}
            aria-label={state === "playing" ? "Pause" : "Play"}
            className={mergeClasses(
              styles.ctrlBtn,
              styles.ctrlBtnPlay,
              state === "idle" && styles.ctrlBtnPlayIdle,
            )}
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
  seriesPick: SeriesPick | null;
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  onSelectEpisode: (seasonNumber: number, episodeNumber: number) => void;
}> = ({ film, seriesPick, open, onClose, onBack, onSelectEpisode }) => {
  const styles = usePlayerStyles();
  // Up next pulls peers from the same profile, but only for movies — for
  // a series the user wants the episode picker, not other shows.
  const upNext = films
    .filter((f) => f.profile === film.profile && f.id !== film.id && f.kind === "movie")
    .slice(0, 3);
  const episodeCode = seriesPick
    ? formatEpisodeCode(seriesPick.season.number, seriesPick.episode.number)
    : null;

  return (
    <aside
      aria-hidden={!open}
      className={mergeClasses(
        styles.sidePanel,
        !open && styles.sidePanelHidden,
      )}
    >
      <button
        type="button"
        aria-label="Close side panel"
        className={styles.panelCloseBtn}
        onClick={onClose}
      >
        <IconClose width={14} height={14} />
      </button>
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
        {seriesPick && episodeCode && (
          <div className={styles.sideEpisodeRow}>
            <span className={styles.sideEpisodeCode}>{episodeCode}</span>
            <span className={styles.sideEpisodeTitle}>
              {seriesPick.episode.title}
            </span>
          </div>
        )}
        {film.plot && <div className={styles.sidePlot}>{film.plot}</div>}
      </div>

      <div className={styles.sideBody}>
        {seriesPick && film.seasons ? (
          <>
            <div className={mergeClasses("eyebrow", styles.eyebrowSpace)}>
              EPISODES
            </div>
            <SeasonsPanel
              seasons={film.seasons}
              activeEpisode={{
                seasonNumber: seriesPick.season.number,
                episodeNumber: seriesPick.episode.number,
              }}
              onSelectEpisode={onSelectEpisode}
              accordion
            />
          </>
        ) : (
          <>
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
                      <IconPlay width={10} height={10} />
                      <span>PLAY</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </>
        )}
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
