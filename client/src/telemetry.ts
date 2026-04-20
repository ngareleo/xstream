/**
 * OpenTelemetry bootstrap for the xstream browser client.
 *
 * Call initTelemetry() as the very first statement in main.tsx, before
 * ReactDOM.createRoot(), so that fetch instrumentation patches window.fetch
 * before any Relay or StreamingService calls are made.
 *
 * In development, OTLP requests are proxied through Rsbuild (/ingest/otlp →
 * http://localhost:5341) to avoid CORS issues. The endpoint and headers are
 * baked into the bundle at build time via Rsbuild PUBLIC_ env vars.
 *
 * Switching to a production backend (Axiom, Grafana Cloud, etc.) requires
 * only changing PUBLIC_OTEL_ENDPOINT and PUBLIC_OTEL_HEADERS in the build
 * environment — no code changes needed.
 */

import { propagation, trace, type Tracer } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { LongTaskInstrumentation } from "@opentelemetry/instrumentation-long-task";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";

// ── Configuration ──────────────────────────────────────────────────────────────

/** Parse "Key1=Val1,Key2=Val2" into a plain object, ignoring malformed pairs. */
function parseHeadersEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(",").flatMap((pair) => {
      const eqIdx = pair.indexOf("=");
      if (eqIdx < 1) return [];
      return [[pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim()]] as [string, string][];
    })
  );
}

// PUBLIC_ prefix is required for Rsbuild to expose env vars to the browser bundle.
// Default to the Rsbuild dev proxy path so no extra config is needed in dev.
const endpoint = (import.meta.env["PUBLIC_OTEL_ENDPOINT"] as string | undefined) ?? "/ingest/otlp";
const headers = parseHeadersEnv(import.meta.env["PUBLIC_OTEL_HEADERS"] as string | undefined);

// ── Providers ──────────────────────────────────────────────────────────────────

let loggerProvider: LoggerProvider | null = null;
let initialized = false;

/**
 * Initialise the OTel SDK. Must be called once, before any fetch or Relay call.
 * Idempotent — safe to call multiple times but only initialises once.
 */
export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  const resource = resourceFromAttributes({
    "service.name": "xstream-client",
    "deployment.environment": import.meta.env.MODE ?? "development",
  });

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers })),
    ],
  });

  // Register the provider and W3C propagator globally.
  // FetchInstrumentation will inject traceparent/tracestate headers into every
  // fetch call (Relay GraphQL queries + StreamingService /stream/ requests),
  // linking client spans to server-side child spans under the same traceId.
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  // Ensure the global propagator is set even if register() doesn't cover it.
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
      // Mirror every log record to the browser console in dev so developers get
      // immediate visibility without opening Seq.
      ...(import.meta.env.DEV
        ? [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())]
        : []),
    ],
  });

  // Patch window.fetch so all requests automatically carry traceparent headers.
  new FetchInstrumentation({
    propagateTraceHeaderCorsUrls: [/.*/],
  }).enable();

  // Detect long tasks (>50ms blocking the main thread) as separate spans.
  // Useful for correlating playback stalls with JS jank.
  new LongTaskInstrumentation({}).enable();
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns an OTel Tracer for the given component.
 * Must be called after initTelemetry().
 */
export function getClientTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/** Structured log record with a consistent component label. */
export interface ClientLog {
  info(message: string, attributes?: Record<string, string | number | boolean>): void;
  warn(message: string, attributes?: Record<string, string | number | boolean>): void;
  error(message: string, attributes?: Record<string, string | number | boolean>): void;
}

/**
 * Returns a structured logger for the given component.
 * Log records are forwarded to the OTLP backend alongside StreamingLogger
 * (which feeds the in-app overlay). Both coexist — OTel provides persistent
 * searchable storage; StreamingLogger provides immediate in-UI visibility.
 */
export function getClientLogger(component: string): ClientLog {
  const logger = loggerProvider?.getLogger(component);
  return {
    info(message, attributes): void {
      logger?.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: message,
        attributes: { component, ...attributes },
      });
    },
    warn(message, attributes): void {
      logger?.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: message,
        attributes: { component, ...attributes },
      });
    },
    error(message, attributes): void {
      logger?.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: message,
        attributes: { component, ...attributes },
      });
    },
  };
}
