import { type ComponentType, lazy, type LazyExoticComponent } from "react";

/**
 * Creates a lazy-loaded component from a named module export.
 * Use this in *Async.tsx files to split a component into its own chunk.
 * The chunk name is derived from the imported module's filename by the bundler.
 *
 * @example
 * // VideoPlayerAsync.tsx
 * export const VideoPlayer = lazyNamedExport(
 *   () => import("./VideoPlayer.js"),
 *   (m) => m.VideoPlayer
 * );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamedExport<M, C extends ComponentType<any>>(
  factory: () => Promise<M>,
  selector: (mod: M) => C
): LazyExoticComponent<C> {
  return lazy(() =>
    factory().then((mod) => ({ default: selector(mod) }))
  ) as LazyExoticComponent<C>;
}
