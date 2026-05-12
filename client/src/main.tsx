// Bootstrap order: flag fetch → initTelemetry → render. See
// docs/architecture/Deployment/04-Axiom-Production-Backend.md § "Bootstrap timing".

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
    // Best-effort — falls back to default endpoint on failure.
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
