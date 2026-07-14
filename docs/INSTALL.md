# Install and use

The personal marketplace entry is at `~/.agents/plugins/marketplace.json`. Install or refresh with `codex plugin add thread-shelf@personal`, restart the ChatGPT desktop app, and start a new Codex task.

Try `收藏刚生成的 HTML 和图片`, `把 /absolute/path/to/dist 加到收藏栏`, or `显示这个任务的收藏`.

## Enable the Widget later

1. Expose an HTTPS Streamable HTTP version of the MCP server.
2. Enable ChatGPT developer mode and create an App for that endpoint.
3. Copy its `plugin_asdk_app...` ID.
4. Copy `.app.json.example` to `.app.json`, replace the placeholder, and add `"apps":"./.app.json"` to the plugin manifest.
5. Update the cachebuster, reinstall, restart the desktop app, and test in a new task.

This registration cannot be completed by local source code alone.
