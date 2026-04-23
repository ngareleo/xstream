#!/usr/bin/env bun
/**
 * test-chunking — exercise the server's chunking pipeline without React/MSE.
 *
 * Fires `startTranscode` against the dev server's GraphQL endpoint, opens
 * `/stream/:jobId` and parses the length-prefixed binary frames, then prints
 * a per-segment + summary report. Same code path as a real playback session
 * (same orphan timer, same VAAPI cascade, same Seq spans) — just curl-style.
 *
 * Usage:
 *   bun run scripts/test-chunking.ts --video "fury road" --resolution 4k
 *   bun run scripts/test-chunking.ts --video VmlkZW86… --resolution 1080p
 *                                    --start 600 --duration 300
 *                                    --save-segments tmp/inspect/
 *   bun run scripts/test-chunking.ts --list
 *
 * Exits 0 on success, 1 on resolve/mutation/stream error, 2 on a wire/disk
 * segment-count mismatch.
 */

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { parseArgs } from "node:util";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3001";
const ROOT = pathResolve(import.meta.dir, "..");
const SEGMENTS_DIR = pathResolve(ROOT, "tmp", "segments");

const RESOLUTION_MAP: Record<string, string> = {
  "240p": "RESOLUTION_240P",
  "360p": "RESOLUTION_360P",
  "480p": "RESOLUTION_480P",
  "720p": "RESOLUTION_720P",
  "1080p": "RESOLUTION_1080P",
  "4k": "RESOLUTION_4K",
};

interface VideoNode {
  id: string;
  filename: string;
  title: string | null;
  durationSeconds: number;
}

interface JobNode {
  id: string;
  status: string;
}

// ── GraphQL helper ─────────────────────────────────────────────────────────

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SERVER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("GraphQL response missing data");
  return json.data;
}

// ── Video resolution ───────────────────────────────────────────────────────

async function listVideos(): Promise<VideoNode[]> {
  const data = await gql<{ videos: { edges: Array<{ node: VideoNode }> } }>(`
    query {
      videos(first: 200) {
        edges { node { id filename title durationSeconds } }
      }
    }
  `);
  return data.videos.edges.map((e) => e.node);
}

function resolveVideo(videos: VideoNode[], spec: string): VideoNode {
  const exactById = videos.find((v) => v.id === spec);
  if (exactById) return exactById;
  const lower = spec.toLowerCase();
  const matches = videos.filter((v) => v.filename.toLowerCase().includes(lower));
  if (matches.length === 0) {
    throw new Error(`No video matches "${spec}". Try --list to see options.`);
  }
  if (matches.length > 1) {
    const list = matches.map((v) => `  ${v.id}  ${v.filename}`).join("\n");
    throw new Error(`Ambiguous --video "${spec}" — ${matches.length} matches:\n${list}`);
  }
  return matches[0];
}

