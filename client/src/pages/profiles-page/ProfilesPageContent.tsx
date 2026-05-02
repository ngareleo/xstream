import { mergeClasses } from "@griffel/react";
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchQuery, graphql, useLazyLoadQuery, useRelayEnvironment } from "react-relay";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DetailPane } from "~/components/detail-pane/DetailPane.js";
import { EmptyLibrariesHero } from "~/components/empty-libraries-hero/EmptyLibrariesHero.js";
import { FilmRow } from "~/components/film-row/FilmRow.js";
import { ProfileRow } from "~/components/profile-row/ProfileRow.js";
import {
  type LibraryScanSnapshot,
  useLibraryScanSubscription,
} from "~/hooks/useLibraryScanSubscription.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import { IconClose, IconSearch } from "~/lib/icons.js";
import type { ProfilesPageContentQuery } from "~/relay/__generated__/ProfilesPageContentQuery.graphql.js";

import { filmMatches } from "./filmMatches.js";
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
  const data = useLazyLoadQuery<ProfilesPageContentQuery>(PROFILES_QUERY, {});
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
  const flatVideos = useMemo(() => {
    const out: { libraryId: string; node: NonNullable<typeof selectedNode> }[] = [];
    for (const lib of data.libraries) {
      for (const edge of lib.videos.edges) {
        out.push({ libraryId: lib.id, node: edge.node });
      }
    }
    return out;
  }, [data]);
  type Edge = (typeof data.libraries)[number]["videos"]["edges"][number]["node"];
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

  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    if (data.libraries.length > 0) set.add(data.libraries[0].id);
    if (selectedLibraryId) set.add(selectedLibraryId);
    return set;
  }, [data.libraries, selectedLibraryId]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialExpanded);

  const toggleProfile = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const visibleProfiles = useMemo(() => {
    return data.libraries
      .map((lib) => ({
        library: lib,
        videos: isSearching
          ? lib.videos.edges.map((e) => e.node).filter((node) => filmMatches(node, trimmedSearch))
          : lib.videos.edges.map((e) => e.node),
      }))
      .filter((entry) => !isSearching || entry.videos.length > 0);
  }, [data.libraries, trimmedSearch, isSearching]);

  const matchCount = useMemo(
    () => visibleProfiles.reduce((sum, p) => sum + p.videos.length, 0),
    [visibleProfiles]
  );

  // Aggregate footer counts.
  let totalFilms = 0;
  let totalShows = 0;
  let totalUnmatched = 0;
  for (const lib of data.libraries) {
    for (const e of lib.videos.edges) {
      if (e.node.mediaType === "MOVIES") totalFilms += 1;
      if (e.node.mediaType === "TV_SHOWS") totalShows += 1;
      if (!e.node.title) totalUnmatched += 1;
    }
  }
  // TODO(release-design): wire episode counts from the seasons subselection.
  const totalEpisodes = 0;
  const scanningCount = scanByLibrary.size;

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
      <div className={styles.leftCol}>
        <div className={styles.breadcrumb}>
          <span className={styles.crumbDim}>{strings.crumbHome}</span>
          <span>/</span>
          <span>{strings.crumbMedia}</span>
          <span>/</span>
          <span className={styles.crumbBright}>{strings.crumbFilms}</span>
          {scanningCount > 0 && (
            <span className={styles.breadcrumbScanning}>
              {strings.formatString(strings.breadcrumbScanningFormat, {
                n: scanningCount,
                total: data.libraries.length,
              })}
            </span>
          )}
        </div>

        <div className={styles.searchBar}>
          <span className={styles.searchPrompt} aria-hidden="true">
            <IconSearch />
          </span>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={strings.searchPlaceholder}
            aria-label={strings.searchAriaLabel}
            spellCheck={false}
            autoComplete="off"
          />
          {isSearching && (
            <>
              <span className={styles.searchCount}>
                {strings.formatString(strings.searchCountFormat, {
                  matchCount,
                  matchLabel: matchCount === 1 ? strings.matchSingular : strings.matchPlural,
                  profileCount: visibleProfiles.length,
                  profileLabel:
                    visibleProfiles.length === 1 ? strings.profileSingular : strings.profilePlural,
                })}
              </span>
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearch("")}
                aria-label={strings.searchClearAriaLabel}
              >
                <IconClose width={12} height={12} />
              </button>
            </>
          )}
        </div>

        <div className={styles.colHeader}>
          <div />
          <div>{strings.colHeaderProfile}</div>
          <div>{strings.colHeaderMatch}</div>
          <div>{strings.colHeaderSize}</div>
          <div />
        </div>

        <div className={styles.rowsScroll}>
          {visibleProfiles.length === 0 ? (
            <div className={styles.noMatches}>
              {strings.formatString(strings.noMatchesFormat, { q: search.trim() })}
            </div>
          ) : (
            visibleProfiles.map(({ library, videos }) => {
              const scan = scanByLibrary.get(library.id);
              const scanProgress =
                scan && scan.done !== null && scan.total !== null
                  ? { done: scan.done, total: scan.total }
                  : null;
              return (
                <ProfileRow
                  key={library.id}
                  library={library}
                  expanded={isSearching || expandedIds.has(library.id)}
                  onToggle={() => {
                    if (!isSearching) toggleProfile(library.id);
                  }}
                  scanning={Boolean(scan)}
                  scanProgress={scanProgress}
                >
                  {videos.map((node) => (
                    <FilmRow
                      key={node.id}
                      video={node}
                      selected={filmId === node.id}
                      onOpen={() => openFilm(node.id)}
                      onEdit={() => editFilm(node.id)}
                    />
                  ))}
                </ProfileRow>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <span>
            {strings.formatString(strings.footerCountsFormat, {
              profiles: data.libraries.length,
              films: totalFilms,
              shows: totalShows,
              episodes: totalEpisodes,
              unmatched: totalUnmatched,
            })}
          </span>
          <button
            type="button"
            className={styles.footerCta}
            onClick={() =>
              navigate("/profiles/new", {
                state: { from: window.location.pathname + window.location.search },
              })
            }
          >
            {strings.footerCta}
          </button>
        </div>
      </div>

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
