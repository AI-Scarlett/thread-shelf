#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { BookmarkStore } from "./store.mjs";
import { normalizeTarget, openTarget } from "./core.mjs";
import { defaultStateDbPath, findCandidates, getTask, listTasks } from "./local-data.mjs";

const COMMAND_ALIASES = new Map([
  ["threads", "tasks"],
  ["get-active", "current"],
  ["get_active", "current"],
  ["bind", "set-current"],
  ["set_current", "set-current"],
]);
const COMMANDS = new Set(["tasks", "candidates", "list", "add", "remove", "open", "reveal", "current", "set-current"]);

function normalizedKey(key) {
  return key.replace(/^--/, "").replaceAll("-", "_");
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0].trim().startsWith("{")) {
    const value = JSON.parse(argv[0]);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("CLI JSON must be an object");
    return value;
  }
  const input = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equal = token.indexOf("=");
    if (equal >= 0) {
      input[normalizedKey(token.slice(0, equal))] = parseScalar(token.slice(equal + 1));
    } else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith("--")) {
      input[normalizedKey(token)] = parseScalar(argv[++index]);
    } else {
      input[normalizedKey(token)] = true;
    }
  }
  input.command ||= input.action || positional.shift();
  input._positional = positional;
  return input;
}

function commandName(input) {
  const raw = input.command || input.action;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("command is required");
  const name = raw.trim().toLowerCase();
  return COMMAND_ALIASES.get(name) || name;
}

function stateOptions(input) {
  return { stateDbPath: input.state_db || input.stateDb || defaultStateDbPath() };
}

function explicitThread(input) {
  const value = input.thread || input.thread_key || input.threadKey || input.session_id || input.sessionId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireThread(input, store, positional = false) {
  const fromPosition = positional && typeof input._positional?.[0] === "string" ? input._positional[0].trim() : null;
  const thread = explicitThread(input) || fromPosition || store.getActiveThread()?.thread;
  if (!thread) throw new Error("thread is required; pass --thread or run set-current first");
  return thread;
}

function requiredString(input, key, positionalIndex) {
  const value = input[key] ?? input._positional?.[positionalIndex];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

export async function executeCommand(input, {
  store: suppliedStore,
  opener = openTarget,
} = {}) {
  const command = commandName(input);
  if (!COMMANDS.has(command)) throw new Error(`Unknown command: ${command}`);
  const requestedCommand = String(input.command || input.action || "").toLowerCase();
  if (command === "tasks") {
    const tasks = listTasks({
      ...stateOptions(input),
      limit: input.limit ?? input._positional?.[0],
      includeArchived: input.include_archived === true || input.includeArchived === true,
    });
    return requestedCommand === "threads" ? { ok: true, threads: tasks, tasks } : { ok: true, tasks };
  }
  const ownsStore = !suppliedStore;
  const store = suppliedStore || new BookmarkStore(input.db || input.bookmark_db || input.bookmarkDb);
  try {
    if (command === "current") {
      const active = store.getActiveThread();
      if (["get-active", "get_active"].includes(requestedCommand)) {
        return { ok: true, thread: active?.thread || null, bound_at: active?.updated_at || null };
      }
      let task = null;
      if (active?.thread) task = getTask(active.thread, stateOptions(input));
      return { ok: true, thread: active?.thread || null, bound_at: active?.updated_at || null, task };
    }
    if (command === "set-current") {
      const thread = explicitThread(input) || input._positional?.[0];
      const binding = store.setActiveThread(thread);
      return { ok: true, thread: binding.thread, bound_at: binding.updated_at };
    }

    const thread = requireThread(input, store, ["candidates", "list"].includes(command));
    if (command === "candidates") {
      const result = await findCandidates(thread, { ...stateOptions(input), limit: input.limit });
      return { ok: true, thread, task: result.task, candidates: result.candidates };
    }
    if (command === "list") return { ok: true, thread, bookmarks: store.list(thread) };
    if (command === "add") {
      const target = requiredString(input, "target", 0);
      const item = normalizeTarget(target, input.kind);
      const title = input.title === undefined ? item.title : requiredString(input, "title");
      if (title.length > 160) throw new Error("title must be at most 160 characters");
      const bookmark = store.add({ threadKey: thread, ...item, title });
      return { ok: true, thread, bookmark };
    }
    if (["remove", "open", "reveal"].includes(command)) {
      const id = requiredString(input, "id", 0);
      if (command === "remove") {
        return { ok: true, thread, removed: store.remove(thread, id), disk_file_deleted: false };
      }
      const bookmark = store.get(thread, id);
      if (!bookmark) throw new Error("Bookmark not found in this task");
      if (command === "reveal" && bookmark.kind === "url") throw new Error("Web links cannot be revealed in a file manager");
      await opener(bookmark, command === "reveal");
      return { ok: true, thread, opened: true, revealed: command === "reveal", bookmark };
    }
  } finally {
    if (ownsStore) store.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await executeCommand(parseCliArgs(argv));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
