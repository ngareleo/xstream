import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(dirname, "..");
const jsDir = path.join(clientRoot, "dist", "static", "js");

// Raw (uncompressed) byte ceilings for the two cache-sensitive chunks, in
// decimal kB to match Rsbuild's `printFileSize` output. These are load-bearing
// gates, not vanity metrics:
//   - vendor-misc is the residual node_modules bucket; if it balloons, a heavy
//     dep has landed there instead of getting its own cacheGroup.
//   - shared.* are the route-affinity chunks loaded across routes; if their
//     total grows, page-specific code is likely leaking into shared.
// Raising either limit requires a deliberate edit here WITH justification in the
// PR description — see docs/client/Bundle-Chunks/00-Strategy.md ("Size gates").
const KB = 1000;
const LIMITS = {
  vendorMisc: 200 * KB,
  sharedAggregate: 50 * KB,
};

// Emitted chunks are split across dist/static/js (initial: vendor-*, runtime,
// index) and dist/static/js/async (lazy: page + shared.* chunks), so match by
// basename across the whole tree.
function jsFilesMatching(re: RegExp): string[] {
  return readdirSync(jsDir, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => re.test(path.basename(f)));
}

function totalBytes(files: string[]): number {
  return files.reduce((sum, f) => sum + statSync(path.join(jsDir, f)).size, 0);
}

beforeAll(() => {
  // CI runs this gate after `bun run build`, so dist already exists and this
  // branch is skipped. It's a convenience fallback for a cold local checkout.
  if (!existsSync(jsDir)) {
    execSync("bun run relay && bunx rsbuild build", { cwd: clientRoot, stdio: "inherit" });
  }
}, 300_000);

describe("bundle size gates", () => {
  it(`vendor-misc stays under ${LIMITS.vendorMisc / KB} kB`, () => {
    const files = jsFilesMatching(/^vendor-misc\.[^.]+\.js$/);
    expect(files, "vendor-misc chunk not found in dist/static/js").toHaveLength(1);

    const bytes = totalBytes(files);
    expect(
      bytes,
      `vendor-misc is ${(bytes / KB).toFixed(1)} kB (limit ${LIMITS.vendorMisc / KB} kB). ` +
        `A heavy dependency likely landed in the residual bucket — give it its own ` +
        `cacheGroup rather than raising this gate. See docs/client/Bundle-Chunks/00-Strategy.md.`
    ).toBeLessThanOrEqual(LIMITS.vendorMisc);
  });

  it(`shared.* chunks together stay under ${LIMITS.sharedAggregate / KB} kB`, () => {
    const files = jsFilesMatching(/^shared\..+\.js$/);
    expect(files.length, "no shared.* chunks found in dist/static/js").toBeGreaterThan(0);

    const bytes = totalBytes(files);
    expect(
      bytes,
      `shared.* totals ${(bytes / KB).toFixed(1)} kB across ${files.length} chunks ` +
        `(limit ${LIMITS.sharedAggregate / KB} kB). Page-specific code is likely leaking into ` +
        `shared — look for a cross-page import or a component-level query before raising this ` +
        `gate. See docs/client/Bundle-Chunks/00-Strategy.md.`
    ).toBeLessThanOrEqual(LIMITS.sharedAggregate);
  });
});
