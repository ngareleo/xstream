import { type FC, Suspense } from "react";

import { lazyNamedExport } from "./lazy.js";

export const NoopFC: FC = () => null;

type NoPropsComponent = FC<Record<string, never>>;

// Call from the dev arm of an `IS_DEV_BUILD ? … : NoopFC` ternary — see
// docs/architecture/Deployment/03-Build-Variants.md for why the env check
// can't move into this helper.
export function devChunk<M>(factory: () => Promise<M>, selector: (mod: M) => NoPropsComponent): FC {
  const Lazy = lazyNamedExport(factory, selector);
  const Wrapped: FC = () => (
    <Suspense fallback={null}>
      <Lazy />
    </Suspense>
  );
  return Wrapped;
}
