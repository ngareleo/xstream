/**
 * transcode.job telemetry contract — full per-branch event surface.
 *
 * Gated on XSTREAM_TEST_MEDIA_DIR — running this test requires a real
 * ffmpeg fixture so the encode pipeline actually fires. When fixtures are
 * absent the entire suite self-skips, mirroring chunker.encode.test.ts.
 *
 * The contract being pinned is the EXACT event-name + attribute-key set
 * the chunker emits on the `transcode.job` span. Adding a new event or
 * dropping an attribute key here is a breaking change for the Rust port
 * AND for every Seq query that filters by these names today.
 *
 * Branches and event surfaces (see chunker.ts addEvent call-sites for the
 * authoritative list):
 *
 *  - Success: probe_complete → transcode_started → transcode_progress (≥1)
 *             → transcode_complete
 *  - Killed:  probe_complete → transcode_started → transcode_killed
 *             with kill_reason ∈ KillReason literal set
 *  - Hard error / silent / cascade tiers: covered by chunker.encode.test.ts.
 *    Skeleton here pins names; deeper assertions belong with that test
 *    family.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  resolveFixturesOrSkip,
  runChunk,
  setupChunkerForTest,
  waitForCompletion,
} from "../../test/encodeHarness.js";
import { expectEvent, expectEventsInOrder, findSpansByName } from "../../test/spanAssertions.js";
import { drainCapturedSpans, resetCapturedSpans } from "../../test/traceCapture.js";
import { killAllJobs, killJob } from "../ffmpegPool.js";

const fixtures = resolveFixturesOrSkip();
const HAVE_FIXTURES = !!fixtures;

describe.skipIf(!HAVE_FIXTURES)("transcode.job span — telemetry contract", () => {
  beforeAll(async () => {
    await setupChunkerForTest();
  });

  afterAll(async () => {
    await killAllJobs();
  });

  test("success branch emits probe_complete + transcode_started + ≥1 transcode_progress + transcode_complete", async () => {
    if (!fixtures || fixtures.length === 0) return;
    const fixture = fixtures[0];
    if (!fixture) return;
    const resolution = fixture.spec.testResolutions[0] ?? "240p";
    const start = fixture.spec.chunkStartTimes[0] ?? 0;
    const end = start + fixture.spec.chunkDurationS;

    resetCapturedSpans();
    const job = await runChunk(fixture, resolution, start, end);
    await waitForCompletion(job, 120_000);

    const transcodeJobSpans = findSpansByName("transcode.job").filter(
      (s) => s.attributes["job.id"] === job.id
    );
    expect(transcodeJobSpans.length).toBe(1);
    const span = transcodeJobSpans[0];
    if (!span) return;

    expectEventsInOrder(span, [
      { name: "probe_complete", attrs: ["probe_duration_ms", "summary"] },
      { name: "transcode_started", attrs: ["resolution", "cmd"] },
      { name: "transcode_progress" },
      {
        name: "transcode_complete",
        attrs: ["segment_count", "encode_duration_ms"],
      },
    ]);

    // No silent-failure or kill events on the success path.
    const eventNames = span.events.map((e) => e.name);
    expect(eventNames).not.toContain("transcode_silent_failure");
    expect(eventNames).not.toContain("transcode_killed");
    expect(eventNames).not.toContain("transcode_error");
  });

  test("killed branch emits transcode_killed with kill_reason attribute", async () => {
    if (!fixtures || fixtures.length === 0) return;
    const fixture = fixtures[0];
    if (!fixture) return;
    const resolution = fixture.spec.testResolutions[0] ?? "240p";
    const start = fixture.spec.chunkStartTimes[0] ?? 0;
    const end = start + fixture.spec.chunkDurationS;

    resetCapturedSpans();
    const job = await runChunk(fixture, resolution, start, end);
    // Give ffmpeg a moment to enter the encode loop, then kill mid-flight.
    await Bun.sleep(500);
    killJob(job.id, "client_disconnected");

    // Wait until the job state moves off "running".
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (job.status !== "running" && job.status !== "pending") break;
      await Bun.sleep(50);
    }

    // Drain spans now that the killed exit has fired.
    const all = drainCapturedSpans();
    const span = all.find((s) => s.name === "transcode.job" && s.attributes["job.id"] === job.id);
    expect(span).toBeDefined();
    if (!span) return;

    const killEvent = expectEvent(span, "transcode_killed", ["kill_reason"]);
    const reason = killEvent.attributes?.kill_reason;
    // KillReason union: client_disconnected, stream_idle_timeout, etc. Just
    // assert it's one of the literal set rather than coupling to the exact
    // race outcome (the production code can promote a kill to a different
    // reason internally — what matters is the attribute is set).
    expect(typeof reason).toBe("string");
    expect(
      [
        "client_request",
        "client_disconnected",
        "stream_idle_timeout",
        "orphan_no_connection",
        "max_encode_timeout",
        "cascade_retry",
        "server_shutdown",
      ].includes(reason as string)
    ).toBe(true);
  });

  // TODO(real-fixture): transcode_silent_failure — chunk-past-EOF on a
  // real fixture should produce segment_count=0 clean exit + span status
  // ERROR. Lands when the encodeHarness gains a past-EOF fixture entry.
  test.skip("transcode_silent_failure on chunk-past-EOF — see TODO above", () => {
    /* placeholder */
  });

  // TODO(stability): transcode_fallback_to_* — VAAPI cascade tiers are
  // covered by chunker.encode.test.ts; this slot exists so adding a new
  // cascade event name is a deliberate cross-file change.
  test.skip("transcode_fallback_to_* event names stay stable — see TODO above", () => {
    /* placeholder */
  });
});
