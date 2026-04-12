import { type FC, useEffect, useRef, useState } from "react";
import { useLocation, useNavigation } from "react-router-dom";

import { usePageLoading } from "~/components/loading-bar/LoadingBarContext.js";

/**
 * Renders nothing but bridges React Router's navigation state into the
 * LoadingBar. Mount once inside LoadingBarProvider (AppShell does this).
 *
 * Two signals feed the loading bar:
 *  1. navigation.state === "loading"  — fires when a route has data loaders
 *  2. location key change             — fires on every navigation commit,
 *     including lazy-route transitions where no loaders run. The bar stays
 *     active for one animation frame so the LoadingBar's enter phase renders,
 *     then transitions to its "completing" exit animation.
 */
export const RouterNavigationLoader: FC = () => {
  const { state } = useNavigation();
  const { key } = useLocation();
  const prevKeyRef = useRef(key);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;

    // Show the bar briefly — enough for the LoadingBar enter phase to mount,
    // then let it run its completing animation (~650 ms).
    setTransitioning(true);
    const t = setTimeout(() => setTransitioning(false), 60);
    return () => clearTimeout(t);
  }, [key]);

  usePageLoading(state === "loading" || transitioning);
  return null;
};
