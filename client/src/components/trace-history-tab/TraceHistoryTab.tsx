import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";
import { graphql, useFragment } from "react-relay";

import type { TraceHistoryTab_sessions$key } from "~/relay/__generated__/TraceHistoryTab_sessions.graphql.js";

import { strings } from "./TraceHistoryTab.strings.js";
import { useTraceHistoryStyles } from "./TraceHistoryTab.styles.js";

const SESSIONS_FRAGMENT = graphql`
  fragment TraceHistoryTab_sessions on Query {
    playbackHistory {
      id
      traceId
      videoTitle
      resolution
      startedAt
    }
  }
`;

interface Props {
  query: TraceHistoryTab_sessions$key;
}

const RESOLUTION_LABELS: Record<string, string> = {
  RESOLUTION_240P: "240p",
  RESOLUTION_360P: "360p",
  RESOLUTION_480P: "480p",
  RESOLUTION_720P: "720p",
  RESOLUTION_1080P: "1080p",
  RESOLUTION_4K: "4K",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CopyButton: FC<{ traceId: string }> = ({ traceId }) => {
  const styles = useTraceHistoryStyles();
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(traceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      className={mergeClasses(styles.copyBtn, copied && styles.copyBtnDone)}
      onClick={handleCopy}
    >
      {copied ? strings.copied : strings.copy}
    </button>
  );
};

export const TraceHistoryTab: FC<Props> = ({ query }) => {
  const styles = useTraceHistoryStyles();
  const data = useFragment(SESSIONS_FRAGMENT, query);
  const sessions = data.playbackHistory;

  return (
    <div className={styles.root}>
      <p className={styles.description}>{strings.description}</p>

      {sessions.length === 0 ? (
        <p className={styles.empty}>{strings.empty}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>{strings.columnTitle}</th>
              <th className={styles.th}>{strings.columnResolution}</th>
              <th className={styles.th}>{strings.columnTime}</th>
              <th className={styles.th}>{strings.columnTrace}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className={mergeClasses(styles.td, styles.tdTitle)} title={s.videoTitle}>
                  {s.videoTitle}
                </td>
                <td className={styles.td}>{RESOLUTION_LABELS[s.resolution] ?? s.resolution}</td>
                <td className={styles.td}>{formatTime(s.startedAt)}</td>
                <td className={styles.td}>
                  <div className={styles.traceCell}>
                    <span className={styles.traceCode} title={s.traceId}>
                      {s.traceId}
                    </span>
                    <CopyButton traceId={s.traceId} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
