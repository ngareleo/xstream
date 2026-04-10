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
import { join } from "path";
import { tmpdir } from "os";

const SHARED_TEST_DIR = join(tmpdir(), "tvke-test-shared");
mkdirSync(SHARED_TEST_DIR, { recursive: true });
process.env.DB_PATH = join(SHARED_TEST_DIR, "test.db");
