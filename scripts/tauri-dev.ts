#!/usr/bin/env bun
/** tauri-dev — run the desktop shell in dev mode with Doppler-injected secrets. */

import { join, resolve } from "node:path";

import { DOPPLER_HINT, exec, requireBin } from "./lib/proc";

requireBin("doppler", DOPPLER_HINT);
requireBin("cargo-tauri", "install once with: cargo install tauri-cli --version ^2 --locked");

const srcTauri = join(resolve(import.meta.dir, ".."), "src-tauri");
const env: NodeJS.ProcessEnv = { ...process.env, XSTREAM_VARIANT: "dev" };

exec(
  "doppler",
  [
    "run",
    "--",
    "cargo",
    "tauri",
    "dev",
    "--features",
    "dev-features",
    "--config",
    "tauri.dev.conf.json",
  ],
  {
    cwd: srcTauri,
    env,
  }
);
