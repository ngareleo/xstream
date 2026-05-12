/** OpenTelemetry bootstrap for the xstream browser client. See docs/architecture/Observability/01-Logging-Policy.md. */

import { propagation, trace, type Tracer } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
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
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";

import { getFlag } from "~/config/featureFlags.js";
import { FLAG_KEYS } from "~/config/flagRegistry.js";
import { getSessionContext } from "~/services/playbackSession.js";

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

// PUBLIC_ prefix required for Rsbuild to expose env vars to the browser bundle.
const defaultEndpoint =
  (import.meta.env.PUBLIC_OTEL_ENDPOINT as string | undefined) ?? "/ingest/otlp";
const defaultHeaders = parseHeadersEnv(import.meta.env.PUBLIC_OTEL_HEADERS as string | undefined);
// Dev posts to same-origin /relay/axiom to bypass CORS. See
// docs/architecture/Deployment/04-Axiom-Production-Backend.md § "Dev flow".
const axiomEndpoint = IS_DEV_BUILD
  ? "/relay/axiom"
  : ((import.meta.env.PUBLIC_OTEL_AXIOM_ENDPOINT as string | undefined) ?? "");
const axiomHeaders = parseHeadersEnv(
  import.meta.env.PUBLIC_OTEL_AXIOM_HEADERS as string | undefined
);

let loggerProvider: LoggerProvider | null = null;
let initialized = false;

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
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers })),
    ],
  });

  // FetchInstrumentation injects traceparent/tracestate into all fetch calls.
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

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

/** Structured log record with a consistent component label. */
export interface ClientLog {
  info(message: string, attributes?: Record<string, string | number | boolean>): void;
  warn(message: string, attributes?: Record<string, string | number | boolean>): void;
  error(message: string, attributes?: Record<string, string | number | boolean>): void;
}

/** Returns a structured logger for the given component. Log records are forwarded to the OTLP backend. */
export function getClientLogger(component: string): ClientLog {
  const logger = loggerProvider?.getLogger(component);
  return {
    info(message, attributes): void {
      logger?.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: message,
        attributes: { component, ...attributes },
        context: getSessionContext(),
      });
    },
    warn(message, attributes): void {
      logger?.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: message,
        attributes: { component, ...attributes },
        context: getSessionContext(),
      });
    },
    error(message, attributes): void {
      logger?.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: message,
        attributes: { component, ...attributes },
        context: getSessionContext(),
      });
    },
  };
}
