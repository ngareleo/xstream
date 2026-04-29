/**
 * Origin selection for the Rust GraphQL server (Step 1 cutover).
 *
 * `featureFlags.ts` populates the in-memory flag cache from `localStorage`
 * at module load — synchronously, before `relay/environment.ts` runs. So
 * `getFlag(useRustGraphQL, false)` here is reliable at module-init time.
 * Toggling the flag in Settings → Flags requires one page reload because
 * the Relay environment is constructed once at app boot.
 */

import { getFlag } from "./featureFlags.js";
import { FLAG_KEYS } from "./flagRegistry.js";

// Rust binds 3002 in dev so it doesn't collide with Bun on 3001.
// Tauri (Step 3) collapses both processes so this constant goes away.
const RUST_HTTP_ORIGIN = "http://localhost:3002";
const RUST_WS_ORIGIN = "ws://localhost:3002";

export function isRustGraphQLEnabled(): boolean {
  return getFlag<boolean>(FLAG_KEYS.useRustGraphQL, false);
}

export function graphqlHttpUrl(): string {
  return isRustGraphQLEnabled() ? `${RUST_HTTP_ORIGIN}/graphql` : "/graphql";
}

export function graphqlWsUrl(): string {
  if (isRustGraphQLEnabled()) return `${RUST_WS_ORIGIN}/graphql`;
  const proto = globalThis.location?.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${globalThis.location?.host ?? "localhost"}/graphql`;
}
