/** Module-scoped `user.id` read by telemetry exporters at emit time. See `docs/architecture/Identity/03-Telemetry-Correlation.md`. */

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
