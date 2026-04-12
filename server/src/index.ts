import { mkdir } from "fs/promises";
import { handleProtocols, makeHandler as makeWsHandler } from "graphql-ws/lib/use/bun";

import { config } from "./config.js";
import { closeDb, getDb } from "./db/index.js";
import { schema, yoga } from "./routes/graphql.js";
import { handleStream } from "./routes/stream.js";
import { killAllActiveJobs } from "./services/chunker.js";
import { restoreInterruptedJobs } from "./services/jobRestore.js";
import { scanLibraries } from "./services/libraryScanner.js";
import { isOmdbConfigured } from "./services/omdbService.js";

async function bootstrap(): Promise<void> {
  // Ensure tmp directories exist
  await mkdir(config.segmentDir, { recursive: true });

  // Initialize DB (migrations run inside getDb)
  getDb();
  console.log("[server] Database ready");

  // Warn early if OMDb is not configured — matchVideo will fail without it.
  // Key can be set via OMDB_API_KEY env var OR saved through Settings → Metadata.
  if (!isOmdbConfigured()) {
    console.warn(
      "[server] OMDb API key not configured — metadata matching will be unavailable. " +
        "Set OMDB_API_KEY env var or add the key in Settings → Metadata."
    );
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
        console.log("[server] Scanning media libraries...");
        await scanLibraries();
        console.log("[server] Library scan complete");
      } catch (err) {
        console.error("[server] Scan error (will retry):", err);
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

  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log(`[server] GraphQL at http://localhost:${config.port}/graphql`);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received — shutting down`);
  await killAllActiveJobs(5000);
  closeDb();
  console.log("[server] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

bootstrap().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
