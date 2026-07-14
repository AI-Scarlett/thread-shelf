import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { BookmarkStore, resolveDefaultDbPath } from "../server/store.mjs";
import { normalizeTarget, resolveThreadKey } from "../server/core.mjs";

test("isolates tasks and removal never deletes the disk file", () => {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-")), file = join(dir, "demo.html");
  writeFileSync(file, "<h1>demo</h1>");
  const store = new BookmarkStore(join(dir, "test.sqlite")), item = normalizeTarget(file);
  const saved = store.add({ threadKey: "task-a", ...item, title: item.title });
  assert.equal(store.list("task-a").length, 1); assert.equal(store.list("task-b").length, 0); assert.equal(saved.kind, "html");
  assert.equal(store.remove("task-a", saved.id), true); assert.equal(existsSync(file), true); store.close();
});
test("resolves explicit and host task keys", () => {
  assert.equal(resolveThreadKey({ thread_key: "explicit" }, { _meta: { "openai/session": "host" } }), "explicit");
  assert.equal(resolveThreadKey({}, { _meta: { "openai/session": "host" } }), "host"); assert.equal(resolveThreadKey({}, { sessionId: "transport" }), "transport");
});
test("accepts file URLs and rejects unsupported URL schemes", () => {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-file-url-"));
  const file = join(dir, "artifact.txt");
  writeFileSync(file, "artifact");
  assert.equal(normalizeTarget(pathToFileURL(file).href).target, file);
  assert.throws(() => normalizeTarget("ftp://example.com/file"), /Only local paths/);
  assert.throws(() => normalizeTarget("C:\\missing\\report.html"), /Path does not exist/);
});
test("persists one active task binding", () => {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-active-"));
  const path = join(dir, "test.sqlite");
  const first = new BookmarkStore(path);
  assert.equal(first.getActiveThread(), null);
  assert.equal(first.setActiveThread("task-a").thread, "task-a");
  first.close();
  const reopened = new BookmarkStore(path);
  assert.equal(reopened.getActiveThread().thread, "task-a");
  reopened.close();
});
test("MCP and companion share a fixed database unless THREAD_SHELF_DATA is explicit", () => {
  assert.equal(
    resolveDefaultDbPath({ PLUGIN_DATA: "/plugin-only" }, "/Users/tester"),
    resolve("/Users/tester/.codex/thread-shelf/bookmarks.sqlite"),
  );
  assert.equal(
    resolveDefaultDbPath({ PLUGIN_DATA: "/plugin-only", THREAD_SHELF_DATA: "/shared/shelf" }, "/Users/tester"),
    resolve("/shared/shelf/bookmarks.sqlite"),
  );
});
