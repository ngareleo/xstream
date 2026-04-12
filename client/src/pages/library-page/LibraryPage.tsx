import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, {
  type FC,
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  graphql,
  type PreloadedQuery,
  useLazyLoadQuery,
  usePreloadedQuery,
  useQueryLoader,
  useSubscription,
} from "react-relay";
import { useSearchParams } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { isFilmDetailPaneClosedEvent } from "~/components/film-detail-pane/FilmDetailPane.events.js";
import { FilmDetailPaneAsync } from "~/components/film-detail-pane/FilmDetailPaneAsync.js";
import { LibraryChips } from "~/components/library-chips/LibraryChips.js";
import { LibraryFilmListRow } from "~/components/library-film-list-row/LibraryFilmListRow.js";
import {
  LibraryFilterBar,
  type TypeFilter,
} from "~/components/library-filter-bar/LibraryFilterBar.js";
import {
  isPosterCardFilmSelectedEvent,
  type PosterCardFilmSelectedData,
} from "~/components/poster-card/PosterCard.events.js";
import { PosterCard } from "~/components/poster-card/PosterCard.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import type { LibraryPageContentDetailQuery } from "~/relay/__generated__/LibraryPageContentDetailQuery.graphql.js";
import type { LibraryPageContentQuery } from "~/relay/__generated__/LibraryPageContentQuery.graphql.js";
import type { LibraryPageContentScanSubscription } from "~/relay/__generated__/LibraryPageContentScanSubscription.graphql.js";

import { useLibraryStyles } from "./LibraryPage.styles.js";

const LIBRARY_QUERY = graphql`
  query LibraryPageContentQuery($search: String, $mediaType: MediaType) {
    libraries {
      id
      ...LibraryChips_library @arguments(search: $search, mediaType: $mediaType)
      videos(first: 200, search: $search, mediaType: $mediaType) {
        edges {
          node {
            id
            ...PosterCard_video
            ...LibraryFilmListRow_video
          }
        }
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
// Uses usePreloadedQuery so the network request starts as soon as the user
// clicks a card (via loadDetailQuery) rather than waiting for this component
// to mount inside the Suspense boundary.

interface DetailLoaderProps {
  queryRef: PreloadedQuery<LibraryPageContentDetailQuery>;
}

const DetailLoader: FC<DetailLoaderProps> = ({ queryRef }) => {
  const data = usePreloadedQuery<LibraryPageContentDetailQuery>(DETAIL_VIDEO_QUERY, queryRef);
  if (!data.video) return null;
  return <FilmDetailPaneAsync video={data.video} />;
};

// ─── LibraryPage ──────────────────────────────────────────────────────────────

const LibraryPage: FC = () => {
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

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isGrid, setIsGrid] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [detailQueryRef, loadDetailQuery] =
    useQueryLoader<LibraryPageContentDetailQuery>(DETAIL_VIDEO_QUERY);

  // Defer the search string so the UI stays responsive while the user types;
  // the server query only re-fires once the deferred value settles.
  const deferredSearch = useDeferredValue(search);

  const data = useLazyLoadQuery<LibraryPageContentQuery>(
    LIBRARY_QUERY,
    {
      search: deferredSearch || null,
      mediaType: typeFilter !== "all" ? typeFilter : null,
    },
    { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" }
  );

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
        // Kick off the network request immediately, before the URL update causes
        // DetailLoader to mount — avoids a wasted render cycle before fetching.
        loadDetailQuery({ videoId: id });
        setSearchParams({ film: id });
      }
    },
    [filmId, closePane, loadDetailQuery, setSearchParams]
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

  // Server handles search + mediaType filtering; client only picks the active library chip.
  const filteredVideos = useMemo(() => {
    if (activeLibraryId) {
      const lib = data.libraries.find((l) => l.id === activeLibraryId);
      return lib ? lib.videos.edges.map((e) => e.node) : [];
    }
    return data.libraries.flatMap((l) => l.videos.edges.map((e) => e.node));
  }, [data.libraries, activeLibraryId]);

  if (data.libraries.length === 0) {
    return (
      <div className={styles.root}>
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
          <LibraryFilterBar
            search={search}
            onSearchChange={setSearch}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            isGrid={isGrid}
            onIsGridChange={setIsGrid}
            count={filteredVideos.length}
          />

          {/* Library selector chips — only shown when there are multiple libraries */}
          {data.libraries.length > 1 && (
            <LibraryChips
              libraries={data.libraries}
              activeLibraryId={activeLibraryId}
              onActiveLibraryIdChange={setActiveLibraryId}
            />
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
              ) : isGrid ? (
                <div className={styles.gridArea}>
                  <div className={styles.grid}>
                    {filteredVideos.map((video) => (
                      <PosterCard key={video.id} video={video} isSelected={video.id === filmId} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.listArea}>
                  <div className={styles.listHeader}>
                    <div />
                    <div className={styles.listHeaderCell}>Title</div>
                    <div className={styles.listHeaderCell} style={{ textAlign: "right" }}>
                      Format
                    </div>
                    <div className={styles.listHeaderCell} style={{ textAlign: "right" }}>
                      Rating
                    </div>
                    <div className={styles.listHeaderCell} style={{ textAlign: "right" }}>
                      Duration
                    </div>
                    <div className={styles.listHeaderCell} style={{ textAlign: "right" }}>
                      Size
                    </div>
                  </div>
                  {filteredVideos.map((video) => (
                    <LibraryFilmListRow
                      key={video.id}
                      video={video}
                      isSelected={video.id === filmId}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Resize handle */}
            {isPaneOpen && <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} />}

            {/* Right pane */}
            <div className={styles.rightPane}>
              {isPaneOpen && detailQueryRef && (
                <Suspense fallback={null}>
                  <DetailLoader queryRef={detailQueryRef} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </NovaEventingInterceptor>
    </DevThrowTarget>
  );
};

export default LibraryPage;
