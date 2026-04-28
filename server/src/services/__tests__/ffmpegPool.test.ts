/**
 * Unit tests for the ffmpegPool — drive a fake FfmpegCommand event emitter
 * through the lifecycle scenarios that govern the concurrency cap and the
 * onKilled-vs-onError dispatch invariant.
 *
 * The bug this pool was extracted to fix: SIGTERM'd jobs continued to count
 * toward the cap until ffmpeg actually exited (10–30 s). The trace
 * `1ac6637ead86d6b65df08637cbabfacd` showed three zombie jobs starving out
 * a seek-burst. The pool counts dying jobs separately, so a kill releases
 * the cap slot at SIGTERM time. These tests pin that behavior.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "events";
import type { FfmpegCommand } from "fluent-ffmpeg";

import {
  getCapLimit,
  hasInflightOrLive,
  killAllJobs,
  killJob,
  type ProcessHooks,
  snapshotCap,
  spawnProcess,
  tryReserveSlot,
} from "../ffmpegPool.js";

const CAP_LIMIT = getCapLimit();

/** Minimal stand-in for fluent-ffmpeg's FfmpegCommand. The pool only uses
 * .on/.once for events, .kill(signal) for SIGTERM/SIGKILL, and .run() to
 * launch. EventEmitter satisfies the event surface; we add kill/run. */
class FakeFfmpegCommand extends EventEmitter {
  signals: string[] = [];
  ranAt: number | null = null;
  kill(signal: string): void {
    this.signals.push(signal);
  }
  run(): void {
    this.ranAt = Date.now();
  }
}

function newFake(): FfmpegCommand {
  return new FakeFfmpegCommand() as unknown as FfmpegCommand;
}

function noopHooks(overrides: Partial<ProcessHooks> = {}): ProcessHooks {
  return {
    onComplete: mock(() => undefined),
    onKilled: mock(() => undefined),
    onError: mock(() => undefined),
    ...overrides,
  };
}

afterEach(async () => {
  // Defensive cleanup so a failing test doesn't poison the next one.
  await killAllJobs(100);
  // Drain any leaked reservations from a test that errored before consuming.
  // (No public API for this — but in practice every test below cleans up
  //  by completing/erroring its fakes, which removes them from the pool.)
});

