import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

import { endpoint, headers, resource } from "./config.js";
import { PrettyConsoleExporter } from "./console-exporter.js";

const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
    // Mirror every log record to the terminal in non-production environments so
    // developers don't need to open Seq for basic visibility.
    ...(process.env.NODE_ENV !== "production"
      ? [new SimpleLogRecordProcessor(new PrettyConsoleExporter())]
      : []),
  ],
});

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
