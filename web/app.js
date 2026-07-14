const $ = (selector) => document.querySelector(selector);

const elements = {
  threadSelect: $("#thread-select"),
  openCodex: $("#open-codex"),
  refresh: $("#refresh"),
  status: $("#status"),
  dropZone: $("#drop-zone"),
  addForm: $("#add-form"),
  targetInput: $("#target-input"),
  addButton: $("#add-button"),
  pickFile: $("#pick-file"),
  pickDirectory: $("#pick-directory"),
  pasteClipboard: $("#paste-clipboard"),
  candidateList: $("#candidate-list"),
  candidateEmpty: $("#candidate-empty"),
  candidateLoading: $("#candidate-loading"),
  candidateCount: $("#candidate-count"),
  bookmarkList: $("#bookmark-list"),
  bookmarkEmpty: $("#bookmark-empty"),
  bookmarkLoading: $("#bookmark-loading"),
  bookmarkCount: $("#bookmark-count"),
  toast: $("#toast"),
};

const state = {
  threads: [],
  currentThread: "",
  bookmarks: [],
  candidates: [],
  contentRequest: 0,
  contentLoading: false,
  currentPolling: false,
};

let toastTimer;

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "发生未知错误");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  let payload;
  try {
    payload = contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || (typeof payload === "string" && payload) || `请求失败（${response.status}）`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }
  return payload;
}

function listFrom(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function currentFrom(payload) {
  const current = payload?.current ?? payload?.thread ?? payload?.data;
  if (typeof current === "string") return current;
  return current?.id || current?.thread || current?.thread_key || "";
}

function idOfThread(thread) {
  return typeof thread === "string" ? thread : (thread?.id || thread?.thread || thread?.thread_key || "");
}

function titleOfThread(thread) {
  return typeof thread === "string" ? thread : (thread?.title || thread?.name || thread?.id || "未命名任务");
}

function setStatus(message = "", tone = "info") {
  elements.status.hidden = !message;
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function showToast(message, tone = "info", duration = 3200) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, duration);
}

