#!/usr/bin/env bun
/**
 * cargo — run cargo with ~/.cargo/bin prepended to PATH, cross-platform.
 *
 * Replaces the `PATH="$HOME/.cargo/bin:$PATH" cargo …` env-prefix used by the
 * server-rust build/lint scripts (POSIX-only). Forwards all args and inherits
 * the caller's cwd so it builds whichever workspace invoked it.
 */

import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { exec, pathKey, requireBin } from "./lib/proc";

const env: NodeJS.ProcessEnv = { ...process.env };
const pk = pathKey(env);
env[pk] = `${join(homedir(), ".cargo", "bin")}${delimiter}${env[pk] ?? ""}`;

requireBin(
  "cargo",
  "cargo not found (looked in ~/.cargo/bin too). Install rustup: https://rustup.rs",
  env[pk]
);

exec("cargo", process.argv.slice(2), { env });
