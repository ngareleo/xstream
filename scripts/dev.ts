#!/usr/bin/env bun
/**
 * dev — start every workspace under the mprocs TUI, with secrets injected by
 * Doppler. Replaces the old `command -v … && doppler run -- mprocs` one-liner.
 */

import { DOPPLER_HINT, exec, requireBin } from "./lib/proc";

requireBin("doppler", DOPPLER_HINT);
requireBin(
  "mprocs",
  'install with: cargo install --locked mprocs (see README "Running in Development")'
);

exec("doppler", ["run", "--", "mprocs", "--config", "mprocs.yaml"]);
