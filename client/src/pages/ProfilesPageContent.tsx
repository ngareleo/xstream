import { Box, Text } from "@chakra-ui/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { type FC, useCallback, useState } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useNavigate } from "react-router-dom";

import { AppHeader } from "../components/AppHeader.js";
import {
  isVideoPlayEvent,
  isVideoSelectedEvent,
  type VideoPlayData,
  type VideoSelectedData,
} from "../components/MediaList.events.js";
import { MediaList } from "../components/MediaList.js";
import {
  isLibrarySelectedEvent,
  type LibrarySelectedData,
} from "../components/ProfilesSidebar.events.js";
import { ProfilesSidebar } from "../components/ProfilesSidebar.js";
import {
  isVideoDetailsPanelPlayEvent,
  type VideoDetailsPanelPlayData,
} from "../components/VideoDetailsPanel.events.js";
import { VideoDetailsPanel } from "../components/VideoDetailsPanel.js";
import type { ProfilesPageContentQuery } from "../relay/__generated__/ProfilesPageContentQuery.graphql.js";

const PROFILES_QUERY = graphql`
  query ProfilesPageContentQuery {
    libraries {
      id
      ...ProfilesSidebar_library
      ...MediaList_library
      videos(first: 50) {
        edges {
          node {
            id
            ...VideoDetailsPanel_video
          }
        }
      }
    }
  }
`;

export const ProfilesPageContent: FC = () => {
  const data = useLazyLoadQuery<ProfilesPageContentQuery>(PROFILES_QUERY, {});
  const navigate = useNavigate();

  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const selectedLibrary = data.libraries.find((l) => l.id === selectedLibraryId) ?? null;
  const selectedVideoKey =
    selectedLibrary?.videos.edges.find((e) => e.node.id === selectedVideoId)?.node ?? null;

  const interceptor = useCallback(
    async (wrapper: EventWrapper, _forward: (e: EventWrapper) => Promise<void>) => {
      if (isLibrarySelectedEvent(wrapper) && wrapper.event.data) {
        const { libraryId } = wrapper.event.data() as LibrarySelectedData;
        setSelectedLibraryId(libraryId);
        setSelectedVideoId(null);
      } else if (isVideoSelectedEvent(wrapper) && wrapper.event.data) {
        const { videoId } = wrapper.event.data() as VideoSelectedData;
        setSelectedVideoId((prev) => (prev === videoId ? null : videoId));
      } else if (isVideoPlayEvent(wrapper) && wrapper.event.data) {
        const { videoId } = wrapper.event.data() as VideoPlayData;
        void navigate(`/play/${encodeURIComponent(videoId)}`);
      } else if (isVideoDetailsPanelPlayEvent(wrapper) && wrapper.event.data) {
        const { videoId } = wrapper.event.data() as VideoDetailsPanelPlayData;
        void navigate(`/play/${encodeURIComponent(videoId)}`);
      }
      return wrapper;
    },
    [navigate]
  );

  return (
    <Box display="flex" flexDir="column" h="100vh" bg="gray.950">
      <AppHeader />

      <NovaEventingInterceptor interceptor={interceptor}>
        <Box display="flex" flex={1} overflow="hidden">
          {/* Left sidebar */}
          <ProfilesSidebar libraries={data.libraries} selectedLibraryId={selectedLibraryId} />

          {/* Center — media list or welcome state */}
          {selectedLibrary ? (
            <MediaList library={selectedLibrary} selectedVideoId={selectedVideoId} />
          ) : (
            <Box
              flex={1}
              display="flex"
              flexDir="column"
              alignItems="center"
              justifyContent="center"
              gap={4}
              bg="gray.950"
            >
              <Box
                w="100px"
                h="100px"
                borderRadius="full"
                bg="gray.900"
                border="2px dashed"
                borderColor="gray.700"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text color="gray.600" fontSize="4xl">
                  ▶
                </Text>
              </Box>
              <Text fontSize="xl" fontWeight="bold" color="white">
                Select a Profile
              </Text>
              <Text fontSize="sm" color="gray.500" textAlign="center" maxW="280px">
                Choose a profile from the sidebar to browse your media collection
              </Text>
            </Box>
          )}

          {/* Right — details panel */}
          {selectedVideoKey && (
            <VideoDetailsPanel video={selectedVideoKey} onClose={() => setSelectedVideoId(null)} />
          )}
        </Box>
      </NovaEventingInterceptor>
    </Box>
  );
};
