#!/usr/bin/env bun
/** seq:stop — stop the Seq log container if it's running. */

import { docker, hasDocker } from "./lib/docker";

const SEQ_CONTAINER = "seq";

const C = { green: "\x1b[0;32m", yellow: "\x1b[1;33m", red: "\x1b[0;31m", off: "\x1b[0m" };
const info = (m: string) => console.log(`${C.green}[seq]${C.off} ${m}`);
const skipped = (m: string) => console.log(`${C.yellow}[seq]${C.off} ${m}`);

if (!hasDocker()) {
  console.error(`${C.red}[seq]${C.off} docker not found — nothing to stop.`);
  process.exit(0);
}

const running = docker(["ps", "--format", "{{.Names}}"], true)
  .stdout.split("\n")
  .map((s) => s.trim())
  .includes(SEQ_CONTAINER);

if (running) {
  info(`Stopping ${SEQ_CONTAINER}…`);
  docker(["stop", SEQ_CONTAINER]);
  info("Stopped.");
} else {
  skipped("Seq is not running.");
}
