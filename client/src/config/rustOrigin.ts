/**
 * Backend origin selection.
 *
 * Two modes are possible at module init:
 *
 *   1. **Tauri** — `window.__XSTREAM_SERVER_PORT__` is set by the Tauri
 *      shell (`src-tauri/src/lib.rs`) before the React bundle evaluates.
 *      The shell picked a free `127.0.0.1:<port>` and spawned the server
 *      there. Origin is `http://127.0.0.1:<port>` /
 *      `ws://127.0.0.1:<port>`.
 *
 *   2. **Browser dev** — `bun run dev` has the server running on
 *      `localhost:3002`. Origin is `http://localhost:3002`.
 */

// Tauri-injected port. Set by `src-tauri/src/lib.rs` via
// `webview.eval("window.__XSTREAM_SERVER_PORT__ = N")` before the
// React bundle's first frame runs.
const TAURI_PORT: number | null =
  typeof window !== "undefined"
    ? ((window as unknown as { __XSTREAM_SERVER_PORT__?: number }).__XSTREAM_SERVER_PORT__ ?? null)
    : null;

const HTTP_ORIGIN =
  TAURI_PORT !== null ? `http://127.0.0.1:${TAURI_PORT}` : "http://localhost:3002";
const WS_ORIGIN = TAURI_PORT !== null ? `ws://127.0.0.1:${TAURI_PORT}` : "ws://localhost:3002";

export function graphqlHttpUrl(): string {
  return `${HTTP_ORIGIN}/graphql`;
}

export function graphqlWsUrl(): string {
  return `${WS_ORIGIN}/graphql`;
}

export function streamUrl(jobId: string): string {
  return `${HTTP_ORIGIN}/stream/${jobId}`;
}
