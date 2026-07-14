---
name: thread-shelf
description: Save, list, open, reveal, rename, reorder, or remove files, directories, images, HTML outputs, and URLs associated with the current Codex task. Use when the user says 收藏, 收藏栏, Thread Shelf, save this output, remember this file, show task bookmarks, or asks to reopen a prior artifact from this task.
---

# Thread Shelf

Use the `thread-shelf` MCP tools to maintain bookmarks scoped to the current task.

1. For “收藏这个/刚生成的文件”, identify only the concrete paths or URLs meant, then call `bookmark_add` once per item.
2. For “显示/打开收藏栏”, call `bookmark_list` and present compact clickable local-file links and web links.
3. Use bookmark IDs returned by `bookmark_list` for open, reveal, rename, reorder, and remove operations.
4. Removing a bookmark only removes its database record. Never delete, move, or rename the actual disk target.
5. If the host does not inject a task key, pass the current Codex task ID as `thread_key`. Never silently use a global bucket.
6. Do not bookmark secrets such as `.env`, private keys, credentials, or token files unless the user explicitly insists after a warning.
