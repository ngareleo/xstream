import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import {
  type FC,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  graphql,
  useLazyLoadQuery,
  useMutation,
  useQueryLoader,
  useSubscription,
} from "react-relay";
import { useSearchParams } from "react-router-dom";

import { useHeaderActionStyles } from "~/components/app-header/AppHeader.styles.js";
import { useHeaderActions } from "~/components/app-shell/AppShell.js";
import { DevThrowTarget } from "~/components/dev-throw-target/DevThrowTarget.js";
import {
  type FilmDetailPaneLinkingChangedData,
  isFilmDetailPaneClosedEvent,
  isFilmDetailPaneLinkingChangedEvent,
} from "~/components/film-detail-pane/FilmDetailPane.events.js";
import {
  type ActiveLibraryChangedData,
  isActiveLibraryChangedEvent,
} from "~/components/library-chips/LibraryChips.events.js";
import { LibraryChips } from "~/components/library-chips/LibraryChips.js";
import {
  type FilmSelectedData,
  isFilmSelectedEvent,
} from "~/components/library-film-list-row/LibraryFilmListRow.events.js";
import { LibraryFilmListRow } from "~/components/library-film-list-row/LibraryFilmListRow.js";
import {
  isSearchChangedEvent,
  isTypeFilterChangedEvent,
  isViewChangedEvent,
  type SearchChangedData,
  type TypeFilter,
  type TypeFilterChangedData,
  type ViewChangedData,
} from "~/components/library-filter-bar/LibraryFilterBar.events.js";
import { LibraryFilterBar } from "~/components/library-filter-bar/LibraryFilterBar.js";
import { LibraryListHeader } from "~/components/library-list-header/LibraryListHeader.js";
import {
  isPosterCardFilmSelectedEvent,
  type PosterCardFilmSelectedData,
} from "~/components/poster-card/PosterCard.events.js";
import { PosterCard } from "~/components/poster-card/PosterCard.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import { IconRefresh } from "~/lib/icons.js";
import {
  FILM_DETAIL_QUERY,
  FilmDetailLoader,
} from "~/pages/film-detail-loader/FilmDetailLoader.js";
import type { FilmDetailLoaderQuery } from "~/relay/__generated__/FilmDetailLoaderQuery.graphql.js";
import type { LibraryPageContentQuery } from "~/relay/__generated__/LibraryPageContentQuery.graphql.js";
import type { LibraryPageContentScanMutation } from "~/relay/__generated__/LibraryPageContentScanMutation.graphql.js";
import type { LibraryPageContentScanSubscription } from "~/relay/__generated__/LibraryPageContentScanSubscription.graphql.js";

import { strings } from "./LibraryPage.strings.js";
import { useLibraryStyles } from "./LibraryPage.styles.js";

const LIBRARY_QUERY = graphql`
  query LibraryPageContentQuery($search: String, $mediaType: MediaType, $libraryId: ID) {
    libraries {
      id
      ...LibraryChips_library
    }
    videos(first: 200, search: $search, mediaType: $mediaType, libraryId: $libraryId) {
      edges {
        node {
          id
          ...PosterCard_video
          ...LibraryFilmListRow_video
        }
      }
    }
  }
`;

