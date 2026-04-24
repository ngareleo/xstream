/**
 * In-memory span capture for tests.
 *
 * Why this is a separate module imported from the test preload:
 *
 * `chunker.ts` (and other producers) call `getTracer("chunker")` at module
 * load and capture the result in a module-level constant. The returned
 * Tracer is bound to whichever TracerProvider was global at that moment —
 * a later `setGlobalTracerProvider` does NOT redirect spans from already-
 * captured tracers.
 *
 * That means the swap from the production OTLP provider to a memory-backed
 * one must happen BEFORE any test file imports the chunker. The test preload
 * (`setup.ts`) is the only place that runs early enough. So this module:
 *   1. Imports the production telemetry side-effect (registers OTLP).
 *   2. Immediately overwrites the global with an in-memory provider.
 *   3. Exports drain/reset so individual tests can read spans they cared about.
 *
 * Test files just `import { drainCapturedSpans, resetCapturedSpans }` — no
 * setup needed; the preload has already installed everything.
 */
// Force the production telemetry side-effects to run first so the OTLP provider
// gets registered, then we overwrite. Doing it in this order means any future
// `import "../telemetry/tracer.js"` is a cache hit and won't clobber us.
import "../telemetry/tracer.js";

import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

// `setGlobalTracerProvider` is one-shot — the second call is rejected and the
// global keeps pointing at the OTLP provider tracer.ts just registered. Clear
// the global first so our memory provider can take over.
trace.disable();

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

export function drainCapturedSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

export function resetCapturedSpans(): void {
  exporter.reset();
}
