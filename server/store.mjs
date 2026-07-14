import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_DB = resolve(process.env.PLUGIN_DATA || `${process.env.HOME}/.codex/thread-shelf`, "bookmarks.sqlite");

export class BookmarkStore {
  constructor(dbPath = DEFAULT_DB) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        thread_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('file','directory','image','html','url')),
        target TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(thread_key, target)
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_thread_order ON bookmarks(thread_key, sort_order, created_at);
    `);
  }
  list(key) { return this.db.prepare("SELECT * FROM bookmarks WHERE thread_key = ? ORDER BY sort_order, created_at").all(key); }
  add({ threadKey, kind, target, title }) {
    const now = new Date().toISOString();
    const order = this.db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM bookmarks WHERE thread_key = ?").get(threadKey).n;
    const id = randomUUID();
    this.db.prepare(`INSERT INTO bookmarks (id,thread_key,kind,target,title,sort_order,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(thread_key,target) DO UPDATE SET kind=excluded.kind,title=excluded.title,updated_at=excluded.updated_at`)
      .run(id, threadKey, kind, target, title, order, now, now);
    return this.db.prepare("SELECT * FROM bookmarks WHERE thread_key = ? AND target = ?").get(threadKey, target);
  }
  get(key, id) { return this.db.prepare("SELECT * FROM bookmarks WHERE thread_key = ? AND id = ?").get(key, id); }
  remove(key, id) { return this.db.prepare("DELETE FROM bookmarks WHERE thread_key = ? AND id = ?").run(key, id).changes > 0; }
  rename(key, id, title) {
    this.db.prepare("UPDATE bookmarks SET title=?,updated_at=? WHERE thread_key=? AND id=?").run(title, new Date().toISOString(), key, id);
    return this.get(key, id);
  }
  reorder(key, ids) {
    this.db.exec("BEGIN");
    try {
      const update = this.db.prepare("UPDATE bookmarks SET sort_order=?,updated_at=? WHERE thread_key=? AND id=?");
      ids.forEach((id, i) => update.run(i, new Date().toISOString(), key, id));
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.list(key);
  }
  close() { this.db.close(); }
}
