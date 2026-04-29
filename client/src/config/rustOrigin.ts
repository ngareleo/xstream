/**
 * Synchronous source of truth for the `useRustGraphQL` flag — read at
 * Relay-environment init time, BEFORE the FeatureFlagsProvider has hydrated
 * the registry from the server.
 *
 * The flag itself lives in the registry (and is persisted via `setSetting`
 * like every other flag); this module mirrors it to `localStorage` so the
 * value is available synchronously when `relay/environment.ts` constructs
 * the network layer at module load. After toggling in Settings → Flags the
 * user must reload the page for the new origin to take effect.
 */

const STORAGE_KEY = "flag.useRustGraphQL";
// Rust binds 3002 in dev so it doesn't collide with Bun on 3001.
// Tauri (Step 3) collapses both processes so this constant goes away.
const RUST_HTTP_ORIGIN = "http://localhost:3002";
const RUST_WS_ORIGIN = "ws://localhost:3002";

export function isRustGraphQLEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Persist the flag value to `localStorage` so the next page load sees it.
 * Called from `useFeatureFlag`'s setter for this specific key.
 */
export function rememberRustGraphQLFlag(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Ignore — quota errors / Safari private mode etc. are non-fatal here.
  }
}

export function graphqlHttpUrl(): string {
  return isRustGraphQLEnabled() ? `${RUST_HTTP_ORIGIN}/graphql` : "/graphql";
}

export function graphqlWsUrl(): string {
  if (isRustGraphQLEnabled()) return `${RUST_WS_ORIGIN}/graphql`;
  const proto = globalThis.location?.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${globalThis.location?.host ?? "localhost"}/graphql`;
}
