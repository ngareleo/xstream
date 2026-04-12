import { createHash } from "crypto";

import type { LibraryRow, MediaType } from "../../types.js";
import { DEFAULT_VIDEO_EXTENSIONS } from "../../types.js";
import { getDb } from "../index.js";

export function upsertLibrary(row: LibraryRow): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
    VALUES ($id, $name, $path, $media_type, $env, $video_extensions)
    ON CONFLICT(path) DO UPDATE SET
      name             = excluded.name,
      media_type       = excluded.media_type,
      env              = excluded.env,
      video_extensions = excluded.video_extensions
  `
  ).run({
    $id: row.id,
    $name: row.name,
    $path: row.path,
    $media_type: row.media_type,
    $env: row.env,
    $video_extensions: row.video_extensions,
  });
}

export function createLibrary(
  name: string,
  path: string,
  mediaType: MediaType,
  extensions: string[]
): LibraryRow {
  const id = createHash("sha1").update(path).digest("hex");
  const row: LibraryRow = {
    id,
    name,
    path,
    media_type: mediaType,
    env: "user",
    video_extensions: JSON.stringify(extensions.length > 0 ? extensions : DEFAULT_VIDEO_EXTENSIONS),
  };
  upsertLibrary(row);
  return getLibraryById(id) as LibraryRow;
}

export function deleteLibrary(id: string): boolean {
  const result = getDb().prepare("DELETE FROM libraries WHERE id = $id").run({ $id: id });
  return result.changes > 0;
}

export function getAllLibraries(): LibraryRow[] {
  return getDb().prepare("SELECT * FROM libraries").all() as LibraryRow[];
}

export function getLibraryById(id: string): LibraryRow | null {
  return getDb()
    .prepare("SELECT * FROM libraries WHERE id = $id")
    .get({ $id: id }) as LibraryRow | null;
}

export function updateLibrary(
  id: string,
  updates: { name?: string; path?: string; mediaType?: MediaType; extensions?: string[] }
): LibraryRow | null {
  const parts: string[] = [];
  const params: Record<string, string> = { $id: id };
  if (updates.name !== undefined) {
    parts.push("name = $name");
    params.$name = updates.name;
  }
  if (updates.path !== undefined) {
    parts.push("path = $path");
    params.$path = updates.path;
  }
  if (updates.mediaType !== undefined) {
    parts.push("media_type = $media_type");
    params.$media_type = updates.mediaType;
  }
  if (updates.extensions !== undefined) {
    parts.push("video_extensions = $video_extensions");
    params.$video_extensions = JSON.stringify(updates.extensions);
  }
  if (parts.length === 0) return getLibraryById(id);
  getDb()
    .prepare(`UPDATE libraries SET ${parts.join(", ")} WHERE id = $id`)
    .run(params);
  return getLibraryById(id);
}
