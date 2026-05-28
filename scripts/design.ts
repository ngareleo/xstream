#!/usr/bin/env bun
/** design — start the design-lab workspaces under the mprocs TUI. */

import { join, resolve } from "node:path";

import { exec, requireBin } from "./lib/proc";

requireBin("mprocs", "install with: cargo install --locked mprocs");

const designDir = join(resolve(import.meta.dir, ".."), "design");

exec("mprocs", ["--config", "mprocs.yaml"], { cwd: designDir });
