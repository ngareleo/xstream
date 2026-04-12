import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import {
  type FC,
  Suspense,
  useCallback,
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
import { useHeaderActions, useProvideLibraries } from "~/components/app-shell/AppShell.js";
import { DashboardHero } from "~/components/dashboard-hero/DashboardHero.js";
import { DevThrowTarget } from "~/components/dev-throw-target/DevThrowTarget.js";
import {
  isEditProfilePaneClosedEvent,
  isEditProfilePaneDeletedEvent,
  isEditProfilePaneSavedEvent,
} from "~/components/edit-profile-pane/EditProfilePane.events.js";
import { EditProfilePaneAsync } from "~/components/edit-profile-pane/EditProfilePaneAsync.js";
import {
  isLibraryIdResolvedEvent,
  type LibraryIdResolvedData,
} from "~/components/film-detail-loader/FilmDetailLoader.events.js";
import {
  FILM_DETAIL_QUERY,
  FilmDetailLoader,
} from "~/components/film-detail-loader/FilmDetailLoader.js";
import {
  type FilmDetailPaneLinkingChangedData,
  isFilmDetailPaneClosedEvent,
  isFilmDetailPaneLinkingChangedEvent,
} from "~/components/film-detail-pane/FilmDetailPane.events.js";
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
import { isProfileClearedEvent } from "~/components/profile-explorer/ProfileExplorer.events.js";
import { ProfileExplorer } from "~/components/profile-explorer/ProfileExplorer.js";
import {
  isProfileRowEditRequestedEvent,
  isProfileRowScanRequestedEvent,
  isProfileRowToggledEvent,
  type ProfileRowEditRequestedData,
  type ProfileRowScanRequestedData,
  type ProfileRowToggledData,
} from "~/components/profile-row/ProfileRow.events.js";
import { useSplitResize } from "~/hooks/useSplitResize.js";
import { IconPlus, IconRefresh } from "~/lib/icons.js";
import type { DashboardPageContentQuery } from "~/relay/__generated__/DashboardPageContentQuery.graphql.js";
import type { DashboardPageContentScanMutation } from "~/relay/__generated__/DashboardPageContentScanMutation.graphql.js";
import type { DashboardPageScanProgressSubscription } from "~/relay/__generated__/DashboardPageScanProgressSubscription.graphql.js";
import type { FilmDetailLoaderQuery } from "~/relay/__generated__/FilmDetailLoaderQuery.graphql.js";

import { strings } from "./DashboardPage.strings.js";
import { useDashboardStyles } from "./DashboardPage.styles.js";

const DASHBOARD_QUERY = graphql`
  query DashboardPageContentQuery {
    libraries {
      id
      name
      stats {
        totalCount
      }
      ...DashboardHero_library
      ...ProfileExplorer_library
      ...EditProfilePane_library
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

const SCAN_PROGRESS_SUBSCRIPTION = graphql`
  subscription DashboardPageScanProgressSubscription {
    libraryScanProgress {
      scanning
      libraryId
      done
      total
    }
  }
`;

// ─── DashboardPage ────────────────────────────────────────────────────────────

const DashboardPage: FC = () => {
  const styles = useDashboardStyles();
  const actionStyles = useHeaderActionStyles();
  const setHeaderActions = useHeaderActions();
  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);
  const [fetchKey, setFetchKey] = useState(0);
  const [, startTransition] = useTransition();
  const wasScanning = useRef(false);
  const data = useLazyLoadQuery<DashboardPageContentQuery>(
    DASHBOARD_QUERY,
    {},
    { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" }
  );
  const [detailQueryRef, loadDetailQuery] =
    useQueryLoader<FilmDetailLoaderQuery>(FILM_DETAIL_QUERY);

  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [scanningLibraryId, setScanningLibraryId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  const scanProgressConfig = useMemo(
    () => ({
      subscription: SCAN_PROGRESS_SUBSCRIPTION,
      variables: {},
      onNext: (response: DashboardPageScanProgressSubscription["response"] | null | undefined) => {
        const progress = response?.libraryScanProgress;
        if (!progress) return;
        const nowScanning = Boolean(progress.scanning);
        if (nowScanning) {
          setScanningLibraryId(progress.libraryId ?? null);
          if (progress.done != null && progress.total != null) {
            setScanProgress({ done: progress.done, total: progress.total });
          }
        } else {
          setScanningLibraryId(null);
          setScanProgress(null);
          if (wasScanning.current) {
            startTransition(() => setFetchKey((k) => k + 1));
          }
        }
        wasScanning.current = nowScanning;
      },
      onError: () => {},
    }),
    []
  );

  useSubscription<DashboardPageScanProgressSubscription>(scanProgressConfig);

  const paneParam = searchParams.get("pane");
  const filmIdParam = searchParams.get("filmId");
  const libraryIdParam = searchParams.get("libraryId");
  const linkingParam = searchParams.get("linking") === "true";

  // Deep-link: if the page loads with a filmId already in the URL, kick off the
  // query immediately so the detail pane has data when it mounts.
  const didInitDetailQuery = useRef(false);
  useEffect(() => {
    if (!didInitDetailQuery.current && filmIdParam) {
      didInitDetailQuery.current = true;
      loadDetailQuery({ videoId: filmIdParam });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPaneFilmDetail = paneParam === "film-detail" && Boolean(filmIdParam);
  const isPaneNewProfile = paneParam === "new-profile";
  const isPaneEditProfile = paneParam === "edit-profile";
  const isPaneOpen = isPaneFilmDetail || isPaneNewProfile || isPaneEditProfile;

  // Push library list to sidebar context so ProfileMenu can show real names
  const libraryInfos = useMemo(
    () => data.libraries.map((l) => ({ id: l.id, name: l.name, fileCount: l.stats.totalCount })),
    [data.libraries]
  );
  useProvideLibraries(libraryInfos);

  // Auto-expand a library when navigated from profile menu (/?libraryId=xxx)
  useEffect(() => {
    if (libraryIdParam && !isPaneEditProfile) {
      setExpandedId(libraryIdParam);
    }
  }, [libraryIdParam, isPaneEditProfile]);

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
        // Switching films always resets linking state
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
      if (isProfileRowScanRequestedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as ProfileRowScanRequestedData | undefined;
        if (payload && !isScanPending) {
          scan({ variables: {} });
        }
        return undefined;
      }
      if (isProfileRowEditRequestedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as ProfileRowEditRequestedData | undefined;
        if (payload) {
          setSearchParams({ pane: "edit-profile", libraryId: payload.libraryId });
        }
        return undefined;
      }
      if (isFilmRowEvent(wrapper) && wrapper.event.type === FilmRowEventTypes.FILM_SELECTED) {
        const payload = wrapper.event.data?.() as FilmSelectedData | undefined;
        if (payload) openFilmDetail(payload.videoId);
        return undefined;
      }
      if (isLibraryIdResolvedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as LibraryIdResolvedData | undefined;
        if (payload) setExpandedId((prev) => prev ?? payload.libraryId);
        return undefined;
      }
      if (isProfileClearedEvent(wrapper)) {
        setSearchParams({});
        return undefined;
      }
      if (isFilmDetailPaneClosedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      if (isFilmDetailPaneLinkingChangedEvent(wrapper)) {
        const payload = wrapper.event.data?.() as FilmDetailPaneLinkingChangedData | undefined;
        if (filmIdParam) {
          const params: Record<string, string> = { pane: "film-detail", filmId: filmIdParam };
          if (payload?.linking) params.linking = "true";
          setSearchParams(params);
        }
        return undefined;
      }
      if (isNewProfilePaneClosedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      if (isNewProfilePaneLibraryCreatedEvent(wrapper)) {
        // Refetch immediately so the new library row appears, then explicitly
        // kick off a scan so the subscription picks it up and triggers a
        // second refetch when videos are discovered.
        startTransition(() => setFetchKey((k) => k + 1));
        scan({ variables: {} });
        closePane();
        return undefined;
      }
      if (isEditProfilePaneClosedEvent(wrapper) || isEditProfilePaneSavedEvent(wrapper)) {
        closePane();
        return undefined;
      }
      if (isEditProfilePaneDeletedEvent(wrapper)) {
        // Refetch so the deleted library disappears without corrupting the store
        startTransition(() => setFetchKey((k) => k + 1));
        closePane();
        return undefined;
      }
      return wrapper;
    },
    [openFilmDetail, closePane, isScanPending, scan, setSearchParams, filmIdParam]
  );

  if (data.libraries.length === 0) {
    return (
      <DevThrowTarget id="Dashboard">
        <div className={styles.pageRoot}>
          <NovaEventingInterceptor interceptor={interceptor}>
            <div
              ref={containerRef}
              className={styles.splitBody}
              style={
                isPaneNewProfile ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined
              }
            >
              <div className={styles.emptyRoot}>
                <div className={styles.emptyWatermark}>LIBRARY</div>
                <div className={styles.emptyContent}>
                  <div className={styles.emptyHeadline}>
                    <span className={styles.emptyHeadlineWhite}>YOUR COLLECTION</span>
                    <span className={styles.emptyHeadlineRed}>STARTS HERE.</span>
                  </div>
                  <div className={styles.emptyRule} />
                  <p className={styles.emptyBody}>{strings.emptyBody}</p>
                  <button className={styles.emptyBtn} onClick={openNewProfile} type="button">
                    {strings.emptyBtn}
                  </button>
                </div>
              </div>
              {isPaneNewProfile && (
                <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} />
              )}
              <div className={styles.rightPane}>
                {isPaneNewProfile && (
                  <Suspense fallback={null}>
                    <NewProfilePaneAsync />
                  </Suspense>
                )}
              </div>
            </div>
          </NovaEventingInterceptor>
        </div>
      </DevThrowTarget>
    );
  }

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
              <ProfileExplorer
                libraries={data.libraries}
                expandedId={expandedId}
                isPaneFilmDetail={isPaneFilmDetail}
                isPaneOpen={isPaneOpen}
                selectedFilmId={filmIdParam}
                scanningLibraryId={scanningLibraryId}
                scanProgress={scanProgress}
                activeProfileName={
                  libraryIdParam && !isPaneEditProfile
                    ? (data.libraries.find((l) => l.id === libraryIdParam)?.name ?? null)
                    : null
                }
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
                  <FilmDetailLoader
                    key={filmIdParam}
                    queryRef={detailQueryRef}
                    linking={linkingParam}
                  />
                </Suspense>
              )}
              {isPaneEditProfile &&
                libraryIdParam &&
                (() => {
                  const lib = data.libraries.find((l) => l.id === libraryIdParam);
                  return lib ? (
                    <Suspense fallback={null}>
                      <EditProfilePaneAsync library={lib} />
                    </Suspense>
                  ) : null;
                })()}
            </div>
          </div>
        </NovaEventingInterceptor>
      </div>
    </DevThrowTarget>
  );
};

export default DashboardPage;