function setButtonBusy(button, busy, busyText) {
  if (!button.dataset.label) button.dataset.label = button.textContent.trim();
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

function renderThreads() {
  const selected = state.currentThread;
  elements.threadSelect.replaceChildren();

  if (!state.threads.length) {
    const option = new Option("没有可用的 Codex 任务", "");
    elements.threadSelect.add(option);
    elements.threadSelect.disabled = true;
  } else {
    for (const thread of state.threads) {
      const id = idOfThread(thread);
      if (!id) continue;
      const option = new Option(titleOfThread(thread), id);
      const detail = thread?.cwd ? `${titleOfThread(thread)} — ${thread.cwd}` : titleOfThread(thread);
      option.title = detail;
      elements.threadSelect.add(option);
    }
    elements.threadSelect.disabled = false;
    if (selected && !state.threads.some((thread) => idOfThread(thread) === selected)) {
      elements.threadSelect.add(new Option(`当前任务 · ${selected}`, selected), 0);
    }
    elements.threadSelect.value = selected;
  }

  const hasCurrent = Boolean(selected);
  elements.openCodex.classList.toggle("is-disabled", !hasCurrent);
  elements.openCodex.setAttribute("aria-disabled", String(!hasCurrent));
  if (hasCurrent) elements.openCodex.href = `codex://threads/${encodeURIComponent(selected)}`;
  else elements.openCodex.removeAttribute("href");
  for (const control of [elements.addButton, elements.pickFile, elements.pickDirectory, elements.pasteClipboard]) {
    control.disabled = !hasCurrent;
  }
}

function kindView(kind) {
  const views = {
    url: ["↗", "网址"],
    directory: ["▰", "目录"],
    image: ["▧", "图片"],
    html: ["◇", "网页文件"],
    file: ["▤", "文件"],
  };
  return views[kind] || views.file;
}

function safeTitle(item) {
  return item?.title || item?.name || item?.target || "未命名收藏";
}

function makeButton(label, symbol, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `item-button ${className || ""}`.trim();
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = symbol;
  button.addEventListener("click", handler);
  return button;
}

function makeItemBase(item) {
  const li = document.createElement("li");
  li.className = "shelf-item";

  const [symbol, kindLabel] = kindView(item.kind);
  const icon = document.createElement("span");
  icon.className = "kind-icon";
  icon.textContent = symbol;
  icon.title = kindLabel;
  icon.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  copy.className = "item-copy";
  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = safeTitle(item);
  title.title = safeTitle(item);
  const target = document.createElement("span");
  target.className = "item-target";
  target.textContent = item.target || "";
  target.title = item.target || "";
  copy.append(title, target);
  li.append(icon, copy);
  return li;
}

function renderCandidates() {
  elements.candidateList.replaceChildren();
  const savedTargets = new Set(state.bookmarks.map((bookmark) => bookmark.target));

  for (const candidate of state.candidates) {
    const li = makeItemBase(candidate);
    const actions = document.createElement("div");
    actions.className = "item-actions";
    const saved = savedTargets.has(candidate.target) || candidate.bookmarked === true || candidate.saved === true;
    const star = makeButton(saved ? "已收藏" : `收藏 ${safeTitle(candidate)}`, saved ? "★" : "☆", "star", async () => {
      if (saved) return;
      star.disabled = true;
      try {
        await addBookmark(candidate.target, candidate.title, { quiet: true });
        showToast(`已收藏：${safeTitle(candidate)}`, "success");
      } catch (error) {
        showToast(errorMessage(error), "error", 5200);
      } finally {
        star.disabled = false;
      }
    });
    star.disabled = saved;
    actions.append(star);
    li.append(actions);
    elements.candidateList.append(li);
  }

  elements.candidateCount.textContent = String(state.candidates.length);
  elements.candidateEmpty.hidden = state.candidates.length > 0;
}

async function actOnBookmark(bookmark, action, button) {
  if (!bookmark?.id) return showToast("这个收藏缺少 ID，请刷新后重试", "error");
  button.disabled = true;
  try {
    await api(`/api/bookmarks/${encodeURIComponent(bookmark.id)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ thread: state.currentThread }),
    });
    showToast(action === "open" ? `已打开：${safeTitle(bookmark)}` : `已在文件管理器中定位：${safeTitle(bookmark)}`, "success");
  } catch (error) {
    showToast(errorMessage(error), "error", 5200);
  } finally {
    button.disabled = false;
  }
}

function renderBookmarks() {
  elements.bookmarkList.replaceChildren();

  for (const bookmark of state.bookmarks) {
    const li = makeItemBase(bookmark);
    const actions = document.createElement("div");
    actions.className = "item-actions bookmark-actions";

    const open = makeButton(`打开 ${safeTitle(bookmark)}`, "↗", "", () => actOnBookmark(bookmark, "open", open));
    actions.append(open);

    if (bookmark.kind !== "url") {
      const reveal = makeButton(`在文件管理器中定位 ${safeTitle(bookmark)}`, "⌖", "", () => actOnBookmark(bookmark, "reveal", reveal));
      actions.append(reveal);
    }

    const remove = makeButton(`移除收藏 ${safeTitle(bookmark)}`, "×", "danger", async () => {
      if (!bookmark?.id) return showToast("这个收藏缺少 ID，请刷新后重试", "error");
      remove.disabled = true;
      try {
        await api(`/api/bookmarks/${encodeURIComponent(bookmark.id)}?thread=${encodeURIComponent(state.currentThread)}`, {
          method: "DELETE",
          body: "{}",
        });
        showToast(`已从收藏栏移除：${safeTitle(bookmark)}`, "success");
        await loadContent();
      } catch (error) {
        showToast(errorMessage(error), "error", 5200);
        remove.disabled = false;
      }
    });
    actions.append(remove);
    li.append(actions);
    elements.bookmarkList.append(li);
  }

  elements.bookmarkCount.textContent = String(state.bookmarks.length);
  elements.bookmarkEmpty.hidden = state.bookmarks.length > 0;
}

function setContentLoading(loading) {
  state.contentLoading = loading;
  elements.candidateLoading.hidden = !loading;
  elements.bookmarkLoading.hidden = !loading;
  if (loading) {
    elements.candidateEmpty.hidden = true;
    elements.bookmarkEmpty.hidden = true;
    elements.candidateList.replaceChildren();
    elements.bookmarkList.replaceChildren();
  }
}

async function loadContent() {
  const thread = state.currentThread;
  const request = ++state.contentRequest;
  if (!thread) {
    state.bookmarks = [];
    state.candidates = [];
    setContentLoading(false);
    renderBookmarks();
    renderCandidates();
    return;
  }

  setContentLoading(true);
  try {
    const [bookmarkResult, candidateResult] = await Promise.allSettled([
      api(`/api/bookmarks?thread=${encodeURIComponent(thread)}`),
      api(`/api/candidates?thread=${encodeURIComponent(thread)}`),
    ]);
    if (request !== state.contentRequest || thread !== state.currentThread) return;
    state.bookmarks = bookmarkResult.status === "fulfilled" ? listFrom(bookmarkResult.value, "bookmarks") : [];
    state.candidates = candidateResult.status === "fulfilled" ? listFrom(candidateResult.value, "candidates") : [];
    const failures = [bookmarkResult, candidateResult].filter((result) => result.status === "rejected");
    if (failures.length === 2) throw failures[0].reason;
    if (failures.length) {
      const missing = bookmarkResult.status === "rejected" ? "收藏" : "候选产物";
      setStatus(`${missing}暂时无法读取：${errorMessage(failures[0].reason)}`, "error");
    } else {
      setStatus("");
    }
  } catch (error) {
    if (request !== state.contentRequest) return;
    state.bookmarks = [];
    state.candidates = [];
    setStatus(`无法读取当前任务：${errorMessage(error)}`, "error");
  } finally {
    if (request === state.contentRequest) {
      setContentLoading(false);
      renderBookmarks();
      renderCandidates();
    }
  }
}

async function selectThread(thread, { persist = true } = {}) {
  if (!thread) return;
  state.currentThread = thread;
  renderThreads();
  if (persist) {
    try {
      await api("/api/current", { method: "POST", body: JSON.stringify({ thread }) });
    } catch (error) {
      setStatus(`任务已经切换，但无法保存当前状态：${errorMessage(error)}`, "error");
    }
  }
  await loadContent();
}

async function refreshAll({ announce = false } = {}) {
  elements.refresh.disabled = true;
  elements.refresh.setAttribute("aria-busy", "true");
  try {
    const [threadPayload, currentPayload] = await Promise.all([
      api("/api/threads"),
      api("/api/current"),
    ]);
    state.threads = listFrom(threadPayload, "threads");
    const serverCurrent = currentFrom(currentPayload);
    const fallback = idOfThread(state.threads[0]);
    state.currentThread = serverCurrent || state.currentThread || fallback;
    renderThreads();
    await loadContent();
    if (!state.threads.length) setStatus("没有找到 Codex 任务。请先在 Codex 中创建或打开一个任务。", "info");
    else if (announce) showToast("已经刷新", "success");
  } catch (error) {
    setStatus(`无法连接 Thread Shelf 本地服务：${errorMessage(error)}`, "error");
    state.threads = [];
    state.currentThread = "";
    renderThreads();
    await loadContent();
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.removeAttribute("aria-busy");
  }
}

async function pollCurrent({ refreshContent = false } = {}) {
  if (document.hidden || state.currentPolling) return;
  state.currentPolling = true;
  try {
    const currentPayload = await api("/api/current");
    const serverCurrent = currentFrom(currentPayload);
    if (serverCurrent && serverCurrent !== state.currentThread) {
      state.currentThread = serverCurrent;
      try {
        const threadPayload = await api("/api/threads");
        state.threads = listFrom(threadPayload, "threads");
      } catch {
        // The synthetic current-task option still makes the new task usable.
      }
      renderThreads();
      await loadContent();
      showToast("已跟随 Codex 切换到当前任务", "success");
    } else if (refreshContent && state.currentThread && !state.contentLoading) {
      await loadContent();
    }
  } catch {
    // Background polling is intentionally quiet; manual refresh reports errors.
  } finally {
    state.currentPolling = false;
  }
}

async function addBookmark(target, title, { quiet = false } = {}) {
  if (!state.currentThread) throw new Error("请先选择一个 Codex 任务");
  const body = { thread: state.currentThread, target };
  if (title) body.title = title;
  await api("/api/bookmarks", { method: "POST", body: JSON.stringify(body) });
  await loadContent();
  if (!quiet) showToast("已加入当前任务的收藏栏", "success");
}

async function pickTarget(kind, button) {
  if (!state.currentThread) return;
  setButtonBusy(button, true, kind === "file" ? "正在选择…" : "正在选择…");
  try {
    const payload = await api("/api/pick", {
      method: "POST",
      body: JSON.stringify({ kind, thread: state.currentThread }),
    });
    if (!payload || payload.cancelled || payload.canceled) {
      showToast("已取消选择");
      return;
    }
    const target = payload.target || payload.path || payload.data?.target;
    if (target && !payload.bookmark && !payload.added) {
      await addBookmark(target, payload.title || payload.data?.title, { quiet: true });
    } else {
      await loadContent();
    }
    showToast(kind === "file" ? "文件已收藏" : "目录已收藏", "success");
  } catch (error) {
    const cancelled = error.status === 409 && /cancel/i.test(errorMessage(error));
    showToast(cancelled ? "已取消选择" : errorMessage(error), cancelled ? "info" : "error", 5200);
  } finally {
    setButtonBusy(button, false);
  }
}

async function addDroppedTargets(targets) {
  const unique = [...new Set(targets.filter(Boolean))];
  if (!unique.length) return;
  let added = 0;
  const failures = [];
  for (const target of unique) {
    try {
      await api("/api/bookmarks", {
        method: "POST",
        body: JSON.stringify({ thread: state.currentThread, target }),
      });
      added += 1;
    } catch (error) {
      failures.push(errorMessage(error));
    }
  }
  await loadContent();
  if (added) showToast(`已收藏 ${added} 项`, "success");
  if (failures.length) setStatus(`有 ${failures.length} 项未能收藏：${failures[0]}`, "error");
}

function fileUrlToPath(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return "";
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1).replaceAll("/", "\\");
    else if (url.hostname) path = `\\\\${url.hostname}${path.replaceAll("/", "\\")}`;
    return path;
  } catch {
    return "";
  }
}

elements.threadSelect.addEventListener("change", () => selectThread(elements.threadSelect.value));
elements.refresh.addEventListener("click", () => refreshAll({ announce: true }));

elements.addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = elements.targetInput.value.trim();
  if (!target) return;
  setButtonBusy(elements.addButton, true, "收藏中…");
  try {
    await addBookmark(target);
    elements.targetInput.value = "";
    setStatus("");
  } catch (error) {
    setStatus(`收藏失败：${errorMessage(error)}`, "error");
    elements.targetInput.focus();
  } finally {
    setButtonBusy(elements.addButton, false);
  }
});

elements.pickFile.addEventListener("click", () => pickTarget("file", elements.pickFile));
elements.pickDirectory.addEventListener("click", () => pickTarget("directory", elements.pickDirectory));

elements.pasteClipboard.addEventListener("click", async () => {
  if (!navigator.clipboard?.readText) {
    setStatus("当前浏览器不允许网页读取剪贴板。请把路径或网址粘贴到上方输入框。", "error");
    elements.targetInput.focus();
    return;
  }
  setButtonBusy(elements.pasteClipboard, true, "正在读取…");
  try {
    const target = (await navigator.clipboard.readText()).trim();
    if (!target) throw new Error("剪贴板是空的");
    await addBookmark(target);
    setStatus("");
  } catch (error) {
    const hint = /denied|permission|notallowed/i.test(errorMessage(error)) ? "浏览器拒绝了剪贴板权限，请手动粘贴到输入框。" : errorMessage(error);
    setStatus(`无法收藏剪贴板：${hint}`, "error");
    elements.targetInput.focus();
  } finally {
    setButtonBusy(elements.pasteClipboard, false);
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    elements.dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "dragend"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    if (eventName === "dragleave" && elements.dropZone.contains(event.relatedTarget)) return;
    elements.dropZone.classList.remove("is-dragging");
  });
}

elements.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  if (!state.currentThread) return showToast("请先选择一个 Codex 任务", "error");

  const transfer = event.dataTransfer;
  const targets = [];
  const inaccessibleFiles = [];
  for (const file of transfer?.files || []) {
    const path = file.path || file.webkitRelativePath;
    if (path) targets.push(path);
    else inaccessibleFiles.push(file.name);
  }

  const uriList = transfer?.getData("text/uri-list") || "";
  for (const line of uriList.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))) {
    if (/^https?:\/\//i.test(line)) targets.push(line);
    else if (/^file:\/\//i.test(line)) targets.push(fileUrlToPath(line));
  }

  if (!targets.length) {
    const plain = (transfer?.getData("text/plain") || "").trim();
    if (/^(?:https?:\/\/|file:\/\/)/i.test(plain)) targets.push(fileUrlToPath(plain) || plain);
    else if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(plain)) targets.push(plain);
  }

  if (targets.length) await addDroppedTargets(targets);
  if (inaccessibleFiles.length) {
    setStatus(`浏览器出于安全原因没有提供“${inaccessibleFiles[0]}”的完整路径，无法直接收藏。请使用“选择文件”或“选择目录”按钮。`, "error");
  } else if (!targets.length) {
    setStatus("没有从拖放内容中读取到本机路径或 HTTP(S) 网址。文件请改用“选择文件/目录”按钮。", "error");
  }
});

refreshAll().finally(() => {
  window.setInterval(() => pollCurrent(), 4_000);
  window.setInterval(() => {
    if (!document.hidden && state.currentThread && !state.contentLoading) loadContent();
  }, 15_000);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollCurrent({ refreshContent: true });
});
