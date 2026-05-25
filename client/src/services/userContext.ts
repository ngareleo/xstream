/** Module-scoped identity read by telemetry + the app header. See `docs/architecture/Identity/03-Telemetry-Correlation.md`. */

let currentUserId: string | null = null;
let currentUserEmail: string | null = null;

export function setUserContext(userId: string, email: string | null = null): void {
  currentUserId = userId;
  currentUserEmail = email;
}

/** The Supabase user id (`sub`). Read by telemetry exporters at emit time. */
export function getUserContext(): string | null {
  return currentUserId;
}

/** The signed-in user's email, when known. Source for AccountMenu's identity card. */
export function getUserEmail(): string | null {
  return currentUserEmail;
}

export function clearUserContext(): void {
  currentUserId = null;
  currentUserEmail = null;
}

/**
 * Sync check used by router loaders. The user id is populated by
 * `restoreSession()` before React mounts (see main.tsx) and kept in
 * lockstep via `subscribeToAuthChanges`, so this is the canonical
 * client-side answer to "is a session present?" without paying for a
 * Web Lock + microtask hop per navigation.
 */
export function hasActiveSession(): boolean {
  return currentUserId !== null;
}
