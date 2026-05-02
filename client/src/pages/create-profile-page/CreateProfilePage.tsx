import { type FC } from "react";
import { fetchQuery, graphql, useMutation, useRelayEnvironment } from "react-relay";
import { useLocation, useNavigate } from "react-router-dom";

import { ProfileForm, type ProfileFormValues } from "~/components/profile-form/ProfileForm.js";
import { PROFILES_QUERY } from "~/pages/profiles-page/ProfilesPageContent.js";
import type { CreateProfilePageMutation } from "~/relay/__generated__/CreateProfilePageMutation.graphql.js";
import type { ProfilesPageContentQuery } from "~/relay/__generated__/ProfilesPageContentQuery.graphql.js";

const CREATE_LIBRARY = graphql`
  mutation CreateProfilePageMutation(
    $name: String!
    $path: String!
    $mediaType: MediaType!
    $extensions: [String!]!
  ) {
    createLibrary(name: $name, path: $path, mediaType: $mediaType, extensions: $extensions) {
      id
      name
      path
    }
  }
`;

interface LocationState {
  from?: string;
}

const CreateProfilePage: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const environment = useRelayEnvironment();
  const [commit, isInFlight] = useMutation<CreateProfilePageMutation>(CREATE_LIBRARY);

  // Callers pass `state: { from: <path> }` when navigating here so that
  // post-create we land back where the user started instead of always
  // dropping them at /profiles. Falls back to /profiles for direct URL
  // visits.
  const returnTo = (location.state as LocationState | null)?.from ?? "/profiles";

  const handleSubmit = (values: ProfileFormValues): void => {
    commit({
      variables: {
        name: values.name,
        path: values.path,
        mediaType: values.mediaType,
        extensions: values.extensions,
      },
      onCompleted: (_data, errors) => {
        if (errors && errors.length > 0) return;
        // Refetch the profiles list so the destination renders the new
        // library immediately on navigation, without a manual refresh.
        fetchQuery<ProfilesPageContentQuery>(environment, PROFILES_QUERY, {}).subscribe({
          complete: () => navigate(returnTo),
          error: () => navigate(returnTo),
        });
      },
    });
  };

  return (
    <ProfileForm
      mode="create"
      initial={{
        name: "",
        path: "",
        mediaType: "MOVIES",
        extensions: [".mkv", ".mp4", ".avi", ".mov", ".m4v"],
      }}
      crumbs={["new profile"]}
      eyebrow="create"
      title="New library"
      submitLabel="Create"
      submitting={isInFlight}
      onSubmit={handleSubmit}
    />
  );
};

export default CreateProfilePage;
