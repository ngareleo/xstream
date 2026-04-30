/**
 * Backend origin selection for the Rust + Tauri migration cutover.
 *
 * One flag (`useRustBackend`) routes BOTH GraphQL and `/stream/*` to the
 * same backend — Rust on `localhost:3002` when on, Bun on `localhost:3001`
 * (via the rsbuild dev proxy) when off. The two servers are
 * runtime-independent — neither knows about the other's job store, segment
 * cache, or DB writes — so splitting traffic between them produces a
 * 404 / split-brain. They are flipped together as one backend.
 *
 * **Module-init capture is load-bearing.** `featureFlags.ts` populates the
 * in-memory flag cache from `localStorage` synchronously at module load.
 * We snapshot the flag value here, ONCE, before any consumer reads it.
 * That guarantees GraphQL routing (read once at module-init) and
 * `/stream/*` routing (read per fetch) cannot diverge mid-session: if a
 * user toggles in Settings without reloading, the toggle is invisible
 * to BOTH channels until the next reload — matching the flag's
 * "Reload required after toggle" contract. Without the snapshot, GraphQL
 * stays on the old backend (frozen) while /stream picks up the new flag
 * value (live), producing a 404 split-brain (Bun creates a job, Rust
 * /stream doesn't know it).
 */

import { getFlag } from "./featureFlags.js";
import { FLAG_KEYS } from "./flagRegistry.js";

// Rust binds 3002 in dev so it doesn't collide with Bun on 3001.
// Tauri (Step 3) collapses both processes so this constant goes away.
const RUST_HTTP_ORIGIN = "http://localhost:3002";
const RUST_WS_ORIGIN = "ws://localhost:3002";

const RUST_BACKEND_ENABLED = getFlag<boolean>(FLAG_KEYS.useRustBackend, false);

export function isRustBackendEnabled(): boolean {
  return RUST_BACKEND_ENABLED;
}

export function graphqlHttpUrl(): string {
  return RUST_BACKEND_ENABLED ? `${RUST_HTTP_ORIGIN}/graphql` : "/graphql";
}

export function graphqlWsUrl(): string {
  if (RUST_BACKEND_ENABLED) return `${RUST_WS_ORIGIN}/graphql`;
  const proto = globalThis.location?.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${globalThis.location?.host ?? "localhost"}/graphql`;
}

/** `/stream/:jobId` URL for the current backend. The same module-init
 *  snapshot drives this and `graphqlHttpUrl()`, so the two channels can
 *  never disagree mid-session. */
export function streamUrl(jobId: string): string {
  return RUST_BACKEND_ENABLED ? `${RUST_HTTP_ORIGIN}/stream/${jobId}` : `/stream/${jobId}`;
}