// Decode a Relay global ID like base64("TranscodeJob:<sha1>") → "<sha1>"
function decodeRawJobId(globalId: string): string {
  const decoded = Buffer.from(globalId, "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep === -1) throw new Error(`Bad global ID format: "${decoded}"`);
  return decoded.slice(sep + 1);
}

// ── Mutation ───────────────────────────────────────────────────────────────

async function startTranscode(
  videoId: string,
  resolution: string,
  startTimeSeconds: number,
  endTimeSeconds: number
): Promise<JobNode> {
  const data = await gql<{ startTranscode: JobNode }>(
    `
    mutation Start($videoId: ID!, $resolution: Resolution!, $start: Float, $end: Float) {
      startTranscode(
        videoId: $videoId
        resolution: $resolution
        startTimeSeconds: $start
        endTimeSeconds: $end
      ) {
        id
        status
      }
    }
  `,
    { videoId, resolution, start: startTimeSeconds, end: endTimeSeconds }
  );
  return data.startTranscode;
}

// ── Stream consumer (length-prefixed binary frame parser) ──────────────────

interface StreamSummary {
  initSize: number | null;
  segments: Array<{ index: number; bytes: number; receivedAtMs: number }>;
  totalBytes: number;
  firstByteAtMs: number | null;
  closedAtMs: number;
}

async function consumeStream(
  rawJobId: string,
  startedAtMs: number,
  saveDir: string | null
): Promise<StreamSummary> {
  const url = `${SERVER_URL}/stream/${rawJobId}`;
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Stream HTTP ${res.status} ${res.statusText}`);
  }
  console.log(`[+${elapsed(startedAtMs).toFixed(2)}s]   stream open`);

  if (saveDir) mkdirSync(saveDir, { recursive: true });

  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  const summary: StreamSummary = {
    initSize: null,
    segments: [],
    totalBytes: 0,
    firstByteAtMs: null,
    closedAtMs: 0,
  };

  // Length-prefix parser — accumulate, peel off complete frames
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (summary.firstByteAtMs === null) summary.firstByteAtMs = Date.now();
    if (value) {
      // Append value to buf
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf, 0);
      next.set(value, buf.length);
      buf = next;
    }
    // Drain as many complete frames as possible
    while (buf.length >= 4) {
      const frameLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false);
      if (buf.length < 4 + frameLen) break;
      const frame = buf.slice(4, 4 + frameLen);
      buf = buf.slice(4 + frameLen);

      if (summary.initSize === null) {
        summary.initSize = frame.length;
        summary.totalBytes += frame.length;
        if (saveDir) writeFileSync(pathResolve(saveDir, "init.mp4"), frame);
        console.log(
          `[+${elapsed(startedAtMs).toFixed(2)}s]   init.mp4 received (${humanBytes(frame.length)})`
        );
      } else {
        const idx = summary.segments.length;
        summary.totalBytes += frame.length;
        summary.segments.push({ index: idx, bytes: frame.length, receivedAtMs: Date.now() });
        if (saveDir) {
          const name = `segment_${String(idx).padStart(4, "0")}.m4s`;
          writeFileSync(pathResolve(saveDir, name), frame);
        }
        console.log(
          `[+${elapsed(startedAtMs).toFixed(2)}s]   segment_${String(idx).padStart(4, "0")} ` +
            `(${humanBytes(frame.length)})  cum ${humanBytes(summary.totalBytes)}`
        );
      }
    }
  }
  summary.closedAtMs = Date.now();
  return summary;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function elapsed(sinceMs: number): number {
  return (Date.now() - sinceMs) / 1000;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main ───────────────────────────────────────────────────────────────────

function usage(): void {
  console.log(`Usage:
  bun run scripts/test-chunking.ts --video <spec> --resolution <res> [--start N] [--duration N] [--save-segments DIR]
  bun run scripts/test-chunking.ts --list

  --video        Filename substring (case-insensitive) OR a Relay global ID.
                 Must match exactly one video.
  --resolution   240p | 360p | 480p | 720p | 1080p | 4k
  --start        Source-time seconds to begin from (default 0)
  --duration     Chunk duration in seconds (default 300)
  --save-segments  Write init.mp4 + segment_NNNN.m4s to this directory

  Server URL via env SERVER_URL (default http://localhost:3001).`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      video: { type: "string" },
      resolution: { type: "string" },
      start: { type: "string", default: "0" },
      duration: { type: "string", default: "300" },
      "save-segments": { type: "string" },
      list: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    usage();
    return 0;
  }

  if (values.list) {
    const videos = await listVideos();
    if (videos.length === 0) {
      console.log("No videos in library. Run a scan from the client first.");
      return 0;
    }
    for (const v of videos) {
      console.log(`  ${v.id}  ${v.filename}  (${v.durationSeconds.toFixed(0)}s)`);
    }
    return 0;
  }

  if (!values.video || !values.resolution) {
    usage();
    return 1;
  }

  const gqlResolution = RESOLUTION_MAP[values.resolution.toLowerCase()];
  if (!gqlResolution) {
    console.error(`Unknown --resolution "${values.resolution}". Valid: ${Object.keys(RESOLUTION_MAP).join(", ")}`);
    return 1;
  }

  const startSec = parseFloat(values.start);
  const durationSec = parseFloat(values.duration);
  if (!Number.isFinite(startSec) || !Number.isFinite(durationSec) || durationSec <= 0) {
    console.error("--start must be ≥ 0 and --duration must be > 0");
    return 1;
  }
  const endSec = startSec + durationSec;

  // 1. Resolve video
  const videos = await listVideos();
  const video = resolveVideo(videos, values.video);
  console.log(
    `Resolved video: ${video.id}  (${video.filename}, ${video.durationSeconds.toFixed(0)}s)`
  );
  console.log(
    `Mutation:       startTranscode([${startSec}s, ${endSec}s), ${gqlResolution}) ...`
  );

  // 2. Start transcode + decode raw job id
  const startedAtMs = Date.now();
  const job = await startTranscode(video.id, gqlResolution, startSec, endSec);
  const rawJobId = decodeRawJobId(job.id);
  console.log(`Job:            ${rawJobId}\n`);

  // 3. Open stream + consume
  const summary = await consumeStream(rawJobId, startedAtMs, values["save-segments"] ?? null);
  const wallSec = (summary.closedAtMs - startedAtMs) / 1000;

  console.log(`\nStream closed.`);
  console.log(`  Segments:   ${summary.segments.length}`);
  console.log(`  Total:      ${humanBytes(summary.totalBytes)}`);
  console.log(`  Wall-time:  ${wallSec.toFixed(1)} s`);

  // 4. Disk verification
  let diskOk = true;
  try {
    const jobDir = pathResolve(SEGMENTS_DIR, rawJobId);
    const m4sFiles = readdirSync(jobDir).filter((n) => n.endsWith(".m4s"));
    const indicator = m4sFiles.length === summary.segments.length ? "✓" : "✗ MISMATCH";
    console.log(`  Disk:       ${m4sFiles.length} files in tmp/segments/${rawJobId.slice(0, 8)}…  ${indicator}`);
    if (m4sFiles.length !== summary.segments.length) diskOk = false;
  } catch (err) {
    console.log(`  Disk:       (could not enumerate: ${(err as Error).message})`);
  }

  if (summary.segments.length === 0) {
    console.log(`\nFAIL — 0 segments received. Check Seq for the failure reason.`);
    return 1;
  }
  if (!diskOk) {
    console.log(`\nFAIL — wire/disk segment count mismatch.`);
    return 2;
  }
  console.log(`\nOK`);
  return 0;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exit(1);
}
