import { type FC, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { recordPageLoadTime, recordPageVisit } from "~/services/clientMetrics.js";
import { noteActivity } from "~/services/userSession.js";
import { getClientLogger } from "~/telemetry.js";
import { routeTemplate } from "~/utils/routeTemplate.js";

const log = getClientLogger("page");

/** Cold-start load time, from navigation start to the load event (or now). */
function initialLoadMs(): number {
  const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (nav && nav.loadEventEnd > 0) return nav.loadEventEnd;
  return performance.now();
}

/**
 * Renders nothing. Mounted once at the router root, it bridges navigation and
 * raw DOM activity into the user-session idle timer, and emits a page-visit
 * (log + counter) plus a page-load-time histogram on every route. Mirrors the
 * null-rendering observer pattern of RouterNavigationLoader.
 */
export const TelemetryTracker: FC = () => {
  const { pathname } = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    noteActivity();
    const route = routeTemplate(pathname);
    const isInitial = prevPath.current === null;
    prevPath.current = pathname;

    recordPageVisit(route);

    if (isInitial) {
      const loadMs = initialLoadMs();
      recordPageLoadTime(route, "initial", loadMs);
      log.info("Page visit", { route, kind: "initial", "page.load_time_ms": Math.round(loadMs) });
      return;
    }

    // Transition time = navigation to next painted frame (double rAF settles layout).
    const startedAt = performance.now();
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const transitionMs = performance.now() - startedAt;
        recordPageLoadTime(route, "route", transitionMs);
        log.info("Page visit", {
          route,
          kind: "route",
          "page.load_time_ms": Math.round(transitionMs),
        });
      })
    );
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  useEffect(() => {
    const onActivity = (): void => noteActivity();
    document.addEventListener("click", onActivity, true);
    document.addEventListener("keydown", onActivity, true);
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    return () => {
      document.removeEventListener("click", onActivity, true);
      document.removeEventListener("keydown", onActivity, true);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("scroll", onActivity);
    };
  }, []);

  return null;
};
