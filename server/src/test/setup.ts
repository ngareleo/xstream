/**
 * Bun test preload — runs in every test worker before any test file is evaluated.
 *
 * **Policy: tests must leave the host as they found it.** Tests can write to
 * their per-PID temp dir freely during execution, but no run may leak into
 * `tmp/xstream.db` / `tmp/segments/` (the dev runtime paths) and no test
 * residue may persist across runs.
 *
 * Mechanism:
 *  - DB_PATH and SEGMENT_DIR point at `/tmp/xstream-test-<pid>/` — writes go
 *    here, never the dev paths. Tests in the same worker share this dir
 *    (so they can build on each other's seeded state); concurrent
 *    `bun test` invocations get distinct PIDs, hence distinct dirs.
 *  - SEGMENT_DIR isolation also matters because `startTranscodeJob` derives
 *    the job cache key from `content_fingerprint + resolution + time range`
 *    — without a fresh dir, stale segments from a prior run let it
 *    "restore" the cached job and silently skip re-encoding.
 *  - **Cleanup runs on the NEXT preload, not the current exit.** bun:test
 *    workers exit through a path that bypasses both `process.on('exit')`
 *    and `'beforeExit'`, so we can't reliably clean up at the end of a
 *    run. Instead, every preload scans `/tmp` for `xstream-test-<pid>`
 *    dirs whose PID is no longer alive and removes them. Net effect: no
 *    permanent residue, and SIGKILL is no worse than a clean exit.
 */
import { mkdirSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

cleanupOrphanTestDirs();

const SHARED_TEST_DIR = join(tmpdir(), `xstream-test-${process.pid}`);
mkdirSync(SHARED_TEST_DIR, { recursive: true });
process.env.DB_PATH = join(SHARED_TEST_DIR, "test.db");
process.env.SEGMENT_DIR = join(SHARED_TEST_DIR, "segments");
mkdirSync(process.env.SEGMENT_DIR, { recursive: true });

/** Remove any `xstream-test-<pid>` dir under /tmp whose PID is no longer
 *  running. Called at preload start so each new run reclaims the previous
 *  run's residue. Skips the current PID (its dir is about to be created). */
function cleanupOrphanTestDirs(): void {
  const prefix = "xstream-test-";
  let entries: string[];
  try {
    entries = readdirSync(tmpdir());
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const pid = Number.parseInt(name.slice(prefix.length), 10);
    if (!Number.isFinite(pid) || pid === process.pid) continue;
    try {
      process.kill(pid, 0); // throws ESRCH when no such process — safe to nuke
      continue;
    } catch {
      // PID not alive — orphan dir
    }
    try {
      rmSync(join(tmpdir(), name), { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

// Replaces the global TracerProvider with an in-memory one. Must happen
// before any test file imports the chunker, since module-load `getTracer`
// captures the current global provider — see `traceCapture.ts` for details.
import "./traceCapture.js";
