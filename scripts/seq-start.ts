#!/usr/bin/env bun
/** seq:start — start (or create) the Seq log container; generates persisted admin creds on first run. */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { docker, ensureDaemon, hasDocker } from "./lib/docker";

const SEQ_CONTAINER = "seq";
const SEQ_PORT = 5341;
const repoRoot = resolve(import.meta.dir, "..");
const seqStore = process.env.SEQ_STORE ?? join(homedir(), ".seq-store");
const credsFile = join(repoRoot, ".seq-credentials");

const C = { green: "\x1b[0;32m", yellow: "\x1b[1;33m", red: "\x1b[0;31m", off: "\x1b[0m" };
const info = (m: string) => console.log(`${C.green}[seq]${C.off} ${m}`);
const skipped = (m: string) => console.log(`${C.yellow}[seq]${C.off} ${m}`);
const fail = (m: string): never => {
  console.error(`${C.red}[seq]${C.off} ${m}`);
  process.exit(1);
};

if (!hasDocker())
  fail("docker not found — install Docker, then re-run. See https://docs.docker.com/get-docker/");

// Generate a random admin password on first run and persist it in .seq-credentials
// (gitignored). All scripts and skills read from this file — never hardcode credentials.
if (!existsSync(credsFile)) {
  info("Generating Seq credentials → .seq-credentials");
  const pass = randomBytes(32).toString("base64").replace(/[/+=]/g, "").slice(0, 32);
  writeFileSync(credsFile, `SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=${pass}\n`);
  info("Credentials saved. Run: cat .seq-credentials");
}
const adminPassword = (
  readFileSync(credsFile, "utf8").match(/^SEQ_ADMIN_PASSWORD=(.*)$/m)?.[1] ?? ""
).trim();

ensureDaemon(info, fail);

const names = (args: string[]) =>
  docker(args, true)
    .stdout.split("\n")
    .map((s) => s.trim());

if (names(["ps", "--format", "{{.Names}}"]).includes(SEQ_CONTAINER)) {
  skipped(`Seq already running at http://localhost:${SEQ_PORT}`);
  process.exit(0);
}

if (names(["ps", "-a", "--format", "{{.Names}}"]).includes(SEQ_CONTAINER)) {
  info("Restarting stopped container…");
  if (docker(["start", SEQ_CONTAINER]).status !== 0)
    fail("Failed to start the existing Seq container.");
} else {
  info(`Creating new Seq container (store: ${seqStore})…`);
  mkdirSync(seqStore, { recursive: true });
  const status = docker([
    "run",
    "-d",
    "--name",
    SEQ_CONTAINER,
    "--restart",
    "unless-stopped",
    "-e",
    "ACCEPT_EULA=Y",
    "-e",
    `SEQ_FIRSTRUN_ADMINPASSWORD=${adminPassword}`,
    "-p",
    `${SEQ_PORT}:80`,
    "-v",
    `${seqStore}:/data`,
    "datalust/seq:latest",
  ]).status;
  if (status !== 0) fail("Failed to create the Seq container.");
  console.log("");
  info(`Seq available at http://localhost:${SEQ_PORT}`);
  info(`Login: username=admin  password=${adminPassword}`);
  info(`Credentials file: ${credsFile} (gitignored — do not commit)`);
}
