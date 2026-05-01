/**
 * Player page — full-screen video playback.
 *
 * Layout: CSS grid, two columns → video area (1fr) | side panel (290px).
 *
 * State machine:
 *   "idle"    → page landed, no video started yet. Shows the pre-play overlay
 *               (poster gradient + centered play button). Inactivity timer is
 *               suppressed so the controls never auto-hide while idle.
 *   "loading" → user clicked play; waiting for the browser to buffer enough to
 *               begin rendering frames. Shows a spinner over the poster.
 *   "playing" → the HTMLVideoElement fired its `playing` event. Overlay is gone,
 *               video fills the frame. After INACTIVITY_MS of no mouse/keyboard
 *               activity, all chrome fades out and the grid collapses to 1fr.
 *
 * Inactivity hide:
 *   Any interaction resets a 3-second timer. When it fires, `.controls-hidden`
 *   is added to the root, which:
 *     - fades the topbar, controls, and side panel to opacity 0
 *     - collapses the grid column from 1fr/290px → 1fr/0px (smooth transition)
 *     - hides the cursor
 *   The timer is never started while playerState === "idle".
 *
 * Navigation:
 *   Both Back buttons call navigate(-1) so the browser history stack is used.
 *   If the user arrived from the Library at /library?film=dune-2, pressing Back
 *   returns exactly there — pane open, same film selected.
 *
 * Data (mock → real):
 *   - `getFilmById(filmId)` → query the video by its GraphQL global ID
 *   - `films` (for suggestions) → a `videosConnection` query or fragment
 *   - `watchlist` → `watchlist` query / subscription
 *   - `src="/videos/test.mp4"` → the real /stream/:jobId endpoint via MSE
 */

import {
  type FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowLeft,
  IconBackward,
  IconFilm,
  IconForward,
  IconArrowsOut,
  IconPause,
  IconPlay,
  IconSpeaker,
} from "../../lib/icons.js";
import { mergeClasses } from "@griffel/react";
import { films, getFilmById, watchlist } from "../../data/mock.js";
import { usePlayerStyles } from "./Player.styles.js";
import { tokens } from "../../styles/tokens.js";

// How long (ms) of inactivity before the chrome fades out.
const INACTIVITY_MS = 3000;

// Returns up to 4 matched films that are not the one currently playing.
// In production: derive from the same library/profile as the current video.
function getSuggestions(currentId: string) {
  return films.filter((f) => f.id !== currentId && f.matched).slice(0, 4);
}

