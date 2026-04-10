import { SimpleGrid } from "@chakra-ui/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import type { LibraryGrid_library$key } from "../relay/__generated__/LibraryGrid_library.graphql";
import { VideoCard } from "./VideoCard.js";

const LIBRARY_FRAGMENT = graphql`
  fragment LibraryGrid_library on Library {
    videos(first: 50) {
      edges {
        node {
          id
          ...VideoCard_video
        }
      }
    }
  }
`;

interface Props {
  library: LibraryGrid_library$key;
}

export const LibraryGrid: FC<Props> = ({ library }) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);

  return (
    <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }} gap={4}>
      {data.videos.edges.map(({ node }) => (
        <VideoCard key={node.id} video={node} />
      ))}
    </SimpleGrid>
  );
};
