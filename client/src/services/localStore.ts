/** Single owner of the client's localStorage keys + the safe read/write
 *  interface every module uses for local persistence. */

/** App-owned localStorage keys. Dynamic keys (e.g. per-feature-flag keys,
 *  owned by the flag registry) aren't listed here but still go through the
 *  helpers below. */
export const LocalStorageKey = {
  PaneWidth: "xstream:pane-width",
  ProfilesLastFilm: "xstream:profiles:last-film",
} as const;

/** Read a value; `null` on miss or when storage is unavailable (private
 *  mode, SSR). */
export function readLocal(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Write a value, or remove it when `value` is `null`. No-ops when storage
 *  is unavailable (quota / private browsing) — callers keep in-memory state
 *  as the authority. */
export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* quota / private browsing — ignore */
  }
}
