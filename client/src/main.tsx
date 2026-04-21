// initTelemetry() must run before any fetch call so that FetchInstrumentation
// patches window.fetch before Relay or StreamingService make their first request.
import { initTelemetry } from "./telemetry.js";
initTelemetry();

import "./styles/global.css";

import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, type ReactNode, Suspense, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { RelayEnvironmentProvider } from "react-relay";
import { RouterProvider } from "react-router-dom";

import { ErrorBoundary } from "./components/error-boundary/ErrorBoundary.js";
import { FeatureFlagsProvider } from "./contexts/FeatureFlagsContext.js";
import { environment } from "./relay/environment.js";
import { router } from "./router.js";

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
