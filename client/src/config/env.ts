/** Single source of truth for `PUBLIC_*` build-time env vars. */

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

/** Normalise a raw env value: undefined or empty → undefined; otherwise return as-is. */
export function readEnvString(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export interface ClientEnv {
  /** Supabase project URL (e.g. `https://<ref>.supabase.co`). */
  supabaseUrl: string | undefined;
  /** Supabase anon key — public by design, scoped by RLS. */
  supabaseAnonKey: string | undefined;
  /** Default OTLP base URL for browser telemetry. Falls back to `/ingest/otlp`. */
  otelEndpoint: string;
  /** Comma-separated `Key=Value` headers for the default OTLP endpoint. */
  otelHeaders: Record<string, string>;
  /** OTLP base URL used when `flag.useAxiomExporter` is ON. */
  otelAxiomEndpoint: string;
  /** Headers for the Axiom endpoint. */
  otelAxiomHeaders: Record<string, string>;
}

// Each field MUST reference `import.meta.env.PUBLIC_X` statically — Rsbuild
// substitutes these at build time by literal text match. Dynamic access
// (`import.meta.env[key]`) is NOT substituted and silently reads undefined.
export const env: ClientEnv = {
  supabaseUrl: readEnvString(import.meta.env.PUBLIC_SUPABASE_URL),
  supabaseAnonKey: readEnvString(import.meta.env.PUBLIC_SUPABASE_ANON_KEY),
  otelEndpoint: readEnvString(import.meta.env.PUBLIC_OTEL_ENDPOINT) ?? "/ingest/otlp",
  otelHeaders: parseHeadersEnv(readEnvString(import.meta.env.PUBLIC_OTEL_HEADERS)),
  otelAxiomEndpoint: readEnvString(import.meta.env.PUBLIC_OTEL_AXIOM_ENDPOINT) ?? "",
  otelAxiomHeaders: parseHeadersEnv(readEnvString(import.meta.env.PUBLIC_OTEL_AXIOM_HEADERS)),
};
