import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface DevToolsCtx {
  throwTarget: string | null;
  setThrowTarget: (id: string | null) => void;
}

const Ctx = createContext<DevToolsCtx>({
  throwTarget: null,
  setThrowTarget: () => {},
});

export const DevToolsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [throwTarget, setThrowTarget] = useState<string | null>(null);

  // ErrorBoundary.handleReset calls window.__devToolsReset() before resetting
  // its own state, giving us a chance to clear throwTarget first so the
  // re-mounted DevThrowTarget doesn't throw again on "Try Again".
  useEffect(() => {
    (window as unknown as { __devToolsReset?: () => void }).__devToolsReset = () =>
      setThrowTarget(null);
    return () => {
      delete (window as unknown as { __devToolsReset?: () => void }).__devToolsReset;
    };
  }, []);

  const handleSet = useCallback((id: string | null) => {
    setThrowTarget(id);
  }, []);

  return <Ctx.Provider value={{ throwTarget, setThrowTarget: handleSet }}>{children}</Ctx.Provider>;
};

export function useDevTools(): DevToolsCtx {
  return useContext(Ctx);
}
