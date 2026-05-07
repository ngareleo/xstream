import { type FC, Suspense } from "react";

import { lazyNamedExport } from "./lazy.js";

/**
 * True when the bundle was built with `XSTREAM_VARIANT=dev`. The value is
 * statically replaced by Rspack (see `client/rsbuild.config.ts` →
 * `source.define`), so any branch guarded by this constant gets dead-code
 * eliminated in prod builds.
 */
export const IS_DEV_BUILD = process.env.PUBLIC_XSTREAM_DEV_FEATURES === "true";

/** Renders nothing. Use as the prod-side branch in an IS_DEV_BUILD ternary. */
export const NoopFC: FC = () => null;

// The components we wrap (DevPanel, FlagsTab, TraceHistoryTab) take no props.
type NoPropsComponent = FC<Record<string, never>>;

/**
 * Wrap a dynamic import in Suspense + a lazy component.
 *
 * **Must be called from the dev-side branch of an `IS_DEV_BUILD` ternary.**
 * Rspack registers a chunk for every reachable `import()`, so to keep the
 * chunk file out of the prod artifact entirely the `import()` itself has
 * to live in a statically-dead branch — not just behind a runtime guard.
 *
 * Pair with `webpackChunkName` so the chunk has a stable, human-readable
 * filename; otherwise Rspack emits an anonymous numeric ID.
 *
 * @example
 *   export const FlagsTabAsync: FC = IS_DEV_BUILD
 *     ? wrapDevImport(
 *         () => import(/* webpackChunkName: "FlagsTab" *\/ "./FlagsTab.js"),
 *         (m) => m.FlagsTab
 *       )
 *     : NoopFC;
 */
export function wrapDevImport<M>(
  factory: () => Promise<M>,
  selector: (mod: M) => NoPropsComponent
): FC {
  const Lazy = lazyNamedExport(factory, selector);
  const Wrapped: FC = () => (
    <Suspense fallback={null}>
      <Lazy />
    </Suspense>
  );
  return Wrapped;
}
