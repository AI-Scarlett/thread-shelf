import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractCandidatesFromText, extractRawPathCandidates, findCandidates, getTask, listTasks } from "../server/local-data.mjs";

function makeStateFixture() {
  const dir = mkdtempSync(join(tmpdir(), "thread-shelf-state-"));
  const outputDir = join(dir, "outputs with spaces");
  mkdirSync(outputDir);
  const html = join(outputDir, "report.html");
  const image = join(outputDir, "cover.png");
  const toolNoise = join(outputDir, "internal.log");
  const secret = join(dir, ".env");
  writeFileSync(html, "<h1>report</h1>");
  writeFileSync(image, "png");
  writeFileSync(toolNoise, "noise");
  writeFileSync(secret, "API_KEY=nope");
  const rollout = join(dir, "rollout.jsonl");
  const records = [
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: `完成：[报告](<${html}>)，图片 \`${image}\`，配置 \`${secret}\`。在线页 https://github.com/openai/codex ，假的 https://example.com/demo` }] } },
    { type: "response_item", payload: { type: "function_call_output", output: `tool internals ${toolNoise} https://tool-noise.test/private\nmissing ${join(dir, "missing.txt")}` } },
    { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "https://should-not-appear.invalid/private" }] } },
  ];
  writeFileSync(rollout, `${records.map(record => JSON.stringify(record)).join("\n")}\n`);
  const dbPath = join(dir, "state.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE threads (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, cwd TEXT NOT NULL, rollout_path TEXT NOT NULL,
    updated_at INTEGER NOT NULL, updated_at_ms INTEGER, thread_source TEXT, agent_path TEXT,
    archived INTEGER NOT NULL DEFAULT 0
  )`);
  const insert = db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?)");
  insert.run("main-new", "New task", dir, rollout, 1_700_000_000, 1_700_000_000_123, "user", null, 0);
  insert.run("main-old", "Old task", dir, rollout, 1_600_000_000, null, "user", null, 0);
  insert.run("subagent", "Worker", dir, rollout, 1_800_000_000, null, "subagent", "/root/worker", 0);
  insert.run("archived", "Archived", dir, rollout, 1_900_000_000, null, "user", null, 1);
  db.close();
  return { dir, dbPath, rollout, html, image, secret, toolNoise };
}

test("lists only unarchived user-owned main tasks from a read-only Codex database", () => {
  const fixture = makeStateFixture();
  const tasks = listTasks({ stateDbPath: fixture.dbPath });
  assert.deepEqual(tasks.map(task => task.id), ["main-new", "main-old"]);
  assert.equal(tasks[0].updated_at, "2023-11-14T22:13:20.123Z");
  assert.equal(tasks[0].updated, tasks[0].updated_at);
  assert.equal(tasks[0].updated_at_ms, 1_700_000_000_123);
  assert.equal(getTask("subagent", { stateDbPath: fixture.dbPath }).title, "Worker");
});

test("extracts existing artifacts and safe URLs while filtering secrets and noise", async () => {
  const fixture = makeStateFixture();
  const { candidates } = await findCandidates("main-new", { stateDbPath: fixture.dbPath });
  assert.equal(candidates.filter(item => item.target === fixture.html).length, 1);
  assert.ok(candidates.some(item => item.target === fixture.image && item.kind === "image"));
  assert.ok(candidates.some(item => item.target === "https://github.com/openai/codex" || item.target === "https://github.com/openai/codex/"));
  assert.ok(!candidates.some(item => item.target === fixture.secret));
  assert.ok(!candidates.some(item => item.target.includes("example.com")));
  assert.ok(!candidates.some(item => item.target.includes("missing.txt")));
  assert.ok(!candidates.some(item => item.target === fixture.toolNoise));
  assert.ok(!candidates.some(item => item.target.includes("tool-noise.test")));
});

test("filters credential-bearing and placeholder URLs", () => {
  const result = extractCandidatesFromText("https://api.openai.com/a?access_token=secret https://files.openai.com/a?X-Amz-Signature=secret https://openai.com/research https://service.example/mcp https://thread-shelf.example.com/mcp");
  assert.deepEqual(result, [{ kind: "url", target: "https://openai.com/research", title: "openai.com" }]);
});

test("recognizes Windows drive and UNC paths before filesystem validation", () => {
  const paths = extractRawPathCandidates("Files: C:\\Users\\Me\\report.html and \\\\server\\share\\folder\\image.png");
  assert.ok(paths.some(path => path.startsWith("C:\\Users\\Me\\report.html")));
  assert.ok(paths.some(path => path.startsWith("\\\\server\\share\\folder\\image.png")));
});

test("candidate cache invalidates when rollout size changes", async () => {
  const fixture = makeStateFixture();
  const first = await findCandidates("main-new", { stateDbPath: fixture.dbPath, limit: 1 });
  assert.equal(first.candidates.length, 1);
  const extraUrl = "https://openai.com/new-cache-entry";
  appendFileSync(fixture.rollout, `${JSON.stringify({
    type: "response_item",
    payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: extraUrl }] },
  })}\n`);
  const second = await findCandidates("main-new", { stateDbPath: fixture.dbPath, limit: 100 });
  assert.ok(second.candidates.some(item => item.target === extraUrl));
  assert.ok(second.candidates.length > 1, "a limit=1 cache entry must not truncate later reads");
});
