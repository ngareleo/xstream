/**
 * Connection-time PRAGMAs are part of the data-correctness contract:
 *
 *  - `journal_mode = wal` is what makes the chunker's parallel writes safe
 *    against the GraphQL resolvers' reads. Without it, readers see SQLITE_BUSY.
 *  - `foreign_keys = on` is what makes the cascade-delete chain
 *    (libraries → videos → segments / metadata / watchlist) actually fire.
 *    Without it, deleting a library leaves orphaned rows that surface in
 *    the player UI as ghost media.
 *
 * The Rust port has to set the same PRAGMAs. This test is the contract.
 */
import { describe, expect, it } from "bun:test";

import { getDb } from "../../index.js";
import { upsertVideo } from "../videos.js";

describe("DB connection PRAGMAs", () => {
  const db = getDb();

  it("journal_mode is WAL", () => {
    const row = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(row.journal_mode.toLowerCase()).toBe("wal");
  });

  it("foreign_keys is enabled", () => {
    const row = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });

  it("FK violation on video insert with non-existent library throws", () => {
    expect(() =>
      upsertVideo({
        id: "pragmas-test-orphan-video",
        library_id: "pragmas-test-no-such-library-id",
        path: "/tmp/pragmas-test-orphan/file.mkv",
        filename: "file.mkv",
        title: "Orphan Test",
        duration_seconds: 0,
        file_size_bytes: 0,
        bitrate: 0,
        scanned_at: new Date().toISOString(),
        content_fingerprint: "pragmas-test-fingerprint",
      })
    ).toThrow();
  });
});
