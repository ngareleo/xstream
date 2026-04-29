/**
 * Span-assertion helpers for telemetry-contract tests.
 *
 * The contract these helpers enforce: span/event NAMES and attribute KEYS
 * are part of the system's public observability surface. The Rust port has
 * to match them so existing Seq queries and dashboards keep working. Tests
 * use these helpers to lock down "this event fires here, with these
 * attribute keys", without coupling to non-deterministic numeric values.
 *
 * Usage examples in `__tests__/*.test.ts` files. All assertions go through
 * `drainCapturedSpans()` from `traceCapture.ts` — never through log strings.
 */
import { type ReadableSpan, type TimedEvent } from "@opentelemetry/sdk-trace-base";

import { drainCapturedSpans } from "./traceCapture.js";

export interface EventSummary {
  name: string;
  attributeKeys: string[];
}

/**
 * Find the single span whose name matches. Throws if zero or more than one
 * match — both indicate a contract drift the test should surface, not paper
 * over. For "is this span the parent of that one" assertions, see
 * `findSpansByName` and check parent IDs explicitly.
 */
export function findSpan(name: string): ReadableSpan {
  const all = drainCapturedSpans();
  const matches = all.filter((s) => s.name === name);
  if (matches.length === 0) {
    const known = Array.from(new Set(all.map((s) => s.name))).sort();
    throw new Error(
      `findSpan("${name}") found 0 spans. Known span names in this drain: [${known.join(", ")}]`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `findSpan("${name}") found ${matches.length} spans — use findSpansByName when multiple are expected`
    );
  }
  const [first] = matches;
  if (!first) {
    throw new Error(`findSpan("${name}") matched but array empty — unreachable`);
  }
  return first;
}

export function findSpansByName(name: string): ReadableSpan[] {
  return drainCapturedSpans().filter((s) => s.name === name);
}

/** Summarise events on a span as `{name, attributeKeys}` — the deterministic fingerprint of the event shape. */
export function eventsOf(span: ReadableSpan): EventSummary[] {
  return span.events.map((e: TimedEvent) => ({
    name: e.name,
    attributeKeys: Object.keys(e.attributes ?? {}).sort(),
  }));
}

/**
 * Assert that `span` has exactly one event named `name`, and that its
 * attribute set contains every key in `expectedAttrKeys` (extra keys are
 * tolerated — the test asserts a minimum contract, so adding new attributes
 * doesn't break older tests).
 */
export function expectEvent(
  span: ReadableSpan,
  name: string,
  expectedAttrKeys: readonly string[] = []
): TimedEvent {
  const matches = span.events.filter((e) => e.name === name);
  if (matches.length === 0) {
    const seen = span.events.map((e) => e.name);
    throw new Error(
      `Expected event "${name}" on span "${span.name}", but only saw [${seen.join(", ")}]`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one "${name}" event on span "${span.name}", got ${matches.length}`
    );
  }
  const [event] = matches;
  if (!event) {
    throw new Error(`Event "${name}" matched but array empty — unreachable`);
  }
  const actualKeys = new Set(Object.keys(event.attributes ?? {}));
  const missing = expectedAttrKeys.filter((k) => !actualKeys.has(k));
  if (missing.length > 0) {
    throw new Error(
      `Event "${name}" on span "${span.name}" is missing attribute keys: [${missing.join(", ")}]. ` +
        `Got: [${Array.from(actualKeys).sort().join(", ")}]`
    );
  }
  return event;
}

export interface EventExpectation {
  name: string;
  attrs?: readonly string[];
}

/**
 * Assert that `span` has every named event from `expected`, in the given
 * order. Other un-named events in between are allowed (so the test pins the
 * contract without breaking when implementation adds an unrelated event).
 *
 * Pass `{ strict: true }` for an "exact and only these" sequence — useful
 * when locking the full event surface for a happy-path assertion.
 */
export function expectEventsInOrder(
  span: ReadableSpan,
  expected: readonly EventExpectation[],
  opts: { strict?: boolean } = {}
): void {
  const actual = span.events;
  if (opts.strict && actual.length !== expected.length) {
    throw new Error(
      `Strict event-order mismatch on span "${span.name}": expected ${expected.length} events, got ${actual.length}: ` +
        `[${actual.map((e) => e.name).join(", ")}]`
    );
  }
  let cursor = 0;
  for (const exp of expected) {
    let matched: TimedEvent | undefined;
    while (cursor < actual.length) {
      const candidate = actual[cursor];
      if (!candidate) break;
      if (candidate.name === exp.name) {
        matched = candidate;
        break;
      }
      if (opts.strict) {
        throw new Error(
          `Strict event-order mismatch on span "${span.name}": expected "${exp.name}" at position ${cursor}, got "${candidate.name}"`
        );
      }
      cursor++;
    }
    if (!matched) {
      throw new Error(
        `Event "${exp.name}" not found in remaining events on span "${span.name}". ` +
          `Full event list: [${actual.map((e) => e.name).join(", ")}]`
      );
    }
    if (exp.attrs && exp.attrs.length > 0) {
      const actualAttrs = new Set(Object.keys(matched.attributes ?? {}));
      const missing = exp.attrs.filter((k) => !actualAttrs.has(k));
      if (missing.length > 0) {
        throw new Error(
          `Event "${exp.name}" on span "${span.name}" missing attribute keys: [${missing.join(", ")}]`
        );
      }
    }
    cursor++;
  }
}

/** Assert that `span` has the given attribute key set (extras tolerated). */
export function expectSpanAttrs(span: ReadableSpan, expectedKeys: readonly string[]): void {
  const actualKeys = new Set(Object.keys(span.attributes ?? {}));
  const missing = expectedKeys.filter((k) => !actualKeys.has(k));
  if (missing.length > 0) {
    throw new Error(
      `Span "${span.name}" missing attribute keys: [${missing.join(", ")}]. ` +
        `Got: [${Array.from(actualKeys).sort().join(", ")}]`
    );
  }
}
