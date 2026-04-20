import { propagation, trace, type Tracer } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

import { endpoint, headers, resource } from "./config.js";

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

/**
 * Returns an OTel Tracer for the given component.
 * Use it to create spans that appear in the Seq trace viewer.
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}
