/**
 * proc — cross-platform process helpers shared by the dev/build launchers.
 *
 * Why these exist: the dev orchestration used to live as bash one-liners
 * inside package.json scripts (`command -v`, `[ -f ../.env ] && . ../.env`,
 * `$HOME/.cargo/bin` PATH munging). Those only run on a POSIX shell, so the
 * launchers were not Windows-safe. Bun runs on every target, so we express
 * the same logic in TypeScript and spawn binaries directly (no shell), which
 * sidesteps quoting and bash-availability entirely.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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

/**
 * Fallback for devs not yet on Doppler: shallow-merge a `.env` into `env`
 * WITHOUT overriding anything already set (so Doppler-injected vars win).
 */
export function loadEnvFallback(file: string, env: NodeJS.ProcessEnv): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) {
      val = val.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = val;
  }
}

export const DOPPLER_HINT = "install: https://docs.doppler.com/docs/cli";
