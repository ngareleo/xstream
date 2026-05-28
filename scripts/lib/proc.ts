/**
 * proc — cross-platform process helpers shared by the dev/build launchers.
 *
 * The dev orchestration used to live as bash one-liners in package.json
 * (`command -v`, POSIX env-prefixes, `$HOME/.cargo/bin` PATH munging), which
 * only run on a POSIX shell. Bun runs on every target, so the launchers
 * express the same logic in TypeScript and spawn binaries directly (no shell),
 * sidestepping quoting and bash-availability entirely.
 */

import { spawnSync } from "node:child_process";

/** Find the existing PATH key (Windows uses `Path`); spreading process.env drops the case-insensitive proxy. */
export function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
}

/** Exit with the conventional 127 if a required binary isn't resolvable on PATH. */
export function requireBin(bin: string, hint: string, path?: string): void {
  if (!Bun.which(bin, path ? { PATH: path } : undefined)) {
    console.error(`${bin} not found — ${hint}`);
    process.exit(127);
  }
}

/** Run a command inheriting stdio and exit this process with its status. Never returns. */
export function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): never {
  process.exit(step(cmd, args, opts));
}

/** Run a command inheriting stdio and return its exit status (for sequencing steps). */
export function step(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): number {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd,
    env: opts.env ?? process.env,
  });
  if (res.error) {
    console.error(`failed to launch ${cmd}: ${res.error.message}`);
    return 1;
  }
  return res.status ?? 0;
}

export const DOPPLER_HINT = "install: https://docs.doppler.com/docs/cli";
