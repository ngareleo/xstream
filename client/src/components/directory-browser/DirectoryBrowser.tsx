import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import { type FC, useCallback, useEffect, useState } from "react";
import { fetchQuery, graphql, useRelayEnvironment } from "react-relay";

import type {
  DirectoryBrowserQuery,
  DirectoryBrowserQuery$data,
} from "~/relay/__generated__/DirectoryBrowserQuery.graphql.js";

import { createFolderSelectedEvent } from "./DirectoryBrowser.events.js";
import { strings } from "./DirectoryBrowser.strings.js";
import { useDirectoryBrowserStyles } from "./DirectoryBrowser.styles.js";

const DIRECTORY_QUERY = graphql`
  query DirectoryBrowserQuery($path: String!) {
    listDirectory(path: $path) {
      name
      path
    }
  }
`;

type DirectoryEntry = DirectoryBrowserQuery$data["listDirectory"][number];

interface Props {
  initialPath: string;
}

export const DirectoryBrowser: FC<Props> = ({ initialPath }) => {
  const styles = useDirectoryBrowserStyles();
  const { bubble } = useNovaEventing();
  const environment = useRelayEnvironment();

  const [browsePath, setBrowsePath] = useState(initialPath || "/");
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const navigate = useCallback(
    (path: string): void => {
      setBrowsePath(path);
      setLoading(true);
      fetchQuery<DirectoryBrowserQuery>(environment, DIRECTORY_QUERY, { path }).subscribe({
        next: (data) => {
          setEntries([...(data.listDirectory ?? [])]);
          setLoading(false);
        },
        error: () => setLoading(false),
      });
    },
    [environment]
  );

  useEffect(() => {
    navigate(initialPath || "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateUp = (): void => {
    const parent = browsePath.replace(/\/?[^/]+$/, "") || "/";
    navigate(parent);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.breadcrumb}>{browsePath}</div>
      <div className={styles.list}>
        {loading ? (
          <div className={styles.empty}>{strings.loading}</div>
        ) : (
          <>
            {browsePath !== "/" && (
              <button
                className={mergeClasses(styles.entry, styles.entryUp)}
                onClick={navigateUp}
                type="button"
              >
                {strings.up}
              </button>
            )}
            {entries.length === 0 ? (
              <div className={styles.empty}>{strings.empty}</div>
            ) : (
              entries.map((entry) => (
                <button
                  key={entry.path}
                  className={styles.entry}
                  onClick={() => navigate(entry.path)}
                  type="button"
                >
                  📁 {entry.name}
                </button>
              ))
            )}
          </>
        )}
      </div>
      <div className={styles.actions}>
        <button
          className={styles.selectBtn}
          onClick={(e) => {
            void bubble({ reactEvent: e, event: createFolderSelectedEvent(browsePath) });
          }}
          type="button"
        >
          {strings.selectFolder}
        </button>
      </div>
    </div>
  );
};
