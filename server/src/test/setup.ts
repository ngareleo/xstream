/**
 * Bun test preload — runs in every test worker before any test file is evaluated.
 *
 * Sets DB_PATH to a single shared temp file so all test files see the same
 * SQLite database. This avoids a race condition where multiple test workers
 * write to process.env.DB_PATH at startup and corrupt each other's singleton.
 *
 * Tests must use unique IDs (not rely on total row counts) since they all share
 * this one database.
 */
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Namespace by PID so concurrent `bun test` invocations on the same machine
// (e.g. parallel CI jobs) each get their own isolated SQLite file.
const SHARED_TEST_DIR = join(tmpdir(), `tvke-test-${process.pid}`);
mkdirSync(SHARED_TEST_DIR, { recursive: true });
process.env.DB_PATH = join(SHARED_TEST_DIR, "test.db");
