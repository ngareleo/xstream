import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor, useNovaEventing } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { type FC, useCallback } from "react";
import { graphql, useFragment, useMutation } from "react-relay";
import { Link } from "react-router-dom";

import { isLinkSearchCancelledEvent } from "~/components/link-search/LinkSearch.events.js";
import { LinkSearch } from "~/components/link-search/LinkSearch.js";
import {
  isSuggestionSelectedEvent,
  type SuggestionSelectedData,
} from "~/components/search-suggestion-card/SearchSuggestionCard.events.js";
import { IconClose, IconEdit, IconPlay } from "~/lib/icons.js";
import type { FilmDetailPane_video$key } from "~/relay/__generated__/FilmDetailPane_video.graphql.js";
import type { FilmDetailPaneMatchMutation } from "~/relay/__generated__/FilmDetailPaneMatchMutation.graphql.js";
import type { FilmDetailPaneUnmatchMutation } from "~/relay/__generated__/FilmDetailPaneUnmatchMutation.graphql.js";
import { formatDuration, formatFileSize, upgradePosterUrl } from "~/utils/formatters.js";

import {
  createFilmDetailPaneClosedEvent,
  createFilmDetailPaneLinkingChangedEvent,
} from "./FilmDetailPane.events.js";
import { strings } from "./FilmDetailPane.strings.js";
import { useFilmDetailPaneStyles } from "./FilmDetailPane.styles.js";

const MATCH_MUTATION = graphql`
  mutation FilmDetailPaneMatchMutation($videoId: ID!, $imdbId: String!) {
    matchVideo(videoId: $videoId, imdbId: $imdbId) {
      id
      matched
      metadata {
        imdbId
        title
        year
        genre
        director
        cast
        rating
        plot
        posterUrl
      }
    }
  }
`;

const UNMATCH_MUTATION = graphql`
  mutation FilmDetailPaneUnmatchMutation($videoId: ID!) {
    unmatchVideo(videoId: $videoId) {
      id
      matched
      metadata {
        imdbId
        title
        year
        genre
        director
        cast
        rating
        plot
        posterUrl
      }
    }
  }
`;

const DETAIL_FRAGMENT = graphql`
  fragment FilmDetailPane_video on Video {
    id
    title
    filename
    durationSeconds
    fileSizeBytes
    bitrate
    matched
    mediaType
    metadata {
      imdbId
      title
      year
      genre
      director
      cast
      rating
      plot
      posterUrl
    }
    videoStream {
      codec
      width
      height
      fps
    }
    audioStream {
      codec
      channels
      sampleRate
    }
  }
`;

interface Props {
  video: FilmDetailPane_video$key;
  linking?: boolean;
}

