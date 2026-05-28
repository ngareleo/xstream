#!/usr/bin/env bun
/**
 * check-env — audit env var configuration under Doppler.
 *
 * Thin launcher around the POSIX-shell diagnostic check-env.sh: guards Doppler,
 * then runs the script under `doppler run` so it audits the injected secrets.
 * On Windows run check-env.sh under WSL / git-bash (it is bash-only).
 */

import { join, resolve } from "node:path";

import { DOPPLER_HINT, exec, requireBin } from "./lib/proc";

requireBin("doppler", DOPPLER_HINT);
requireBin(
  "bash",
  "check-env is a POSIX-shell diagnostic — on Windows run it under WSL or git-bash"
);

const script = join(resolve(import.meta.dir, ".."), "scripts", "check-env.sh");

exec("doppler", ["run", "--", "bash", script, ...process.argv.slice(2)]);
