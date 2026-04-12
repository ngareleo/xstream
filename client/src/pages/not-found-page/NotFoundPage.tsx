import { type FC } from "react";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { NotFound } from "~/components/not-found/NotFound.js";

export const NotFoundPage: FC = () => (
  <DevThrowTarget id="NotFound">
    <NotFound />
  </DevThrowTarget>
);
