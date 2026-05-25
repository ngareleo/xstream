/**
 * Client usage metrics. Thin recorders over OTel instruments so call sites stay
 * readable and the instrument set lives in one place.
 *
 * Cardinality rule: instrument attributes must be low-cardinality (route
 * template, resolution) — never `user.id` or `session.id`. "Unique users" and
 * "usage per day" are answered by querying distinct ids over logs/spans, not by
 * metric dimensions. See docs/architecture/Observability.
 *
 * Note: Seq does not ingest OTLP metrics. In dev these surface via the
 * ConsoleMetricExporter; real metric dashboards come from the Axiom path
 * (`flag.useAxiomExporter`). See `~/telemetry.ts`.
 */

import type { Counter, Histogram, Meter } from "@opentelemetry/api";

import { getClientMeter } from "~/telemetry.js";
import type { Resolution } from "~/types.js";

// Instruments are created lazily on first use — the MeterProvider is registered
// in initTelemetry(), and a no-op meter is returned harmlessly if a recorder
// runs before init (e.g. in tests).
let meter: Meter | null = null;
let pageVisits: Counter | null = null;
let pageLoadTime: Histogram | null = null;
let sessions: Counter | null = null;
let sessionDuration: Histogram | null = null;
let playtime: Histogram | null = null;
let stalls: Counter | null = null;
let stallDuration: Histogram | null = null;

function m(): Meter {
  return (meter ??= getClientMeter("xstream-client"));
}

/** A page was visited. `route` is a path template, e.g. `/player/:videoId`. */
export function recordPageVisit(route: string): void {
  (pageVisits ??= m().createCounter("page.visits", {
    description: "Count of page visits, by route template",
  })).add(1, { route });
}

/** Time to render a page. `kind` is "initial" (cold load) or "route" (transition). */
export function recordPageLoadTime(route: string, kind: "initial" | "route", ms: number): void {
  (pageLoadTime ??= m().createHistogram("page.load_time_ms", {
    description: "Page load time in milliseconds",
    unit: "ms",
  })).record(ms, { route, kind });
}

/** A new user session began. */
export function recordSessionStarted(): void {
  (sessions ??= m().createCounter("user.sessions", {
    description: "Count of user sessions started",
  })).add(1);
}

/** A user session ended; `ms` is its wall-clock duration. */
export function recordSessionDuration(ms: number): void {
  (sessionDuration ??= m().createHistogram("user.session.duration_ms", {
    description: "User session duration in milliseconds",
    unit: "ms",
  })).record(ms);
}

/** Total time a video actually played in one playback session. */
export function recordPlaytime(resolution: Resolution, ms: number): void {
  (playtime ??= m().createHistogram("playback.playtime_ms", {
    description: "Active playback time per session in milliseconds",
    unit: "ms",
  })).record(ms, { resolution });
}

/** A user-visible playback stall resolved; `durationMs` is how long it lasted. */
export function recordStall(resolution: Resolution, durationMs: number): void {
  (stalls ??= m().createCounter("playback.stalls", {
    description: "Count of user-visible playback stalls",
  })).add(1, { resolution });
  (stallDuration ??= m().createHistogram("playback.stall.duration_ms", {
    description: "Playback stall duration in milliseconds",
    unit: "ms",
  })).record(durationMs, { resolution });
}
