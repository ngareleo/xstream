import { type FC } from "react";
import { ProfileForm } from "../../components/ProfileForm/ProfileForm.js";

export const CreateProfile: FC = () => {
  return (
    <ProfileForm
      mode="create"
      crumbs={["media", "profiles", "new"]}
      eyebrow="NEW PROFILE"
      title="Add a library."
      subtitle="Point Xstream at a folder of films or shows. We'll scan recursively, match titles against OMDb, and pull posters."
      submitLabel="Create"
      initial={{
        name: "",
        path: "",
        mediaType: "MOVIES",
        extensions: [".mkv", ".mp4", ".avi", ".mov", ".m4v"],
      }}
    />
  );
};
