export function compactDashboardUrl(dashboardUrl) {
  const url = new URL(dashboardUrl);
  url.searchParams.set("compact", "1");
  return url.toString();
}

export function shouldOpenDashboard(open) {
  return open === true;
}

export function dashboardToolResponse({ threadKey, dashboardUrl, opened = false }) {
  const url = compactDashboardUrl(dashboardUrl);
  const data = {
    thread_key: threadKey,
    url,
    full_url: dashboardUrl,
    mode: "compact",
    opened,
    local_only: true,
    recommended_surface: "pinned_default_browser_tab",
    in_app_browser_scope: "current_task_only",
    in_app_browser_shortcut: "Cmd/Ctrl+Shift+B",
    native_sidebar_injection: false,
  };

  return {
    content: [{
      type: "text",
      text: [
        "### Thread Shelf 紧凑收藏栏",
        "",
        `[打开紧凑版 Dashboard](${url})`,
        "",
        "最省事的方式是把这个地址固定为 Chrome、Edge 或 Safari 的一个标签页；任务启动、恢复或发送消息后会自动更新，也可在页面顶部手动切换。",
        "Codex 内置浏览器按任务隔离；Cmd/Ctrl+Shift+B 只用于显示或隐藏当前任务的浏览器区域。",
      ].join("\n"),
    }],
    structuredContent: data,
  };
}
