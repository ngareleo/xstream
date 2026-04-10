import { Box, Spinner } from "@chakra-ui/react";
import { type FC, Suspense } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useParams } from "react-router-dom";

import { VideoPlayer } from "../components/VideoPlayer.js";
import type { PlayerPageQuery } from "../relay/__generated__/PlayerPageQuery.graphql";

const VIDEO_QUERY = graphql`
  query PlayerPageQuery($id: ID!) {
    video(id: $id) {
      ...VideoPlayer_video
    }
  }
`;

/**
 * Normalise the route param to a Relay global ID.
 * The param is URL-encoded by VideoCard (encodeURIComponent); decode first.
 * If the decoded value already looks like a Relay global ID (decodes to "Video:…"),
 * use it as-is. Otherwise treat it as a bare local ID and wrap it.
 */
function resolveVideoId(param: string): string {
  const decoded = decodeURIComponent(param);
  try {
    if (atob(decoded).startsWith("Video:")) return decoded;
  } catch {
    // not valid base64 — fall through
  }
  return btoa(`Video:${decoded}`);
}

const PlayerContent: FC<{ videoId: string }> = ({ videoId }) => {
  const data = useLazyLoadQuery<PlayerPageQuery>(VIDEO_QUERY, { id: videoId });

  if (!data.video) {
    return <Box p={8}>Video not found.</Box>;
  }

  return (
    <Box>
      <VideoPlayer video={data.video} />
    </Box>
  );
};

export const PlayerPage: FC = () => {
  const { videoId } = useParams<{ videoId: string }>();

  if (!videoId) return <Box p={8}>Invalid video ID.</Box>;

  return (
    <Box maxW="1600px" mx="auto">
      <Suspense
        fallback={
          <Box display="flex" justifyContent="center" pt={20}>
            <Spinner size="xl" />
          </Box>
        }
      >
        <PlayerContent videoId={resolveVideoId(videoId)} />
      </Suspense>
    </Box>
  );
};
