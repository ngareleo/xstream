/**
 * Feature-flag runtime: module-level cache + pub/sub.
 *
 * Flag *declarations* live in `flagRegistry.ts`. This file owns the cache,
 * the parse/serialize helpers, and the subscription plumbing so the same
 * values are readable from React (`useFeatureFlag`) and non-React code
 * (`getFlag`, `getEffectiveBufferConfig`, `relay/environment.ts`).
 *
 * **Trust model — `localStorage` is higher trust than the server.** At
 * module load (synchronously, before any GraphQL query has run) we read
 * every registered flag from `localStorage` into the cache. Once the
 * `FeatureFlagsProvider` later hydrates from the server, server values
 * are written to the cache **only for keys that have no localStorage
 * override** — a local toggle wins. Operators wanting the server to
 * become authoritative again call `clearLocalFlagOverrides()` (the
 * "Clear local overrides" button in Settings → Flags).
 */

import { type BufferConfig, clientConfig } from "./appConfig.js";
import { FLAG_KEYS, FLAG_REGISTRY, type FlagValue, type FlagValueType } from "./flagRegistry.js";

const cache = new Map<string, FlagValue>();
const subscribers = new Set<() => void>();
let snapshotVersion = 0;

function parseValue(raw: string, valueType: FlagValueType): FlagValue | null {
  if (valueType === "boolean") {
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function serializeValue(value: FlagValue): string {
  return typeof value === "boolean" ? (value ? "1" : "0") : String(value);
}

function notify(): void {
  snapshotVersion++;
  subscribers.forEach((cb) => cb());
}

function lsGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Quota errors / private browsing — non-fatal here, the in-memory
    // cache is still authoritative for this session.
  }
}

function lsRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

//
// Runs once on first import. Resolvers in `relay/environment.ts` and other
// non-React call sites can therefore call `getFlag(...)` synchronously and
// get the locally-overridden value without waiting for the server hydration.

for (const desc of FLAG_REGISTRY) {
  const raw = lsGet(desc.key);
  if (raw === null) continue;
  const parsed = parseValue(raw, desc.valueType);
  if (parsed !== null) cache.set(desc.key, parsed);
}

/**
 * Called once by `FeatureFlagsProvider` with the server's response. Server
 * values are written to the cache **only for keys that don't already have
 * a localStorage override** — local always wins.
 */
export function hydrateFlags(
  entries: readonly { key: string; value: string | null | undefined }[]
): void {
  for (const entry of entries) {
    const desc = FLAG_REGISTRY.find((f) => f.key === entry.key);
    if (!desc || entry.value == null) continue;
    if (lsGet(entry.key) !== null) continue; // local override wins
    const parsed = parseValue(entry.value, desc.valueType);
    if (parsed !== null) cache.set(entry.key, parsed);
  }
  notify();
}

export function getFlag<T extends FlagValue>(key: string, fallback: T): T {
  const cached = cache.get(key);
  return (cached ?? fallback) as T;
}

/**
 * Optimistic local update: writes to BOTH the in-memory cache and to
 * `localStorage` (so the next page load sees it before the server hydration
 * even starts). The caller is responsible for persisting to the server via
 * the `setSetting` mutation. Subscribers are notified so React re-renders.
 */
export function setFlagLocal(key: string, value: FlagValue): void {
  cache.set(key, value);
  lsSet(key, serializeValue(value));
  notify();
}

/**
 * Drop every flag's localStorage override and in-memory cache entry. The
 * next read returns the registry default until the next server hydration
 * fills the cache from the server. Used by Settings → Flags' "Clear local
 * overrides" button.
 */
export function clearLocalFlagOverrides(): void {
  for (const desc of FLAG_REGISTRY) {
    lsRemove(desc.key);
    cache.delete(desc.key);
  }
  notify();
}

/**
 * Set every flag back to its registry `defaultValue` (writes to cache +
 * localStorage). Returns the list of `{ key, serializedValue }` so the
 * caller can persist them to the server in one batch via `setSetting`.
 */
export function resetAllFlagsToDefaults(): Array<{ key: string; value: string }> {
  const writes: Array<{ key: string; value: string }> = [];
  for (const desc of FLAG_REGISTRY) {
    setFlagLocal(desc.key, desc.defaultValue);
    writes.push({ key: desc.key, value: serializeValue(desc.defaultValue) });
  }
  return writes;
}

export function subscribeFlags(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Snapshot identity used by `useSyncExternalStore`. Bumped whenever a flag
 *  is hydrated or written so React components re-render. */
export function getFlagsSnapshot(): number {
  return snapshotVersion;
}

/**
 * Resolves the effective BufferConfig for a new playback session. Called
 * synchronously by `PlaybackController` at the moment it constructs a
 * `BufferManager`, so toggling the flag takes effect on the *next* playback
 * (current session keeps whatever config it booted with).
 */
export function getEffectiveBufferConfig(): BufferConfig {
  const experimental = getFlag<boolean>(FLAG_KEYS.experimentalBuffer, false);
  if (!experimental) return clientConfig.buffer;
  return {
    ...clientConfig.buffer,
    forwardTargetS: getFlag<number>(
      FLAG_KEYS.bufferForwardTargetS,
      clientConfig.buffer.forwardTargetS
    ),
    forwardResumeS: getFlag<number>(
      FLAG_KEYS.bufferForwardResumeS,
      clientConfig.buffer.forwardResumeS
    ),
  };
}
