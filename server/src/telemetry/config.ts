import { resourceFromAttributes } from "@opentelemetry/resources";

/** Parse "Key1=Val1,Key2=Val2" into a plain object, ignoring malformed pairs. */
export function parseHeadersEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(",").flatMap((pair) => {
      const eqIdx = pair.indexOf("=");
      if (eqIdx < 1) return [];
      return [[pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim()]] as [string, string][];
    })
  );
}

export const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:5341/ingest/otlp";

export const headers = parseHeadersEnv(process.env.OTEL_EXPORTER_OTLP_HEADERS);

export const resource = resourceFromAttributes({
  "service.name": "xstream-server",
  "deployment.environment": process.env.NODE_ENV ?? "development",
});
