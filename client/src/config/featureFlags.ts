/**
 * Feature-flag runtime: module-level cache + pub/sub.
 *
 * Flag *declarations* live in `flagRegistry.ts`. This file owns the cache,
 * the parse/serialize helpers, and the subscription plumbing so the same
 * values are readable from React (`useFeatureFlag`) and non-React code
 * (`getFlag`, `getEffectiveBufferConfig`). On app boot,
 * `FeatureFlagsProvider` hydrates this cache from a single bulk `settings`
 * query. Once hydrated, `getFlag(key, default)` returns synchronously.
 */

import { type BufferConfig, DEFAULT_BUFFER_CONFIG } from "~/services/BufferManager.js";

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

/** Called once by FeatureFlagsProvider with the server's response. */
export function hydrateFlags(
  entries: readonly { key: string; value: string | null | undefined }[]
): void {
  for (const entry of entries) {
    const desc = FLAG_REGISTRY.find((f) => f.key === entry.key);
    if (!desc || entry.value == null) continue;
    const parsed = parseValue(entry.value, desc.valueType);
    if (parsed !== null) cache.set(entry.key, parsed);
  }
  notify();
}

export function getFlag<T extends FlagValue>(key: string, fallback: T): T {
  const cached = cache.get(key);
  return (cached ?? fallback) as T;
}

/** Optimistic local update — the caller is responsible for persisting via the
 *  `setSetting` mutation. Subscribers are notified so React components re-render. */
export function setFlagLocal(key: string, value: FlagValue): void {
  cache.set(key, value);
  notify();
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
  if (!experimental) return DEFAULT_BUFFER_CONFIG;
  return {
    ...DEFAULT_BUFFER_CONFIG,
    forwardTargetS: getFlag<number>(
      FLAG_KEYS.bufferForwardTargetS,
      DEFAULT_BUFFER_CONFIG.forwardTargetS
    ),
    forwardResumeS: getFlag<number>(
      FLAG_KEYS.bufferForwardResumeS,
      DEFAULT_BUFFER_CONFIG.forwardResumeS
    ),
  };
}