export const FilmDetailPane: FC<Props> = ({ video, linking = false }) => {
  const data = useFragment(DETAIL_FRAGMENT, video);
  const styles = useFilmDetailPaneStyles();
  const { bubble, generateEvent } = useNovaEventing();
  const [commitMatch] = useMutation<FilmDetailPaneMatchMutation>(MATCH_MUTATION);
  const [commitUnmatch] = useMutation<FilmDetailPaneUnmatchMutation>(UNMATCH_MUTATION);

  const handleUnlink = (): void => {
    commitUnmatch({ variables: { videoId: data.id } });
  };

  const linkSearchInterceptor = useCallback(
    async (wrapper: EventWrapper): Promise<EventWrapper | undefined> => {
      if (isSuggestionSelectedEvent(wrapper) && wrapper.event.data) {
        const suggestion = wrapper.event.data() as SuggestionSelectedData;
        void generateEvent({ event: createFilmDetailPaneLinkingChangedEvent(false) });
        commitMatch({ variables: { videoId: data.id, imdbId: suggestion.imdbId } });
        return undefined;
      }
      if (isLinkSearchCancelledEvent(wrapper)) {
        void generateEvent({ event: createFilmDetailPaneLinkingChangedEvent(false) });
        return undefined;
      }
      return wrapper;
    },
    [generateEvent, commitMatch, data.id]
  );

  const meta = data.metadata;
  const vs = data.videoStream;
  const as = data.audioStream;

  const displayTitle = meta?.title ?? data.title;
  const subLine = [meta?.year, meta?.genre].filter(Boolean).join(" · ");
  const isHd = (vs?.height ?? 0) >= 2160;

  const posterStyle = meta?.posterUrl
    ? {
        backgroundImage: `url(${upgradePosterUrl(meta.posterUrl)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: "linear-gradient(135deg, #1a0a0a 0%, #2d0d10 50%, #0f0f0f 100%)" };

  return (
    <div className={styles.root}>
      {/* Poster area */}
      <div className={styles.posterArea} style={posterStyle}>
        <div className={styles.posterOverlay} />
        <div className={styles.posterFade} />

        {/* Action bar */}
        <div className={styles.actionBar}>
          <Link
            to={`/player/${data.id}`}
            className={mergeClasses(styles.actionBtn, styles.actionBtnPrimary)}
          >
            <IconPlay size={10} />
            {strings.play}
          </Link>
          <div className={styles.actionSep}>
            <div className={styles.actionSepLine} />
          </div>
          <button
            className={mergeClasses(styles.actionBtn, linking && styles.actionBtnActive)}
            onClick={(e) =>
              void bubble({
                reactEvent: e,
                event: createFilmDetailPaneLinkingChangedEvent(!linking),
              })
            }
          >
            <IconEdit size={10} />
            {data.matched ? strings.reLink : strings.link}
          </button>
          {data.matched && (
            <>
              <div className={styles.actionSep}>
                <div className={styles.actionSepLine} />
              </div>
              <button
                className={mergeClasses(styles.actionBtn, styles.actionBtnDanger)}
                onClick={handleUnlink}
              >
                {strings.unlink}
              </button>
            </>
          )}
          <div className={styles.actionSpacer} />
          <button
            className={styles.closeBtn}
            onClick={(e) =>
              void bubble({ reactEvent: e, event: createFilmDetailPaneClosedEvent() })
            }
            title={strings.close}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Title/meta over poster */}
        <div className={styles.posterMeta}>
          <div className={styles.posterTitle}>{displayTitle}</div>
          {subLine ? <div className={styles.posterSub}>{subLine}</div> : null}
        </div>
      </div>

      {/* Body — switches between detail view and link search */}
      {linking ? (
        <NovaEventingInterceptor interceptor={linkSearchInterceptor}>
          <LinkSearch filename={data.filename} />
        </NovaEventingInterceptor>
      ) : null}
      <div className={styles.body} style={linking ? { display: "none" } : undefined}>
        {meta ? (
          <>
            {/* Badges row */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{strings.sectionDetails}</div>
              <div className={styles.badgesRow}>
                {isHd && (
                  <span className={mergeClasses(styles.badge, styles.badgeRed)}>
                    {strings.badge4K}
                  </span>
                )}
                {vs && !isHd && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>
                    {strings.badgeHD}
                  </span>
                )}
                {data.mediaType === "MOVIES" && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>
                    {strings.badgeMovie}
                  </span>
                )}
                {data.mediaType === "TV_SHOWS" && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>
                    {strings.badgeTV}
                  </span>
                )}
                {vs?.codec && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>
                    {vs.codec.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* IMDb rating */}
            {meta.rating != null && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{strings.sectionRating}</div>
                <div className={styles.ratingRow}>
                  <span className={styles.ratingNum}>★ {meta.rating.toFixed(1)}</span>
                  <span className={styles.ratingLabel}>{strings.ratingProvider}</span>
                </div>
              </div>
            )}

            {/* Plot */}
            {meta.plot && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{strings.sectionSynopsis}</div>
                <div className={styles.plot}>{meta.plot}</div>
              </div>
            )}

            {/* Cast */}
            {meta.cast.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{strings.sectionCast}</div>
                <div className={styles.castChips}>
                  {meta.cast.map((name) => (
                    <span key={name} className={styles.castChip}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* File info */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{strings.sectionFile}</div>
              {vs && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>{strings.infoResolution}</span>
                  <span className={styles.infoVal}>
                    {vs.width}×{vs.height}
                  </span>
                </div>
              )}
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>{strings.infoDuration}</span>
                <span className={styles.infoVal}>{formatDuration(data.durationSeconds)}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>{strings.infoSize}</span>
                <span className={styles.infoVal}>{formatFileSize(data.fileSizeBytes)}</span>
              </div>
              {as && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>{strings.infoAudio}</span>
                  <span className={styles.infoVal}>
                    {as.codec.toUpperCase()} {as.channels}ch
                  </span>
                </div>
              )}
              {meta.director && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>{strings.infoDirector}</span>
                  <span className={styles.infoVal}>{meta.director}</span>
                </div>
              )}
              {meta.imdbId && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>{strings.infoImdb}</span>
                  <span className={styles.infoVal}>{meta.imdbId}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyMeta}>
            <div>{strings.noMetadata}</div>
            <div style={{ marginTop: 6 }}>{strings.noMetadataHelp}</div>
          </div>
        )}
      </div>
    </div>
  );
};
