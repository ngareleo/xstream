import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { type FC, Suspense, useCallback, useEffect, useState } from "react";
import { graphql, useLazyLoadQuery, useMutation, useQueryLoader } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { useHeaderActionStyles } from "~/components/app-header/AppHeader.styles.js";
import { useHeaderActions } from "~/components/app-shell/AppShell.js";
import { DashboardHero } from "~/components/dashboard-hero/DashboardHero.js";
import { DashboardLibraryList } from "~/components/dashboard-library-list/DashboardLibraryList.js";
import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import {
  FILM_DETAIL_QUERY,
  FilmDetailLoader,
} from "~/components/film-detail-pane/FilmDetailLoader.js";
import { isFilmDetailPaneClosedEvent } from "~/components/film-detail-pane/FilmDetailPane.events.js";
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
import { useSplitResize } from "~/hooks/useSplitResize.js";
import { IconPlus, IconRefresh } from "~/lib/icons.js";
import type { DashboardPageContentQuery } from "~/relay/__generated__/DashboardPageContentQuery.graphql.js";
import type { DashboardPageContentScanMutation } from "~/relay/__generated__/DashboardPageContentScanMutation.graphql.js";
import type { FilmDetailLoaderQuery } from "~/relay/__generated__/FilmDetailLoaderQuery.graphql.js";

import { strings } from "./DashboardPage.strings.js";
import { useDashboardStyles } from "./DashboardPage.styles.js";

const DASHBOARD_QUERY = graphql`
  query DashboardPageContentQuery {
    libraries {
      id
      ...DashboardHero_library
      ...DashboardLibraryList_library
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

// ─── DashboardPage ────────────────────────────────────────────────────────────

const DashboardPage: FC = () => {
  const styles = useDashboardStyles();
  const actionStyles = useHeaderActionStyles();
  const setHeaderActions = useHeaderActions();
  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);
  const data = useLazyLoadQuery<DashboardPageContentQuery>(DASHBOARD_QUERY, {});
  const [detailQueryRef, loadDetailQuery] =
    useQueryLoader<FilmDetailLoaderQuery>(FILM_DETAIL_QUERY);

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
        // Kick off the network request immediately, before the URL update causes
        // DetailLoader to mount — avoids a wasted render cycle before fetching.
        loadDetailQuery({ videoId: id });
        setSearchParams({ pane: "film-detail", filmId: id });
      }
    },
    [isPaneFilmDetail, filmIdParam, closePane, loadDetailQuery, setSearchParams]
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
          {isScanPending ? strings.scanning : strings.scanAll}
        </button>
        <div className={actionStyles.sep}>
          <div className={actionStyles.sepLine} />
        </div>
        <button
          className={mergeClasses(actionStyles.btn, actionStyles.btnPrimary)}
          onClick={openNewProfile}
          type="button"
        >
          <IconPlus size={14} />
          {strings.newProfile}
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

  return (
    <DevThrowTarget id="Dashboard">
      <div className={styles.pageRoot}>
        <NovaEventingInterceptor interceptor={interceptor}>
          <div
            ref={containerRef}
            className={styles.splitBody}
            style={isPaneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
          >
            {/* Left column */}
            <div className={styles.splitLeft}>
              <DashboardHero libraries={data.libraries} />
              <DashboardLibraryList
                libraries={data.libraries}
                expandedId={expandedId}
                isPaneFilmDetail={isPaneFilmDetail}
                selectedFilmId={filmIdParam}
              />
            </div>

            {/* Resize handle */}
            {isPaneOpen && <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} />}

            {/* Right pane */}
            <div className={styles.rightPane}>
              {isPaneNewProfile && (
                <Suspense fallback={null}>
                  <NewProfilePaneAsync />
                </Suspense>
              )}
              {isPaneFilmDetail && detailQueryRef && (
                <Suspense fallback={null}>
                  <FilmDetailLoader queryRef={detailQueryRef} />
                </Suspense>
              )}
            </div>
          </div>
        </NovaEventingInterceptor>
      </div>
    </DevThrowTarget>
  );
};

export default DashboardPage;
