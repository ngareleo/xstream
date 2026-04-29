/**
 * Fake-clock helpers for timer-driven tests.
 *
 * Two modes — pick the one that matches what the code under test does
 * during a wait. Both keep `Date.now()` and `setTimeout` advancing on the
 * same view of elapsed time (no drift), so the production code's sense of
 * "how long since X" is internally consistent (see
 * `feedback_clock_no_drift.md`).
 *
 *   - `installClock()` — full sinon fake-timers. Mocks `Date`,
 *     `setTimeout`, `setInterval`, and monkey-patches `Bun.sleep` to use
 *     the faked `setTimeout`. Use when the wait loop is purely timer-bound
 *     (no real I/O between sleeps). `tickAsync(ms)` advances both clocks.
 *
 *     Limitation: sinon's `tickAsync` cannot drain libuv I/O. Any wait
 *     loop that does `await fs/promises.access()` (or other real-I/O
 *     awaits) between `Bun.sleep` calls deadlocks under this mode —
 *     tickAsync advances time but the I/O completion never lands.
 *     Use `installDateOnlyClock()` for those.
 *
 *   - `installDateOnlyClock()` — fakes `Date` only; `setTimeout` and
 *     `Bun.sleep` continue to fire on the real wall clock. Use when the
 *     wait loop checks `Date.now() - lastSentAt > N` and does real I/O
 *     between sleeps. Production code's view of elapsed time still
 *     advances when the test calls `advance(ms)`; the test then waits
 *     one or two real `Bun.sleep` cycles for the loop to observe the
 *     jump and exit.
 *
 *     This is NOT drift — `Date` is the only thing the production code
 *     compares against; setTimeout's real cadence is a scheduling detail
 *     not observable by the code under test. The single tick of real
 *     wait we pay (~100 ms) is the cost of integration with real-fs
 *     behavior the chunker relies on.
 */
import FakeTimers from "@sinonjs/fake-timers";

// `@sinonjs/fake-timers` ships its own bundled types alongside the
// DefinitelyTyped @types/sinonjs__fake-timers package; the bundled types
// take precedence and don't export `InstalledClock`. Derive the install-
// return type so we work regardless of which type-source resolves.
type SinonInstalledClock = ReturnType<typeof FakeTimers.install>;

export interface InstalledClock {
  /** Advance both `Date.now()` and any pending `setTimeout`/`setInterval`/`Bun.sleep` callbacks. */
  tick(ms: number): void;
  /** Async variant — yields between scheduler ticks so awaited callbacks can resolve before the next slice. */
  tickAsync(ms: number): Promise<void>;
  /** Restore the real clock + the original `Bun.sleep`. Idempotent. */
  uninstall(): void;
  /** Underlying sinon clock, for tests that need its full API (e.g. `runAllAsync`). */
  raw: SinonInstalledClock;
}

export interface InstallClockOpts {
  now?: number | Date;
}

export function installClock(opts: InstallClockOpts = {}): InstalledClock {
  const realSleep = Bun.sleep;
  const sinonClock = FakeTimers.install({
    now: opts.now ?? 0,
    // Fake the clock-time primitives only. setImmediate / queueMicrotask are
    // scheduling primitives, NOT wall-clock primitives; faking them blocks
    // libuv I/O completion (e.g. fs/promises `access()`) during tickAsync,
    // so any wait loop that does real I/O between sleeps deadlocks. Real
    // semantics for those keeps the JS event loop draining I/O while the
    // clock advances.
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  // Route Bun.sleep through setTimeout so sinon can drive it.
  (Bun as { sleep: (ms: number) => Promise<void> }).sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  let uninstalled = false;
  return {
    tick(ms): void {
      sinonClock.tick(ms);
    },
    async tickAsync(ms): Promise<void> {
      await sinonClock.tickAsync(ms);
    },
    uninstall(): void {
      if (uninstalled) return;
      uninstalled = true;
      sinonClock.uninstall();
      (Bun as { sleep: (ms: number) => Promise<void> }).sleep = realSleep;
    },
    raw: sinonClock,
  };
}

export interface DateOnlyClock {
  /** Advance the faked `Date.now()` view by `ms`. setTimeout / Bun.sleep keep real cadence. */
  advance(ms: number): void;
  /** Set the faked `Date.now()` view to a specific epoch. */
  setNow(epochMs: number): void;
  /** Restore the real Date. Idempotent. */
  uninstall(): void;
}

export function installDateOnlyClock(opts: InstallClockOpts = {}): DateOnlyClock {
  const sinonClock = FakeTimers.install({
    now: opts.now ?? Date.now(),
    toFake: ["Date"],
  });

  let uninstalled = false;
  return {
    advance(ms): void {
      sinonClock.tick(ms);
    },
    setNow(epochMs): void {
      sinonClock.setSystemTime(epochMs);
    },
    uninstall(): void {
      if (uninstalled) return;
      uninstalled = true;
      sinonClock.uninstall();
    },
  };
}
