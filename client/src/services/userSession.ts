/**
 * User-session state machine. A session begins on the first activity and ends
 * after an idle gap with no activity — 15 min in prod, 1 min in dev. Playback
 * counts as activity: while a video plays the idle timer is disarmed, so a
 * playing-but-untouched page never expires. Once playback pauses, the idle
 * timer re-arms and the session ends if nothing else happens in time.
 *
 * The `session.id` produced here is stamped onto every client log and span (see
 * `~/telemetry.ts`) so usage can be reconstructed from telemetry. This module is
 * deliberately telemetry-free — it imports nothing from `~/telemetry.ts`, which
 * keeps it a leaf (telemetry imports `getCurrentSessionId` from here without a
 * cycle). Session-boundary telemetry is emitted by the `onStart`/`onEnd` hooks
 * passed to `initUserSession`; see `~/services/sessionTelemetry.ts`.
 */

/** 1 min in dev (so sessions are testable by hand), 15 min in prod. */
export const IDLE_TIMEOUT_MS = IS_DEV_BUILD ? 60_000 : 15 * 60_000;

export interface SessionHooks {
  /** Fired when a new session is minted, with its id. */
  onStart?: (sessionId: string) => void;
  /** Fired when a session ends from idle, with its id and wall-clock duration. */
  onEnd?: (sessionId: string, durationMs: number) => void;
}

let hooks: SessionHooks = {};
let currentSessionId: string | null = null;
let sessionStartedAt = 0;
let playbackActive = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function nowMs(): number {
  return performance.now();
}

function startSession(now: number): void {
  currentSessionId = crypto.randomUUID();
  sessionStartedAt = now;
  hooks.onStart?.(currentSessionId);
}

function expireSession(): void {
  idleTimer = null;
  if (currentSessionId === null) return;
  const durationMs = nowMs() - sessionStartedAt;
  const endedId = currentSessionId;
  currentSessionId = null;
  hooks.onEnd?.(endedId, durationMs);
}

function clearIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function armIdleTimer(): void {
  clearIdleTimer();
  idleTimer = setTimeout(expireSession, IDLE_TIMEOUT_MS);
}

/**
 * Start session tracking. Mints the first session immediately — opening the app
 * is itself activity — so telemetry emitted from boot carries a `session.id`.
 * Call once, after `initTelemetry()`.
 */
export function initUserSession(sessionHooks: SessionHooks = {}): void {
  hooks = sessionHooks;
  startSession(nowMs());
  armIdleTimer();
}

/**
 * Record a user-activity signal (route change, click, key, mouse-move, scroll).
 * Mints a session if none is active, then re-arms the idle timer — unless
 * playback is active, in which case the timer stays disarmed.
 */
export function noteActivity(): void {
  if (currentSessionId === null) startSession(nowMs());
  if (!playbackActive) armIdleTimer();
}

/**
 * Mark playback as started/stopped. While active, the idle timer is disarmed so
 * the session survives a quiet page. When playback stops, the timer re-arms
 * from now, so the session ends one idle window after the user pauses.
 */
export function setPlaybackActive(active: boolean): void {
  if (active === playbackActive) return;
  playbackActive = active;
  if (active) {
    if (currentSessionId === null) startSession(nowMs());
    clearIdleTimer();
  } else {
    armIdleTimer();
  }
}

/** The active session id, or null before init / between expiry and next activity. */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/** Stop tracking and reset all state. Used by tests and on teardown. */
export function teardownUserSession(): void {
  clearIdleTimer();
  hooks = {};
  currentSessionId = null;
  sessionStartedAt = 0;
  playbackActive = false;
}
