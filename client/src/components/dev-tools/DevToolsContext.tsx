/**
 * DevToolsContext — shared state for the dev kill switch.
 *
 * Usage:
 *   // Wrap any subtree you want to be throwable from DevPanel:
 *   <DevThrowTarget id="Dashboard">
 *     <DashboardPageContent />
 *   </DevThrowTarget>
 *
 *   // DevPanel lists all registered targets. Clicking "⚡ Throw" on one
 *   // causes that DevThrowTarget to throw, triggering the nearest ErrorBoundary.
 */

import { createContext, type FC, type ReactNode, useContext, useState } from "react";

interface DevToolsCtx {
  throwTarget: string | null;
  setThrowTarget: (id: string | null) => void;
}

const Ctx = createContext<DevToolsCtx>({ throwTarget: null, setThrowTarget: () => {} });

export const DevToolsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [throwTarget, setThrowTarget] = useState<string | null>(null);
  return <Ctx.Provider value={{ throwTarget, setThrowTarget }}>{children}</Ctx.Provider>;
};

export function useDevTools(): DevToolsCtx {
  return useContext(Ctx);
}

/**
 * Wrap any component subtree with this to make it throwable from the DevPanel.
 * When `throwTarget` matches `id`, this component throws a descriptive error
 * that the nearest ErrorBoundary will catch.
 */
export const DevThrowTarget: FC<{ id: string; children: ReactNode }> = ({ id, children }) => {
  const { throwTarget, setThrowTarget } = useDevTools();

  if (throwTarget === id) {
    setThrowTarget(null);
    throw new Error(
      `[DevTools] Force-thrown in: ${id}\n\nThis error was triggered by the DevPanel kill switch. ` +
        `It simulates a render crash in the "${id}" component tree.`
    );
  }

  return <>{children}</>;
};
