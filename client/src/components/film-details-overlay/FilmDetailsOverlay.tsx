import { mergeClasses } from "@griffel/react";
import { type FC, useMemo, useRef, useState } from "react";
import { graphql, useFragment } from "react-relay";
import { useNavigate } from "react-router-dom";

import { FilmTile } from "~/components/film-tile/FilmTile";
import { type FilmVariantOption, FilmVariants } from "~/components/film-variants/FilmVariants";
import { Poster } from "~/components/poster/Poster";
import { PosterRow } from "~/components/poster-row/PosterRow";
import { SeasonsPanel } from "~/components/seasons-panel/SeasonsPanel";
import { IconClose, IconPlay, ImdbBadge } from "~/lib/icons";
import type { FilmDetailsOverlay_video$key } from "~/relay/__generated__/FilmDetailsOverlay_video.graphql";
import type { FilmTile_video$key } from "~/relay/__generated__/FilmTile_video.graphql";
import { formatDurationHuman } from "~/utils/formatters";
import { withViewTransition } from "~/utils/viewTransition";

import { strings } from "./FilmDetailsOverlay.strings";
import { useFilmDetailsOverlayStyles } from "./FilmDetailsOverlay.styles";

/** Fields required by FilmVariants picker; sourced from Film.copies. */
export interface OverlayCopy {
  readonly id: string;
  readonly filename: string;
  readonly nativeResolution: string | null | undefined;
  readonly fileSizeBytes: number;
  readonly bitrate: number;
  readonly videoStream: { readonly codec: string } | null | undefined;
}

const OVERLAY_FRAGMENT = graphql`
  fragment FilmDetailsOverlay_video on Video {
    id
    title
    filename
    mediaType
    durationSeconds
    nativeResolution
    metadata {
      title
      year
      genre
      director
      plot
      rating
      posterUrl
    }
    videoStream {
      codec
    }
    show {
      seasons {
        episodes {
          onDisk
        }
      }
    }
    ...SeasonsPanel_video
  }
`;

interface FilmDetailsOverlayProps {
  video: FilmDetailsOverlay_video$key;
  /** All main copies of the Film (movies only); drives FilmVariants picker. */
  copies?: ReadonlyArray<OverlayCopy>;
  suggestions?: ReadonlyArray<FilmTile_video$key>;
  onClose: () => void;
  onSelectSuggestion?: (id: string) => void;
}

const RESOLUTION_DISPLAY: Record<string, string> = {
  "4k": "4K",
  "1080p": "1080p",
  "720p": "720p",
  "480p": "480p",
  "360p": "360p",
  "240p": "240p",
};

const RESOLUTION_LABEL: Record<string, string> = {
  RESOLUTION_4K: "4K",
  RESOLUTION_1080P: "1080p",
  RESOLUTION_720P: "720p",
  RESOLUTION_480P: "480p",
  RESOLUTION_360P: "360p",
  RESOLUTION_240P: "240p",
};

