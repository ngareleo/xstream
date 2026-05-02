import { type FC, Suspense } from "react";

import { EditProfilePageContent } from "./EditProfilePageContent.js";

const EditProfilePage: FC = () => (
  <Suspense fallback={null}>
    <EditProfilePageContent />
  </Suspense>
);

export default EditProfilePage;
