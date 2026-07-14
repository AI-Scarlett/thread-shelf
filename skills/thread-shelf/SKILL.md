---
name: thread-shelf
description: Use the cross-platform local Thread Shelf Dashboard or MCP fallback to save, list, open, reveal, rename, reorder, or remove files, directories, images, HTML outputs, and URLs associated with a Codex task. When explicitly invoked without another request, open the current task shelf in the Codex built-in browser. Trigger when the user says 收藏, 收藏栏, Thread Shelf, save this output, remember this file, show task bookmarks, asks how to click-to-bookmark, or wants to reopen a prior artifact from a task.
---

# Thread Shelf

Thread Shelf is a pure local Codex plugin for macOS, Windows, and Linux. Its primary clickable UI is the browser Dashboard; the narrow-pane-friendly URL is `http://127.0.0.1:43125/?compact=1`. The primary surface is the current task's Codex built-in Browser. It does not require an Apps SDK App, public HTTPS endpoint, tunnel, or native companion application.

## Prefer the current-task in-app workflow

When the user asks how to bookmark, view the shelf, or avoid natural-language commands:

1. In the Codex composer, type `@` and select the **Thread Shelf** plugin. In the current desktop app, the user can also type `/`, find **Thread Shelf** under the **Skills** group, and select it. Do not promise a literal `/thread-shelf` command: slash selection inserts the skill mention. The composer's `+` menu is for attachments such as files and images, not the Thread Shelf picker.
2. If the user sends the Thread Shelf plugin or skill mention with no additional request, treat that as “打开当前任务收藏栏”. Do not ask them to type another natural-language instruction.
3. Call `bookmark_dashboard` with the current task key and leave `open` unset. This binds the Dashboard to the current task and returns the clickable compact URL `http://127.0.0.1:43125/?compact=1`.
4. If callable Codex in-app Browser control is available, navigate that Browser directly to the returned URL. Otherwise show the returned Markdown link; clicking it opens the local page in the current task's built-in Browser. Do not set `open: true` for this path because that option explicitly launches the system default browser.
5. When the user switches to another task, have them invoke **Thread Shelf** there once. In-app Browser tabs are task-scoped, which is useful here: each task opens its own task-bound shelf. `Cmd/Ctrl+Shift+B` shows or hides the in-app Browser for the current task.
6. Tell them to confirm the Codex task in the top task selector. The tool binding and trusted Hook normally keep this current; manual selection is the fallback.
7. To save a discovered output, click its star in the candidate list. To add another target, use the file/directory picker, local-path or HTTP(S)-URL field, clipboard action, or supported drag and drop.
8. Use the saved item's actions to open it, reveal it in Finder/File Explorer/the Linux file manager, or remove the bookmark.

Only offer the “跨任务固定到系统浏览器” button as an optional mode for someone who explicitly wants one normal-browser tab to persist while switching among many Codex tasks. It is not required for normal use.

The plugin MCP normally starts the localhost service. If the user asks for the Dashboard, use `bookmark_dashboard` when available; it returns a clickable compact URL and does not launch an external application by default. Pass `open: true` only when the user explicitly asks for the system default browser. If the page is unavailable, instruct the user to run `npm run dashboard` from the plugin source directory.

Do not tell the user to install a menu-bar, system-tray, or desktop companion. Do not claim that Thread Shelf can inject a button into Codex's native right-click menu, title bar, Browser toolbar, or right sidebar. The compact page is a layout, not a host-pinned sidebar.

## Natural-language fallback

Use the `thread-shelf` MCP tools only when the user explicitly asks Codex to perform the bookmark operation instead of using the Dashboard:

1. For “收藏这个/刚生成的文件”, identify only the concrete paths or URLs meant, then call `bookmark_add` once per item.
2. For “显示收藏”, call `bookmark_list` and present compact clickable local-file links and web links.
3. Use bookmark IDs returned by `bookmark_list` for open, reveal, rename, reorder, and remove operations.
4. If the host does not inject a task key, pass the current Codex task ID as `thread_key`. Never silently use a global bucket.

Removing a bookmark only removes its database record. Never delete, move, or rename the actual disk target. Do not bookmark secrets such as `.env`, private keys, credentials, or token files unless the user explicitly insists after a warning.
