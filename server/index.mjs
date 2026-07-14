#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BookmarkStore } from "./store.mjs";
import { normalizeTarget, openTarget, resolveThreadKey } from "./core.mjs";

const server = new McpServer({ name: "thread-shelf", version: "0.1.0" });
const store = new BookmarkStore();
const threadField = { thread_key: z.string().min(1).optional().describe("Stable task/thread key; usually injected by the host") };
const response = data => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data });
const withThread = handler => async (input, extra) => {
  try {
    const key = resolveThreadKey(input, extra);
    if (!key) throw new Error("The host did not provide a task identifier. Pass thread_key explicitly for this task.");
    return response(await handler(input, key));
  } catch (error) { return { isError: true, content: [{ type: "text", text: error.message }] }; }
};

server.registerTool("bookmark_list", {
  title: "List task bookmarks", description: "List artifacts and links saved for this Codex task.", inputSchema: threadField,
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
}, withThread((_, key) => ({ thread_key: key, bookmarks: store.list(key) })));

server.registerTool("bookmark_add", {
  title: "Add task bookmark", description: "Save an existing local path or HTTP(S) URL to this task's shelf.",
  inputSchema: { ...threadField, target: z.string().min(1), title: z.string().min(1).max(160).optional(), kind: z.enum(["file","directory","image","html","url"]).optional() },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false }
}, withThread((input, key) => { const item = normalizeTarget(input.target, input.kind); return { bookmark: store.add({ threadKey: key, ...item, title: input.title || item.title }) }; }));

server.registerTool("bookmark_remove", {
  title: "Remove task bookmark", description: "Remove only the shelf entry; never delete the actual disk target.",
  inputSchema: { ...threadField, id: z.string().uuid() }, annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true }
}, withThread((input, key) => ({ removed: store.remove(key, input.id), disk_file_deleted: false })));

server.registerTool("bookmark_rename", {
  title: "Rename task bookmark", description: "Change the display title without renaming the actual file.",
  inputSchema: { ...threadField, id: z.string().uuid(), title: z.string().min(1).max(160) }, annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false }
}, withThread((input, key) => ({ bookmark: store.rename(key, input.id, input.title) })));

server.registerTool("bookmark_reorder", {
  title: "Reorder task bookmarks", description: "Set the shelf display order.",
  inputSchema: { ...threadField, ids: z.array(z.string().uuid()).min(1) }, annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false }
}, withThread((input, key) => ({ bookmarks: store.reorder(key, input.ids) })));

for (const [name, reveal] of [["bookmark_open", false], ["bookmark_reveal", true]]) {
  server.registerTool(name, {
    title: reveal ? "Reveal task bookmark" : "Open task bookmark",
    description: reveal ? "Reveal a saved local bookmark in the system file manager." : "Open a saved bookmark with the default application.",
    inputSchema: { ...threadField, id: z.string().uuid() }, annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
  }, withThread((input, key) => {
    const bookmark = store.get(key, input.id);
    if (!bookmark) throw new Error("Bookmark not found in this task");
    if (reveal && bookmark.kind === "url") throw new Error("Web links cannot be revealed in a file manager");
    openTarget(bookmark, reveal); return { opened: true, bookmark };
  }));
}

await server.connect(new StdioServerTransport());