const SCAN_MUTATION = graphql`
  mutation LibraryPageContentScanMutation {
    scanLibraries {
      id
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

// ─── LibraryPage ──────────────────────────────────────────────────────────────

const LibraryPage: FC = () => {
  const styles = useLibraryStyles();
  const actionStyles = useHeaderActionStyles();
  const setHeaderActions = useHeaderActions();
  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);
  const [fetchKey, setFetchKey] = useState(0);
  const [, startTransition] = useTransition();
  const wasScanning = useRef(false);
  const [scan, isScanPending] = useMutation<LibraryPageContentScanMutation>(SCAN_MUTATION);

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

  // Inject Scan button into the app header; clear on unmount
  useEffect(() => {
    const handleScan = (): void => {
      if (!isScanPending) scan({ variables: {} });
    };
    setHeaderActions(
      <button
        className={mergeClasses(actionStyles.btn, actionStyles.btnPrimary)}
        onClick={handleScan}
        disabled={isScanPending}
        type="button"
      >
        <IconRefresh size={14} />
        {isScanPending ? strings.scanning : strings.scanAll}
      </button>
    );
    return () => setHeaderActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanPending]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isGrid, setIsGrid] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [detailQueryRef, loadDetailQuery] =
    useQueryLoader<FilmDetailLoaderQuery>(FILM_DETAIL_QUERY);

  // Defer the search string so the UI stays responsive while the user types;
  // the server query only re-fires once the deferred value settles.
  const deferredSearch = useDeferredValue(search);

  const data = useLazyLoadQuery<LibraryPageContentQuery>(
    LIBRARY_QUERY,
    {
      search: deferredSearch || null,
      mediaType: typeFilter !== "all" ? typeFilter : null,
      libraryId: activeLibraryId ?? null,
    },
    { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" }
  );

  const filmId = searchParams.get("film");
  const isPaneOpen = Boolean(filmId);
  const linkingParam = searchParams.get("linking") === "true";

  // Deep-link: if the page loads with a filmId already in the URL, kick off the
  // query immediately so the detail pane has data when it mounts.
  const didInitDetailQuery = useRef(false);
  useEffect(() => {
    if (!didInitDetailQuery.current && filmId) {
      didInitDetailQuery.current = true;
      loadDetailQuery({ videoId: filmId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePane = useCallback((): void => {
    setSearchParams({});
  }, [setSearchParams]);

  const handleSelect = useCallback(
    (id: string): void => {
      if (filmId === id) {
        closePane();
      } else {
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
      if (isFilmSelectedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as FilmSelectedData | undefined;
        if (payload) handleSelect(payload.videoId);
        return undefined;
      }
      if (isActiveLibraryChangedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as ActiveLibraryChangedData | undefined;
        setActiveLibraryId(payload?.libraryId ?? null);
        return undefined;
      }
      if (isSearchChangedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as SearchChangedData | undefined;
        if (payload) setSearch(payload.value);
        return undefined;
      }
      if (isTypeFilterChangedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as TypeFilterChangedData | undefined;
        if (payload) setTypeFilter(payload.value);
        return undefined;
      }
      if (isViewChangedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as ViewChangedData | undefined;
        if (payload) setIsGrid(payload.isGrid);
        return undefined;
      }
      if (isFilmDetailPaneClosedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      if (isFilmDetailPaneLinkingChangedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as FilmDetailPaneLinkingChangedData | undefined;
        if (filmId) {
          const params: Record<string, string> = { film: filmId };
          if (payload?.linking) params.linking = "true";
          setSearchParams(params);
        }
        return undefined;
      }
      return wrapper;
    },
    [handleSelect, closePane, filmId, setSearchParams]
  );

  const videos = data.videos.edges.map((e) => e.node);

  if (data.libraries.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{strings.noLibrariesTitle}</div>
          <div className={styles.emptyBody}>{strings.noLibrariesBody}</div>
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
            typeFilter={typeFilter}
            isGrid={isGrid}
            count={videos.length}
          />

          {/* Library selector chips — only shown when there are multiple libraries */}
          {data.libraries.length > 1 && (
            <LibraryChips libraries={data.libraries} activeLibraryId={activeLibraryId} />
          )}

          {/* Split body */}
          <div
            ref={containerRef}
            className={styles.splitBody}
            style={isPaneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
          >
            <div className={styles.splitLeft}>
              {videos.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyTitle}>{strings.noResultsTitle}</div>
                  <div className={styles.emptyBody}>{strings.noResultsBody}</div>
                </div>
              ) : isGrid ? (
                <div className={styles.gridArea}>
                  <div className={styles.grid}>
                    {videos.map((video) => (
                      <PosterCard key={video.id} video={video} isSelected={video.id === filmId} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.listArea}>
                  <LibraryListHeader />
                  {videos.map((video) => (
                    <LibraryFilmListRow
                      key={video.id}
                      video={video}
                      isSelected={video.id === filmId}
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
                  <FilmDetailLoader queryRef={detailQueryRef} linking={linkingParam} />
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
