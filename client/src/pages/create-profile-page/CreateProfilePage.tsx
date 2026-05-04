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

  // Return to caller's URL (?return_to=) or /profiles; validate same-origin to prevent open redirect.
  const rawReturn = searchParams.get("return_to");
  const returnTo = rawReturn && rawReturn.startsWith("/") ? rawReturn : "/profiles";

  const handleSubmit = (values: ProfileFormValues): void => {
    commit({
      variables: {
        name: values.name,
        path: values.path,
        mediaType: values.mediaType,
        extensions: values.extensions,
      },
      // Destination page's useLazyLoadQuery re-validates on mount (fetchPolicy: store-and-network).
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