export const FilmDetailsOverlay: FC<FilmDetailsOverlayProps> = ({
  video,
  copies,
  suggestions = [],
  onClose,
  onSelectSuggestion,
}) => {
  const data = useFragment(OVERLAY_FRAGMENT, video);
  const styles = useFilmDetailsOverlayStyles();
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isSeries = data.mediaType === "TV_SHOWS";
  const sanitisedTitle = data.metadata?.title ?? data.title;
  const altText = sanitisedTitle || data.filename;
  const titleText = sanitisedTitle || strings.unmatched;
  // Variant selection; switching retargets play CTA only, not Film-level metadata.
  const [selectedCopyId, setSelectedCopyId] = useState<string>(data.id);
  const variantOptions = useMemo<FilmVariantOption[]>(
    () =>
      (copies ?? []).map((c) => ({
        id: c.id,
        resolution: c.nativeResolution
          ? (RESOLUTION_DISPLAY[c.nativeResolution] ?? c.nativeResolution)
          : null,
        codec: c.videoStream?.codec ?? null,
        fileSizeBytes: c.fileSizeBytes,
        libraryName: null,
      })),
    [copies]
  );

  const seasons = data.show?.seasons ?? [];
  const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);
  const availableEpisodes = seasons.reduce(
    (sum, s) => sum + s.episodes.filter((e) => e.onDisk).length,
    0
  );
  const seasonCount = seasons.length;
  const resolution = data.nativeResolution
    ? (RESOLUTION_LABEL[data.nativeResolution] ?? null)
    : null;
  const codec = data.videoStream?.codec ?? null;
  const duration = data.durationSeconds > 0 ? formatDurationHuman(data.durationSeconds) : null;

  const playWithTransition = (): void => {
    // Use picker's selected copy or overlay's source video (bestCopy/show).
    const target = selectedCopyId || data.id;
    withViewTransition(() => navigate(`/player/${target}`));
  };

  const playEpisode = (seasonNumber: number, episodeNumber: number): void => {
    navigate(`/player/${data.id}?s=${seasonNumber}&e=${episodeNumber}`);
  };

  const handleSuggestionClick = (id: string): void => {
    overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (onSelectSuggestion) onSelectSuggestion(id);
    else navigate(`/player/${id}`);
  };

  return (
    <div ref={overlayRef} className={styles.overlay}>
      <div className={styles.hero}>
        <Poster
          url={data.metadata?.posterUrl ?? null}
          alt={altText}
          className={styles.poster}
          width={1600}
        />
        <div className={styles.gradient} />
        <button
          type="button"
          onClick={onClose}
          aria-label={strings.closeAriaLabel}
          className={styles.close}
        >
          <IconClose />
        </button>
        <div className={mergeClasses(styles.content, isSeries && styles.contentWithRail)}>
          <div className={styles.chips}>
            {resolution && (
              <span className={mergeClasses(styles.chip, styles.chipGreen)}>{resolution}</span>
            )}
            {codec && <span className={styles.chip}>{codec}</span>}
            {data.metadata?.rating !== null && data.metadata?.rating !== undefined && (
              <span className={styles.rating}>
                <ImdbBadge />
                {data.metadata.rating}
              </span>
            )}
          </div>
          <div className={styles.title}>{titleText}</div>
          <div className={styles.metaRow}>
            {[data.metadata?.year, data.metadata?.genre, duration]
              .filter((v): v is string | number => v !== null && v !== undefined)
              .join(" · ")}
          </div>
          {data.metadata?.director && (
            <div className={styles.director}>
              {strings.directedBy}
              <span className={styles.directorName}>{data.metadata.director}</span>
            </div>
          )}
          {data.metadata?.plot && <div className={styles.plot}>{data.metadata.plot}</div>}
          <div className={styles.actions}>
            <button type="button" onClick={playWithTransition} className={styles.playCta}>
              <IconPlay />
              <span>{strings.play}</span>
            </button>
            <span className={styles.filename}>{data.filename}</span>
          </div>
          {variantOptions.length > 1 && (
            <FilmVariants
              copies={variantOptions}
              selectedId={selectedCopyId}
              onSelect={setSelectedCopyId}
            />
          )}
          {suggestions.length > 0 && (
            <div className={styles.scrollHint} aria-hidden="true">
              {strings.scrollHint}
            </div>
          )}
        </div>
        {isSeries && seasonCount > 0 && (
          <aside className={styles.seasonsRail} aria-label={strings.seasonsAriaLabel}>
            <div className={styles.seasonsRailHeader}>
              <span className={styles.seasonsRailLabel}>
                {seasonCount} {seasonCount === 1 ? strings.season : strings.seasons}
              </span>
              <span className={styles.seasonsRailStat}>
                {strings.formatString(strings.onDiskFormat, {
                  onDisk: availableEpisodes,
                  total: totalEpisodes,
                })}
              </span>
            </div>
            <div className={styles.seasonsRailScroll}>
              <SeasonsPanel video={data} defaultOpenFirst onSelectEpisode={playEpisode} />
            </div>
          </aside>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          <PosterRow title={strings.youMightAlsoLike}>
            {suggestions.map((suggestionRef, idx) => (
              <SuggestionTile key={idx} video={suggestionRef} onClick={handleSuggestionClick} />
            ))}
          </PosterRow>
        </div>
      )}
    </div>
  );
};

const SuggestionTile: FC<{
  video: FilmTile_video$key;
  onClick: (id: string) => void;
}> = ({ video, onClick }) => <FilmTile video={video} onClick={onClick} />;
