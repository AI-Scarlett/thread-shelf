import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

export function resolveThreadKey(input = {}, extra = {}) {
  const meta = extra?._meta || {};
  return input.thread_key || meta["openai/session"] || meta["openai/thread_id"] || meta.threadId || extra.sessionId || process.env.CODEX_THREAD_ID || null;
}
export function normalizeTarget(raw, requestedKind) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("target is required");
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    return { target: url.href, kind: "url", title: url.hostname };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error("Only local paths and HTTP(S) URLs are supported");
  const target = resolve(value);
  if (!existsSync(target)) throw new Error(`Path does not exist: ${target}`);
  const stat = statSync(target), ext = target.toLowerCase().split('.').pop();
  let kind = requestedKind || (stat.isDirectory() ? "directory" : (["png","jpg","jpeg","gif","webp","avif"].includes(ext) ? "image" : (["html","htm"].includes(ext) ? "html" : "file")));
  if (kind === "directory" && !stat.isDirectory()) throw new Error("Target is not a directory");
  if (kind === "url") throw new Error("A URL bookmark must use HTTP or HTTPS");
  return { target, kind, title: basename(target) };
}
export function openTarget(bookmark, reveal = false) {
  let command, args;
  if (process.platform === "darwin") { command = "open"; args = reveal && bookmark.kind !== "url" ? ["-R", bookmark.target] : [bookmark.target]; }
  else if (process.platform === "win32") { command = "explorer.exe"; args = reveal && bookmark.kind !== "url" ? ["/select,", bookmark.target] : [bookmark.target]; }
  else { command = "xdg-open"; args = [reveal && bookmark.kind !== "directory" ? dirname(bookmark.target) : bookmark.target]; }
  const child = spawn(command, args, { detached: true, stdio: "ignore", shell: false }); child.unref();
}
