/**
 * DevToolsContext — shared state for the dev kill switch.
 *
 * WHY window.__devToolsReset, not ref-clear-before-throw:
 *
 *   React 18 concurrent mode retries renders that throw. If we clear
 *   throwTargetRef.current before throwing, the retry sees null and succeeds —
 *   the ErrorBoundary never commits its fallback and the UI stays unchanged.
 *
 *   Instead we leave the ref set so every retry also throws, which forces React
 *   to commit the ErrorBoundary. The ref is only cleared when the user clicks
 *   "Try again" in the ErrorBoundary, which calls window.__devToolsReset() —
 *   a dev-only hook registered here. ErrorBoundary.handleReset calls it before
 *   re-mounting the subtree so the second render finds null and succeeds cleanly.
 *
 * Flow:
 *   1. DevPanel calls requestThrow("Watchlist")
 *   2. throwTargetRef.current = "Watchlist"; setTick(t+1)
 *   3. DevThrowTarget re-renders, sees ref === id → throws (ref NOT cleared)
 *   4. React retries; ref still set → throws again → ErrorBoundary commits fallback
 *   5. User clicks "Try again" → ErrorBoundary calls window.__devToolsReset()
 *   6. ref cleared, tick bumped → DevThrowTarget re-renders → ref is null → success
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FC, type ReactNode } from "react";

interface DevToolsCtx {
  throwTargetRef: React.MutableRefObject<string | null>;
  requestThrow: (id: string) => void;
}

const Ctx = createContext<DevToolsCtx>({
  throwTargetRef: { current: null },
  requestThrow: () => {},
});

export const DevToolsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const throwTargetRef = useRef<string | null>(null);
  const [, setTick] = useState(0);

  const requestThrow = useCallback((id: string) => {
    throwTargetRef.current = id;
    setTick((t) => t + 1);
  }, []);

  // Register a global reset hook so the ErrorBoundary can clear the target
  // without needing to access this context directly (class components can't use hooks).
  useEffect(() => {
    (window as Record<string, unknown>).__devToolsReset = () => {
      throwTargetRef.current = null;
      setTick((t) => t + 1);
    };
    return () => {
      delete (window as Record<string, unknown>).__devToolsReset;
    };
  }, []);

  return (
    <Ctx.Provider value={{ throwTargetRef, requestThrow }}>
      {children}
    </Ctx.Provider>
  );
};

export function useDevTools(): DevToolsCtx {
  return useContext(Ctx);
}

/**
 * Wrap any component subtree with this to make it throwable from the DevPanel.
 * The ref is NOT cleared here — it must stay set so React's concurrent retry
 * also throws, forcing the ErrorBoundary to commit. It is cleared by
 * window.__devToolsReset() when the user clicks "Try again".
 */
export const DevThrowTarget: FC<{ id: string; children: ReactNode }> = ({ id, children }) => {
  const { throwTargetRef } = useDevTools();

  if (throwTargetRef.current === id) {
    throw new Error(
      `[DevTools] Force-thrown in: ${id}\n\nThis error was triggered by the DevPanel kill switch. ` +
      `It simulates a render crash in the "${id}" component tree.`,
    );
  }

  return <>{children}</>;
};
