/// <reference types="@rsbuild/core/types" />

/**
 * `true` when the bundle was built with `XSTREAM_VARIANT=dev`. Substituted by
 * Rspack's DefinePlugin at parse time (see `rsbuild.config.ts`), so any
 * `if (IS_DEV_BUILD)` / `IS_DEV_BUILD ? … : …` branch is constant-folded and
 * the prod-dead arm is removed before dependency analysis — which is what
 * lets dynamic `import()` calls inside dev-only branches drop their chunk
 * files in the prod artifact.
 */
declare const IS_DEV_BUILD: boolean;
