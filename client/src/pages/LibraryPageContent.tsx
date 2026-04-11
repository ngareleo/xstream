import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, {
  type FC,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { graphql, useLazyLoadQuery, useSubscription } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { isFilmDetailPaneClosedEvent } from "~/components/film-detail-pane/FilmDetailPane.events.js";
import { FilmDetailPaneAsync } from "~/components/film-detail-pane/FilmDetailPaneAsync.js";
import {
  isPosterCardFilmSelectedEvent,
  type PosterCardFilmSelectedData,
} from "~/components/poster-card/PosterCard.events.js";
import { PosterCard } from "~/components/poster-card/PosterCard.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import { IconBars, IconSquares } from "~/lib/icons.js";
import type { LibraryPageContentDetailQuery } from "~/relay/__generated__/LibraryPageContentDetailQuery.graphql.js";
import type { LibraryPageContentQuery } from "~/relay/__generated__/LibraryPageContentQuery.graphql.js";
import type { LibraryPageContentScanSubscription } from "~/relay/__generated__/LibraryPageContentScanSubscription.graphql.js";

import { useLibraryStyles } from "./LibraryPage.styles.js";

const LIBRARY_QUERY = graphql`
  query LibraryPageContentQuery {
    libraries {
      id
      name
      mediaType
      videos(first: 200) {
        edges {
          node {
            id
            title
            matched
            metadata {
              genre
            }
            ...PosterCard_video
          }
        }
        totalCount
      }
    }
  }
`;

const SCAN_SUBSCRIPTION = graphql`
  subscription LibraryPageContentScanSubscription {
    libraryScanUpdated {
      scanning
    }
  }
`;

const DETAIL_VIDEO_QUERY = graphql`
  query LibraryPageContentDetailQuery($videoId: ID!) {
    video(id: $videoId) {
      ...FilmDetailPane_video
    }
  }
`;

// ─── Detail loader ────────────────────────────────────────────────────────────

interface DetailLoaderProps {
  filmId: string;
}

const DetailLoader: FC<DetailLoaderProps> = ({ filmId }) => {
  const data = useLazyLoadQuery<LibraryPageContentDetailQuery>(DETAIL_VIDEO_QUERY, {
    videoId: filmId,
  });
  if (!data.video) return null;
  return <FilmDetailPaneAsync video={data.video} />;
};

// ─── Main component ───────────────────────────────────────────────────────────

export const LibraryPageContent: FC = () => {
  const styles = useLibraryStyles();
  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);
  const [fetchKey, setFetchKey] = useState(0);
  const [, startTransition] = useTransition();
  const wasScanning = useRef(false);

  const scanConfig = useMemo(
    () => ({
      subscription: SCAN_SUBSCRIPTION,
      variables: {},
      onNext: (response: LibraryPageContentScanSubscription["response"] | null | undefined) => {
        const isScanning = response?.libraryScanUpdated?.scanning ?? false;
        if (wasScanning.current && !isScanning) {
          startTransition(() => setFetchKey((k) => k + 1));
        }
        wasScanning.current = isScanning;
      },
      onError: () => {},
    }),
    []
  );

  useSubscription<LibraryPageContentScanSubscription>(scanConfig);

  const data = useLazyLoadQuery<LibraryPageContentQuery>(
    LIBRARY_QUERY,
    {},
    { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" }
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(
    data.libraries[0]?.id ?? null
  );
  const [search, setSearch] = useState("");
  const [isGrid, setIsGrid] = useState(true);

  const filmId = searchParams.get("film");
  const isPaneOpen = Boolean(filmId);

  const closePane = useCallback((): void => {
    setSearchParams({});
  }, [setSearchParams]);

  const handleSelect = useCallback(
    (id: string): void => {
      if (filmId === id) {
        closePane();
      } else {
        setSearchParams({ film: id });
      }
    },
    [filmId, closePane, setSearchParams]
  );

  const interceptor = useCallback(
    async (wrapper: EventWrapper): Promise<EventWrapper | undefined> => {
      if (isPosterCardFilmSelectedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as PosterCardFilmSelectedData | undefined;
        if (payload) handleSelect(payload.videoId);
        return undefined;
      }
      if (isFilmDetailPaneClosedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      return wrapper;
    },
    [handleSelect, closePane]
  );

  const activeLibrary =
    data.libraries.find((l) => l.id === activeLibraryId) ?? data.libraries[0] ?? null;

  const filteredVideos = useMemo(() => {
    if (!activeLibrary) return [];
    const q = search.toLowerCase();
    return activeLibrary.videos.edges
      .map((e) => e.node)
      .filter(
        (v) =>
          !q ||
          v.title.toLowerCase().includes(q) ||
          (v.metadata?.genre ?? "").toLowerCase().includes(q)
      );
  }, [activeLibrary, search]);

  if (data.libraries.length === 0) {
    return (
      <div className={mergeClasses(styles.root)}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No libraries found</div>
          <div className={styles.emptyBody}>
            Create a library from the Dashboard to start browsing your collection.
          </div>
        </div>
      </div>
    );
  }

  return (
    <DevThrowTarget id="Library">
      <NovaEventingInterceptor interceptor={interceptor}>
        <div className={styles.root}>
          {/* Filter bar */}
          <div className={styles.filterBar}>
            <input
              className={styles.searchInput}
              placeholder="Search titles, genres…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.filterSep} />
            <button
              className={mergeClasses(styles.toggleBtn, isGrid && styles.toggleBtnActive)}
              onClick={() => setIsGrid(true)}
              title="Grid view"
              type="button"
            >
              <IconSquares size={13} />
            </button>
            <button
              className={mergeClasses(styles.toggleBtn, !isGrid && styles.toggleBtnActive)}
              onClick={() => setIsGrid(false)}
              title="List view"
              type="button"
            >
              <IconBars size={13} />
            </button>
            <span className={styles.filterCount}>
              {filteredVideos.length} title{filteredVideos.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Library tabs (only when >1 library) */}
          {data.libraries.length > 1 && (
            <div className={styles.tabs}>
              {data.libraries.map((lib) => (
                <button
                  key={lib.id}
                  className={mergeClasses(
                    styles.tab,
                    lib.id === (activeLibrary?.id ?? null) && styles.tabActive
                  )}
                  onClick={() => setActiveLibraryId(lib.id)}
                  type="button"
                >
                  {lib.name}
                  <span className={styles.tabCount}>{lib.videos.totalCount}</span>
                </button>
              ))}
            </div>
          )}

          {/* Split body */}
          <div
            ref={containerRef}
            className={styles.splitBody}
            style={isPaneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
          >
            <div className={styles.splitLeft}>
              {filteredVideos.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyTitle}>No results</div>
                  <div className={styles.emptyBody}>Try a different search term.</div>
                </div>
              ) : (
                <div className={styles.gridArea}>
                  <div className={styles.grid}>
                    {filteredVideos.map((video) => (
                      <PosterCard key={video.id} video={video} isSelected={video.id === filmId} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Resize handle */}
            {isPaneOpen && <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} />}

            {/* Right pane */}
            <div className={styles.rightPane}>
              {filmId && (
                <Suspense fallback={null}>
                  <DetailLoader filmId={filmId} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </NovaEventingInterceptor>
    </DevThrowTarget>
  );
};
