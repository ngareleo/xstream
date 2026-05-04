import { type FC, useCallback } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { EmptyLibrariesHero } from "~/components/empty-libraries-hero/EmptyLibrariesHero";
import { HomeFilmsSection } from "~/components/home-films-section/HomeFilmsSection";
import { PosterRow } from "~/components/poster-row/PosterRow";
import { ShowDetailsOverlay } from "~/components/show-details-overlay/ShowDetailsOverlay";
import { ShowTile } from "~/components/show-tile/ShowTile";
import type { HomePageContentQuery } from "~/relay/__generated__/HomePageContentQuery.graphql";

import { strings } from "./HomePage.strings";
import { useHomePageStyles } from "./HomePage.styles";

const HOMEPAGE_QUERY = graphql`
  query HomePageContentQuery {
    libraries {
      id
    }
    movies: films(first: 200) {
      ...HomeFilmsSection_films
    }
    tvShows: shows(first: 200) {
      edges {
        node {
          id
          ...ShowTile_show
          ...ShowDetailsOverlay_show
        }
      }
    }
  }
`;

export const HomePageContent: FC = () => {
  const styles = useHomePageStyles();
  const data = useLazyLoadQuery<HomePageContentQuery>(
    HOMEPAGE_QUERY,
    {},
    { fetchPolicy: "store-and-network" }
  );
  const [params, setParams] = useSearchParams();
  const hasLibraries = (data.libraries ?? []).length > 0;

  const tvShowEdges = data.tvShows?.edges ?? [];
  const showId = params.get("show");
  const selectedShowEdge = showId ? tvShowEdges.find((e) => e.node.id === showId) : undefined;

  const openShow = useCallback(
    (id: string): void => {
      const next = new URLSearchParams(params);
      next.set("show", id);
      setParams(next);
    },
    [params, setParams]
  );

  const closeShow = useCallback((): void => {
    const next = new URLSearchParams(params);
    next.delete("show");
    setParams(next);
  }, [params, setParams]);

  if (!hasLibraries) {
    return <EmptyLibrariesHero watermark={strings.emptyWatermark} />;
  }

  if (selectedShowEdge) {
    return <ShowDetailsOverlay show={selectedShowEdge.node} onClose={closeShow} />;
  }

  return (
    <div className={styles.page}>
      <HomeFilmsSection
        films={data.movies}
        tvShowsRow={
          tvShowEdges.length > 0 ? (
            <PosterRow title={strings.rowTvShows}>
              {tvShowEdges.map((edge) => (
                <ShowTile
                  key={edge.node.id}
                  show={edge.node}
                  onClick={() => openShow(edge.node.id)}
                />
              ))}
            </PosterRow>
          ) : null
        }
      />
    </div>
  );
};