describe("ffmpegPool — cap accounting", () => {
  it("tryReserveSlot returns up to CAP_LIMIT reservations and then null", () => {
    const reservations = [];
    for (let i = 0; i < CAP_LIMIT; i++) {
      const r = tryReserveSlot(`cap-test-${i}`);
      expect(r).not.toBeNull();
      if (r) reservations.push(r);
    }
    expect(tryReserveSlot("cap-test-overflow")).toBeNull();
    // Release them so the suite stays clean.
    for (const r of reservations) r.release();
  });

  it("release() frees the slot synchronously", () => {
    const r1 = tryReserveSlot("release-1");
    const r2 = tryReserveSlot("release-2");
    const r3 = tryReserveSlot("release-3");
    expect(tryReserveSlot("release-blocked")).toBeNull();
    r1?.release();
    const r4 = tryReserveSlot("release-after");
    expect(r4).not.toBeNull();
    r2?.release();
    r3?.release();
    r4?.release();
  });

  it("dying jobs (post-killJob, pre-exit) do NOT count toward the cap", () => {
    // Reserve + spawn 3 jobs.
    const fakes = [newFake(), newFake(), newFake()];
    const ids = ["dying-A", "dying-B", "dying-C"];
    for (let i = 0; i < 3; i++) {
      const r = tryReserveSlot(ids[i]);
      expect(r).not.toBeNull();
      if (r) spawnProcess(r, fakes[i], noopHooks());
    }
    // Cap is full.
    expect(tryReserveSlot("would-block")).toBeNull();

    // Kill one. The fake's ffmpeg has not exited yet — its kill() was called
    // (SIGTERM dispatched) but the process is still "alive" from the OS's view.
    // This is exactly the production trace pattern: SIGTERM in flight, exit pending.
    killJob("dying-A", "client_disconnected");
    expect((fakes[0] as unknown as FakeFfmpegCommand).signals).toContain("SIGTERM");

    // The cap MUST have a free slot now even though dying-A is still in liveCommands.
    // This is the bug fix this pool was built for.
    const r = tryReserveSlot("can-reserve-during-zombie");
    expect(r).not.toBeNull();
    r?.release();

    // Cleanup: emit end on the dying fake to clear it; emit end on the others.
    (fakes[0] as unknown as FakeFfmpegCommand).emit("end");
    (fakes[1] as unknown as FakeFfmpegCommand).emit("end");
    (fakes[2] as unknown as FakeFfmpegCommand).emit("end");
  });

  it("snapshotCap reports liveCount, inflightCount, dyingCount correctly", () => {
    const fake = newFake();
    const r1 = tryReserveSlot("snap-live");
    expect(r1).not.toBeNull();
    if (r1) spawnProcess(r1, fake, noopHooks());
    const r2 = tryReserveSlot("snap-inflight");
    expect(r2).not.toBeNull();

    let snap = snapshotCap();
    expect(snap.limit).toBe(CAP_LIMIT);
    expect(snap.liveJobIds).toContain("snap-live");
    expect(snap.inflightJobIds).toContain("snap-inflight");
    expect(snap.dyingJobIds).toEqual([]);

    killJob("snap-live", "client_disconnected");
    snap = snapshotCap();
    expect(snap.dyingJobIds).toContain("snap-live");
    // Live count excludes dying.
    expect(snap.liveJobIds).not.toContain("snap-live");

    // Cleanup.
    (fake as unknown as FakeFfmpegCommand).emit("end");
    r2?.release();
  });

  it("hasInflightOrLive sees both reservations and live jobs", () => {
    const r = tryReserveSlot("inflight-id");
    expect(hasInflightOrLive("inflight-id")).toBe(true);
    expect(hasInflightOrLive("nope")).toBe(false);
    r?.release();
    expect(hasInflightOrLive("inflight-id")).toBe(false);

    const fake = newFake();
    const r2 = tryReserveSlot("live-id");
    expect(r2).not.toBeNull();
    if (r2) spawnProcess(r2, fake, noopHooks());
    expect(hasInflightOrLive("live-id")).toBe(true);
    (fake as unknown as FakeFfmpegCommand).emit("end");
    expect(hasInflightOrLive("live-id")).toBe(false);
  });
});

