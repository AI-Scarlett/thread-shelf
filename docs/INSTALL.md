# 安装与测试

Thread Shelf 是一个带 localhost 浏览器 Dashboard 的纯 Codex 插件。它不安装 macOS 菜单栏程序或 Windows 桌面程序，也不使用 Apps SDK 和公网服务。

## 1. 系统要求

- macOS、Windows 或 Linux；
- Node.js 22 或更高版本（本地数据库使用 Node 内置 SQLite）；
- 支持插件和 Hook 的 Codex；
- 任意现代浏览器。

先确认版本：

```bash
node --version
npm --version
codex --version
```

## 2. 准备代码

三种系统都可以在终端或 PowerShell 中运行：

```bash
git clone https://github.com/AI-Scarlett/thread-shelf.git
cd thread-shelf
npm install
npm test
```

Thread Shelf 需要作为本地插件来源加入一个 Codex marketplace，再从该 marketplace 安装。已有 personal marketplace 且其 `thread-shelf` 条目指向这个目录时，刷新命令是：

```bash
codex plugin add thread-shelf@personal
```

安装或更新后重启 Codex，并用一个新任务测试，确保新的 Skill、MCP 和 Hook 都被加载。

> 当前 GitHub 仓库是插件源码，不是公网 MCP 服务。收藏服务实际运行在使用者自己的电脑上。

## 3. 信任任务同步 Hook

插件内的 Hook 在以下时机把 Codex 提供的 `session_id` 设为当前任务：

- 任务启动、恢复、清空或压缩时；
- 用户在任务中提交消息时。

非托管命令 Hook 首次安装或内容改变后需要用户审查。Codex 出现提示时检查并信任 Thread Shelf Hook；支持 `/hooks` 的 Codex CLI 也可以用 `/hooks` 查看来源和状态。

Hook 只读取事件 JSON 中的 `session_id`，不会读取对话正文。失败时静默退出，不阻断 Codex。

### Node 路径

桌面程序不一定继承交互式终端的 PATH，所以 Hook 会在常见位置查找 Node 22+：PATH、Homebrew、Volta、NVM、FNM、mise、asdf、Windows Program Files 和 Scoop 等。如果使用了非标准位置，可设置：

```text
THREAD_SHELF_NODE=/absolute/path/to/node
```

Windows 中填写 `node.exe` 的完整路径。插件 MCP 本身也需要 Codex 进程能够运行 `node`；如果 MCP 未加载，先把 Node 加入系统 PATH 并重启 Codex。

## 4. 打开 Dashboard

插件 MCP 启动时会一并启动本机 Dashboard 服务，但不会自动弹出浏览器。请自行打开：

[http://127.0.0.1:43125](http://127.0.0.1:43125)

如果浏览器显示无法连接，在源码目录执行：

```bash
npm run dashboard
```

默认服务只监听 `127.0.0.1:43125`。保持该终端运行，再刷新页面。同一端口已有 Thread Shelf 时会直接复用；如果被其他程序占用，先关闭占用者。也可在启动前设置 `THREAD_SHELF_DASHBOARD_PORT` 使用另一个固定端口。

## 5. 点击式使用

### 选择任务

顶部任务下拉框列出本机 Codex 任务。Hook 正常运行时，当前任务会自动跟随正在交互的任务；页面可见期间会定期同步，也可以手动选择。点击“跳回 Codex”会打开对应的 Codex 任务。

如果只从侧边栏查看旧任务但没有发送消息，宿主不一定触发 Hook，此时在 Dashboard 手动选择该任务。

### 收藏候选产物

Codex 回复中出现的有效本机路径和 HTTP(S) 网址会显示在“候选产物”区域。点击目标旁的 `☆` 即可加入当前任务的收藏。

### 直接添加

可使用任一方式：

- 点击“选择文件”或“选择目录”，使用系统选择器；
- 输入 Windows、macOS 或 Linux 本机路径；
- 输入 `http://` 或 `https://` 网址；
- 点击“收藏剪贴板”；
- 把网址拖入添加区域。

浏览器并不保证向网页暴露拖入文件的绝对路径。页面提示无法读取时，改用系统选择按钮，不需要输入自然语言。

Linux 的系统选择按钮调用 `zenity`；未安装时可直接粘贴绝对路径，或先用发行版包管理器安装 `zenity`。

### 管理收藏

- “打开”使用系统默认应用或浏览器；
- “定位”在 Finder、Windows 文件资源管理器或 Linux 文件管理器中显示本地目标；
- “移除”只删除 SQLite 记录，不删除磁盘文件。

## 6. 验收步骤

1. 在任务 A 打开 Dashboard，选择一个文件并收藏。
2. 从任务 A 的候选区点星标收藏一个网址或输出文件。
3. 打开并定位收藏，确认系统动作正确。
4. 移除收藏，确认原文件仍然存在。
5. 切换到任务 B 并发送消息，确认顶部当前任务随 Hook 更新。
6. 确认任务 A 的收藏不会出现在任务 B。
7. 手动选回任务 A，确认原有收藏仍在。
8. 重启 Dashboard，确认收藏仍然存在。

Dashboard 页面隐藏时暂停轮询，重新显示后立即同步；正常可见时会定期刷新当前任务、候选和收藏。

## 7. 数据与排查

默认数据库：

```text
macOS/Linux: ~/.codex/thread-shelf/bookmarks.sqlite
Windows:     %USERPROFILE%\.codex\thread-shelf\bookmarks.sqlite
```

本地 CLI 与 Dashboard 使用同一数据库。可在源码目录排查：

```bash
node server/local-cli.mjs tasks --limit 10
node server/local-cli.mjs current
node server/local-cli.mjs candidates --thread TASK_ID
node server/local-cli.mjs list --thread TASK_ID
node server/local-cli.mjs add --thread TASK_ID --target /absolute/path/to/file
```

Windows 路径示例：

```powershell
node server/local-cli.mjs add --thread TASK_ID --target "C:\Users\me\Desktop\report.html"
```

测试时可用 `THREAD_SHELF_DATA` 覆盖数据目录，或用 `THREAD_SHELF_DB` 指定数据库文件。

## 已知边界

- 不能向 Codex 原生右键菜单或标题栏加入按钮。
- Dashboard 是独立浏览器页，不会覆盖或修改 Codex 客户端 UI。
- 只有本机存在的路径和 HTTP(S) 网址可以收藏。
- 任务自动切换依赖受信任的 Hook；必要时使用顶部任务选择器。
- 默认排除 `.env`、私钥、凭据、Token 等敏感候选项。
