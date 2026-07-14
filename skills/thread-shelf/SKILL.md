---
name: thread-shelf
description: Use the cross-platform local Thread Shelf Dashboard or MCP fallback to save, list, open, reveal, rename, reorder, or remove files, directories, images, HTML outputs, and URLs associated with a Codex task. Trigger when the user says 收藏, 收藏栏, Thread Shelf, save this output, remember this file, show task bookmarks, asks how to click-to-bookmark, or wants to reopen a prior artifact from a task.
---

# Thread Shelf

Thread Shelf is a pure local Codex plugin for macOS, Windows, and Linux. Its primary clickable UI is the browser Dashboard at `http://127.0.0.1:43125`. It does not require an Apps SDK App, public HTTPS endpoint, tunnel, or native companion application.

## Prefer the clickable workflow

When the user asks how to bookmark, view the shelf, or avoid natural-language commands:

1. Direct them to `http://127.0.0.1:43125`.
2. Tell them to confirm the Codex task in the top task selector. A trusted Hook normally keeps this current; manual selection is the fallback.
3. To save a discovered output, click its star in the candidate list.
4. To add another target, use the file/directory picker, local-path or HTTP(S)-URL field, clipboard action, or supported drag and drop.
5. Use the saved item's actions to open it, reveal it in Finder/File Explorer/the Linux file manager, or remove the bookmark.

The plugin MCP normally starts the localhost service. If the user explicitly asks Codex to open the Dashboard, use `bookmark_dashboard` when available; otherwise give the local URL. If the page is unavailable, instruct the user to run `npm run dashboard` from the plugin source directory. Do not claim that Thread Shelf automatically opens a browser without an explicit user action.

Do not tell the user to install a menu-bar, system-tray, or desktop companion. Do not claim that Thread Shelf can inject a button into Codex's native right-click menu or title bar.

## Natural-language fallback

Use the `thread-shelf` MCP tools only when the user explicitly asks Codex to perform the bookmark operation instead of using the Dashboard:

1. For “收藏这个/刚生成的文件”, identify only the concrete paths or URLs meant, then call `bookmark_add` once per item.
2. For “显示收藏”, call `bookmark_list` and present compact clickable local-file links and web links.
3. Use bookmark IDs returned by `bookmark_list` for open, reveal, rename, reorder, and remove operations.
4. If the host does not inject a task key, pass the current Codex task ID as `thread_key`. Never silently use a global bucket.

Removing a bookmark only removes its database record. Never delete, move, or rename the actual disk target. Do not bookmark secrets such as `.env`, private keys, credentials, or token files unless the user explicitly insists after a warning.
