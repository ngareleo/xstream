import { type FC, Suspense } from "react";

import { lazyNamedExport } from "./lazy.js";

/** Renders nothing. Use as the prod-side branch in an `IS_DEV_BUILD` ternary. */
export const NoopFC: FC = () => null;

// The components we wrap (DevPanel, FlagsTab, TraceHistoryTab) take no props.
type NoPropsComponent = FC<Record<string, never>>;

/**
 * Wrap a dynamic import in Suspense + a lazy component, for dev-only chunks.
 *
 * **Must be called from the dev-side branch of an `IS_DEV_BUILD` ternary.**
 * Rspack registers a chunk for every reachable `import()`; the only way to
 * keep the chunk file out of the prod artifact is for the `import()` itself
 * to live in a statically-dead branch, which `IS_DEV_BUILD` provides.
 *
 * Pair the import with a `webpackChunkName` magic comment so the chunk has
 * a stable filename instead of a numeric ID.
 *
 * @example
 *   export const FlagsTabAsync: FC = IS_DEV_BUILD
 *     ? devChunk(
 *         () => import(/* webpackChunkName: "FlagsTab" *\/ "./FlagsTab.js"),
 *         (m) => m.FlagsTab,
 *       )
 *     : NoopFC;
 */
export function devChunk<M>(factory: () => Promise<M>, selector: (mod: M) => NoPropsComponent): FC {
  const Lazy = lazyNamedExport(factory, selector);
  const Wrapped: FC = () => (
    <Suspense fallback={null}>
      <Lazy />
    </Suspense>
  );
  return Wrapped;
}
