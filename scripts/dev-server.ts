#!/usr/bin/env bun
/**
 * dev-server — run the Rust server in dev mode.
 *
 * Secrets arrive via `doppler run` (the parent `bun run dev`). Prepends
 * ~/.cargo/bin to PATH so cargo resolves without a login shell.
 */

import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { exec, pathKey, requireBin } from "./lib/proc";

const repoRoot = resolve(import.meta.dir, "..");
const serverDir = join(repoRoot, "server-rust");

const env: NodeJS.ProcessEnv = { ...process.env };
const pk = pathKey(env);
env[pk] = `${join(homedir(), ".cargo", "bin")}${delimiter}${env[pk] ?? ""}`;
env.DB_PATH = env.DB_PATH ?? join(repoRoot, "tmp", "xstream-rust.db");
env.XSTREAM_PROJECT_ROOT = env.XSTREAM_PROJECT_ROOT ?? repoRoot;

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
