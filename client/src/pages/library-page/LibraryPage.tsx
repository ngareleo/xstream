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
import {
  graphql,
  type PreloadedQuery,
  useLazyLoadQuery,
  usePreloadedQuery,
  useQueryLoader,
  useSubscription,
} from "react-relay";
import { Link, useSearchParams } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { isFilmDetailPaneClosedEvent } from "~/components/film-detail-pane/FilmDetailPane.events.js";
import { FilmDetailPaneAsync } from "~/components/film-detail-pane/FilmDetailPaneAsync.js";
import {
  isPosterCardFilmSelectedEvent,
  type PosterCardFilmSelectedData,
} from "~/components/poster-card/PosterCard.events.js";
import { PosterCard } from "~/components/poster-card/PosterCard.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import { IconBars, IconPlay, IconSquares } from "~/lib/icons.js";
import type { LibraryPageContentDetailQuery } from "~/relay/__generated__/LibraryPageContentDetailQuery.graphql.js";
import type { LibraryPageContentQuery } from "~/relay/__generated__/LibraryPageContentQuery.graphql.js";
import type { LibraryPageContentScanSubscription } from "~/relay/__generated__/LibraryPageContentScanSubscription.graphql.js";
import { formatDuration, formatFileSize } from "~/utils/formatters.js";

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
            mediaType
            durationSeconds
            fileSizeBytes
            metadata {
              year
              genre
              rating
              posterUrl
            }
            videoStream {
              height
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

// ─── FilmListRow ──────────────────────────────────────────────────────────────

interface FilmListRowProps {
  id: string;
  title: string;
  matched: boolean;
  durationSeconds: number;
  fileSizeBytes: number;
  height: number | null;
  posterUrl: string | null;
  year: number | null;
  genre: string | null;
  rating: number | null;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const FilmListRow: FC<FilmListRowProps> = ({
  id,
  title,
  matched,
  durationSeconds,
  fileSizeBytes,
  height,
  posterUrl,
  year,
  genre,
  rating,
  isSelected,
  onSelect,
}) => {
  const styles = useLibraryStyles();
  const is4k = (height ?? 0) >= 2160;
  const thumbStyle = posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined;

  return (
    <div
      className={mergeClasses(styles.listRow, isSelected && styles.listRowSelected)}
      onClick={() => onSelect(id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(id);
      }}
    >
      <div className={styles.listThumb} style={thumbStyle} />
      <div className={styles.listInfo}>
        <div className={styles.listTitle}>{title}</div>
        {(year ?? genre) && (
          <div className={styles.listMeta}>{[year, genre].filter(Boolean).join(" · ")}</div>
        )}
      </div>
      <div className={styles.listCell}>{is4k ? "4K" : "HD"}</div>
      <div className={styles.listCell}>{rating != null ? `★ ${rating.toFixed(1)}` : "—"}</div>
      <div className={styles.listCell}>{formatDuration(durationSeconds)}</div>
      <div className={styles.listCell}>
        {matched ? (
          <Link
            to={`/player/${id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: "inherit",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <IconPlay size={9} />
            {formatFileSize(fileSizeBytes)}
          </Link>
        ) : (
          formatFileSize(fileSizeBytes)
        )}
      </div>
    </div>
  );
};

// ─── LibraryPage ──────────────────────────────────────────────────────────────

type TypeFilter = "all" | "MOVIES" | "TV_SHOWS";

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

  const data = useLazyLoadQuery<LibraryPageContentQuery>(
    LIBRARY_QUERY,
    {},
    { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" }
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isGrid, setIsGrid] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [detailQueryRef, loadDetailQuery] =
    useQueryLoader<LibraryPageContentDetailQuery>(DETAIL_VIDEO_QUERY);

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

  // Collect all videos across libraries (or from selected library)
  const allVideos = useMemo(() => {
    if (activeLibraryId) {
      const lib = data.libraries.find((l) => l.id === activeLibraryId);
      return lib ? lib.videos.edges.map((e) => e.node) : [];
    }
    return data.libraries.flatMap((l) => l.videos.edges.map((e) => e.node));
  }, [data.libraries, activeLibraryId]);

  const filteredVideos = useMemo(() => {
    const q = search.toLowerCase();
    return allVideos.filter((v) => {
      if (typeFilter !== "all" && v.mediaType !== typeFilter) return false;
      if (
        q &&
        !v.title.toLowerCase().includes(q) &&
        !(v.metadata?.genre ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [allVideos, search, typeFilter]);

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
          {/* Filter bar */}
          <div className={styles.filterBar}>
            <input
              className={styles.searchInput}
              placeholder="Search titles, genres…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.filterSep} />
            <select
              className={styles.filterSelect}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            >
              <option value="all">All Types</option>
              <option value="MOVIES">Movies</option>
              <option value="TV_SHOWS">TV Shows</option>
            </select>
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

          {/* Profile chips */}
          {data.libraries.length > 1 && (
            <div className={styles.profileChips}>
              <button
                className={mergeClasses(styles.chip, activeLibraryId === null && styles.chipActive)}
                onClick={() => setActiveLibraryId(null)}
                type="button"
              >
                All
                <span className={styles.chipCount}>
                  {data.libraries.reduce((s, l) => s + l.videos.totalCount, 0)}
                </span>
              </button>
              {data.libraries.map((lib) => (
                <button
                  key={lib.id}
                  className={mergeClasses(
                    styles.chip,
                    lib.id === activeLibraryId && styles.chipActive
                  )}
                  onClick={() => setActiveLibraryId(lib.id === activeLibraryId ? null : lib.id)}
                  type="button"
                >
                  {lib.name}
                  <span className={styles.chipCount}>{lib.videos.totalCount}</span>
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
                    <FilmListRow
                      key={video.id}
                      id={video.id}
                      title={video.title}
                      matched={video.matched}
                      durationSeconds={video.durationSeconds}
                      fileSizeBytes={video.fileSizeBytes}
                      height={video.videoStream?.height ?? null}
                      posterUrl={video.metadata?.posterUrl ?? null}
                      year={video.metadata?.year ?? null}
                      genre={video.metadata?.genre ?? null}
                      rating={video.metadata?.rating ?? null}
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
