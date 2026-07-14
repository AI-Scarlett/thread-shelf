# 能力报告

## 当前产品形态

Thread Shelf 是一个跨平台、纯本地的 Codex 插件。它把点击式 UI 放在 `http://127.0.0.1:43125` 的浏览器 Dashboard 中，由同一个插件的本地 MCP 进程启动和管理。

运行主线只有：Codex 插件、Node.js、本机浏览器和 SQLite。没有 Apps SDK App、公网 MCP、HTTPS 隧道，也没有 macOS/Windows/Linux 原生 companion。

## 已实现

- macOS、Windows、Linux（Node.js 22+）共用一套插件代码。
- 只监听 loopback 的 localhost Dashboard；默认端口 `43125`，支持固定端口覆盖。
- 当前任务下拉选择、刷新和 `codex://threads/<id>` 跳转。
- 页面可见时自动轮询当前任务、候选与收藏，页面隐藏时暂停。
- 从 Codex 回复中发现本机文件、目录和 HTTP(S) 网址候选。
- 候选项星标一键收藏。
- 系统文件/目录选择器、路径输入、网址输入、剪贴板和受浏览器能力限制的拖放入口。
- 已收藏项目的打开、系统文件管理器定位和移除。
- SQLite 持久化与任务键隔离。
- `SessionStart` 和 `UserPromptSubmit` Hook 自动更新当前任务。
- Unix shell 与 Windows PowerShell Hook 启动器，可发现多个常见 Node 22+ 安装位置。
- 本地 MCP stdio 工具，保留为自然语言备用入口。
- 移除收藏只删除数据库记录；没有删除磁盘文件的产品操作。

## 隐私与网络

- Dashboard 与 API 仅绑定 `127.0.0.1`，不对局域网或公网监听。
- 变更 API 只接受 JSON，拒绝跨域 Origin 与 CORS 预检，限制请求体大小，并为静态页面设置 CSP。
- 收藏数据库默认位于用户目录下的 `.codex/thread-shelf/bookmarks.sqlite`。
- 本机路径不会因为收藏而上传；GitHub 只保存源代码。
- Hook 只使用 Codex 事件中的 `session_id`，不读取对话正文。
- 候选发现从本机 Codex 任务状态和 rollout 读取必要文本，并过滤常见敏感路径与带凭据的网址。

## 不需要的组件

- ChatGPT Developer Mode；
- Apps SDK App 或 `plugin_asdk_app...` ID；
- 公网 Streamable HTTP MCP；
- HTTPS 隧道；
- PiP Widget；
- macOS 菜单栏、Windows 托盘或 Linux 桌面应用。

## Codex 宿主边界

Codex 普通插件没有面向第三方的原生右键菜单或标题栏注入点，因此 Thread Shelf 无法在 Codex 自带的 `Copy Link` 菜单中增加一项。localhost Dashboard 是在“保持纯插件、跨平台、完全本地”约束下提供点击式管理的入口。

Hook 能在任务启动、恢复或提交消息时取得 `session_id`。如果用户只是查看旧任务而宿主没有触发生命周期事件，Dashboard 可能仍指向上一任务；顶部任务下拉框提供明确的手动回退路径。

浏览器出于安全原因可能隐藏拖入文件的真实路径，所以文件和目录以系统选择器作为可靠点击入口。

## 安全策略

- Hook 脚本校验 `session_id`，只执行固定的 `set-current` 操作。
- Hook 找不到 Node、CLI 或数据库时静默退出，不影响 Codex 任务。
- Dashboard 启动失败不会拖垮 MCP 收藏工具；同端口已有 Thread Shelf 时会复用。
- URL 仅允许 `http://` 和 `https://`。
- 打开与定位只接受已经保存、属于当前任务的收藏 ID。
- 网址中包含凭据或敏感鉴权参数时不会作为候选展示。
- 移除收藏与删除磁盘文件严格分离。
