import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type { LogEntry } from "~/services/StreamingLogger.js";
import { StreamingLogger } from "~/services/StreamingLogger.js";

interface DevToolsCtx {
  throwTarget: string | null;
  setThrowTarget: (id: string | null) => void;
  streamingLogsOpen: boolean;
  setStreamingLogsOpen: (open: boolean) => void;
  logEntries: ReadonlyArray<LogEntry>;
}

const Ctx = createContext<DevToolsCtx>({
  throwTarget: null,
  setThrowTarget: () => {},
  streamingLogsOpen: false,
  setStreamingLogsOpen: () => {},
  logEntries: [],
});

export const DevToolsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [throwTarget, setThrowTarget] = useState<string | null>(null);
  const [streamingLogsOpen, setStreamingLogsOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<ReadonlyArray<LogEntry>>([]);

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

  // Subscribe to the streaming logger once — entries accumulate even when the
  // overlay is closed, so the user doesn't miss events from a closed panel.
  useEffect(() => {
    return StreamingLogger.subscribe(setLogEntries);
  }, []);

  const handleSet = useCallback((id: string | null) => {
    setThrowTarget(id);
  }, []);

  const handleSetLogsOpen = useCallback((open: boolean) => {
    setStreamingLogsOpen(open);
  }, []);

  return (
    <Ctx.Provider
      value={{
        throwTarget,
        setThrowTarget: handleSet,
        streamingLogsOpen,
        setStreamingLogsOpen: handleSetLogsOpen,
        logEntries,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export function useDevTools(): DevToolsCtx {
  return useContext(Ctx);
}
