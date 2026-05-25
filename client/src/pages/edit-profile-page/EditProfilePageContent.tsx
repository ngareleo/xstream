import { type FC } from "react";
import {
  fetchQuery,
  graphql,
  useLazyLoadQuery,
  useMutation,
  useRelayEnvironment,
} from "react-relay";
import { useNavigate, useParams } from "react-router-dom";

import { ProfileForm, type ProfileFormValues } from "~/components/profile-form/ProfileForm.js";
import type { EditProfilePageContentDeleteMutation } from "~/relay/__generated__/EditProfilePageContentDeleteMutation.graphql.js";
import type { EditProfilePageContentQuery } from "~/relay/__generated__/EditProfilePageContentQuery.graphql.js";
import type { EditProfilePageContentRefetchQuery } from "~/relay/__generated__/EditProfilePageContentRefetchQuery.graphql.js";
import type { EditProfilePageContentUpdateMutation } from "~/relay/__generated__/EditProfilePageContentUpdateMutation.graphql.js";

const QUERY = graphql`
  query EditProfilePageContentQuery($id: ID!) {
    node(id: $id) {
      __typename
      ... on Library {
        id
        name
        path
        mediaType
        videoExtensions
      }
    }
  }
`;

const UPDATE_LIBRARY = graphql`
  mutation EditProfilePageContentUpdateMutation(
    $id: ID!
    $name: String
    $path: String
    $mediaType: MediaType
    $extensions: [String!]
  ) {
    updateLibrary(
      id: $id
      name: $name
      path: $path
      mediaType: $mediaType
      extensions: $extensions
    ) {
      id
      name
      path
      mediaType
      videoExtensions
    }
  }
`;

const DELETE_LIBRARY = graphql`
  mutation EditProfilePageContentDeleteMutation($id: ID!) {
    deleteLibrary(id: $id)
  }
`;

// Pre-warms the store before navigating to /profiles (fresh render, no flicker).
// Duplicates ProfilesPage's query shape deliberately — keep the two in sync.
// See docs/architecture/Relay/00-Fragment-Contract.md.
const PROFILES_REFETCH_QUERY = graphql`
  query EditProfilePageContentRefetchQuery {
    libraries {
      id
      ...ProfileRow_library
      videos(first: 500) {
        edges {
          node {
            id
            title
            filename
            mediaType
            metadata {
              genre
              director
            }
            ...FilmRow_video
            ...DetailPane_video
          }
        }
      }
    }
  }
`;

export const EditProfilePageContent: FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const environment = useRelayEnvironment();
  const data = useLazyLoadQuery<EditProfilePageContentQuery>(
    QUERY,
    { id: profileId ?? "" },
    { fetchPolicy: "store-and-network" }
  );
  const [updateCommit, updating] =
    useMutation<EditProfilePageContentUpdateMutation>(UPDATE_LIBRARY);
  const [deleteCommit] = useMutation<EditProfilePageContentDeleteMutation>(DELETE_LIBRARY);

  if (data.node?.__typename !== "Library") {
    navigate("/profiles");
    return null;
  }
  const lib = data.node;
  const libraryId = lib.id;
  const libraryName = lib.name;

  const initial: ProfileFormValues = {
    name: lib.name,
    path: lib.path,
    mediaType: lib.mediaType === "TV_SHOWS" ? "TV_SHOWS" : "MOVIES",
    extensions: [...lib.videoExtensions],
  };

  const refetchAndNavigate = (): void => {
    // Refetch the profiles list so /profiles renders fresh data on
    // navigation, without a manual refresh.
    fetchQuery<EditProfilePageContentRefetchQuery>(
      environment,
      PROFILES_REFETCH_QUERY,
      {}
    ).subscribe({
      complete: () => navigate("/profiles"),
      error: () => navigate("/profiles"),
    });
  };

  const handleSubmit = (values: ProfileFormValues): void => {
    updateCommit({
      variables: {
        id: libraryId,
        name: values.name,
        path: values.path,
        mediaType: values.mediaType,
        extensions: values.extensions,
      },
      onCompleted: (_data, errors) => {
        if (errors && errors.length > 0) return;
        refetchAndNavigate();
      },
    });
  };

  const handleDelete = (): void => {
    deleteCommit({
      variables: { id: libraryId },
      onCompleted: (_data, errors) => {
        if (errors && errors.length > 0) return;
        refetchAndNavigate();
      },
    });
  };

  return (
    <ProfileForm
      mode="edit"
      initial={initial}
      crumbs={["edit profile", libraryName]}
      eyebrow="edit"
      title={libraryName}
      subtitle="Update library settings or remove it from your shelf."
      submitLabel="Save"
      submitting={updating}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    />
  );
};
