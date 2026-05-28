#!/usr/bin/env bun
/**
 * tauri-build — build the production desktop bundle.
 *
 * Deliberately NOT wrapped in `doppler run`: this is the prod variant and must
 * never be baked with the dev config's secrets. Prod builds inject the `prd`
 * config out of band (CI service token / `doppler run --config prd`).
 */

import { join, resolve } from "node:path";

import { exec, requireBin } from "./lib/proc";

requireBin("cargo-tauri", "install once with: cargo install tauri-cli --version ^2 --locked");

const srcTauri = join(resolve(import.meta.dir, ".."), "src-tauri");
const env: NodeJS.ProcessEnv = { ...process.env, XSTREAM_VARIANT: "prod" };

exec("cargo", ["tauri", "build", "--bundles", "deb,appimage"], { cwd: srcTauri, env });
