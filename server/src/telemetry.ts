/**
 * OpenTelemetry bootstrap for the tvke server.
 *
 * Must be the first side-effecting import in server/src/index.ts so that the
 * global TracerProvider and propagator are registered before any service code
 * runs. Importing this module is sufficient — no explicit initialisation call
 * is needed.
 *
 * Telemetry is routed to Seq in development and can be switched to any
 * OTLP-compatible backend (Axiom, Grafana Cloud, Jaeger, etc.) by changing
 * two environment variables — no code changes required:
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co
 *   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>,X-Axiom-Dataset=tvke-prod
 */

import { propagation, trace, type Tracer } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

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

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:5341/ingest/otlp";
const headers = parseHeadersEnv(process.env.OTEL_EXPORTER_OTLP_HEADERS);

const resource = resourceFromAttributes({
  "service.name": "tvke-server",
  "deployment.environment": process.env.NODE_ENV ?? "development",
});

// ── Tracing ────────────────────────────────────────────────────────────────────

const tracerProvider = new BasicTracerProvider({
  resource,
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers })),
  ],
});

// Register as the global tracer provider and set the W3C Trace Context propagator
// so incoming traceparent/tracestate headers are extracted from client requests
// and server spans become children of the client-side trace.
trace.setGlobalTracerProvider(tracerProvider);
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

// ── Logging ────────────────────────────────────────────────────────────────────

const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
  ],
});

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns an OTel Tracer for the given component.
 * Use it to create spans that appear in the Seq trace viewer.
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/** Structured log record with a consistent component label. */
export interface OtelLog {
  info(message: string, attributes?: Record<string, string | number | boolean>): void;
  warn(message: string, attributes?: Record<string, string | number | boolean>): void;
  error(message: string, attributes?: Record<string, string | number | boolean>): void;
}

/**
 * Returns a structured logger for the given component.
 * Log records are forwarded to the OTLP backend (Seq in dev, Axiom in prod)
 * with a `component` attribute for filtering.
 */
export function getOtelLogger(component: string): OtelLog {
  const logger = loggerProvider.getLogger(component);
  return {
    info(message, attributes): void {
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: message,
        attributes: { component, ...attributes },
      });
    },
    warn(message, attributes): void {
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: message,
        attributes: { component, ...attributes },
      });
    },
    error(message, attributes): void {
      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: message,
        attributes: { component, ...attributes },
      });
    },
  };
}

console.log(`[telemetry] OTel initialized → ${endpoint}`);
