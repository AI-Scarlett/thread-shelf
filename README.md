# Thread Shelf

Thread Shelf 是一个纯本地、跨平台的 Codex 插件，用来保存某个 Codex 任务里值得以后再打开的文件、目录、图片、HTML 和网址。

它的点击式界面是本机浏览器 Dashboard：

```text
http://127.0.0.1:43125
```

支持 macOS、Windows 和 Linux（Node.js 22+）。不需要 Apps SDK App、`plugin_asdk_app...`、ChatGPT Developer Mode、公网服务器、HTTPS 隧道或额外的原生应用。Dashboard 和 SQLite 数据都只在本机运行。

## 怎么收藏

安装并启用插件后，在浏览器打开 [Thread Shelf Dashboard](http://127.0.0.1:43125)：

1. 顶部确认或切换当前 Codex 任务。
2. 在“候选产物”中点击 `☆`，一键收藏 Codex 回复里识别到的文件和网址。
3. 也可以点击“选择文件”“选择目录”，或输入本机路径、HTTP(S) 网址。
4. 已收藏项目可以打开、在系统文件管理器中定位或移除。

“移除”只删除收藏记录，绝不会删除、移动或重命名原文件。

Dashboard 还提供剪贴板与拖放入口。浏览器有时不会把拖入文件的绝对路径交给网页；遇到这种情况直接使用“选择文件/选择目录”即可。

## 工作方式

```text
Codex plugin
├── MCP server ───── 启动 localhost Dashboard
├── Hook ─────────── 同步当前 task/session id
├── Skill ────────── 说明点击式与自然语言备用流程
└── SQLite ───────── 按任务隔离收藏

浏览器 → http://127.0.0.1:43125 → 本机 API → SQLite / 本机文件
```

- 插件 MCP 加载后会启动 Dashboard 服务，但不会擅自打开浏览器。
- `SessionStart` 和 `UserPromptSubmit` Hook 会更新当前任务。
- Dashboard 在页面可见时会跟随 Hook 更新，也有任务下拉框可手动切换。
- “跳回 Codex”使用该任务的 `codex://threads/<id>` 链接。
- GitHub 只托管源代码，不托管收藏服务或用户数据。

## 安装与运行

准备 Node.js 22 或更高版本，然后在 macOS、Windows 或 Linux 上执行：

```bash
git clone https://github.com/AI-Scarlett/thread-shelf.git
cd thread-shelf
npm install
npm test
```

将此目录作为本地 Codex 插件加入 marketplace、安装并启用后，重启 Codex 并新建任务。当前开发机的 personal marketplace 已配置时可刷新安装：

```bash
codex plugin add thread-shelf@personal
```

插件 MCP 正常加载后，手动打开：

```text
http://127.0.0.1:43125
```

如果页面无法连接，可在源码目录手动启动本地 Dashboard：

```bash
npm run dashboard
```

默认端口可用 `THREAD_SHELF_DASHBOARD_PORT` 环境变量覆盖；服务始终只绑定 `127.0.0.1`。

完整的首次安装、Windows 注意事项、Hook 信任和验收步骤见 [docs/INSTALL.md](docs/INSTALL.md)。

## Codex 宿主边界

普通 Codex 插件目前不能向 Codex 原生右键菜单或标题栏注入“收藏”按钮。因此 Thread Shelf 把可点击收藏界面放在 localhost Dashboard，而不是 Apps SDK Widget 或系统菜单栏应用。无需输入自然语言即可完成日常收藏；MCP 工具只作为可选备用入口。

## 开发验证

```bash
npm test
python3 -m json.tool hooks/hooks.json >/dev/null
python3 "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" .
```

能力与安全边界见 [docs/CAPABILITY_REPORT.md](docs/CAPABILITY_REPORT.md)。
