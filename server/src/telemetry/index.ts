/**
 * OpenTelemetry bootstrap for the xstream server.
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
 *   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>,X-Axiom-Dataset=xstream-prod
 */

// Side effects: registers the global TracerProvider and LoggerProvider on import.
import "./tracer.js";
import "./logger.js";

export type { OtelLog } from "./logger.js";
export { getOtelLogger } from "./logger.js";
export { getTracer } from "./tracer.js";