describe("ffmpegPool — exit dispatch", () => {
  it("natural end → onComplete fires (not onKilled, not onError)", () => {
    const fake = newFake();
    const hooks = noopHooks();
    const r = tryReserveSlot("natural-end");
    expect(r).not.toBeNull();
    if (r) spawnProcess(r, fake, hooks);

    (fake as unknown as FakeFfmpegCommand).emit("end");

    expect(hooks.onComplete).toHaveBeenCalledTimes(1);
    expect(hooks.onKilled).not.toHaveBeenCalled();
    expect(hooks.onError).not.toHaveBeenCalled();
  });

  it("natural error → onError fires (not onKilled, not onComplete)", () => {
    const fake = newFake();
    const hooks = noopHooks();
    const r = tryReserveSlot("natural-error");
    expect(r).not.toBeNull();
    if (r) spawnProcess(r, fake, hooks);

    const err = new Error("ffmpeg exited with code 218");
    (fake as unknown as FakeFfmpegCommand).emit("error", err);

    expect(hooks.onError).toHaveBeenCalledTimes(1);
    expect(hooks.onError).toHaveBeenCalledWith(err);
    expect(hooks.onComplete).not.toHaveBeenCalled();
    expect(hooks.onKilled).not.toHaveBeenCalled();
  });

  it("kill → end → onKilled fires (NOT onComplete; the kill-on-end gotcha)", () => {
    // ffmpeg sometimes exits cleanly on SIGTERM via .on("end") rather than
    // .on("error"). The pool must still classify this as a kill, not a
    // completion — otherwise the chunker would mark the job complete with
    // a truncated segment set.
    const fake = newFake();
    const hooks = noopHooks();
    const r = tryReserveSlot("kill-end");
    expect(r).not.toBeNull();
    if (r) spawnProcess(r, fake, hooks);

    killJob("kill-end", "client_disconnected");
    (fake as unknown as FakeFfmpegCommand).emit("end");

    expect(hooks.onKilled).toHaveBeenCalledTimes(1);
    expect(hooks.onKilled).toHaveBeenCalledWith("client_disconnected");
    expect(hooks.onComplete).not.toHaveBeenCalled();
    expect(hooks.onError).not.toHaveBeenCalled();
  });

  it("kill → error → onKilled fires (NOT onError; the cascade-after-kill bug fix)", () => {
    // Bug Category #2 from the plan: a SIGTERM mid-VAAPI exit fires .on("error"),
    // and the OLD code cleared killedJobs and cascaded to software for a user
    // who already disconnected. Pool must dispatch onKilled in this path so
    // the chunker's onError cascade is unreachable for deliberate kills.
    const fake = newFake();
    const hooks = noopHooks();
    const r = tryReserveSlot("kill-error");
    expect(r).not.toBeNull();
    if (r) spawnProcess(r, fake, hooks);

    killJob("kill-error", "max_encode_timeout");
    (fake as unknown as FakeFfmpegCommand).emit("error", new Error("ffmpeg exited with code 255"));

    expect(hooks.onKilled).toHaveBeenCalledTimes(1);
    expect(hooks.onKilled).toHaveBeenCalledWith("max_encode_timeout");
    expect(hooks.onError).not.toHaveBeenCalled();
    expect(hooks.onComplete).not.toHaveBeenCalled();
  });
});

describe("ffmpegPool — kill semantics", () => {
  it("killJob is idempotent — second call on the same id is a no-op", () => {
    const fake = newFake();
    const r = tryReserveSlot("idem-kill");
    expect(r).not.toBeNull();
    if (r) spawnProcess(r, fake, noopHooks());

    killJob("idem-kill", "client_disconnected");
    killJob("idem-kill", "client_disconnected");
    killJob("idem-kill", "max_encode_timeout"); // even with a different reason

    const fakeCmd = fake as unknown as FakeFfmpegCommand;
    // Only one SIGTERM should have been dispatched.
    expect(fakeCmd.signals.filter((s) => s === "SIGTERM")).toHaveLength(1);

    fakeCmd.emit("end");
  });

  it("killJob on an unknown id is a no-op", () => {
    // Should not throw.
    killJob("never-existed", "client_disconnected");
  });

  it("killJob on a not-yet-spawned reservation releases it", () => {
    const r = tryReserveSlot("res-kill");
    expect(r).not.toBeNull();
    expect(hasInflightOrLive("res-kill")).toBe(true);
    killJob("res-kill", "client_disconnected");
    expect(hasInflightOrLive("res-kill")).toBe(false);
  });

  it("killAllJobs SIGTERMs every live job and resolves when they exit", async () => {
    const fakes = [newFake(), newFake(), newFake()];
    const hookList = fakes.map(() => noopHooks());
    const ids = ["sweep-A", "sweep-B", "sweep-C"];
    for (let i = 0; i < 3; i++) {
      const r = tryReserveSlot(ids[i]);
      expect(r).not.toBeNull();
      if (r) spawnProcess(r, fakes[i], hookList[i]);
    }

    // Schedule the fakes to emit "end" on the next microtask, so killAllJobs's
    // await actually has something to wait for.
    queueMicrotask(() => {
      for (const f of fakes) (f as unknown as FakeFfmpegCommand).emit("end");
    });

    await killAllJobs(1000);

    for (let i = 0; i < 3; i++) {
      expect((fakes[i] as unknown as FakeFfmpegCommand).signals).toContain("SIGTERM");
      expect(hookList[i].onKilled).toHaveBeenCalledTimes(1);
      expect(hookList[i].onKilled).toHaveBeenCalledWith("server_shutdown");
    }
  });
});
