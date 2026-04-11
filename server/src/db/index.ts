import { Database } from "bun:sqlite";

import { config } from "../config.js";
import { migrate } from "./migrate.js";

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(config.dbPath, { create: true });
    _db.exec("PRAGMA journal_mode = WAL;");
    _db.exec("PRAGMA foreign_keys = ON;");
    migrate(_db);
  }
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
