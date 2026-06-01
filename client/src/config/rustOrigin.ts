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

export function settingsUrl(keys: readonly string[]): string {
  return `${HTTP_ORIGIN}/settings?keys=${encodeURIComponent(keys.join(","))}`;
}

/** Absolute URL for a server auth endpoint (e.g. `/auth/session`). */
export function authUrl(path: string): string {
  return `${HTTP_ORIGIN}${path}`;
}

/**
 * Rewrite a `posterUrl` from GraphQL into a fetchable URL. The server
 * returns `/poster/<basename>` for locally cached posters; we prepend
 * the server origin so the dev client (running on a different port from
 * the server) can fetch them. Absolute URLs (the OMDb fallback) are
 * passed through unchanged.
 */
export function resolvePosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/poster/")) {
    return `${HTTP_ORIGIN}${url}`;
  }
  return url;
}
