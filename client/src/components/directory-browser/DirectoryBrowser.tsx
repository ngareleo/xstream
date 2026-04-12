import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import { type FC, useCallback, useEffect, useState } from "react";
import { fetchQuery, graphql, useRelayEnvironment } from "react-relay";

import type { DirectoryBrowserListDirectoryQuery } from "~/relay/__generated__/DirectoryBrowserListDirectoryQuery.graphql.js";

import { createFolderSelectedEvent } from "./DirectoryBrowser.events.js";
import { strings } from "./DirectoryBrowser.strings.js";
import { useDirectoryBrowserStyles } from "./DirectoryBrowser.styles.js";

const LIST_DIRECTORY_QUERY = graphql`
  query DirectoryBrowserListDirectoryQuery($path: String!) {
    listDirectory(path: $path) {
      name
      path
    }
  }
`;

interface DirEntry {
  readonly name: string;
  readonly path: string;
}

interface Props {
  initialPath: string;
}

export const DirectoryBrowser: FC<Props> = ({ initialPath }) => {
  const styles = useDirectoryBrowserStyles();
  const environment = useRelayEnvironment();
  const { bubble } = useNovaEventing();

  const [browsePath, setBrowsePath] = useState(initialPath || "/");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDirectory = useCallback(
    (dirPath: string): void => {
      setLoading(true);
      fetchQuery<DirectoryBrowserListDirectoryQuery>(environment, LIST_DIRECTORY_QUERY, {
        path: dirPath,
      }).subscribe({
        next: (result) => {
          setEntries([...(result.listDirectory ?? [])]);
          setBrowsePath(dirPath);
          setLoading(false);
        },
        error: () => {
          setEntries([]);
          setLoading(false);
        },
      });
    },
    [environment]
  );

  useEffect(() => {
    loadDirectory(initialPath || "/");
  }, [initialPath, loadDirectory]);

  const navigateUp = (): void => {
    const parent = browsePath.replace(/\/?[^/]+$/, "") || "/";
    loadDirectory(parent);
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
                  onClick={() => loadDirectory(entry.path)}
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
