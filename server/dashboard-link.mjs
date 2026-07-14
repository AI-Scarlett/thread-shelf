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
    recommended_surface: "codex_in_app_browser",
    launch_mode: "navigate_in_app_browser_or_click_returned_url",
    plugin_invocation: "@Thread Shelf",
    skill_invocation: "/ → Skills → Thread Shelf",
    slash_skill_picker: true,
    custom_slash_command: false,
    system_browser_optional: true,
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
        "已绑定到当前 Codex 任务。",
        "",
        `[在当前任务的内置浏览器打开](${url})`,
        "",
        "切换到其他任务后，在那个任务的聊天框再次选择 @Thread Shelf 即可打开对应收藏；Cmd/Ctrl+Shift+B 可显示或隐藏当前任务的内置浏览器。",
        "只有需要一个跨任务常驻标签页时，才使用页面里的“跨任务固定到系统浏览器”。",
      ].join("\n"),
    }],
    structuredContent: data,
  };
}
