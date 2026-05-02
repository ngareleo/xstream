import { type FC } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ProfileForm } from "../../components/ProfileForm/ProfileForm.js";
import { profiles } from "../../data/mock.js";

export const EditProfile: FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const profile = profiles.find((p) => p.id === profileId);

  if (!profile) {
    return <Navigate to="/profiles" replace />;
  }

  // The mock data doesn't carry the OMDb-shape fields the form needs.
  // Map media-type back from the prototype's `type` enum and seed the
  // extension list from the production presets so the form renders cleanly.
  const mediaType = profile.type === "tv" ? "TV_SHOWS" : "MOVIES";
  const extensionDefaults =
    mediaType === "MOVIES"
      ? [".mkv", ".mp4", ".avi", ".mov", ".m4v"]
      : [".mkv", ".mp4", ".avi", ".mov"];

  return (
    <ProfileForm
      mode="edit"
      crumbs={["media", "profiles", profile.name]}
      eyebrow={`PROFILE · ${profile.id}`}
      title={profile.name}
      subtitle={profile.path}
      submitLabel="Save"
      initial={{
        name: profile.name,
        path: profile.path,
        mediaType,
        extensions: extensionDefaults,
      }}
    />
  );
};
