/** Single owner of the client's localStorage keys + the safe read/write
 *  interface every module uses for local persistence. */

/** App-owned localStorage keys. */
export const LocalStorageKey = {
  PaneWidth: "xstream:pane-width",
  ProfilesLastFilm: "xstream:profiles:last-film",
  Session: "xstream:session",
} as const;

/** Read a value; `null` on miss or when storage is unavailable. */
export function readLocal(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Write a value, or remove it when `value` is `null`; no-op when storage is unavailable. */
export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* quota / private browsing — in-memory state stays authoritative */
  }
}

/** Remove app-owned UI-state keys (the values in {@link LocalStorageKey}),
 *  except the session token — a cache wipe must not sign the user out. */
export function clearAppLocal(): void {
  for (const key of Object.values(LocalStorageKey)) {
    if (key === LocalStorageKey.Session) continue;
    writeLocal(key, null);
  }
}

/** Every key currently in localStorage; empty when storage is unavailable. */
export function localKeys(): string[] {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return [];
    const out: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key !== null) out.push(key);
    }
    return out;
  } catch {
    return [];
  }
}
