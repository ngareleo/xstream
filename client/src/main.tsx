// Bootstrap order: flag fetch → initTelemetry → restoreSession → render.
// See docs/architecture/Deployment/04-Axiom-Production-Backend.md and
// docs/architecture/Identity/01-Sign-In-Flow.md §"Boot — session restore".

import "./styles/global.css";
import "./styles/shared.css";

import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, type ReactNode, Suspense, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { RelayEnvironmentProvider } from "react-relay";
import { RouterProvider } from "react-router-dom";

import { ErrorBoundary } from "./components/error-boundary/ErrorBoundary.js";
import { bootstrapFlagsFromServer } from "./config/featureFlags.js";
import { FeatureFlagsProvider } from "./contexts/FeatureFlagsContext.js";
import { environment } from "./relay/environment.js";
import { router } from "./router.js";
import { restoreSession, subscribeToAuthChanges } from "./services/auth.js";
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

void bootstrapFlagsFromServer().finally(() => {
  initTelemetry();

  // Hydrate Supabase session before mount so the first Relay fetch carries the JWT.
  void restoreSession().then(() => {
    subscribeToAuthChanges(() => {});

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
});