export const Player: FC = () => {
  const navigate = useNavigate();
  const { filmId } = useParams<{ filmId: string }>();
  // Fall back to the first film so the page never hard-crashes in the design lab.
  // In production, a missing/invalid ID should redirect to 404 or the library.
  const film = (filmId ? getFilmById(filmId) : null) ?? films[0];

  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef  = useRef<HTMLDivElement>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Player state machine ──────────────────────────────────────────────────
  // "idle"    : no stream started, pre-play overlay visible
  // "loading" : video.play() called, buffering in progress, spinner visible
  // "playing" : HTMLVideoElement fired "playing", overlay is gone
  const [playerState, setPlayerState] = useState<"idle" | "loading" | "playing">("idle");

  // Fine-grained playback booleans derived from the video element's events.
  // `playing` tracks play/pause while `playerState` tracks the macro UI phase.
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);   // 0–100, drives the progress bar
  const [buffered, setBuffered] = useState(0);   // 0–100, drives the buffer bar
  const [elapsed,  setElapsed]  = useState(0);   // seconds, for the time display
  const [duration, setDuration] = useState(0);   // seconds, 0 until metadata loads
  const [volume,   setVolume]   = useState(0.7); // 0–1, reflected back to the element
  const [resolution, setResolution] = useState(film.resolution ?? "4K");
  // `hidden` is true while the inactivity timer has fired (and playerState !== "idle").
  const [hidden, setHidden] = useState(false);

  // ── Inactivity hide ───────────────────────────────────────────────────────
  // Called on every mousemove / keydown / click event on the root element.
  const resetInactivity = useCallback(() => {
    setHidden(false);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => setHidden(true), INACTIVITY_MS);
  }, []);

  useEffect(() => {
    resetInactivity();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetInactivity]);

  // ── Video event sync ──────────────────────────────────────────────────────
  // All state driven by native HTMLVideoElement events rather than polling,
  // so the UI stays in sync even when the browser pauses for buffering.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!video.duration) return;
      setElapsed(video.currentTime);
      setProgress((video.currentTime / video.duration) * 100);
      // Use the last buffered range end as the buffered indicator.
      if (video.buffered.length > 0) {
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      }
    };

    const onDurationChange = () => setDuration(video.duration);
    const onPlay    = () => setPlaying(true);
    const onPause   = () => setPlaying(false);
    // When the stream ends, return to the idle poster state so the user can
    // replay or choose something from the side panel.
    const onEnded   = () => { setPlaying(false); setPlayerState("idle"); };
    // "playing" fires when frames are actually being decoded and rendered —
    // this is the correct moment to dismiss the loading spinner.
    const onPlaying = () => setPlayerState("playing");
    // "waiting" fires when the browser stalls mid-playback. Only regress to
    // "loading" if we were already playing (not from idle → loading transition).
    const onWaiting = () => setPlayerState((s) => s === "playing" ? "loading" : s);

    video.addEventListener("timeupdate",      onTimeUpdate);
    video.addEventListener("durationchange",  onDurationChange);
    video.addEventListener("play",            onPlay);
    video.addEventListener("pause",           onPause);
    video.addEventListener("ended",           onEnded);
    video.addEventListener("playing",         onPlaying);
    video.addEventListener("waiting",         onWaiting);
    return () => {
      video.removeEventListener("timeupdate",      onTimeUpdate);
      video.removeEventListener("durationchange",  onDurationChange);
      video.removeEventListener("play",            onPlay);
      video.removeEventListener("pause",           onPause);
      video.removeEventListener("ended",           onEnded);
      video.removeEventListener("playing",         onPlaying);
      video.removeEventListener("waiting",         onWaiting);
    };
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────

  // First-play: transitions idle → loading and calls video.play().
  // In production this is where the START_TRANSCODE_MUTATION fires and the
  // MSE pipeline initialises (see useVideoPlayback hook in the main client).
  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    setPlayerState("loading");
    void video.play();
  };

  // Unified play/pause toggle. From idle it always starts fresh; once playing
  // it toggles the element's paused state directly.
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playerState === "idle") { startPlayback(); return; }
    if (video.paused) void video.play();
    else video.pause();
  };

  // Click on the progress track — seeks to the clicked position.
  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
  };

  // Fullscreen targets the entire player root (video + side panel) so the
  // side panel remains accessible while in fullscreen mode.
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void rootRef.current?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const p = usePlayerStyles();
  const suggestions = getSuggestions(film.id);
  const isIdle      = playerState === "idle";
  const isLoading   = playerState === "loading";
  const controlsHidden = hidden && !isIdle;

  return (
    <div
      className={mergeClasses(p.root, controlsHidden && p.rootControlsHidden)}
      ref={rootRef}
      onMouseMove={resetInactivity}
      onKeyDown={resetInactivity}
      onClick={resetInactivity}
      tabIndex={0}
    >
      {/* ── Video area ──────────────────────────────────────────────────── */}
      <div className={p.videoArea}>
        <video
          ref={videoRef}
          className={p.videoEl}
          src="/videos/test.mp4"
          preload="metadata"
          onClick={togglePlay}
        />
        <div className={p.scene} />
        <div className={p.grain} />
        <div className={p.letterbox} />

        {/* ── Idle / loading overlay ──────────────────────────────────── */}
        {(isIdle || isLoading) && (
          <div
            className={mergeClasses(p.preOverlay, isLoading && p.preOverlayLoading)}
            onClick={isIdle ? startPlayback : undefined}
          >
            <div className={p.prePoster} style={{ background: film.gradient }} />
            <div className={p.preVignette} />
            {isIdle && (
              <div className={p.prePlayWrap}>
                <button className={p.prePlayBtn} onClick={startPlayback}>
                  <IconPlay size={36} />
                </button>
                <div className={p.preFilmTitle}>{film.title ?? film.filename}</div>
                <div className={p.preFilmMeta}>
                  {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}
            {isLoading && (
              <div className={p.preSpinnerWrap}>
                <div className={p.preSpinner} />
              </div>
            )}
          </div>
        )}

        {/* ── Topbar ──────────────────────────────────────────────────── */}
        <div className={mergeClasses(p.playerTopbar, controlsHidden && p.playerTopbarHidden)}>
          <button className={p.backBtn} onClick={() => navigate(-1)}>
            <IconArrowLeft size={14} />
            Back
          </button>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          <div>
            <div className={p.playerFilmTitle}>{film.title ?? film.filename}</div>
            <div className={p.playerFilmMeta}>
              {[film.year, film.genre, film.director, film.duration].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {film.resolution === "4K" && (
              <span className={mergeClasses(p.badge, p.badgeRed)}>
                {film.resolution}{film.hdr ? " HDR" : ""}
              </span>
            )}
            {film.codec && <span className={mergeClasses(p.badge, p.badgeGray)}>{film.codec}</span>}
          </div>
        </div>

        {/* ── Playback controls ───────────────────────────────────────── */}
        <div className={mergeClasses(p.playerControls, controlsHidden && p.playerControlsHidden)}>
          <div className={p.progressTimes}>
            <span className={p.progressTime}>{formatTime(elapsed)}</span>
            <span className={p.progressTime}>{duration ? formatTime(duration) : film.duration}</span>
          </div>
          <div className={p.progressTrack} onClick={scrub}>
            <div className={p.progressBuffered} style={{ width: `${buffered}%` }} />
            <div className={p.progressPlayed}   style={{ width: `${progress}%` }} />
            <div className={p.progressThumb}    style={{ left:  `${progress}%` }} />
          </div>
          <div className={p.controlsRow}>
            <button className={p.ctrl} data-tip="−10s" onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}>
              <IconBackward size={20} />
            </button>
            <button className={mergeClasses(p.ctrl, p.ctrlPlay)} data-tip={playing ? "Pause" : "Play"} onClick={togglePlay}>
              {playing ? <IconPause size={26} /> : <IconPlay size={26} />}
            </button>
            <button className={p.ctrl} data-tip="+10s" onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}>
              <IconForward size={20} />
            </button>
            <div className={p.volWrap}>
              <button className={p.ctrl} data-tip="Volume"><IconSpeaker size={20} /></button>
              <div
                className={p.volTrack}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setVolume(v);
                  if (videoRef.current) videoRef.current.volume = v;
                }}
              >
                <div className={p.volFill} style={{ width: `${volume * 100}%` }} />
              </div>
            </div>
            <div className={p.ctrlRight}>
              <select
                className={p.resSelect}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option>4K</option>
                <option>1080p</option>
                <option>720p</option>
                <option>480p</option>
                <option>240p</option>
              </select>
              <button className={p.ctrl} data-tip="Fullscreen" onClick={toggleFullscreen}>
                <IconArrowsOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Side panel ──────────────────────────────────────────────────── */}
      <div className={mergeClasses(p.sidePanel, controlsHidden && p.sidePanelHidden)}>
        <div className={p.panelHead}>
          <div className={p.panelSecLabel}>Now Playing</div>
          <div className={p.panelNowTitle}>{film.title ?? film.filename}</div>
          <div className={p.panelNowMeta}>
            {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
          </div>
          {film.plot && <p className={p.panelPlot}>{film.plot}</p>}
        </div>

        <div className={p.panelBody}>
          <div className={p.panelSection}>
            <div className={p.panelSecLabel}>Up Next</div>
            {suggestions.map((sg) => (
              <Link key={sg.id} to={`/player/${sg.id}`} className={p.panelItem}>
                <div className={p.panelThumb} style={{ background: sg.gradient }} />
                <div>
                  <div className={p.panelItemTitle}>{sg.title}</div>
                  <div className={p.panelItemMeta}>{sg.genre}</div>
                </div>
                <button className={p.panelPlay} onClick={(e) => e.stopPropagation()}>
                  <IconPlay size={10} />
                </button>
              </Link>
            ))}
          </div>

          <div className={p.panelSection}>
            <div className={p.panelSecLabel}>From Your Watchlist</div>
            {watchlist.slice(0, 4).map((item) => {
              const wFilm = getFilmById(item.filmId);
              return (
                <div key={item.id} className={p.panelItem}>
                  <div
                    className={p.panelThumb}
                    style={{ background: wFilm?.gradient ?? tokens.colorSurface3 }}
                  />
                  <div>
                    <div className={p.panelItemTitle}>{item.title}</div>
                    <div
                      className={p.panelItemMeta}
                      style={{ color: wFilm ? tokens.colorGreen : "rgba(255,255,255,0.3)" }}
                    >
                      {wFilm ? "✓ On disk" : "Not on disk yet"}
                    </div>
                  </div>
                  {wFilm && (
                    <Link
                      to={`/player/${wFilm.id}`}
                      className={p.panelPlay}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconPlay size={10} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={p.panelFoot}>
          <button className={mergeClasses(p.btnSurface, p.btnSm)}>
            <IconFilm size={13} />
            Open in VLC
          </button>
          <button
            className={mergeClasses(p.btnGhost, p.btnSm)}
            onClick={() => navigate(-1)}
          >
            <IconArrowLeft size={13} />
            Back
          </button>
        </div>
      </div>
    </div>
  );
};
