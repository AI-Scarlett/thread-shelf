import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DASHBOARD_HOST,
  getPickerCommand,
  pickLocalTarget,
  resolveDashboardPort,
  startDashboard,
} from "../server/dashboard-server.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-dashboard-"));
  const artifact = join(dir, "artifact.html");
  writeFileSync(artifact, "<h1>Artifact</h1>");
  const rollout = join(dir, "rollout.jsonl");
  writeFileSync(rollout, `${JSON.stringify({
    type: "response_item",
    payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: `Result: \`${artifact}\` https://openai.com/research` }] },
  })}\n`);
  const stateDb = join(dir, "state.sqlite");
  const db = new DatabaseSync(stateDb);
  db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY,title TEXT,cwd TEXT,rollout_path TEXT,updated_at INTEGER,thread_source TEXT,archived INTEGER)");
  db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?,?)").run("thread-a", "Dashboard task", dir, rollout, 1_700_000_000, "user", 0);
  db.close();
  const webRoot = join(dir, "web");
  mkdirSync(webRoot);
  writeFileSync(join(webRoot, "index.html"), "<!doctype html><title>Thread Shelf</title>");
  writeFileSync(join(dir, "secret.txt"), "secret");
  return { dir, artifact, stateDb, webRoot, dbPath: join(dir, "bookmarks.sqlite") };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

function mutation(origin, path, method, body, extraHeaders = {}) {
  return jsonFetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, ...extraHeaders },
    body: JSON.stringify(body || {}),
  });
}

function rawGet(origin, path) {
  const url = new URL(origin);
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest({ hostname: url.hostname, port: url.port, path, method: "GET" }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolvePromise({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.once("error", reject);
    req.end();
  });
}

test("serves the dashboard and supports the complete task bookmark API", async t => {
  const data = fixture();
  const opened = [];
  const dashboard = await startDashboard({
    port: 0,
    dbPath: data.dbPath,
    stateDbPath: data.stateDb,
    webRoot: data.webRoot,
    opener: async (bookmark, reveal) => { opened.push({ bookmark, reveal }); },
    picker: async kind => ({ cancelled: false, target: kind === "file" ? data.artifact : data.dir }),
  });
  t.after(() => dashboard.close());
  assert.equal(dashboard.host, DASHBOARD_HOST);
  assert.match(dashboard.origin, /^http:\/\/127\.0\.0\.1:\d+$/);

  const page = await fetch(dashboard.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Thread Shelf/);
  const linkedFromCodex = await fetch(dashboard.url, { headers: { "Sec-Fetch-Site": "cross-site" } });
  assert.equal(linkedFromCodex.status, 200, "top-level GET navigation from Codex must be allowed");

  let result = await jsonFetch(`${dashboard.url}/api/threads`);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.threads.map(item => item.id), ["thread-a"]);

  result = await mutation(dashboard.url, "/api/current", "POST", { thread: "thread-a" });
  assert.equal(result.body.thread, "thread-a");
  result = await jsonFetch(`${dashboard.url}/api/current`);
  assert.equal(result.body.current.id, "thread-a");

  result = await jsonFetch(`${dashboard.url}/api/candidates?thread=thread-a`);
  assert.ok(result.body.candidates.some(item => item.target === data.artifact));
  assert.ok(result.body.candidates.some(item => item.target.startsWith("https://openai.com/research")));

  result = await mutation(dashboard.url, "/api/pick", "POST", { kind: "file", thread: "thread-a" });
  assert.equal(result.body.target, data.artifact);
  result = await mutation(dashboard.url, "/api/bookmarks", "POST", { thread: "thread-a", target: result.body.target });
  assert.equal(result.response.status, 201);
  const bookmark = result.body.bookmark;
  assert.equal(bookmark.kind, "html");

  result = await jsonFetch(`${dashboard.url}/api/bookmarks?thread=thread-a`);
  assert.deepEqual(result.body.bookmarks.map(item => item.id), [bookmark.id]);
  result = await mutation(dashboard.url, `/api/bookmarks/${bookmark.id}/open`, "POST", { thread: "thread-a" });
  assert.equal(result.body.opened, true);
  result = await mutation(dashboard.url, `/api/bookmarks/${bookmark.id}/reveal`, "POST", { thread: "thread-a" });
  assert.equal(result.body.revealed, true);
  assert.deepEqual(opened.map(item => item.reveal), [false, true]);

  result = await mutation(dashboard.url, `/api/bookmarks/${bookmark.id}?thread=thread-a`, "DELETE", {});
  assert.equal(result.body.removed, true);
  assert.equal(result.body.disk_file_deleted, false);
});

test("rejects cross-origin, non-JSON, oversized, CORS, and traversal requests", async t => {
  const data = fixture();
  const dashboard = await startDashboard({ port: 0, dbPath: data.dbPath, stateDbPath: data.stateDb, webRoot: data.webRoot, bodyLimit: 32 });
  t.after(() => dashboard.close());

  let result = await jsonFetch(`${dashboard.url}/api/current`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread: "thread-a" }),
  });
  assert.equal(result.response.status, 200, "JSON clients without an Origin header are allowed");

  result = await jsonFetch(`${dashboard.url}/api/current`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ thread: "thread-a" }),
  });
  assert.equal(result.response.status, 403);

  result = await jsonFetch(`${dashboard.url}/api/current`, {
    method: "POST", headers: { Origin: dashboard.url }, body: "thread=thread-a",
  });
  assert.equal(result.response.status, 415);

  result = await jsonFetch(`${dashboard.url}/api/current`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: dashboard.url }, body: JSON.stringify({ thread: "x".repeat(100) }),
  });
  assert.equal(result.response.status, 413);

  result = await jsonFetch(`${dashboard.url}/api/threads`, {
    method: "OPTIONS", headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "GET" },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.response.headers.get("access-control-allow-origin"), null);

  const traversal = await rawGet(dashboard.url, "/%2e%2e/secret.txt");
  assert.equal(traversal.status, 403);
  assert.doesNotMatch(traversal.body, /secret$/);
});

test("reuses an already-running Thread Shelf dashboard on the configured port", async t => {
  const data = fixture();
  const first = await startDashboard({ port: 0, dbPath: data.dbPath, stateDbPath: data.stateDb, webRoot: data.webRoot });
  t.after(() => first.close());
  const second = await startDashboard({ port: first.port, dbPath: join(data.dir, "second.sqlite"), stateDbPath: data.stateDb, webRoot: data.webRoot });
  assert.equal(second.reused, true);
  assert.equal(second.server, null);
  assert.equal(second.url, first.url);
  await second.close();
});

test("selects safe platform-specific picker commands and supports injected dialogs", async () => {
  assert.equal(getPickerCommand("file", "darwin").command, "osascript");
  assert.equal(getPickerCommand("file", "win32").command, "powershell.exe");
  assert.equal(getPickerCommand("directory", "linux").command, "zenity");
  assert.throws(() => getPickerCommand("url", "linux"), /kind must be/);
  let invocation;
  const selected = await pickLocalTarget("file", {
    platform: "win32",
    runner: async (command, args, options) => {
      invocation = { command, args, options };
      return { code: 0, stdout: "C:\\Users\\Me\\report.html\r\n", stderr: "" };
    },
  });
  assert.equal(invocation.command, "powershell.exe");
  assert.equal(invocation.options.shell, false);
  assert.equal(selected.target, "C:\\Users\\Me\\report.html");
  assert.deepEqual(await pickLocalTarget("directory", { platform: "linux", runner: async () => ({ code: 1, stdout: "", stderr: "cancelled" }) }), { cancelled: true });
});

test("validates dashboard port configuration", () => {
  assert.equal(resolveDashboardPort({}), 43125);
  assert.equal(resolveDashboardPort({ THREAD_SHELF_DASHBOARD_PORT: "43210" }), 43210);
  assert.throws(() => resolveDashboardPort({ THREAD_SHELF_DASHBOARD_PORT: "70000" }), /between 0 and 65535/);
});
