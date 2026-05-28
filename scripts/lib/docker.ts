/**
 * docker — cross-platform docker invocation shared by the Seq scripts.
 *
 * On Linux it falls back to sudo (via a zenity askpass so it works without a
 * TTY, e.g. under mprocs) when the user lacks docker-socket access, and starts
 * the daemon through systemctl. macOS/Windows run Docker Desktop — no sudo, no
 * systemd — so those paths are skipped and the daemon is assumed user-managed.
 */

import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const isLinux = process.platform === "linux";

export interface Run {
  status: number;
  stdout: string;
}

// capture=true → grab stdout, swallow stderr (mirrors the scripts' `2>/dev/null`).
// capture=false → fully interactive (shows output, lets sudo -A prompt).
const spawn = (cmd: string, args: string[], capture: boolean, env?: NodeJS.ProcessEnv): Run => {
  const r = spawnSync(cmd, args, {
    stdio: capture ? ["ignore", "pipe", "ignore"] : "inherit",
    encoding: "utf8",
    env: env ?? process.env,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
};

let askpass: string | null = null;
let askpassResolved = false;
function askpassHelper(): string | null {
  if (askpassResolved) return askpass;
  askpassResolved = true;
  if (isLinux && Bun.which("zenity")) {
    askpass = join(tmpdir(), `seq-askpass-${process.pid}.sh`);
    writeFileSync(askpass, '#!/bin/sh\nzenity --password --title="[seq] sudo authentication"\n', {
      mode: 0o755,
    });
    process.on("exit", () => {
      try {
        if (askpass) rmSync(askpass);
      } catch {
        // best-effort cleanup
      }
    });
  }
  return askpass;
}

function sudo(args: string[], capture: boolean): Run {
  const noPass = spawn("sudo", ["-n", ...args], true); // probe NOPASSWD without prompting
  if (noPass.status === 0) return capture ? noPass : spawn("sudo", ["-n", ...args], false);
  const helper = askpassHelper();
  if (helper)
    return spawn("sudo", ["-A", ...args], capture, { ...process.env, SUDO_ASKPASS: helper });
  console.error(
    `[seq] sudo needs a password but no zenity askpass is available. Run manually: sudo ${args.join(" ")}`
  );
  process.exit(1);
}

/** True if the `docker` CLI is on PATH. */
export const hasDocker = (): boolean => Bun.which("docker") !== null;

/**
 * Run `docker <args>`. On Linux, retry under sudo only when the failure is a
 * docker-socket permission error — a daemon-down / other failure returns as-is
 * so callers (e.g. seq:stop) don't trigger a spurious sudo prompt.
 */
export function docker(args: string[], capture = false): Run {
  if (capture) {
    const r = spawnSync("docker", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (r.status === 0) return { status: 0, stdout: r.stdout ?? "" };
    if (isLinux && /permission denied/i.test(r.stderr ?? ""))
      return sudo(["docker", ...args], true);
    return { status: r.status ?? 1, stdout: r.stdout ?? "" };
  }
  // Show stdout live; on Linux swallow the first attempt's stderr since we may
  // retry under sudo, otherwise surface it (mac/Windows have no sudo fallback).
  const direct = spawnSync("docker", args, {
    stdio: ["inherit", "inherit", isLinux ? "ignore" : "inherit"],
    encoding: "utf8",
  });
  if (direct.status === 0 || !isLinux) return { status: direct.status ?? 1, stdout: "" };
  return sudo(["docker", ...args], false);
}

/** Ensure the Docker daemon is reachable. Linux: start via systemctl. Else: require Docker Desktop running. */
export function ensureDaemon(log: (m: string) => void, fail: (m: string) => never): void {
  if (!isLinux) {
    if (spawn("docker", ["info"], true).status !== 0)
      fail("Docker isn't running — start Docker Desktop, then re-run.");
    return;
  }
  const active = () => spawn("systemctl", ["is-active", "--quiet", "docker"], true).status === 0;
  if (active()) return;
  log("Docker not running — starting daemon…");
  if (spawn("systemctl", ["--user", "start", "docker"], true).status !== 0)
    sudo(["systemctl", "start", "docker"], false);
  for (let i = 0; i < 10; i++) {
    if (active()) return;
    Bun.sleepSync(1000);
  }
  fail("Docker daemon did not become ready in time.");
}
