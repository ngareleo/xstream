// Bootstrap order is load-bearing:
//
//  1. Fetch `flag.useAxiomExporter` from the server (dev only) — telemetry
//     init must know which OTLP endpoint to target. localStorage isn't a
//     reliable source on first page load (a fresh browser profile has it
//     empty even if the SQLite flag is ON), so we synchronously block on
//     a one-shot GraphQL query before initialising.
//
//  2. `initTelemetry()` — must run before any Relay/StreamingService fetch
//     so FetchInstrumentation has patched `window.fetch`.
//
//  3. Render — Relay then issues its first request through the patched
//     fetch with the correctly-configured OTLP exporter.

import "./styles/global.css";
import "./styles/shared.css";

import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, type ReactNode, Suspense, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { RelayEnvironmentProvider } from "react-relay";
import { RouterProvider } from "react-router-dom";

import { ErrorBoundary } from "./components/error-boundary/ErrorBoundary.js";
import { hydrateFlags } from "./config/featureFlags.js";
import { graphqlHttpUrl } from "./config/rustOrigin.js";
import { FeatureFlagsProvider } from "./contexts/FeatureFlagsContext.js";
import { environment } from "./relay/environment.js";
import { router } from "./router.js";
import { initTelemetry } from "./telemetry.js";

/**
 * Root eventing handler. Terminal handler for any event not consumed by an
 * intermediate NovaEventingInterceptor.
 */
const AppEventing: FC<{ children: ReactNode }> = ({ children }) => {
  const eventing = useMemo(
    () => ({
      bubble: (_event: EventWrapper): Promise<void> => Promise.resolve(),
    }),
    []
  );

  return (
    <NovaEventingProvider eventing={eventing} reactEventMapper={mapEventMetadata}>
      {children}
    </NovaEventingProvider>
  );
};

async function bootstrapTelemetryFlag(): Promise<void> {
  if (!IS_DEV_BUILD) return;
  try {
    const resp = await fetch(graphqlHttpUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query BootstrapFlags($keys: [String!]!) { settings(keys: $keys) { key value } }",
        variables: { keys: ["flag.useAxiomExporter"] },
      }),
    });
    const json: { data?: { settings?: { key: string; value: string | null }[] } } =
      await resp.json();
    hydrateFlags(json?.data?.settings ?? []);
  } catch {
    // Best-effort. If the server is unreachable during boot the exporter
    // falls back to its default endpoint — same as a fresh install.
  }
}

void bootstrapTelemetryFlag().finally(() => {
  initTelemetry();

  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <RelayEnvironmentProvider environment={environment}>
          <Suspense fallback={null}>
            <FeatureFlagsProvider>
              <AppEventing>
                <RouterProvider router={router} />
              </AppEventing>
            </FeatureFlagsProvider>
          </Suspense>
        </RelayEnvironmentProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
});
