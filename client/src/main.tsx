import "./styles/global.css";

import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, type ReactNode, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { RelayEnvironmentProvider } from "react-relay";
import { RouterProvider } from "react-router-dom";

import { ErrorBoundary } from "./components/error-boundary/ErrorBoundary.js";
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
        <AppEventing>
          <RouterProvider router={router} />
        </AppEventing>
      </RelayEnvironmentProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
