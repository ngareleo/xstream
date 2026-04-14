import { mergeClasses } from "@griffel/react";
import { type FC, useCallback, useEffect, useRef } from "react";

import { useDevTools } from "~/components/dev-tools/DevToolsContext.js";
import { type LogCategory, type LogEntry, StreamingLogger } from "~/services/StreamingLogger.js";

import { strings } from "./StreamingLogOverlay.strings.js";
import { useStreamingLogOverlayStyles } from "./StreamingLogOverlay.styles.js";

// ─── Inner presentational component ──────────────────────────────────────────
// Accepts plain props so Storybook stories can target it directly without
// needing DevToolsContext or the StreamingLogger singleton.

export interface StreamingLogPanelProps {
  entries: ReadonlyArray<LogEntry>;
  onClear: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function categoryLabel(cat: LogCategory): string {
  switch (cat) {
    case "STREAM":
      return strings.categoryStream;
    case "BUFFER":
      return strings.categoryBuffer;
    case "PLAYBACK":
      return strings.categoryPlayback;
  }
}

export const StreamingLogPanel: FC<StreamingLogPanelProps> = ({ entries, onClear }) => {
  const styles = useStreamingLogOverlayStyles();
  const listRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to bottom when new entries arrive, unless the user has
  // manually scrolled up to inspect older entries.
  useEffect(() => {
    const el = listRef.current;
    if (!el || userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const handleScroll = useCallback((): void => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    userScrolledRef.current = !atBottom;
  }, []);

  function categoryPillClass(cat: LogCategory): string {
    switch (cat) {
      case "STREAM":
        return mergeClasses(styles.categoryPill, styles.categoryStream);
      case "BUFFER":
        return mergeClasses(styles.categoryPill, styles.categoryBuffer);
      case "PLAYBACK":
        return mergeClasses(styles.categoryPill, styles.categoryPlayback);
    }
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>{strings.title}</span>
          <span className={styles.count}>{entries.length}</span>
        </div>
        <button className={styles.clearBtn} onClick={onClear} type="button">
          {strings.clearButton}
        </button>
      </div>

      <div className={styles.list} ref={listRef} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <div className={styles.emptyState}>{strings.emptyState}</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={mergeClasses(styles.entryRow, entry.isError && styles.entryRowError)}
            >
              <span className={styles.timestamp}>{formatTimestamp(entry.timestamp)}</span>
              <span className={categoryPillClass(entry.category)}>
                {categoryLabel(entry.category)}
              </span>
              <span className={mergeClasses(styles.message, entry.isError && styles.messageError)}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
};

// ─── Context-connected overlay ────────────────────────────────────────────────

export const StreamingLogOverlay: FC = () => {
  const styles = useStreamingLogOverlayStyles();
  const { streamingLogsOpen, logEntries } = useDevTools();

  const handleClear = useCallback((): void => {
    StreamingLogger.clear();
  }, []);

  if (!streamingLogsOpen) return null;

  return (
    <div className={styles.overlay}>
      <StreamingLogPanel entries={logEntries} onClear={handleClear} />
    </div>
  );
};
