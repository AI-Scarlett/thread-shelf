#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BookmarkStore } from "./store.mjs";
import { openTarget } from "./core.mjs";
import { defaultStateDbPath } from "./local-data.mjs";
import { executeCommand } from "./local-cli.mjs";

export const DASHBOARD_HOST = "127.0.0.1";
export const DEFAULT_DASHBOARD_PORT = 43125;
export const DASHBOARD_SERVICE = "thread-shelf-dashboard";
const DEFAULT_BODY_LIMIT = 64 * 1024;
const DEFAULT_WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "web");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function resolveDashboardPort(env = process.env) {
  const raw = env.THREAD_SHELF_DASHBOARD_PORT ?? env.THREAD_SHELF_PORT ?? DEFAULT_DASHBOARD_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("THREAD_SHELF_DASHBOARD_PORT must be an integer between 0 and 65535");
  }
  return port;
}

function pickerScript(kind, platform) {
  if (!['file', 'directory'].includes(kind)) throw new Error("kind must be file or directory");
  if (platform === "darwin") {
    const choice = kind === "directory"
      ? 'choose folder with prompt "Choose a folder to bookmark"'
      : 'choose file with prompt "Choose a file to bookmark"';
    return { command: "osascript", args: ["-e", `POSIX path of (${choice})`] };
  }
  if (platform === "win32") {
    const script = kind === "directory"
      ? "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Out.Write($d.SelectedPath)}"
      : "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.OpenFileDialog; if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Out.Write($d.FileName)}";
    return { command: "powershell.exe", args: ["-NoProfile", "-STA", "-Command", script] };
  }
  return {
    command: "zenity",
    args: kind === "directory"
      ? ["--file-selection", "--directory", "--title=Choose a folder to bookmark"]
      : ["--file-selection", "--title=Choose a file to bookmark"],
  };
}

export function getPickerCommand(kind, platform = process.platform) {
  return pickerScript(kind, platform);
}

function runPickerProcess(command, args, { spawnImpl = spawn } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnImpl(command, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding?.("utf8");
    child.stderr?.setEncoding?.("utf8");
    child.stdout?.on("data", chunk => { if (stdout.length < 64 * 1024) stdout += chunk; });
    child.stderr?.on("data", chunk => { if (stderr.length < 64 * 1024) stderr += chunk; });
    child.once("error", reject);
    child.once("close", code => resolvePromise({ code, stdout, stderr }));
  });
}

export async function pickLocalTarget(kind, {
  platform = process.platform,
  runner = runPickerProcess,
} = {}) {
  const spec = getPickerCommand(kind, platform);
  let result;
  try {
    result = await runner(spec.command, spec.args, { shell: false });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(platform === "linux"
        ? "No graphical file picker was found. Install zenity or paste the path manually."
        : "The system file picker could not be started.");
    }
    throw error;
  }
  const target = String(result?.stdout || "").trim();
  if (result?.code !== 0 || !target) return { cancelled: true };
  return { cancelled: false, target };
}

