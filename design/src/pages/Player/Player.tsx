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
import { films, getFilmById, watchlist } from "../../data/mock.js";
import "./Player.css";

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

  const suggestions = getSuggestions(film.id);
  const isIdle      = playerState === "idle";
  const isLoading   = playerState === "loading";

  return (
    <div
      // controls-hidden: fades topbar + controls + side panel, collapses panel column
      className={`player-root${hidden && !isIdle ? " controls-hidden" : ""}`}
      ref={rootRef}
      onMouseMove={resetInactivity}
      onKeyDown={resetInactivity}
      onClick={resetInactivity}
      tabIndex={0}
    >
      {/* ── Video area ──────────────────────────────────────────────────── */}
      <div className="video-area">
        {/*
         * The video element is always mounted so metadata loads immediately.
         * In production: no `src` here — video is fed via MSE SourceBuffer.
         * The element sits at z-index 1 above `.scene` (z-index 0) so the
         * atmospheric background shows through until playback starts.
         */}
        <video
          ref={videoRef}
          className="video-el"
          src="/videos/test.mp4"
          preload="metadata"
          onClick={togglePlay}
        />
        {/* Atmospheric background visible during idle/loading and before the
            video frame is ready. Layered: scene (gradient) → grain → letterbox */}
        <div className="scene" />
        <div className="grain" />
        <div className="letterbox" />

        {/* ── Idle / loading overlay ──────────────────────────────────── */}
        {/*
         * Shown when playerState is "idle" or "loading".
         * Idle:    poster gradient + film title + large play button.
         *          Clicking anywhere on the overlay (or the play button) starts playback.
         * Loading: same poster but play button replaced with a spinner.
         *          Not clickable — user must wait for the stream to buffer.
         *
         * The overlay sits at z-index 5, above all video layers but below the
         * topbar (z-index 10) so the film title and Back button remain reachable.
         */}
        {(isIdle || isLoading) && (
          <div
            className={`pre-overlay${isLoading ? " pre-overlay--loading" : ""}`}
            onClick={isIdle ? startPlayback : undefined}
          >
            <div className="pre-poster" style={{ background: film.gradient }} />
            <div className="pre-vignette" />
            {isIdle && (
              <div className="pre-play-wrap">
                <button className="pre-play-btn" onClick={startPlayback}>
                  <IconPlay size={36} />
                </button>
                <div className="pre-film-title">{film.title ?? film.filename}</div>
                <div className="pre-film-meta">
                  {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}
            {isLoading && (
              <div className="pre-spinner-wrap">
                <div className="pre-spinner" />
              </div>
            )}
          </div>
        )}

        {/* ── Topbar ──────────────────────────────────────────────────── */}
        {/*
         * Always rendered; hidden by .controls-hidden when inactive.
         * Back button uses navigate(-1) to preserve the full history stack:
         * if the user arrived from /library?film=dune-2 the pane reopens on return.
         */}
        <div className="player-topbar">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <IconArrowLeft size={14} />
            Back
          </button>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          <div>
            <div className="player-film-title">{film.title ?? film.filename}</div>
            <div className="player-film-meta">
              {[film.year, film.genre, film.director, film.duration].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {film.resolution === "4K" && (
              <span className="badge badge-red">
                {film.resolution}{film.hdr ? " HDR" : ""}
              </span>
            )}
            {film.codec && <span className="badge badge-gray">{film.codec}</span>}
          </div>
        </div>

        {/* ── Playback controls ───────────────────────────────────────── */}
        {/*
         * Gradient scrim fades from bottom so text stays readable over any frame.
         * The progress bar shows two layers: buffered (lighter) and played (red).
         * The thumb only appears on hover (CSS-only, no JS state needed).
         * Skip buttons jump ±10s; volume track scrubs 0–1 linearly.
         * The resolution selector is visual-only in the design — in production
         * it triggers a resolution switch on the streaming pipeline.
         */}
        <div className="player-controls">
          <div className="progress-times">
            <span className="progress-time">{formatTime(elapsed)}</span>
            {/* Prefer real duration once loaded; fall back to the metadata string */}
            <span className="progress-time">{duration ? formatTime(duration) : film.duration}</span>
          </div>
          <div className="progress-track" onClick={scrub}>
            <div className="progress-buffered" style={{ width: `${buffered}%` }} />
            <div className="progress-played"   style={{ width: `${progress}%` }} />
            <div className="progress-thumb"    style={{ left:  `${progress}%` }} />
          </div>
          <div className="controls-row">
            <button className="ctrl" data-tip="−10s" onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}>
              <IconBackward size={20} />
            </button>
            <button className="ctrl play" data-tip={playing ? "Pause" : "Play"} onClick={togglePlay}>
              {playing ? <IconPause size={26} /> : <IconPlay size={26} />}
            </button>
            <button className="ctrl" data-tip="+10s" onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}>
              <IconForward size={20} />
            </button>
            <div className="vol-wrap">
              <button className="ctrl" data-tip="Volume"><IconSpeaker size={20} /></button>
              <div
                className="vol-track"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setVolume(v);
                  if (videoRef.current) videoRef.current.volume = v;
                }}
              >
                <div className="vol-fill" style={{ width: `${volume * 100}%` }} />
              </div>
            </div>
            <div className="ctrl-right">
              {/* In production: changing resolution calls stopStream() + startStream(newRes) */}
              <select
                className="res-select"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option>4K</option>
                <option>1080p</option>
                <option>720p</option>
                <option>480p</option>
                <option>240p</option>
              </select>
              <button className="ctrl" data-tip="Fullscreen" onClick={toggleFullscreen}>
                <IconArrowsOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Side panel ──────────────────────────────────────────────────── */}
      {/*
       * Slides out with the controls on inactivity (grid column → 0px).
       * Divided into three sections:
       *   panel-head : current film info + plot (truncated to 3 lines)
       *   panel-body : Up Next (matched films, same library) + Watchlist
       *   panel-foot : secondary actions (Open in VLC, Back)
       *
       * Up Next links navigate to /player/:id, replacing the current entry in
       * the history stack so the Back button returns to the originating library
       * page rather than building an unbounded player → player chain.
       *
       * Watchlist items show a green "On disk" indicator when the film exists
       * locally; items not on disk show a muted "Not on disk yet" and no play button.
       */}
      <div className="side-panel">
        <div className="panel-head">
          <div className="panel-sec-label">Now Playing</div>
          <div className="panel-now-title">{film.title ?? film.filename}</div>
          <div className="panel-now-meta">
            {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
          </div>
          {film.plot && <p className="panel-plot">{film.plot}</p>}
        </div>

        <div className="panel-body">
          <div className="panel-section">
            <div className="panel-sec-label">Up Next</div>
            {suggestions.map((s) => (
              <Link key={s.id} to={`/player/${s.id}`} className="panel-item">
                <div className="panel-thumb" style={{ background: s.gradient }} />
                <div>
                  <div className="panel-item-title">{s.title}</div>
                  <div className="panel-item-meta">{s.genre}</div>
                </div>
                <button className="panel-play" onClick={(e) => e.stopPropagation()}>
                  <IconPlay size={10} />
                </button>
              </Link>
            ))}
          </div>

          <div className="panel-section">
            <div className="panel-sec-label">From Your Watchlist</div>
            {watchlist.slice(0, 4).map((item) => {
              const wFilm = getFilmById(item.filmId);
              return (
                <div key={item.id} className="panel-item">
                  <div
                    className="panel-thumb"
                    style={{ background: wFilm?.gradient ?? "var(--surface3)" }}
                  />
                  <div>
                    <div className="panel-item-title">{item.title}</div>
                    <div
                      className="panel-item-meta"
                      style={{ color: wFilm ? "var(--green)" : "rgba(255,255,255,0.3)" }}
                    >
                      {wFilm ? "✓ On disk" : "Not on disk yet"}
                    </div>
                  </div>
                  {wFilm && (
                    <Link
                      to={`/player/${wFilm.id}`}
                      className="panel-play"
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

        <div className="panel-foot">
          {/* Open in VLC: passes the local file path to the vlc:// URL scheme.
              In production, resolve the absolute file path from the video record. */}
          <button className="btn btn-surface btn-sm" style={{ justifyContent: "center" }}>
            <IconFilm size={13} />
            Open in VLC
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "center" }}
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
