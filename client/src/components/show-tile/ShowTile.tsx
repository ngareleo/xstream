import type { FC } from "react";
import { graphql, useFragment } from "react-relay";

import { MediaKindBadge } from "~/components/media-kind-badge/MediaKindBadge";
import { Poster } from "~/components/poster/Poster";
import type { ShowTile_show$key } from "~/relay/__generated__/ShowTile_show.graphql";

import { useShowTileStyles } from "./ShowTile.styles";

const SHOW_TILE_FRAGMENT = graphql`
  fragment ShowTile_show on Show
  @argumentDefinitions(posterSize: { type: "PosterSize!", defaultValue: W400 }) {
    id
    title
    year
    metadata {
      year
      tilePoster: posterUrl(size: $posterSize)
    }
  }
`;

interface ShowTileProps {
  show: ShowTile_show$key;
  onClick: (id: string) => void;
}

export const ShowTile: FC<ShowTileProps> = ({ show, onClick }) => {
  const data = useFragment(SHOW_TILE_FRAGMENT, show);
  const styles = useShowTileStyles();
  const altText = data.title;
  const year = data.metadata?.year ?? data.year ?? null;
  return (
    <button type="button" onClick={() => onClick(data.id)} className={styles.tile}>
      <div className={styles.frame}>
        <Poster url={data.metadata?.tilePoster ?? null} alt={altText} className={styles.image} />
        <MediaKindBadge kind="TV_SHOWS" variant="tile" />
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{altText}</div>
        {year !== null && <div className={styles.subtitle}>{year}</div>}
      </div>
    </button>
  );
};
