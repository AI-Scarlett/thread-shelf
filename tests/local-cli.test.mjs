import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { BookmarkStore } from "../server/store.mjs";
import { executeCommand, parseCliArgs } from "../server/local-cli.mjs";

const cliPath = resolve("server/local-cli.mjs");

test("parses JSON and conventional flag arguments", () => {
  assert.deepEqual(parseCliArgs(['{"command":"list","thread":"abc"}']), { command: "list", thread: "abc" });
  assert.deepEqual(parseCliArgs(["add", "--thread", "abc", "--target=/tmp/demo", "--include-archived"]), {
    command: "add", thread: "abc", target: "/tmp/demo", include_archived: true, _positional: [],
  });
});

test("supports active binding aliases and bookmark commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-cli-"));
  const file = join(dir, "artifact.txt");
  writeFileSync(file, "artifact");
  const store = new BookmarkStore(join(dir, "bookmarks.sqlite"));
  assert.equal((await executeCommand({ command: "bind", thread: "task-a" }, { store })).thread, "task-a");
  assert.equal((await executeCommand({ command: "get-active" }, { store })).thread, "task-a");
  const added = await executeCommand({ command: "add", target: file }, { store });
  const listed = await executeCommand({ command: "list" }, { store });
  assert.equal(listed.thread, "task-a");
  assert.equal(listed.bookmarks[0].id, added.bookmark.id);
  let opened;
  await executeCommand({ command: "open", id: added.bookmark.id }, { store, opener: (bookmark, reveal) => { opened = { bookmark, reveal }; } });
  assert.equal(opened.bookmark.target, file);
  assert.equal(opened.reveal, false);
  const removed = await executeCommand({ command: "remove", id: added.bookmark.id }, { store });
  assert.equal(removed.removed, true);
  store.close();
});

test("CLI writes one JSON value and exits nonzero on errors", () => {
  const result = spawnSync(process.execPath, [cliPath, "unknown-command"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.match(output.error, /Unknown command/);
  assert.equal(result.stdout.trim().split("\n").length, 1);
});

test("threads alias returns user tasks through the executable CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-cli-state-"));
  const stateDb = join(dir, "state.sqlite");
  const rollout = join(dir, "rollout.jsonl");
  writeFileSync(rollout, "");
  const db = new DatabaseSync(stateDb);
  db.exec("CREATE TABLE threads (id TEXT,title TEXT,cwd TEXT,rollout_path TEXT,updated_at INTEGER,thread_source TEXT,archived INTEGER)");
  db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?,?)").run("task-a", "Task A", dir, rollout, 1_700_000_000, "user", 0);
  db.close();
  const bookmarkDb = join(dir, "bookmarks.sqlite");
  const result = spawnSync(process.execPath, [cliPath, "threads", "--state-db", stateDb, "--db", bookmarkDb], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.threads[0].id, "task-a");
  assert.deepEqual(output.tasks, output.threads);
  assert.equal(existsSync(bookmarkDb), false, "the read-only threads command must not create a shelf database");
});
