/**
 * Offline mock filesystem for the design-lab DirectoryBrowser.
 * Mirrors the GraphQL `listDirectory(path)` shape from the production
 * server (`server/src/graphql/resolvers/listDirectory.ts`) so a future
 * port can swap this map for a real call without changing the UI.
 */

export interface DirectoryEntry {
  name: string;
  path: string;
}

const TREE: Record<string, string[]> = {
  "/": ["home", "media", "mnt", "var"],
  "/home": ["ngareleo", "shared"],
  "/home/ngareleo": ["Movies", "Documents", "Downloads"],
  "/home/ngareleo/Movies": ["Inbox", "Archive"],
  "/home/ngareleo/Movies/Inbox": [],
  "/home/ngareleo/Movies/Archive": [],
  "/home/ngareleo/Documents": [],
  "/home/ngareleo/Downloads": [],
  "/home/shared": ["Family", "Guests"],
  "/home/shared/Family": [],
  "/home/shared/Guests": [],
  "/media": ["films", "tv", "docs", "music"],
  "/media/films": ["4k", "hd", "older"],
  "/media/films/4k": [],
  "/media/films/hd": [],
  "/media/films/older": [],
  "/media/tv": ["current", "classics", "kids"],
  "/media/tv/current": [],
  "/media/tv/classics": [],
  "/media/tv/kids": [],
  "/media/docs": [],
  "/media/music": [],
  "/mnt": ["nas", "external"],
  "/mnt/nas": ["films", "tv", "backups"],
  "/mnt/nas/films": [],
  "/mnt/nas/tv": [],
  "/mnt/nas/backups": [],
  "/mnt/external": [],
  "/var": ["media-imports"],
  "/var/media-imports": [],
};

export function listDirectory(path: string): DirectoryEntry[] {
  const normalised = path === "" ? "/" : path;
  const children = TREE[normalised] ?? null;
  if (children === null) return [];
  return children.map((name) => ({
    name,
    path: normalised === "/" ? `/${name}` : `${normalised}/${name}`,
  }));
}

/** Returns true when `path` is a known directory in the mock tree. */
export function isDirectory(path: string): boolean {
  const normalised = path === "" ? "/" : path;
  return Object.prototype.hasOwnProperty.call(TREE, normalised);
}

export function parentPath(path: string): string {
  if (path === "/" || path === "") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}
