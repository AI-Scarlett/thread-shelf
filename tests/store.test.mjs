import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BookmarkStore } from "../server/store.mjs";
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
test("rejects unsupported URL schemes", () => assert.throws(() => normalizeTarget("file:///etc/passwd"), /Only local paths/));
