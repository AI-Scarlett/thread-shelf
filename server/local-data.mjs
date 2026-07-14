import { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, win32 } from "node:path";
import { createInterface } from "node:readline";
import { normalizeTarget } from "./core.mjs";

export const DEFAULT_CODEX_HOME = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const candidateCache = new Map();

export function defaultStateDbPath() {
  return resolve(
    process.env.THREAD_SHELF_STATE_DB
      || process.env.CODEX_STATE_DB
      || process.env.STATE_DB
      || join(DEFAULT_CODEX_HOME, "state_5.sqlite"),
  );
}

function asLimit(value, fallback = 50) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }
  return number;
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
}

function assertThreadSchema(columns) {
  for (const name of ["id", "title", "cwd", "rollout_path", "updated_at"]) {
    if (!columns.has(name)) throw new Error(`Unsupported Codex state database: threads.${name} is missing`);
  }
}

function updatedMsExpression(columns) {
  return columns.has("updated_at_ms")
    ? "COALESCE(NULLIF(updated_at_ms, 0), updated_at * 1000)"
    : "updated_at * 1000";
}

function userThreadPredicate(columns) {
  if (columns.has("thread_source")) {
    const legacyMain = columns.has("agent_path")
      ? "(COALESCE(thread_source, '') = '' AND COALESCE(agent_path, '') = '')"
      : "COALESCE(thread_source, '') = ''";
    return `(thread_source = 'user' OR ${legacyMain})`;
  }
  if (columns.has("agent_path")) return "COALESCE(agent_path, '') = ''";
  // Old Codex state databases predate sub-agent rows, so all rows are main tasks.
  return "1 = 1";
}

function mapTask(row) {
  let updatedAtMs = Number(row.updated_at_ms);
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) updatedAtMs = Number(row.raw_updated_at) * 1000;
  if (updatedAtMs > 0 && updatedAtMs < 1e12) updatedAtMs *= 1000;
  const updatedAt = new Date(updatedAtMs).toISOString();
  return {
    id: row.id,
    title: row.title,
    cwd: row.cwd,
    rollout_path: row.rollout_path,
    updated: updatedAt,
    updated_at: updatedAt,
    updated_at_ms: updatedAtMs,
  };
}

function openStateDatabase(stateDbPath) {
  const path = resolve(stateDbPath || defaultStateDbPath());
  if (!existsSync(path)) throw new Error(`Codex state database not found: ${path}`);
  return new DatabaseSync(path, { readOnly: true });
}

export function listTasks({ stateDbPath = defaultStateDbPath(), limit = 50, includeArchived = false } = {}) {
  const db = openStateDatabase(stateDbPath);
  try {
    const columns = tableColumns(db, "threads");
    assertThreadSchema(columns);
    const updatedMs = updatedMsExpression(columns);
    const predicates = [userThreadPredicate(columns)];
    if (!includeArchived && columns.has("archived")) predicates.push("COALESCE(archived, 0) = 0");
    const rows = db.prepare(`SELECT id,title,cwd,rollout_path,updated_at AS raw_updated_at,
      ${updatedMs} AS updated_at_ms
      FROM threads WHERE ${predicates.join(" AND ")}
      ORDER BY ${updatedMs} DESC, id DESC LIMIT ?`).all(asLimit(limit));
    return rows.map(mapTask);
  } finally {
    db.close();
  }
}

export function getTask(threadId, { stateDbPath = defaultStateDbPath() } = {}) {
  if (typeof threadId !== "string" || !threadId.trim()) throw new Error("thread is required");
  const db = openStateDatabase(stateDbPath);
  try {
    const columns = tableColumns(db, "threads");
    assertThreadSchema(columns);
    const updatedMs = updatedMsExpression(columns);
    const row = db.prepare(`SELECT id,title,cwd,rollout_path,updated_at AS raw_updated_at,
      ${updatedMs} AS updated_at_ms FROM threads WHERE id = ?`).get(threadId.trim());
    return row ? mapTask(row) : null;
  } finally {
    db.close();
  }
}

function selectedTexts(record) {
  const payload = record?.payload;
  if (!payload || typeof payload !== "object") return [];
  if (record.type === "response_item") {
    if (payload.type === "message" && payload.role === "assistant") return collectText(payload.content);
  }
  if (record.type === "event_msg" && payload.type === "agent_message") {
    return typeof payload.message === "string" ? [payload.message] : [];
  }
  return [];
}

function collectText(value, result = []) {
  if (typeof value === "string") {
    result.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectText(item, result);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key !== "encrypted_content") collectText(item, result);
    }
  }
  return result;
}

function trimUrl(raw) {
  return raw.replace(/&amp;/gi, "&").replace(/[.,;:!?，。；：！？、\]\[}\)>）】》」』]+$/g, "");
}

function isSensitiveUrl(url) {
  if (url.username || url.password) return true;
  for (const key of url.searchParams.keys()) {
    if (/(?:^|[_-])(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|secret|signature|credential|authorization|auth|sig|key)(?:$|[_-])/i.test(key)) return true;
  }
  return false;
}

