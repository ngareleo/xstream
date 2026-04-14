export type LogCategory = "STREAM" | "BUFFER" | "PLAYBACK";

export interface LogEntry {
  id: number;
  timestamp: number;
  category: LogCategory;
  message: string;
  isError: boolean;
}

type Subscriber = (entries: ReadonlyArray<LogEntry>) => void;

const MAX_ENTRIES = 500;

// No-op implementation used in production — tree-shakes away entirely.
const noop = (): void => {};
const noopUnsub = (): (() => void) => noop;

interface StreamingLoggerShape {
  push(entry: Omit<LogEntry, "id" | "timestamp">): void;
  subscribe(fn: Subscriber): () => void;
  clear(): void;
}

function createLogger(): StreamingLoggerShape {
  if (process.env.NODE_ENV === "production") {
    return { push: noop, subscribe: noopUnsub, clear: noop };
  }

  let counter = 0;
  const entries: LogEntry[] = [];
  const subscribers = new Set<Subscriber>();

  const notify = (): void => {
    // Spread into a new array so React's useState sees a changed reference
    // and triggers a re-render on every push/clear.
    const snapshot = [...entries] as ReadonlyArray<LogEntry>;
    subscribers.forEach((fn) => fn(snapshot));
  };

  return {
    push(partial) {
      const entry: LogEntry = {
        id: counter++,
        timestamp: Date.now(),
        category: partial.category,
        message: partial.message,
        isError: partial.isError,
      };
      entries.push(entry);
      if (entries.length > MAX_ENTRIES) {
        entries.shift();
      }
      notify();
    },

    subscribe(fn) {
      subscribers.add(fn);
      // Deliver a snapshot immediately so late subscribers are in sync.
      fn([...entries] as ReadonlyArray<LogEntry>);
      return () => {
        subscribers.delete(fn);
      };
    },

    clear() {
      entries.length = 0;
      notify();
    },
  };
}

export const StreamingLogger: StreamingLoggerShape = createLogger();
