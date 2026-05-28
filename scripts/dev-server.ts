#!/usr/bin/env bun
/**
 * dev-server — run the Rust server in dev mode.
 *
 * Replaces the bash one-liner that prepended `$HOME/.cargo/bin` to PATH and
 * sourced `../.env`. Secrets normally arrive via `doppler run` (the parent
 * `bun run dev`); the `.env` fallback only fills vars Doppler didn't set.
 */

import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { exec, loadEnvFallback, pathKey, requireBin } from "./lib/proc";

const repoRoot = resolve(import.meta.dir, "..");
const serverDir = join(repoRoot, "server-rust");

const env: NodeJS.ProcessEnv = { ...process.env };
const pk = pathKey(env);
// rustup installs cargo under ~/.cargo/bin, which non-interactive shells often
// don't have on PATH. Prepend it so `cargo` resolves without a login shell.
env[pk] = `${join(homedir(), ".cargo", "bin")}${delimiter}${env[pk] ?? ""}`;
env.DB_PATH = env.DB_PATH ?? join(repoRoot, "tmp", "xstream-rust.db");
env.XSTREAM_PROJECT_ROOT = env.XSTREAM_PROJECT_ROOT ?? repoRoot;
loadEnvFallback(join(repoRoot, ".env"), env);

requireBin(
  "cargo",
  "cargo not found (looked in ~/.cargo/bin too). Install rustup: https://rustup.rs",
  env[pk]
);

console.log("[server-rust] starting xstream-server (cold build can take 30–60s)…");
exec("cargo", ["run", "--manifest-path", "Cargo.toml", "--features", "dev-features"], {
  cwd: serverDir,
  env,
});