function json(res, status, value, extraHeaders = {}) {
  const body = status === 204 ? "" : `${JSON.stringify(value)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(body);
}

function contentType(path) {
  return new Map([
    [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
    [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
    [".gif", "image/gif"], [".webp", "image/webp"], [".ico", "image/x-icon"],
  ]).get(extname(path).toLowerCase()) || "application/octet-stream";
}

function assertMutationOrigin(req, origin) {
  const supplied = req.headers.origin;
  if (supplied && supplied !== origin) throw new HttpError(403, "Cross-origin requests are not allowed");
  if (req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Cross-site requests are not allowed");
}

async function readJson(req, limit) {
  const type = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "Content-Type must be application/json");
  const declared = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, "Request body is too large");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request body is too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "Request body must be a JSON object");
  }
}

function queryInput(url) {
  const result = {};
  for (const [key, value] of url.searchParams) result[key.replaceAll("-", "_")] = value;
  return result;
}

async function apiRequest(req, res, url, context) {
  const { store, stateDbPath, opener, picker, bodyLimit, origin } = context;
  const common = { store, opener };
  const state = { state_db: stateDbPath };
  const path = url.pathname;

  if (path === "/api/health" && req.method === "GET") {
    return json(res, 200, { ok: true, service: DASHBOARD_SERVICE, version: 1 });
  }
  if (path === "/api/threads" && req.method === "GET") {
    const result = await executeCommand({ command: "threads", ...state, ...queryInput(url) }, common);
    return json(res, 200, result);
  }
  if (path === "/api/current" && req.method === "GET") {
    const result = await executeCommand({ command: "current", ...state }, common);
    return json(res, 200, { ...result, current: result.task || null });
  }
  if (path === "/api/bookmarks" && req.method === "GET") {
    const result = await executeCommand({ command: "list", ...queryInput(url) }, common);
    return json(res, 200, result);
  }
  if (path === "/api/candidates" && req.method === "GET") {
    const result = await executeCommand({ command: "candidates", ...state, ...queryInput(url) }, common);
    return json(res, 200, result);
  }

  if (!["POST", "DELETE"].includes(req.method)) throw new HttpError(405, "Method not allowed");
  const body = await readJson(req, bodyLimit);
  const input = { ...queryInput(url), ...body };
  if (path === "/api/current" && req.method === "POST") {
    const result = await executeCommand({ command: "set-current", ...input }, common);
    return json(res, 200, { ...result, current: result.thread });
  }
  if (path === "/api/open-system-browser" && req.method === "POST") {
    const target = new URL("/?compact=1", origin).toString();
    await opener({ kind: "url", target, title: "Thread Shelf" }, false);
    return json(res, 200, { ok: true, opened: true, url: target, browser: "system_default" });
  }
  if ((path === "/api/pick" || path === "/api/pick-file" || path === "/api/pick-directory") && req.method === "POST") {
    const kind = path === "/api/pick-file" ? "file" : path === "/api/pick-directory" ? "directory" : input.kind;
    if (!['file', 'directory'].includes(kind)) throw new HttpError(400, "kind must be file or directory");
    const result = await picker(kind);
    return json(res, 200, result.cancelled ? { ok: true, cancelled: true } : { ok: true, cancelled: false, target: result.target });
  }
  if ((path === "/api/bookmarks" || path === "/api/add") && req.method === "POST") {
    const result = await executeCommand({ command: "add", ...input }, common);
    return json(res, 201, result);
  }

  const bookmarkAction = path.match(/^\/api\/bookmarks\/([^/]+)(?:\/(open|reveal))?$/);
  if (bookmarkAction) {
    let id;
    try { id = decodeURIComponent(bookmarkAction[1]); } catch { throw new HttpError(400, "Invalid bookmark id"); }
    const action = bookmarkAction[2];
    if (!action && req.method === "DELETE") {
      const result = await executeCommand({ command: "remove", ...input, id }, common);
      return json(res, 200, result);
    }
    if (action && req.method === "POST") {
      const result = await executeCommand({ command: action, ...input, id }, common);
      return json(res, 200, result);
    }
    throw new HttpError(405, "Method not allowed");
  }

  for (const action of ["remove", "open", "reveal"]) {
    if (path === `/api/${action}` && (req.method === "POST" || (action === "remove" && req.method === "DELETE"))) {
      const result = await executeCommand({ command: action, ...input }, common);
      return json(res, 200, result);
    }
  }
  throw new HttpError(404, "API endpoint not found");
}

function safeStaticPath(rawUrl, webRoot) {
  const rawPath = String(rawUrl || "/").split("?", 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(rawPath); }
  catch { throw new HttpError(400, "Invalid URL encoding"); }
  if (decoded.includes("\0") || decoded.includes("\\")) throw new HttpError(403, "Invalid static path");
  if (decoded.split("/").some(part => part === "..")) throw new HttpError(403, "Path traversal is not allowed");
  const requested = decoded === "/" ? "/index.html" : decoded;
  const root = resolve(webRoot);
  let target = resolve(root, `.${requested}`);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new HttpError(403, "Path traversal is not allowed");
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
  return target;
}

function serveStatic(req, res, webRoot) {
  if (!["GET", "HEAD"].includes(req.method)) throw new HttpError(405, "Method not allowed");
  const target = safeStaticPath(req.url, webRoot);
  if (!existsSync(target) || !statSync(target).isFile()) throw new HttpError(404, "Not found");
  const stat = statSync(target);
  res.writeHead(200, {
    "Content-Type": contentType(target),
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(target).pipe(res);
}

export function createDashboardServer({
  store,
  stateDbPath = defaultStateDbPath(),
  webRoot = DEFAULT_WEB_ROOT,
  opener = openTarget,
  picker = kind => pickLocalTarget(kind),
  bodyLimit = DEFAULT_BODY_LIMIT,
  getOrigin,
} = {}) {
  if (!store) throw new Error("store is required");
  return createServer(async (req, res) => {
    try {
      const origin = getOrigin();
      if (["POST", "DELETE", "OPTIONS"].includes(req.method)) assertMutationOrigin(req, origin);
      if (req.method === "OPTIONS") throw new HttpError(403, "CORS requests are not allowed");
      const url = new URL(req.url || "/", origin);
      if (url.pathname.startsWith("/api/")) {
        await apiRequest(req, res, url, { store, stateDbPath, opener, picker, bodyLimit, origin });
      } else {
        serveStatic(req, res, webRoot);
      }
    } catch (error) {
      if (res.headersSent) return res.destroy(error);
      const status = error instanceof HttpError ? error.status : 400;
      json(res, status, { ok: false, error: error?.message || String(error) });
    }
  });
}

async function probeDashboard(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.service === DASHBOARD_SERVICE;
  } catch {
    return false;
  }
}

export async function startDashboard({
  host = DASHBOARD_HOST,
  port = resolveDashboardPort(),
  dbPath,
  store: suppliedStore,
  stateDbPath = defaultStateDbPath(),
  webRoot = DEFAULT_WEB_ROOT,
  opener = openTarget,
  picker = kind => pickLocalTarget(kind),
  bodyLimit = DEFAULT_BODY_LIMIT,
} = {}) {
  if (host !== DASHBOARD_HOST) throw new Error(`Dashboard host must be ${DASHBOARD_HOST}`);
  const ownsStore = !suppliedStore;
  const store = suppliedStore || new BookmarkStore(dbPath);
  let origin = `http://${DASHBOARD_HOST}:${port}`;
  const server = createDashboardServer({ store, stateDbPath, webRoot, opener, picker, bodyLimit, getOrigin: () => origin });
  try {
    await new Promise((resolvePromise, reject) => {
      const onError = error => { server.off("listening", onListening); reject(error); };
      const onListening = () => { server.off("error", onError); resolvePromise(); };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, DASHBOARD_HOST);
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE" && port !== 0 && await probeDashboard(origin)) {
      if (ownsStore) store.close();
      return { origin, url: origin, port, host: DASHBOARD_HOST, reused: true, server: null, close: async () => {} };
    }
    if (ownsStore) store.close();
    throw error;
  }
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  origin = `http://${DASHBOARD_HOST}:${actualPort}`;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise()));
    if (ownsStore) store.close();
  };
  return { origin, url: origin, port: actualPort, host: DASHBOARD_HOST, reused: false, server, close };
}

async function main() {
  const dashboard = await startDashboard();
  process.stderr.write(`Thread Shelf dashboard: ${dashboard.url}${dashboard.reused ? " (already running)" : ""}\n`);
  const stop = async () => { await dashboard.close(); process.exit(0); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`Thread Shelf dashboard failed: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
