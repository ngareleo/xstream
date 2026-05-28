#!/usr/bin/env bun
/** setup:dev — check required dev tools, auto-install what's feasible cross-platform, and prepare the repo. */

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { step } from "./lib/proc";

const repoRoot = resolve(import.meta.dir, "..");

const C = {
  green: "\x1b[0;32m",
  yellow: "\x1b[1;33m",
  red: "\x1b[0;31m",
  dim: "\x1b[0;90m",
  off: "\x1b[0m",
};
const info = (m: string) => console.log(`${C.green}[xstream]${C.off} ${m}`);
const warn = (m: string) => console.log(`${C.yellow}[xstream]${C.off} ${m}`);

const has = (bin: string): boolean => Bun.which(bin) !== null;
const ok = (cmd: string, args: string[]): boolean =>
  spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
const version = (bin: string): string =>
  (spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout ?? "").trim() || "unknown";
const run = (cmd: string, args: string[], cwd = repoRoot): boolean =>
  step(cmd, args, { cwd }) === 0;

const parseSemver = (s: string): [number, number, number] | null => {
  const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
};
const meetsMin = (actual: string, min: string): boolean => {
  const a = parseSemver(actual);
  const b = parseSemver(min);
  if (!a || !b) return true; // unparseable — don't block on a version we can't read
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

// Final per-tool status, printed as a summary at the end.
type State = "ok" | "installed" | "missing-required" | "missing-optional";
const report: { tool: string; state: State; note: string }[] = [];
const mark = (tool: string, state: State, note = "") => report.push({ tool, state, note });

// ── Bun (the runtime executing this script) ──────────────────────────────────
const BUN_MIN = "1.1";
if (meetsMin(Bun.version, BUN_MIN)) mark("bun", "ok", Bun.version);
else mark("bun", "missing-required", `${Bun.version} < ${BUN_MIN} — upgrade: https://bun.sh`);

// ── Rust toolchain (cargo) — required to build the server + Tauri shell ──────
const RUST_MIN = "1.75";
let hasCargo = false;
if (!has("cargo")) {
  mark("rust", "missing-required", "install from https://rustup.rs");
} else {
  hasCargo = true;
  const v = version("cargo");
  if (meetsMin(v, RUST_MIN)) mark("rust", "ok", v.replace(/^cargo\s+/, "").split(" ")[0] ?? v);
  else mark("rust", "missing-required", `${v} < ${RUST_MIN} — run \`rustup update\``);
}

// ── cargo-installable tools (cross-platform once cargo exists) ────────────────
const cargoTools: { bin: string; tool: string; args: string[] }[] = [
  {
    bin: "cargo-tauri",
    tool: "tauri-cli",
    args: ["install", "tauri-cli", "--version", "^2", "--locked"],
  },
  { bin: "mprocs", tool: "mprocs", args: ["install", "--locked", "mprocs"] },
];
for (const { bin, tool, args } of cargoTools) {
  if (has(bin)) {
    mark(tool, "ok", version(bin));
  } else if (!hasCargo) {
    mark(tool, "missing-required", "needs Rust/cargo first");
  } else {
    info(`${tool} not found — installing via cargo (first time can take a few minutes)…`);
    const installed = run("cargo", args);
    mark(
      tool,
      installed ? "installed" : "missing-required",
      installed ? "" : "`cargo install` failed"
    );
  }
}

// ── Doppler — required for dev secrets; no single cross-platform installer ────
if (has("doppler")) mark("doppler", "ok", version("doppler"));
else mark("doppler", "missing-required", "install: https://docs.doppler.com/docs/cli");

// ── Docker — optional, only needed for the Seq log container ──────────────────
if (!has("docker"))
  mark("docker", "missing-optional", "https://docs.docker.com/get-docker/ (only needed for Seq)");
else if (!ok("docker", ["info"]))
  mark("docker", "missing-optional", "installed but not running (only needed for Seq)");
else mark("docker", "ok", version("docker"));

// ── Linux webview build deps for Tauri (mac/Windows ship a system webview) ────
if (process.platform === "linux") {
  const deps = [
    "pkg-config",
    "libgtk-3-dev",
    "libwebkit2gtk-4.1-dev",
    "libayatana-appindicator3-dev",
    "librsvg2-dev",
  ];
  if (has("dpkg") && has("apt-get")) {
    const missing = deps.filter((p) => !ok("dpkg", ["-s", p]));
    if (!missing.length) {
      mark("tauri-linux-deps", "ok", "all present");
    } else {
      info(`Installing Tauri Linux build deps (missing: ${missing.join(", ")})…`);
      const installed =
        run("sudo", ["apt-get", "update"]) && run("sudo", ["apt-get", "install", "-y", ...missing]);
      mark(
        "tauri-linux-deps",
        installed ? "installed" : "missing-required",
        installed ? "" : "apt-get failed — install manually"
      );
    }
  } else {
    mark(
      "tauri-linux-deps",
      "missing-optional",
      `non-Debian: install for your distro — ${deps.join(", ")}`
    );
  }
}

// ── Project bootstrap (always runnable under bun) ─────────────────────────────
info("Installing workspace dependencies…");
if (!run("bun", ["install"])) mark("bun install", "missing-required", "see output above");

info("Creating tmp/ directories…");
mkdirSync(join(repoRoot, "tmp", "segments"), { recursive: true });

info("Installing pinned ffmpeg…");
if (run("bun", ["run", "setup-ffmpeg"]))
  mark("ffmpeg", "ok", "pinned (scripts/ffmpeg-manifest.json)");
else mark("ffmpeg", "missing-required", "run `bun run setup-ffmpeg --force`");

info("Generating Relay compiler artifacts…");
if (!run("bun", ["run", "relay"], join(repoRoot, "client"))) {
  warn("Relay compiler failed — run `cd client && bun run relay` after fixing schema issues.");
}

if (process.platform !== "win32") {
  for (const s of ["stop.sh", "clean.sh"]) {
    try {
      chmodSync(join(repoRoot, "scripts", s), 0o755);
    } catch {
      // script not present — nothing to mark executable
    }
  }
}

if (has("doppler") && ok("doppler", ["configure", "get", "project"])) {
  info("Doppler configured — secrets injected by `doppler run` (bun run dev).");
} else if (has("doppler")) {
  warn(
    "Doppler installed but this checkout isn't linked. Run: doppler login && doppler setup --project xstream --config dev"
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
const glyph: Record<State, string> = {
  ok: `${C.green}✓${C.off}`,
  installed: `${C.green}✓ installed${C.off}`,
  "missing-required": `${C.red}✗${C.off}`,
  "missing-optional": `${C.yellow}!${C.off}`,
};
console.log("");
info("Dependency summary:");
for (const { tool, state, note } of report) {
  console.log(`  ${glyph[state]} ${tool}${note ? ` ${C.dim}— ${note}${C.off}` : ""}`);
}

const blockers = report.filter((r) => r.state === "missing-required");
console.log("");
if (blockers.length) {
  warn(
    `${blockers.length} required tool(s) still missing — install them, then re-run \`bun run setup:dev\`.`
  );
  process.exit(1);
}
info("Setup complete. Start development:");
console.log("");
console.log("    bun run dev          # Rust server + client dev (mprocs, secrets via Doppler)");
console.log("    bun run tauri:dev    # desktop shell with the embedded Rust server");
console.log("");
console.log("    GraphQL:  http://localhost:3002/graphql");
console.log("    Client:   http://localhost:5173");
console.log("");
info("See README.md for full usage.");
