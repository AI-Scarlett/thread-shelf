import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compactDashboardUrl, dashboardToolResponse, shouldOpenDashboard } from "../server/dashboard-link.mjs";

test("builds a compact dashboard URL without losing existing query values", () => {
  assert.equal(compactDashboardUrl("http://127.0.0.1:43125/"), "http://127.0.0.1:43125/?compact=1");
  assert.equal(compactDashboardUrl("http://127.0.0.1:43125/?source=codex"), "http://127.0.0.1:43125/?source=codex&compact=1");
});

test("dashboard opening is opt-in and the tool result exposes a clickable compact URL", () => {
  assert.equal(shouldOpenDashboard(undefined), false);
  assert.equal(shouldOpenDashboard(false), false);
  assert.equal(shouldOpenDashboard(true), true);

  const result = dashboardToolResponse({
    threadKey: "task-a",
    dashboardUrl: "http://127.0.0.1:43125/",
    opened: false,
  });
  assert.equal(result.structuredContent.url, "http://127.0.0.1:43125/?compact=1");
  assert.equal(result.structuredContent.opened, false);
  assert.equal(result.structuredContent.in_app_browser_scope, "current_task_only");
  assert.match(result.content[0].text, /\[打开紧凑版 Dashboard\]\(http:\/\/127\.0\.0\.1:43125\/\?compact=1\)/);
  assert.match(result.content[0].text, /Chrome、Edge 或 Safari/);
});

test("web assets expose a query-activated compact mode without hiding bookmark actions", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../web/app.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../web/styles.css", import.meta.url), "utf8");
  assert.match(html, /id="view-mode"/);
  assert.match(html, /id="open-system-browser"/);
  assert.match(script, /get\("compact"\) === "1"/);
  assert.match(styles, /html\.compact-mode/);
  assert.match(styles, /\.compact-mode \.bookmark-actions \.item-button:nth-child\(2\) \{ display: grid; \}/);
});
