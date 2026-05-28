#!/usr/bin/env bun
/**
 * dev-plain — headless fallback for `bun run dev`: runs every workspace's dev
 * script in parallel (colored prefixes, no TUI), with Doppler-injected secrets.
 */

import { DOPPLER_HINT, exec, requireBin } from "./lib/proc";

requireBin("doppler", DOPPLER_HINT);

exec("doppler", ["run", "--", "bun", "run", "--filter", "*", "dev"]);
