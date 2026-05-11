/**
 * Module-scoped identity context used by telemetry exporters.
 *
 * OTel resource attributes are frozen at provider init when the user is
 * unknown. Instead of attaching `user.id` as a resource attr, exporters
 * read `getUserContext()` at log/span emit time so the attribute attaches
 * per-record. See `docs/architecture/Identity/03-Telemetry-Correlation.md`.
 *
 * The auth service calls `setUserContext` after a successful signin /
 * session restore, and `clearUserContext` on signout.
 */

let currentUserId: string | null = null;

export function setUserContext(userId: string): void {
  currentUserId = userId;
}

export function getUserContext(): string | null {
  return currentUserId;
}

export function clearUserContext(): void {
  currentUserId = null;
}
