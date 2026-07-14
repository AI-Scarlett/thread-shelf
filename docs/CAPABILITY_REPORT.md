# Capability report

## Implemented

- Personal marketplace plugin and local MCP stdio server.
- SQLite persistence with task-key isolation.
- Add, list, remove, rename, reorder, open, and reveal operations.
- Local path and HTTP(S) validation; open/reveal accepts only an existing bookmark ID.
- Removal deletes only the database row. There is no disk-delete code path.
- Apps SDK Widget source with a guarded PiP request.

## External configuration required

The official plugin model requires `.app.json` to point at an App created in ChatGPT developer mode. Its ID begins `plugin_asdk_app`. No such ID is available in this task, so the plugin does not advertise a non-working App. The MCP tools and skill work without it.

The server prefers explicit `thread_key`, then `openai/session`, an OpenAI thread ID, or the MCP transport session. It refuses a silent global default, preventing cross-task leakage.
