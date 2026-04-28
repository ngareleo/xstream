/**
 * Chunker encode-pipeline integration tests.
 *
 * Real ffmpeg subprocesses against real movie sources, gated by
 * $XSTREAM_TEST_MEDIA_DIR (set via /setup-local or .env). When the env var
 * isn't set, the entire suite skips so a default `bun test` run stays green
 * for anyone without the fixture media on disk.
 *
 * Two assertion bands:
 *   - Always (when fixtures resolve): every chunk completes, segments + init
 *     hit disk, and chunks 0 + 1 fired concurrently each carry source-time
 *     PTS (the chunkStartSeconds offset contract from commit 45f7f8f).
 *   - When the host has a working HW encoder: 4K source must NEVER fall back
 *     to software. Software fallback at 4K stalls playback continuously and
 *     is treated as a UX regression.
 *
 * **Policy:** every encoder edge case we discover lands here as a fixture
 * + assertion. A fix without a matching test in the same PR is not done.
 * See `.claude/agents/architect.md` § "Encoder edge-case test policy" for
 * the full rules and the carve-outs.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "bun:test";

import { getDb } from "../../db/index.js";
import {
  firstPacketPts,
  hasHardwareEncode,
  resolveFixturesOrSkip,
  runChunk,
  setupChunkerForTest,
  waitForCompletion,
} from "../../test/encodeHarness.js";
import { drainCapturedSpans, resetCapturedSpans } from "../../test/traceCapture.js";
import type { Resolution } from "../../types.js";
import { killAllJobs } from "../ffmpegPool.js";

// ── Suite-wide setup ────────────────────────────────────────────────────────

const fixtures = (() => {
  // Trigger DB migrations before resolveFixturesOrSkip's upserts hit the schema.
  getDb();
  return resolveFixturesOrSkip();
})();

const SUITE_REASON =
  fixtures === null
    ? "XSTREAM_TEST_MEDIA_DIR not set"
    : fixtures.length === 0
      ? "no fixtures matched on disk"
      : null;

// `describe.skipIf` only takes a boolean, so we precompute it here for clarity.
const skipSuite = SUITE_REASON !== null;

// Run the production HW probe at module-load (before any describe block
// registers) so `it.skipIf(!hwAvailable)` sees the real value at registration
// time, not a default `false` that would skip every HW-gated test.
const hwAvailable: boolean = await (async () => {
  if (skipSuite) return false;
  await setupChunkerForTest();
  return hasHardwareEncode();
})();

describe.skipIf(skipSuite)("chunker encode pipeline", () => {
  afterAll(async () => {
    await killAllJobs(5_000);
  });

  // ── Per-fixture × per-resolution structural tests ────────────────────────

  for (const fixture of fixtures ?? []) {
    describe(fixture.spec.filename, () => {
      for (const resolution of fixture.spec.testResolutions) {
        describe(resolution, () => {
          it(
            "encodes consecutive chunks sequentially",
            async () => {
              for (const startS of fixture.spec.chunkStartTimes) {
                const job = await runChunk(
                  fixture,
                  resolution,
                  startS,
                  startS + fixture.spec.chunkDurationS
                );
                const completed = await waitForCompletion(job, encodeBudgetMs(resolution));
                expectSegmentsOnDisk(completed.id);
              }
            },
            // Total budget for this whole sequential test = sum of per-chunk budgets
            // plus a small overhead.
            totalSequentialBudgetMs(resolution, fixture.spec.chunkStartTimes.length)
          );

          it(
            "encodes chunks 0 and 1 concurrently with non-colliding PTS",
            async () => {
              const [start0, start1] = [
                fixture.spec.chunkStartTimes[0],
                fixture.spec.chunkStartTimes[1] ??
                  fixture.spec.chunkStartTimes[0] + fixture.spec.chunkDurationS,
              ];
              const dur = fixture.spec.chunkDurationS;
              const [job0Start, job1Start] = await Promise.all([
                runChunk(fixture, resolution, start0, start0 + dur),
                runChunk(fixture, resolution, start1, start1 + dur),
              ]);
              const [job0, job1] = await Promise.all([
                waitForCompletion(job0Start, encodeBudgetMs(resolution)),
                waitForCompletion(job1Start, encodeBudgetMs(resolution)),
              ]);
              expectSegmentsOnDisk(job0.id);
              expectSegmentsOnDisk(job1.id);

              const pts0 = await firstPacketPts(job0);
              const pts1 = await firstPacketPts(job1);
              // chunkStartSeconds offset contract: each chunk's first PTS is
              // the source-time start, not 0. Tolerance covers fmp4 segment
              // alignment (a couple of frames at most).
              expect(pts0).toBeGreaterThanOrEqual(start0 - 0.1);
              expect(pts0).toBeLessThan(start0 + 1.0);
              expect(pts1).toBeGreaterThanOrEqual(start1 - 0.1);
              expect(pts1).toBeLessThan(start1 + 1.0);
            },
            // Two concurrent encodes share the GPU/CPU; allow 1.5× per-chunk budget.
            Math.round(encodeBudgetMs(resolution) * 1.5)
          );
        });
      }
    });
  }

  // ── 4K hardware-encoding invariant ───────────────────────────────────────

  describe("4K must use hardware encoding (UX regression guard)", () => {
    for (const fixture of (fixtures ?? []).filter((f) => f.spec.testResolutions.includes("4k"))) {
      it.skipIf(!hwAvailable)(
        `${fixture.spec.filename} — no transcode_fallback_to_software events`,
        async () => {
          // Drain pre-existing spans so we only inspect THIS test's encodes.
          resetCapturedSpans();

          // Distinct chunk times from the structural test so the chunker's
          // in-memory job cache doesn't return cached jobs (which would emit
          // no new transcode.job spans and the assertion below would see 0).
          const dur = fixture.spec.chunkDurationS;
          const start0 = 600;
          const start1 = 600 + dur;
          const [j0, j1] = await Promise.all([
            runChunk(fixture, "4k", start0, start0 + dur),
            runChunk(fixture, "4k", start1, start1 + dur),
          ]);
          await Promise.all([
            waitForCompletion(j0, encodeBudgetMs("4k")),
            waitForCompletion(j1, encodeBudgetMs("4k")),
          ]);

          const transcodeJobSpans = drainCapturedSpans().filter((s) => s.name === "transcode.job");
          expect(transcodeJobSpans.length).toBeGreaterThanOrEqual(2);

          for (const span of transcodeJobSpans) {
            const fallback = span.events.find((e) => e.name === "transcode_fallback_to_software");
            expect(
              fallback,
              `Span ${span.attributes["job.id"]} fell back to software:\n` +
                `  hwaccel: ${String(span.attributes.hwaccel)}\n` +
                `  events: ${span.events.map((e) => e.name).join(", ")}`
            ).toBeUndefined();

            // Initial backend selection must match the production probe.
            expect(String(span.attributes.hwaccel)).not.toBe("software");
          }
        },
        Math.round(encodeBudgetMs("4k") * 1.5)
      );
    }
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Wall-time budget per chunk for a given resolution. Generous to accommodate
 *  ffmpeg cold-start + VAAPI device init on the first encode. */
function encodeBudgetMs(resolution: Resolution): number {
  // 4K HW encode of a 30 s chunk runs in ~10-15 s on the dev box; software at
  // 4K is unbounded (we don't budget for it — it'll trip the 4K HW assertion
  // first). 1080p HW: ~5-8 s. 240p: < 5 s. Allow 2× headroom.
  switch (resolution) {
    case "4k":
      return 90_000;
    case "1080p":
      return 45_000;
    default:
      return 30_000;
  }
}

function totalSequentialBudgetMs(resolution: Resolution, chunkCount: number): number {
  return encodeBudgetMs(resolution) * chunkCount + 5_000;
}

function expectSegmentsOnDisk(jobId: string): void {
  const segmentDir = process.env.SEGMENT_DIR;
  if (!segmentDir) throw new Error("SEGMENT_DIR not set — test preload must run first");
  const jobDir = join(segmentDir, jobId);
  expect(existsSync(join(jobDir, "init.mp4"))).toBe(true);
  const segs = readdirSync(jobDir).filter((n) => n.endsWith(".m4s"));
  expect(segs.length).toBeGreaterThan(0);
}
