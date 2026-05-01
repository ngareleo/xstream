/**
 * Backend origin selection for the Rust + Tauri migration cutover.
 *
 * Three modes are possible at module init:
 *
 *   1. **Tauri** — `window.__XSTREAM_SERVER_PORT__` is set by the Tauri
 *      shell (`src-tauri/src/lib.rs`) before the React bundle evaluates.
 *      The shell picked a free `127.0.0.1:<port>` and spawned the Rust
 *      server there. Origin is `http://127.0.0.1:<port>` /
 *      `ws://127.0.0.1:<port>`. The `useRustBackend` flag is irrelevant —
 *      there is no Bun, the Rust server is the only origin.
 *
 *   2. **Browser, flag on** — dev workflow with both Bun + Rust running.
 *      Origin is `http://localhost:3002` (Rust server in dev).
 *
 *   3. **Browser, flag off** — dev workflow against Bun via the rsbuild
 *      dev proxy. Origin is the page origin (no host).
 *
 * **Module-init capture is load-bearing.** `featureFlags.ts` populates the
 * in-memory flag cache from `localStorage` synchronously at module load.
 * We snapshot the chosen origin here, ONCE, before any consumer reads it.
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

// Tauri-injected port. Set by `src-tauri/src/lib.rs` via
// `webview.eval("window.__XSTREAM_SERVER_PORT__ = N")` before the
// React bundle's first frame runs. When set, it overrides the flag —
// there is no Bun in a packaged Tauri build.
const TAURI_PORT: number | null =
  typeof window !== "undefined"
    ? ((window as unknown as { __XSTREAM_SERVER_PORT__?: number }).__XSTREAM_SERVER_PORT__ ?? null)
    : null;

const RUST_HTTP_ORIGIN = TAURI_PORT !== null ? `http://127.0.0.1:${TAURI_PORT}` : "http://localhost:3002";
const RUST_WS_ORIGIN = TAURI_PORT !== null ? `ws://127.0.0.1:${TAURI_PORT}` : "ws://localhost:3002";

// Under Tauri the Rust server is the only origin, so the flag is forced
// on. In the browser, the flag's user-set value drives routing.
const RUST_BACKEND_ENABLED = TAURI_PORT !== null ? true : getFlag<boolean>(FLAG_KEYS.useRustBackend, false);

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
