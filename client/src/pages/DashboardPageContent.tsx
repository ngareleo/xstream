import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, Suspense, useCallback, useEffect, useState } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { useHeaderActionStyles } from "~/components/app-header/AppHeader.styles.js";
import { useHeaderActions } from "~/components/app-shell/AppShell.js";
import { isFilmDetailPaneClosedEvent } from "~/components/film-detail-pane/FilmDetailPane.events.js";
import { FilmDetailPaneAsync } from "~/components/film-detail-pane/FilmDetailPaneAsync.js";
import {
  FilmRowEventTypes,
  type FilmSelectedData,
  isFilmRowEvent,
} from "~/components/film-row/FilmRow.events.js";
import {
  isNewProfilePaneClosedEvent,
  isNewProfilePaneLibraryCreatedEvent,
} from "~/components/new-profile-pane/NewProfilePane.events.js";
import { NewProfilePaneAsync } from "~/components/new-profile-pane/NewProfilePaneAsync.js";
import {
  isProfileRowToggledEvent,
  type ProfileRowToggledData,
} from "~/components/profile-row/ProfileRow.events.js";
import { ProfileRow } from "~/components/profile-row/ProfileRow.js";
import { Slideshow } from "~/components/slideshow/Slideshow.js";
import { IconPlus, IconRefresh } from "~/lib/icons.js";
import type { DashboardPageContentDetailQuery } from "~/relay/__generated__/DashboardPageContentDetailQuery.graphql.js";
import type { DashboardPageContentQuery } from "~/relay/__generated__/DashboardPageContentQuery.graphql.js";
import type { DashboardPageContentScanMutation } from "~/relay/__generated__/DashboardPageContentScanMutation.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import { useDashboardStyles } from "./DashboardPage.styles.js";

const DASHBOARD_QUERY = graphql`
  query DashboardPageContentQuery {
    libraries {
      id
      stats {
        totalCount
        totalSizeBytes
      }
      ...ProfileRow_library
    }
  }
`;

const DETAIL_VIDEO_QUERY = graphql`
  query DashboardPageContentDetailQuery($videoId: ID!) {
    video(id: $videoId) {
      ...FilmDetailPane_video
    }
  }
`;

const SCAN_MUTATION = graphql`
  mutation DashboardPageContentScanMutation {
    scanLibraries {
      id
    }
  }
`;

// ─── Detail pane loader ───────────────────────────────────────────────────────

interface DetailLoaderProps {
  filmId: string;
}

const DetailLoader: FC<DetailLoaderProps> = ({ filmId }) => {
  const data = useLazyLoadQuery<DashboardPageContentDetailQuery>(DETAIL_VIDEO_QUERY, {
    videoId: filmId,
  });
  if (!data.video) return null;
  return <FilmDetailPaneAsync video={data.video} />;
};

// ─── Main component ───────────────────────────────────────────────────────────

