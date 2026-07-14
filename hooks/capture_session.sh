#!/bin/sh

# Desktop apps do not always inherit the user's interactive shell PATH. Search
# common Node.js install locations, but only accept Node 22+ (node:sqlite).

is_supported_node() {
  [ -x "$1" ] || return 1
  major=$("$1" -p "Number(process.versions.node.split('.')[0])" 2>/dev/null) || return 1
  [ "$major" -ge 22 ] 2>/dev/null
}

find_node() {
  for candidate in "${THREAD_SHELF_NODE:-}" "${NODE_BINARY:-}"; do
    if [ -n "$candidate" ] && is_supported_node "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  candidate=$(command -v node 2>/dev/null || true)
  if [ -n "$candidate" ] && is_supported_node "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  for candidate in \
    "${NVM_BIN:-}/node" \
    "${VOLTA_HOME:-}/bin/node" \
    "${FNM_MULTISHELL_PATH:-}/bin/node" \
    "$HOME/.volta/bin/node" \
    "$HOME/.local/share/mise/shims/node" \
    "$HOME/.asdf/shims/node" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node \
    /snap/bin/node \
    "$HOME"/.nvm/versions/node/*/bin/node \
    "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node; do
    if is_supported_node "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

plugin_root=${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}
if [ -z "$plugin_root" ]; then
  plugin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd)
fi

node_path=$(find_node) || exit 0
exec "$node_path" "$plugin_root/hooks/capture_session.mjs" 2>/dev/null