function normalizeUrlCandidate(raw) {
  try {
    const url = new URL(trimUrl(raw));
    if (!/^https?:$/.test(url.protocol) || isSensitiveUrl(url)) return null;
    if (/(?:^|\.)example\.(?:com|org|net|invalid)$/i.test(url.hostname)) return null;
    if (/\.(?:example|invalid|test)$/i.test(url.hostname)) return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch {
    return null;
  }
}

function pathIsSensitiveOrNoise(path, context) {
  const normalized = path.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  const parts = lower.split("/").filter(Boolean);
  if (parts.some(part => part.startsWith(".") && part !== ".well-known")) return true;
  if (parts.some(part => /^(?:\.env(?:\..*)?|\.ssh|\.gnupg|\.aws|\.netrc|credentials?(?:\..*)?|secrets?(?:\..*)?|auth(?:\..*)?|tokens?(?:\..*)?|id_(?:rsa|ed25519)(?:\..*)?|.*private[_-]?key.*|.*api[_-]?key.*)$/.test(part))) return true;
  if (/(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(lower)) return true;
  if (/(?:^|\/)\.codex\/(?:sessions|logs|memories?|plugins\/cache)(?:\/|$)/.test(lower)) return true;
  if (/\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm))?$/.test(lower)) return true;
  if (/\/(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(lower)) return true;
  if (context.rolloutPath && resolve(path) === resolve(context.rolloutPath)) return true;
  if (context.stateDbPath && resolve(path) === resolve(context.stateDbPath)) return true;
  if (context.cwd && resolve(path) === resolve(context.cwd)) return true;
  return false;
}

function cleanPathText(raw) {
  let value = raw.trim().replace(/^<|>$/g, "");
  if (value.startsWith("file://")) {
    try { value = decodeURIComponent(new URL(value).pathname); } catch { return null; }
  }
  value = value.replace(/[#:]L?\d+(?::\d+)?$/i, "");
  value = value.replace(/[.,;:!?\]\[}\)>]+$/g, "");
  return value;
}

function existingPathFrom(raw) {
  let candidate = cleanPathText(raw);
  if (!candidate || (!candidate.startsWith("/") && !win32.isAbsolute(candidate))) return null;
  while (candidate.length > 1) {
    if (existsSync(candidate)) return resolve(candidate);
    const previous = candidate;
    candidate = candidate.replace(/\s+\S+$/, "").replace(/[.,;:!?\]\[}\)>]+$/g, "").trimEnd();
    if (candidate === previous) candidate = candidate.replace(/[，。；：！？、）】》」』].*$/, "").trimEnd();
    if (candidate === previous) break;
  }
  return null;
}

export function extractRawPathCandidates(text) {
  const result = [];
  const patterns = [
    /!?(?:\[[^\]]*\])\((?:<)?(file:\/\/\/[^)>\n]+|\/[^)>\n]+)(?:>)?\)/g,
    /`(file:\/\/\/[^`\n]+|\/[^`\n]+)`/g,
    /<(file:\/\/\/[^>\n]+|\/[^>\n]+)>/g,
    /(?:^|[\s"'(])(\/(?:Users|home|tmp|private|var|Volumes|Applications|opt|workspace|root)\/[^\n\r\t"'`<>|{}\[\]]+)/gm,
    /(?:^|[\s"'(])([A-Za-z]:\\(?:[^\n\r\t"'`<>|{}\[\]]+))/gm,
    /(?:^|[\s"'(])(\\\\[^\\\s]+\\[^\n\r\t"'`<>|{}\[\]]+)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) result.push(match[1]);
  }
  return result;
}

export function extractCandidatesFromText(text, context = {}) {
  if (typeof text !== "string" || !text) return [];
  const candidates = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`\u3000-\u9fff\uff00-\uffef]+/gi)) {
    const target = normalizeUrlCandidate(match[0]);
    if (target) candidates.push({ kind: "url", target, title: new URL(target).hostname });
  }
  for (const raw of extractRawPathCandidates(text)) {
    const target = existingPathFrom(raw);
    if (!target || pathIsSensitiveOrNoise(target, context)) continue;
    try {
      const item = normalizeTarget(target);
      candidates.push({ kind: item.kind, target: item.target, title: item.title || basename(target) });
    } catch {
      // A target can disappear while a live rollout is being parsed.
    }
  }
  return candidates;
}

export async function findCandidates(threadId, {
  stateDbPath = defaultStateDbPath(),
  limit = 100,
} = {}) {
  const task = getTask(threadId, { stateDbPath });
  if (!task) throw new Error(`Codex task not found: ${threadId}`);
  if (!task.rollout_path || !existsSync(task.rollout_path) || !statSync(task.rollout_path).isFile()) {
    throw new Error(`Rollout file not found for task ${threadId}`);
  }
  const max = asLimit(limit, 100);
  const stat = statSync(task.rollout_path);
  const cacheKey = `${resolve(stateDbPath)}\0${threadId}`;
  const cached = candidateCache.get(cacheKey);
  if (cached && cached.rolloutPath === resolve(task.rollout_path)
    && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { task, candidates: cached.candidates.slice(0, max) };
  }
  const found = new Map();
  const context = { cwd: task.cwd, rolloutPath: task.rollout_path, stateDbPath };
  const lines = createInterface({ input: createReadStream(task.rollout_path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    for (const text of selectedTexts(record)) {
      for (const candidate of extractCandidatesFromText(text, context)) {
        found.delete(candidate.target);
        found.set(candidate.target, candidate);
        if (found.size > 500) found.delete(found.keys().next().value);
      }
    }
  }
  const candidates = [...found.values()].reverse();
  candidateCache.set(cacheKey, {
    rolloutPath: resolve(task.rollout_path), mtimeMs: stat.mtimeMs, size: stat.size, candidates,
  });
  if (candidateCache.size > 128) candidateCache.delete(candidateCache.keys().next().value);
  return { task, candidates: candidates.slice(0, max) };
}
