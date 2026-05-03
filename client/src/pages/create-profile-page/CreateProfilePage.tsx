import { type FC } from "react";
import { graphql, useMutation } from "react-relay";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ProfileForm, type ProfileFormValues } from "~/components/profile-form/ProfileForm.js";
import type { CreateProfilePageMutation } from "~/relay/__generated__/CreateProfilePageMutation.graphql.js";

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

const CreateProfilePage: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [commit, isInFlight] = useMutation<CreateProfilePageMutation>(CREATE_LIBRARY);

  // Callers tack `?return_to=<encoded path>` onto the URL so post-create
  // we land back where the user started instead of always dumping them
  // at /profiles. Falls back to /profiles for direct URL visits.
  const rawReturn = searchParams.get("return_to");
  // Only honour same-origin paths to avoid being weaponised as an open
  // redirect.
  const returnTo = rawReturn && rawReturn.startsWith("/") ? rawReturn : "/profiles";

  const handleSubmit = (values: ProfileFormValues): void => {
    commit({
      variables: {
        name: values.name,
        path: values.path,
        mediaType: values.mediaType,
        extensions: values.extensions,
      },
      // The destination page's useLazyLoadQuery uses
      // fetchPolicy: "store-and-network" so it re-validates on mount —
      // see the Relay rule in docs/code-style/Client-Conventions. No
      // post-mutation cache work is needed here.
      onCompleted: (_data, errors) => {
        if (errors && errors.length > 0) return;
        navigate(returnTo);
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