export const DashboardPageContent: FC = () => {
  const styles = useDashboardStyles();
  const actionStyles = useHeaderActionStyles();
  const setHeaderActions = useHeaderActions();
  const data = useLazyLoadQuery<DashboardPageContentQuery>(DASHBOARD_QUERY, {});

  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const paneParam = searchParams.get("pane");
  const filmIdParam = searchParams.get("filmId");

  const isPaneFilmDetail = paneParam === "film-detail" && Boolean(filmIdParam);
  const isPaneNewProfile = paneParam === "new-profile";
  const isPaneOpen = isPaneFilmDetail || isPaneNewProfile;

  const openNewProfile = (): void => {
    setSearchParams({ pane: "new-profile" });
  };

  const closePane = useCallback((): void => {
    setSearchParams({});
  }, [setSearchParams]);

  const openFilmDetail = useCallback(
    (id: string): void => {
      if (isPaneFilmDetail && filmIdParam === id) {
        closePane();
      } else {
        setSearchParams({ pane: "film-detail", filmId: id });
      }
    },
    [isPaneFilmDetail, filmIdParam, closePane, setSearchParams]
  );

  const [scan, isScanPending] = useMutation<DashboardPageContentScanMutation>(SCAN_MUTATION);

  const handleScanAll = (): void => {
    if (isScanPending) return;
    scan({ variables: {} });
  };

  // Inject page-specific action buttons into the app header
  useEffect(() => {
    setHeaderActions(
      <>
        <button
          className={actionStyles.btn}
          onClick={handleScanAll}
          disabled={isScanPending}
          type="button"
        >
          <IconRefresh size={14} />
          {isScanPending ? "Scanning…" : "Scan All"}
        </button>
        <div className={actionStyles.sep} />
        <button
          className={mergeClasses(actionStyles.btn, actionStyles.btnPrimary)}
          onClick={openNewProfile}
          type="button"
        >
          <IconPlus size={14} />
          New Profile
        </button>
      </>
    );
    return () => setHeaderActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanPending]);

  const interceptor = useCallback(
    async (wrapper: EventWrapper): Promise<EventWrapper | undefined> => {
      if (isProfileRowToggledEvent(wrapper)) {
        const payload = wrapper.event.data?.() as ProfileRowToggledData | undefined;
        if (payload)
          setExpandedId((prev) => (prev === payload.libraryId ? null : payload.libraryId));
        return undefined;
      }
      if (isFilmRowEvent(wrapper) && wrapper.event.type === FilmRowEventTypes.FILM_SELECTED) {
        const payload = wrapper.event.data?.() as FilmSelectedData | undefined;
        if (payload) openFilmDetail(payload.videoId);
        return undefined;
      }
      if (isFilmDetailPaneClosedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      if (isNewProfilePaneClosedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      if (isNewProfilePaneLibraryCreatedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      return wrapper;
    },
    [openFilmDetail, closePane]
  );

  const totalFiles = data.libraries.reduce((s, l) => s + l.stats.totalCount, 0);
  const totalBytes = data.libraries.reduce((s, l) => s + l.stats.totalSizeBytes, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <NovaEventingInterceptor interceptor={interceptor}>
        <div className={mergeClasses(styles.splitBody, isPaneOpen && styles.splitBodyPaneOpen)}>
          {/* Left column */}
          <div className={styles.splitLeft}>
            {/* Hero */}
            <div className={styles.hero}>
              <Slideshow />
              <div className={styles.greeting}>
                <div className={styles.greetingText}>
                  Your <span className={styles.greetingName}>Library</span>
                </div>
                <div className={styles.greetingSub}>
                  {totalFiles} files · {formatFileSize(totalBytes)}
                </div>
              </div>
            </div>

            {/* Location bar */}
            <div className={styles.locationBar}>
              <span
                style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}
              >
                Profiles
              </span>
              <span className={styles.locSep}>/</span>
              <span className={styles.locCurrent}>All Libraries</span>
            </div>

            {/* Column headers */}
            <div className={styles.dirHeader}>
              <div />
              <div className={styles.dirCol}>Name</div>
              <div className={styles.dirCol}>Count</div>
              <div className={styles.dirCol}>Match</div>
              <div className={styles.dirCol}>Size</div>
              <div className={styles.dirCol}>Actions</div>
            </div>

            {/* Library rows */}
            <div className={styles.dirList}>
              {data.libraries.map((lib) => (
                <ProfileRow
                  key={lib.id}
                  library={lib}
                  expanded={expandedId === lib.id}
                  selected={isPaneFilmDetail}
                  selectedFilmId={filmIdParam}
                />
              ))}
            </div>

            {/* Footer */}
            <div className={styles.dirFooter}>
              <span className={styles.dirFooterStat}>
                Libraries <span className={styles.dirFooterStatNum}>{data.libraries.length}</span>
              </span>
              <span className={styles.dirFooterStat}>
                Files <span className={styles.dirFooterStatNum}>{totalFiles}</span>
              </span>
              <span className={styles.dirFooterStat}>
                Total <span className={styles.dirFooterStatNum}>{formatFileSize(totalBytes)}</span>
              </span>
            </div>
          </div>

          {/* Right pane */}
          <div className={styles.rightPane}>
            {isPaneNewProfile && (
              <Suspense fallback={null}>
                <NewProfilePaneAsync />
              </Suspense>
            )}
            {isPaneFilmDetail && filmIdParam && (
              <Suspense fallback={null}>
                <DetailLoader filmId={filmIdParam} />
              </Suspense>
            )}
          </div>
        </div>
      </NovaEventingInterceptor>
    </div>
  );
};
