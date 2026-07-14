---
name: thread-shelf
description: Use the cross-platform local Thread Shelf Dashboard or MCP fallback to save, list, open, reveal, rename, reorder, or remove files, directories, images, HTML outputs, and URLs associated with a Codex task. Trigger when the user says 收藏, 收藏栏, Thread Shelf, save this output, remember this file, show task bookmarks, asks how to click-to-bookmark, or wants to reopen a prior artifact from a task.
---

# Thread Shelf

Thread Shelf is a pure local Codex plugin for macOS, Windows, and Linux. Its primary clickable UI is the browser Dashboard; the narrow-pane-friendly URL is `http://127.0.0.1:43125/?compact=1`. It does not require an Apps SDK App, public HTTPS endpoint, tunnel, or native companion application.

## Prefer the clickable workflow

When the user asks how to bookmark, view the shelf, or avoid natural-language commands:

1. Give them the clickable compact URL `http://127.0.0.1:43125/?compact=1`.
2. Recommend pinning one compact Dashboard tab in their normal Chrome, Edge, or Safari browser. If they are viewing the page in Codex's in-app Browser, tell them to click “在系统浏览器打开” once and pin the new normal-browser tab. That page can follow Hook task updates. Do not claim that a Codex in-app Browser tab persists across tasks: it is task-scoped. `Cmd/Ctrl+Shift+B` only shows or hides the in-app Browser for the current task.
3. Tell them to confirm the Codex task in the top task selector. A trusted Hook normally keeps this current; manual selection is the fallback.
4. To save a discovered output, click its star in the candidate list.
5. To add another target, use the file/directory picker, local-path or HTTP(S)-URL field, clipboard action, or supported drag and drop.
6. Use the saved item's actions to open it, reveal it in Finder/File Explorer/the Linux file manager, or remove the bookmark.

The plugin MCP normally starts the localhost service. If the user asks for the Dashboard, use `bookmark_dashboard` when available; it returns a clickable compact URL and does not open a browser by default. Pass `open: true` only when the user explicitly asks to open it, and describe that action as opening the system default browser, not the Codex in-app Browser. If the page is unavailable, instruct the user to run `npm run dashboard` from the plugin source directory.

Do not tell the user to install a menu-bar, system-tray, or desktop companion. Do not claim that Thread Shelf can inject a button into Codex's native right-click menu, title bar, Browser toolbar, or right sidebar. The compact page is a layout, not a host-pinned sidebar.

## Natural-language fallback

Use the `thread-shelf` MCP tools only when the user explicitly asks Codex to perform the bookmark operation instead of using the Dashboard:

1. For “收藏这个/刚生成的文件”, identify only the concrete paths or URLs meant, then call `bookmark_add` once per item.
2. For “显示收藏”, call `bookmark_list` and present compact clickable local-file links and web links.
3. Use bookmark IDs returned by `bookmark_list` for open, reveal, rename, reorder, and remove operations.
4. If the host does not inject a task key, pass the current Codex task ID as `thread_key`. Never silently use a global bucket.

Removing a bookmark only removes its database record. Never delete, move, or rename the actual disk target. Do not bookmark secrets such as `.env`, private keys, credentials, or token files unless the user explicitly insists after a warning.
