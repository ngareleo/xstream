/** Feature-flag runtime: module cache + pub/sub. localStorage has higher trust than server. See docs/client/Feature-Flags/. */

import { readLocal, writeLocal } from "~/services/localStore.js";

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

// Module-init: populate cache from localStorage so getFlag() works synchronously.
// Prod builds skip this — flags always resolve to caller-provided fallbacks.
if (IS_DEV_BUILD) {
  for (const desc of FLAG_REGISTRY) {
    const raw = readLocal(desc.key);
    if (raw === null) continue;
    const parsed = parseValue(raw, desc.valueType);
    if (parsed !== null) cache.set(desc.key, parsed);
  }
}

/**
 * Fetch every registered flag from the server and hydrate the cache before
 * React mounts. Called from `main.tsx` before `initTelemetry()` so the
 * exporter can read the right flag values. Noop in prod builds — the cache
 * is no-op there and `getFlag` returns caller fallbacks.
 */
export async function bootstrapFlagsFromServer(): Promise<void> {
  if (!IS_DEV_BUILD) return;
  const { settingsUrl } = await import("./rustOrigin.js");
  const keys = FLAG_REGISTRY.map((f) => f.key);
  if (keys.length === 0) return;
  try {
    const resp = await fetch(settingsUrl(keys), { method: "GET" });
    if (!resp.ok) return;
    const entries = (await resp.json()) as { key: string; value: string | null }[];
    hydrateFlags(entries);
  } catch {
    // Best-effort. Cache stays empty → callers fall back to registry defaults.
  }
}

/** Hydrate cache from server; local overrides always win. Noop in prod builds. */
export function hydrateFlags(
  entries: readonly { key: string; value: string | null | undefined }[]
): void {
  if (!IS_DEV_BUILD) return;
  for (const entry of entries) {
    const desc = FLAG_REGISTRY.find((f) => f.key === entry.key);
    if (!desc || entry.value == null) continue;
    if (readLocal(entry.key) !== null) continue; // local override wins
    const parsed = parseValue(entry.value, desc.valueType);
    if (parsed !== null) cache.set(entry.key, parsed);
  }
  notify();
}

export function getFlag<T extends FlagValue>(key: string, fallback: T): T {
  if (!IS_DEV_BUILD) return fallback;
  const cached = cache.get(key);
  return (cached ?? fallback) as T;
}

/** Optimistic update: cache + localStorage. Caller persists to server via setSetting mutation. Noop in prod. */
export function setFlagLocal(key: string, value: FlagValue): void {
  if (!IS_DEV_BUILD) return;
  cache.set(key, value);
  writeLocal(key, serializeValue(value));
  notify();
}

/** Clear all localStorage overrides; revert to registry defaults until next server hydration. Noop in prod. */
export function clearLocalFlagOverrides(): void {
  if (!IS_DEV_BUILD) return;
  for (const desc of FLAG_REGISTRY) {
    writeLocal(desc.key, null);
    cache.delete(desc.key);
  }
  notify();
}

/** Reset all flags to registry defaults; return serialized values for batch server persistence. Noop in prod. */
export function resetAllFlagsToDefaults(): Array<{ key: string; value: string }> {
  if (!IS_DEV_BUILD) return [];
  const writes: Array<{ key: string; value: string }> = [];
  for (const desc of FLAG_REGISTRY) {
    setFlagLocal(desc.key, desc.defaultValue);
    writes.push({ key: desc.key, value: serializeValue(desc.defaultValue) });
  }
  return writes;
}

export function subscribeFlags(cb: () => void): () => void {
  if (!IS_DEV_BUILD) return () => {};
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Snapshot for useSyncExternalStore; bumped on flag change. Constant in prod. */
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
