// telemetry must be the first import — it registers the global OTel
// TracerProvider and propagator before any service module runs.
import "./telemetry/index.js";

import { mkdir } from "fs/promises";
import { handleProtocols, makeHandler as makeWsHandler } from "graphql-ws/lib/use/bun";

import { config } from "./config.js";
import { closeDb, getDb } from "./db/index.js";
import { schema, yoga } from "./routes/graphql.js";
import { handleStream } from "./routes/stream.js";
import { resolveFfmpegPaths } from "./services/ffmpegPath.js";
import { killAllJobs } from "./services/ffmpegPool.js";
import { detectHwAccel } from "./services/hwAccel.js";
import { restoreInterruptedJobs } from "./services/jobRestore.js";
import { scanLibraries } from "./services/libraryScanner.js";
import { isOmdbConfigured } from "./services/omdbService.js";
import { getOtelLogger } from "./telemetry/index.js";

const log = getOtelLogger("server");

async function bootstrap(): Promise<void> {
  // Ensure tmp directories exist
  await mkdir(config.segmentDir, { recursive: true });

  // Resolve the pinned ffmpeg install (scripts/ffmpeg-manifest.json).
  // Throws if the binary is missing or its version string does not match the
  // manifest pin, with a pointer to `bun run setup-ffmpeg`.
  const ffmpegPaths = resolveFfmpegPaths();
  log.info(`ffmpeg resolved — ${ffmpegPaths.versionString} at ${ffmpegPaths.ffmpeg}`, {
    ffmpeg_path: ffmpegPaths.ffmpeg,
    ffmpeg_version: ffmpegPaths.versionString,
  });

  // Probe hardware acceleration. This is fatal on failure when HW_ACCEL=auto
  // (default) — software 4K encode has been measured as unviable and we want
  // real driver regressions to surface loudly. HW_ACCEL=off skips the probe
  // and returns software immediately.
  await detectHwAccel(ffmpegPaths.ffmpeg, config.hardwareAcceleration);

  // Initialize DB (migrations run inside getDb)
  getDb();
  log.info("Database ready");

  // Warn early if OMDb is not configured — matchVideo will fail without it.
  // Key can be set via OMDB_API_KEY env var OR saved through Settings → Metadata.
  if (!isOmdbConfigured()) {
    const omdbWarning =
      "OMDb API key not configured — metadata matching will be unavailable. " +
      "Set OMDB_API_KEY env var or add the key in Settings → Metadata.";
    log.warn(omdbWarning);
  }

  // Restore any jobs that were running when server last died.
  // Jobs whose segment files still exist are restored to memory and marked
  // complete; jobs with no output are marked as error.
  await restoreInterruptedJobs();

  // Start continuous library scan loop. Runs immediately then repeats every
  // config.scanIntervalMs so the library stays up to date without any client
  // action. scanLibraries() is a no-op if a scan is already in progress.
  // Errors are caught per-iteration so a transient failure doesn't stop the loop.
  void (async () => {
    while (true) {
      try {
        log.info("Library scan started");
        await scanLibraries();
        log.info("Library scan complete");
      } catch (err) {
        log.error("Library scan error", { message: (err as Error).message });
      }
      await Bun.sleep(config.scanIntervalMs);
    }
  })();

  // Start HTTP + WebSocket server
  Bun.serve({
    port: config.port,
    // Disable idle timeout — the /stream/:jobId endpoint is a long-lived
    // chunked HTTP response and would be killed by the 10s default.
    idleTimeout: 0,

    async fetch(req, server) {
      const url = new URL(req.url);

      // Upgrade WebSocket connections for GraphQL subscriptions (graphql-ws protocol).
      if (url.pathname === "/graphql" && req.headers.get("upgrade") === "websocket") {
        const protocol = req.headers.get("sec-websocket-protocol") ?? "";
        if (!handleProtocols(protocol)) {
          return new Response("Bad Request: unsupported WebSocket subprotocol", { status: 400 });
        }
        if (!server.upgrade(req)) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return new Response();
      }

      // GraphQL endpoint (GET for introspection, POST for queries/mutations)
      if (url.pathname === "/graphql" || url.pathname.startsWith("/graphql")) {
        return yoga.handle(req);
      }

      // Binary streaming endpoint
      if (url.pathname.startsWith("/stream/")) {
        return handleStream(req);
      }

      return new Response("Not Found", { status: 404 });
    },

    // graphql-ws Bun handler manages the per-socket lifecycle.
    websocket: makeWsHandler({ schema }),
  });

  log.info("Server listening", { port: config.port });
}

async function shutdown(signal: string): Promise<void> {
  log.info("Shutdown initiated", { signal });
  await killAllJobs(5000);
  closeDb();
  log.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

bootstrap().catch((err) => {
  log.error("Fatal startup error", { message: (err as Error).message });
  process.exit(1);
});
