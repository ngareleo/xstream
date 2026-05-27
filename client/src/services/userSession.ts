/** User-session state machine producing a `session.id`. See docs/architecture/Observability/01-Logging-Policy.md §"User sessions: activity-based tracking". */

import { clientConfig } from "~/config/appConfig.js";

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
  idleTimer = setTimeout(expireSession, clientConfig.session.idleTimeoutMs);
}

/** Start session tracking, minting the first session immediately. Call once, after initTelemetry(). */
export function initUserSession(sessionHooks: SessionHooks = {}): void {
  hooks = sessionHooks;
  startSession(nowMs());
  armIdleTimer();
}

/** Record a user-activity signal: mint a session if none is active and re-arm the idle timer (unless playback is active). */
export function noteActivity(): void {
  if (currentSessionId === null) startSession(nowMs());
  if (!playbackActive) armIdleTimer();
}

/** Mark playback active/inactive; while active the idle timer is disarmed so the session survives a quiet page. */
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
