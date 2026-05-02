import { type FC, Suspense } from "react";

import { HomePageContent } from "./HomePageContent.js";

const HomePage: FC = () => (
  <Suspense fallback={null}>
    <HomePageContent />
  </Suspense>
);

export default HomePage;
