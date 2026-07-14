# Thread Shelf

Thread Shelf keeps local files, folders, images, HTML pages, and web links attached to the current Codex task.

The installed local plugin provides an MCP-first workflow: add, list, open, reveal, rename, reorder, and remove bookmarks. Data is stored in SQLite under `$PLUGIN_DATA/bookmarks.sqlite`, or `~/.codex/thread-shelf/bookmarks.sqlite` when `PLUGIN_DATA` is unavailable.

## Development

```bash
npm install
npm test
npm start
```

The repository's GitHub HTTPS URL serves source code; it is not an MCP endpoint. Apps SDK registration needs a running Streamable HTTP MCP endpoint over public HTTPS. Because Thread Shelf opens files on the user's computer, the intended deployment is a local HTTP process exposed through a secure HTTPS tunnel, not a remote server that cannot access local files.

## UI boundary

Codex plugins cannot declare a new local App UI using only `.app.json`. That file must reference an App created in ChatGPT developer mode with an ID beginning `plugin_asdk_app`. Widget source is included in `widget/`, and `.app.json.example` documents the final binding, but the plugin intentionally does not claim an App until a real ID exists.
