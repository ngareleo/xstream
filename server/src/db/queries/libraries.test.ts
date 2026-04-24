/**
 * Integration tests for the libraries DB query functions.
 * Uses a temp SQLite database to verify the actual SQL is correct.
 */
// DB_PATH is set by src/test/setup.ts (Bun preload) — do not override it here.
import { describe, expect, test } from "bun:test";

const { upsertLibrary, getAllLibraries, getLibraryById } = await import("./libraries.js");

const LIB: Parameters<typeof upsertLibrary>[0] = {
  id: "lib1",
  name: "My Videos",
  path: "/home/user/Videos",
  media_type: "movies",
  env: "dev",
  video_extensions: "[]",
};

describe("upsertLibrary", () => {
  test("inserts a new library row", () => {
    upsertLibrary(LIB);
    const row = getLibraryById("lib1");
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.name).toBe("My Videos");
    expect(row.path).toBe("/home/user/Videos");
    expect(row.media_type).toBe("movies");
    expect(row.env).toBe("dev");
  });

  test("ON CONFLICT updates name, media_type, env when path matches", () => {
    upsertLibrary({ ...LIB, name: "Updated Name", media_type: "tvShows", env: "prod" });
    const row = getLibraryById("lib1");
    if (!row) return;
    expect(row.name).toBe("Updated Name");
    expect(row.media_type).toBe("tvShows");
    expect(row.env).toBe("prod");
    // path and id must remain the same
    expect(row.path).toBe("/home/user/Videos");
    expect(row.id).toBe("lib1");
  });

  test("two libraries with different paths coexist", () => {
    upsertLibrary({
      id: "lib2",
      name: "Movies",
      path: "/mnt/movies",
      media_type: "movies",
      env: "prod",
      video_extensions: "[]",
    });
    upsertLibrary({
      id: "lib3",
      name: "TV",
      path: "/mnt/tv",
      media_type: "tvShows",
      env: "prod",
      video_extensions: "[]",
    });
    const all = getAllLibraries();
    const paths = all.map((r) => r.path);
    expect(paths).toContain("/home/user/Videos");
    expect(paths).toContain("/mnt/movies");
    expect(paths).toContain("/mnt/tv");
  });
});

describe("getAllLibraries", () => {
  test("returns all rows", () => {
    const all = getAllLibraries();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  test("each row has required fields", () => {
    const all = getAllLibraries();
    for (const row of all) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.name).toBe("string");
      expect(typeof row.path).toBe("string");
      expect(typeof row.media_type).toBe("string");
      expect(typeof row.env).toBe("string");
    }
  });
});

describe("getLibraryById", () => {
  test("returns null for unknown id", () => {
    expect(getLibraryById("no-such-lib")).toBeNull();
  });

  test("returns the correct row by id", () => {
    upsertLibrary({
      id: "lib4",
      name: "Exact",
      path: "/exact/path",
      media_type: "movies",
      env: "dev",
      video_extensions: "[]",
    });
    const row = getLibraryById("lib4");
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.id).toBe("lib4");
    expect(row.name).toBe("Exact");
  });
});
