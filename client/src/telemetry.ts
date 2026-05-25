/** OpenTelemetry bootstrap for the xstream browser client. See docs/architecture/Observability/01-Logging-Policy.md. */

import { type Meter, metrics, propagation, trace, type Tracer } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { LongTaskInstrumentation } from "@opentelemetry/instrumentation-long-task";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";

import { env } from "~/config/env.js";
import { getFlag } from "~/config/featureFlags.js";
import { FLAG_KEYS } from "~/config/flagRegistry.js";
import { getSessionContext } from "~/services/playbackSession.js";
import { getUserContext } from "~/services/userContext.js";
import { getCurrentSessionId } from "~/services/userSession.js";

const defaultEndpoint = env.otelEndpoint;
const defaultHeaders = env.otelHeaders;
// Dev posts to same-origin /relay/axiom to bypass CORS. See
// docs/architecture/Deployment/04-Axiom-Production-Backend.md § "Dev flow".
const axiomEndpoint = IS_DEV_BUILD ? "/relay/axiom" : env.otelAxiomEndpoint;
const axiomHeaders = env.otelAxiomHeaders;

let loggerProvider: LoggerProvider | null = null;
let initialized = false;

/**
 * Stamps `session.id` onto every span at start time. The user session id changes
 * over the app's lifetime, so it can't live on the (frozen) resource — a span
 * processor reads it per-span instead. See `~/services/userSession.ts`.
 */
class SessionAttributeSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    const sessionId = getCurrentSessionId();
    if (sessionId) span.setAttribute("session.id", sessionId);
  }
  onEnd(_span: ReadableSpan): void {}
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Initialise the OTel SDK. Must be called once, before any fetch or Relay call.
 * Idempotent — safe to call multiple times but only initialises once.
 */
export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  // Dead-code-eliminated in prod builds via IS_DEV_BUILD; prod uses baked PUBLIC_OTEL_* values.
  const useAxiom = IS_DEV_BUILD && getFlag(FLAG_KEYS.useAxiomExporter, false);
  const endpoint = useAxiom && axiomEndpoint ? axiomEndpoint : defaultEndpoint;
  const headers = useAxiom && axiomEndpoint ? axiomHeaders : defaultHeaders;
  const deploymentEnvironment = IS_DEV_BUILD ? "development" : "production";

  const resource = resourceFromAttributes({
    "service.name": "xstream-client",
    "deployment.environment": deploymentEnvironment,
  });

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [
      // Stamps session.id before the batch processor exports the span.
      new SessionAttributeSpanProcessor(),
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers })),
    ],
  });

  // FetchInstrumentation injects traceparent/tracestate into all fetch calls.
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  // Usage metrics (page visits, sessions, playtimes, stalls). Seq doesn't ingest
  // OTLP metrics, so dev also mirrors to the console; real dashboards come from
  // the Axiom path. See docs/architecture/Observability.
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers }),
        exportIntervalMillis: 60_000,
      }),
      ...(import.meta.env.DEV
        ? [
            new PeriodicExportingMetricReader({
              exporter: new ConsoleMetricExporter(),
              exportIntervalMillis: 60_000,
            }),
          ]
        : []),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
      // In dev, mirror logs to browser console for immediate visibility.
      ...(import.meta.env.DEV
        ? [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())]
        : []),
    ],
  });

  // Patch window.fetch to carry traceparent headers.
  new FetchInstrumentation({
    propagateTraceHeaderCorsUrls: [/.*/],
  }).enable();

  // Detect long tasks (>50ms) to correlate playback stalls with JS jank.
  new LongTaskInstrumentation({}).enable();
}

/**
 * Returns an OTel Tracer for the given component.
 * Must be called after initTelemetry().
 */
export function getClientTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/**
 * Returns an OTel Meter for the given component. Returns a no-op meter until
 * initTelemetry() registers the MeterProvider. See `~/services/clientMetrics.ts`.
 */
export function getClientMeter(name: string): Meter {
  return metrics.getMeter(name);
}

/** Structured log record with a consistent component label. */
export interface ClientLog {
  info(message: string, attributes?: Record<string, string | number | boolean>): void;
  warn(message: string, attributes?: Record<string, string | number | boolean>): void;
  error(message: string, attributes?: Record<string, string | number | boolean>): void;
}

/** `user.id` read at emit time. Empty when signed-out. */
function userAttrs(): Record<string, string> {
  const userId = getUserContext();
  return userId ? { "user.id": userId } : {};
}

/** `session.id` read at emit time. Empty before the first session is minted. */
function sessionAttrs(): Record<string, string> {
  const sessionId = getCurrentSessionId();
  return sessionId ? { "session.id": sessionId } : {};
}

/** Returns a structured logger for the given component. Log records are forwarded to the OTLP backend. */
export function getClientLogger(component: string): ClientLog {
  // Resolve the logger at emit time, not here: modules imported before
  // initTelemetry() (e.g. via the router) would otherwise capture a null
  // provider and silently no-op for the app's lifetime. (Tracers/meters already
  // resolve lazily via the global API; this keeps loggers consistent.)
  const emit = (
    severityNumber: SeverityNumber,
    severityText: string,
    message: string,
    attributes?: Record<string, string | number | boolean>
  ): void => {
    loggerProvider?.getLogger(component).emit({
      severityNumber,
      severityText,
      body: message,
      attributes: { component, ...userAttrs(), ...sessionAttrs(), ...attributes },
      context: getSessionContext(),
    });
  };
  return {
    info: (message, attributes) => emit(SeverityNumber.INFO, "INFO", message, attributes),
    warn: (message, attributes) => emit(SeverityNumber.WARN, "WARN", message, attributes),
    error: (message, attributes) => emit(SeverityNumber.ERROR, "ERROR", message, attributes),
  };
}
