#!/usr/bin/env bun
/**
 * dev-client — compile Relay artifacts, then start the Rsbuild dev server.
 *
 * Secrets arrive via `doppler run` (the parent `bun run dev`).
 */

import { join, resolve } from "node:path";

import { exec, step } from "./lib/proc";

const repoRoot = resolve(import.meta.dir, "..");
const clientDir = join(repoRoot, "client");

const env: NodeJS.ProcessEnv = { ...process.env };
env.NODE_OPTIONS = [env.NODE_OPTIONS, "--dns-result-order=ipv4first"].filter(Boolean).join(" ");
env.XSTREAM_VARIANT = "dev";

const relay = step("bun", ["run", "relay"], { cwd: clientDir, env });
if (relay !== 0) process.exit(relay);

exec("bun", ["x", "rsbuild", "dev"], { cwd: clientDir, env });
