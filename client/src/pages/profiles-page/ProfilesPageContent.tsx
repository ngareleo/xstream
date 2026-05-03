import { mergeClasses } from "@griffel/react";
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchQuery, graphql, useLazyLoadQuery, useRelayEnvironment } from "react-relay";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DetailPane } from "~/components/detail-pane/DetailPane.js";
import { EmptyLibrariesHero } from "~/components/empty-libraries-hero/EmptyLibrariesHero.js";
import { ProfilesExplorer } from "~/components/profiles-explorer/ProfilesExplorer.js";
import {
  type LibraryScanSnapshot,
  useLibraryScanSubscription,
} from "~/hooks/useLibraryScanSubscription.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import type { ProfilesPageContentQuery } from "~/relay/__generated__/ProfilesPageContentQuery.graphql.js";

import { strings } from "./ProfilesPage.strings.js";
import { useProfilesPageStyles } from "./ProfilesPage.styles.js";

export const PROFILES_QUERY = graphql`
  query ProfilesPageContentQuery {
    libraries {
      id
      ...ProfileRow_library
      videos(first: 500) {
        edges {
          node {
            id
            title
            filename
            mediaType
            metadata {
              genre
              director
            }
            ...FilmRow_video
            ...DetailPane_video
          }
        }
      }
    }
  }
`;

export const ProfilesPageContent: FC = () => {
  const data = useLazyLoadQuery<ProfilesPageContentQuery>(
    PROFILES_QUERY,
    {},
    { fetchPolicy: "store-and-network" }
  );
  const styles = useProfilesPageStyles();
  const navigate = useNavigate();
  const environment = useRelayEnvironment();
  const [params, setParams] = useSearchParams();

  const filmId = params.get("film");
  const editingFilm = params.get("edit") === "1";

  // Live scan state, keyed by library id. Subscribing to
  // libraryScanProgress lets the row spinner + done/total label update in
  // real time without a manual refresh; the post-scan refetch then
  // surfaces the freshly-discovered videos.
  const [scanByLibrary, setScanByLibrary] = useState<Map<string, LibraryScanSnapshot>>(new Map());
  const wasScanningRef = useRef(false);

  const handleScanUpdate = useCallback(
    (snap: LibraryScanSnapshot): void => {
      if (snap.scanning && snap.libraryId) {
        wasScanningRef.current = true;
        setScanByLibrary((prev) => {
          const next = new Map(prev);
          next.set(snap.libraryId as string, snap);
          return next;
        });
        return;
      }
      // scanning=false: clear any state we tracked. If we just transitioned
      // from scanning, refetch the libraries list so newly-discovered
      // videos populate without a manual refresh.
      if (wasScanningRef.current) {
        wasScanningRef.current = false;
        setScanByLibrary(new Map());
        fetchQuery<ProfilesPageContentQuery>(environment, PROFILES_QUERY, {}).subscribe({});
      }
    },
    [environment]
  );
  useLibraryScanSubscription(handleScanUpdate);

  // Flatten { library, video } edges so we can resolve the selected film
  // in O(1) and pre-expand its parent profile on mount / deep-link.
  type Edge = (typeof data.libraries)[number]["videos"]["edges"][number]["node"];
  const flatVideos = useMemo(() => {
    const out: { libraryId: string; node: Edge }[] = [];
    for (const lib of data.libraries) {
      for (const edge of lib.videos.edges) {
        out.push({ libraryId: lib.id, node: edge.node });
      }
    }
    return out;
  }, [data]);
  const selectedNode: Edge | undefined = filmId
    ? flatVideos.find((v) => v.node.id === filmId)?.node
    : undefined;
  const selectedLibraryId = filmId
    ? flatVideos.find((v) => v.node.id === filmId)?.libraryId
    : undefined;
  const paneOpen = Boolean(selectedNode);

  const defaultPaneWidth = useMemo(() => {
    if (typeof window === "undefined") return 720;
    return Math.floor(window.innerWidth * 0.5);
  }, []);
  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(defaultPaneWidth);

  // First-mount default selection: pick the first matched movie so the
  // page lands with the DetailPane already open. Skips if URL already
  // carries a `?film=` (deep-link or back-nav) or `?empty=1`.
  useEffect(() => {
    if (params.get("film") || params.get("empty") === "1") return;
    const firstMovie = flatVideos.find(
      (v) => v.node.mediaType === "MOVIES" && Boolean(v.node.title)
    );
    if (firstMovie) setParams({ film: firstMovie.node.id }, { replace: true });
    // Run once on mount; re-firing on URL change would override an
    // intentional close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFilm = (id: string): void => {
    if (filmId === id) setParams({});
    else setParams({ film: id });
  };
  const editFilm = (id: string): void => setParams({ film: id, edit: "1" });
  const handleEditChange = (editing: boolean): void => {
    if (!filmId) return;
    if (editing) setParams({ film: filmId, edit: "1" });
    else setParams({ film: filmId });
  };
  const closePane = (): void => setParams({});
  const navigateToCreateProfile = (): void => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    navigate(`/profiles/new?return_to=${returnTo}`);
  };

  // Empty state preview: `/profiles?empty=1` for the design lab. Production
  // also falls back here when there are no libraries at all.
  if (params.get("empty") === "1" || data.libraries.length === 0) {
    return <EmptyLibrariesHero watermark={strings.emptyWatermark} />;
  }

  return (
    <div
      ref={containerRef}
      className={mergeClasses(styles.splitBody, paneOpen && styles.splitBodyOpen)}
      style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
    >
      <ProfilesExplorer
        libraries={data.libraries}
        selectedFilmId={filmId}
        selectedLibraryId={selectedLibraryId}
        scanByLibrary={scanByLibrary}
        onOpenFilm={openFilm}
        onEditFilm={editFilm}
        onCreateProfile={navigateToCreateProfile}
      />

      {paneOpen && selectedNode && (
        <>
          <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} />
          <DetailPane
            video={selectedNode}
            initialEdit={editingFilm}
            onEditChange={handleEditChange}
            onClose={closePane}
          />
        </>
      )}
    </div>
  );
};
