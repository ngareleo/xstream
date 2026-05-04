/** Feature-flag runtime: module cache + pub/sub. localStorage has higher trust than server. See docs/client/Feature-Flags/. */

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
    // Quota / private browsing; in-memory cache still authoritative.
  }
}

function lsRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

// Module-init: populate cache from localStorage so getFlag() works synchronously.
for (const desc of FLAG_REGISTRY) {
  const raw = lsGet(desc.key);
  if (raw === null) continue;
  const parsed = parseValue(raw, desc.valueType);
  if (parsed !== null) cache.set(desc.key, parsed);
}

/** Hydrate cache from server; local overrides always win. */
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

/** Optimistic update: cache + localStorage. Caller persists to server via setSetting mutation. */
export function setFlagLocal(key: string, value: FlagValue): void {
  cache.set(key, value);
  lsSet(key, serializeValue(value));
  notify();
}

/** Clear all localStorage overrides; revert to registry defaults until next server hydration. */
export function clearLocalFlagOverrides(): void {
  for (const desc of FLAG_REGISTRY) {
    lsRemove(desc.key);
    cache.delete(desc.key);
  }
  notify();
}

/** Reset all flags to registry defaults; return serialized values for batch server persistence. */
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

/** Snapshot for useSyncExternalStore; bumped on flag change. */
export function getFlagsSnapshot(): number {
  return snapshotVersion;
}

/** Resolve effective BufferConfig for new playback session; takes effect on next playback. */
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
