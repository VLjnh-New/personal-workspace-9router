const STORAGE_KEY = "personal-workspace.threads.v1";
const MODEL_KEY = "personal-workspace.model.v1";
const REQUESTS_KEY = "personal-workspace.requests.v1";

const elements = {
  activeThreadTitle: document.querySelector("#activeThreadTitle"),
  apiKeyState: document.querySelector("#apiKeyState"),
  chatEmptyState: document.querySelector("#chatEmptyState"),
  chatScrollArea: document.querySelector("#chatScrollArea"),
  chatView: document.querySelector("#chatView"),
  connectionPill: document.querySelector("#connectionPill"),
  connectionText: document.querySelector("#connectionText"),
  conversationCount: document.querySelector("#conversationCount"),
  dashboardView: document.querySelector("#dashboardView"),
  messageInput: document.querySelector("#messageInput"),
  messageList: document.querySelector("#messageList"),
  modelCount: document.querySelector("#modelCount"),
  modelInput: document.querySelector("#modelInput"),
  modelOptions: document.querySelector("#modelOptions"),
  navChat: document.querySelector("#navChat"),
  navDashboard: document.querySelector("#navDashboard"),
  recentEmpty: document.querySelector("#recentEmpty"),
  recentList: document.querySelector("#recentList"),
  requestCount: document.querySelector("#requestCount"),
  routerBaseUrl: document.querySelector("#routerBaseUrl"),
  sidebarRouterAddress: document.querySelector("#sidebarRouterAddress"),
  sidebarStatusDot: document.querySelector("#sidebarStatusDot"),
  sidebarStatusText: document.querySelector("#sidebarStatusText"),
  threadEmpty: document.querySelector("#threadEmpty"),
  threadList: document.querySelector("#threadList"),
  toast: document.querySelector("#toast"),
  viewTitle: document.querySelector("#viewTitle"),
};

const state = {
  apiKeyConfigured: false,
  activeThreadId: null,
  config: null,
  currentView: "dashboard",
  isSending: false,
  models: [],
  requests: Number.parseInt(localStorage.getItem(REQUESTS_KEY) || "0", 10) || 0,
  threads: loadThreads(),
  toastTimer: null,
};

function loadThreads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (thread) =>
            thread &&
            typeof thread.id === "string" &&
            Array.isArray(thread.messages),
        )
      : [];
  } catch {
    return [];
  }
}

function saveThreads() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.threads));
  } catch {
    showToast("This browser could not save the conversation history.");
  }
}

function activeThread() {
  return state.threads.find((thread) => thread.id === state.activeThreadId);
}

function formatRelativeTime(timestamp) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - Number(timestamp || Date.now())) / 60_000),
  );
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3200);
}

function setConnectionState(status, text) {
  const dot = elements.connectionPill.querySelector(".status-dot");
  const className =
    status === "online"
      ? "is-online"
      : status === "warning"
        ? "is-warning"
        : status === "offline"
          ? "is-offline"
          : "";

  dot.className = `status-dot ${className}`.trim();
  elements.sidebarStatusDot.className = `status-dot ${className}`.trim();
  elements.connectionText.textContent = text;
  elements.sidebarStatusText.textContent =
    status === "online"
      ? "9Router connected"
      : status === "warning"
        ? "API key needed"
        : status === "offline"
          ? "9Router offline"
          : "Checking 9Router";
}

function getModelIds(payload) {
  const entries = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  return entries
    .map((entry) => (typeof entry === "string" ? entry : entry?.id))
    .filter((id) => typeof id === "string" && id.length > 0);
}

async function loadConfiguration() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load local configuration.");
    state.config = await response.json();
    state.apiKeyConfigured = Boolean(state.config.hasApiKey);
    elements.routerBaseUrl.textContent = state.config.routerBaseUrl;
    elements.sidebarRouterAddress.textContent = state.config.routerBaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    elements.apiKeyState.textContent = state.apiKeyConfigured
      ? "Configured on this device"
      : "Add ROUTER_API_KEY to .env";
    elements.apiKeyState.style.color = state.apiKeyConfigured
      ? "#36855d"
      : "#9b762e";
  } catch {
    elements.apiKeyState.textContent = "Local configuration unavailable";
    elements.apiKeyState.style.color = "#9b5555";
  }
}

async function refreshModels() {
  setConnectionState("checking", "Checking");
  try {
    const response = await fetch("/api/models", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
          payload?.error ||
          `9Router returned HTTP ${response.status}.`,
      );
    }

    state.models = getModelIds(payload);
    renderModelOptions();
    elements.modelCount.textContent = state.models.length.toLocaleString();
    setConnectionState(
      state.apiKeyConfigured ? "online" : "warning",
      state.apiKeyConfigured ? "Connected" : "Connected · key needed",
    );
    renderDashboard();
  } catch (error) {
    state.models = [];
    elements.modelCount.textContent = "—";
    setConnectionState("offline", "Unavailable");
    showToast(`Could not reach 9Router: ${error.message}`);
  }
}

function renderModelOptions() {
  const previousModel =
    activeThread()?.model || localStorage.getItem(MODEL_KEY) || "";
  elements.modelOptions.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const id of state.models) {
    const option = document.createElement("option");
    option.value = id;
    fragment.append(option);
  }
  elements.modelOptions.append(fragment);

  const selectedModel = state.models.includes(previousModel)
    ? previousModel
    : state.models[0] || "";
  elements.modelInput.value = selectedModel;
  if (selectedModel) localStorage.setItem(MODEL_KEY, selectedModel);
}

function renderThreadList() {
  elements.threadList.replaceChildren();
  elements.threadEmpty.hidden = state.threads.length > 0;

  for (const thread of state.threads) {
    const button = document.createElement("button");
    button.className = `thread-item${thread.id === state.activeThreadId ? " is-active" : ""}`;
    button.type = "button";
    button.title = thread.title || "New conversation";

    const icon = document.createElement("span");
    icon.className = "thread-item-icon";
    icon.textContent = "◌";

    const title = document.createElement("span");
    title.className = "thread-item-title";
    title.textContent = thread.title || "New conversation";

    button.append(icon, title);
    button.addEventListener("click", () => openThread(thread.id));
    elements.threadList.append(button);
  }
}

function renderRecentList() {
  elements.recentList.replaceChildren();
  elements.recentEmpty.hidden = state.threads.length > 0;

  for (const thread of state.threads.slice(0, 4)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-item";

    const titleWrap = document.createElement("span");
    titleWrap.className = "recent-title-wrap";

    const icon = document.createElement("span");
    icon.textContent = "✳";

    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = thread.title || "New conversation";
    titleWrap.append(icon, title);

    const time = document.createElement("span");
    time.className = "recent-meta";
    time.textContent = formatRelativeTime(thread.updatedAt);
    button.append(titleWrap, time);
    button.addEventListener("click", () => openThread(thread.id));
    elements.recentList.append(button);
  }
}

function renderDashboard() {
  elements.conversationCount.textContent = state.threads.length.toLocaleString();
  elements.requestCount.textContent = state.requests.toLocaleString();
  renderRecentList();
}

function renderMessages() {
  const thread = activeThread();
  elements.messageList.replaceChildren();
  elements.chatEmptyState.classList.toggle(
    "is-hidden",
    Boolean(thread?.messages?.length),
  );
  elements.activeThreadTitle.textContent =
    thread?.title || "New conversation";

  if (!thread) return;

  for (const message of thread.messages) {
    const row = document.createElement("article");
    row.className = `message${message.role === "user" ? " is-user" : ""}${message.error ? " is-error" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.setAttribute(
      "aria-label",
      message.role === "user" ? "You" : "Assistant",
    );
    avatar.textContent = message.role === "user" ? "You" : "✳";

    const content = document.createElement("div");
    content.className = "message-content";

    const label = document.createElement("p");
    label.className = "message-label";
    label.textContent =
      message.role === "user" ? "You" : message.error ? "Connection error" : "Assistant";

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.content;
    content.append(label, text);
    row.append(avatar, content);
    elements.messageList.append(row);
  }

  requestAnimationFrame(() => {
    elements.chatScrollArea.scrollTop = elements.chatScrollArea.scrollHeight;
  });
}

function setView(view) {
  state.currentView = view;
  const isChat = view === "chat";

  elements.dashboardView.classList.toggle("is-hidden", isChat);
  elements.chatView.classList.toggle("is-hidden", !isChat);
  elements.navDashboard.classList.toggle("is-active", !isChat);
  elements.navChat.classList.toggle("is-active", isChat);
  elements.viewTitle.textContent = isChat ? "Chat" : "Overview";

  if (isChat) {
    renderMessages();
    window.setTimeout(() => elements.messageInput.focus(), 30);
  }
}

function openThread(threadId) {
  state.activeThreadId = threadId;
  const thread = activeThread();
  if (thread?.model) elements.modelInput.value = thread.model;
  renderThreadList();
  renderMessages();
  setView("chat");
}

function createThread(open = true) {
  const thread = {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "New conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: elements.modelInput.value || localStorage.getItem(MODEL_KEY) || "",
    messages: [],
  };
  state.threads.unshift(thread);
  state.activeThreadId = thread.id;
  saveThreads();
  renderThreadList();
  renderDashboard();
  if (open) setView("chat");
  return thread;
}

function normalizeAssistantContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function responseError(payload, status) {
  const detail =
    payload?.error?.message ||
    payload?.error ||
    payload?.message ||
    `9Router returned HTTP ${status}.`;
  if (status === 401) {
    return "9Router needs an API key. Add ROUTER_API_KEY to .env, then restart this app.";
  }
  return String(detail);
}

async function sendMessage() {
  const content = elements.messageInput.value.trim();
  if (!content || state.isSending) return;

  if (!state.apiKeyConfigured) {
    elements.chatView.querySelector(".composer-wrap").scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
    showToast("Add your 9Router API key to .env before sending a chat request.");
    return;
  }

  if (!state.models.length) {
    showToast("9Router has no available models. Check the local gateway.");
    return;
  }

  const thread = activeThread() || createThread(false);
  const model = elements.modelInput.value.trim();
  if (!model) {
    showToast("Choose a model before sending.");
    return;
  }

  thread.model = model;
  thread.messages.push({ role: "user", content });
  if (thread.title === "New conversation") {
    thread.title = content.replace(/\s+/g, " ").slice(0, 46);
  }
  thread.updatedAt = Date.now();
  elements.messageInput.value = "";
  elements.messageInput.style.height = "";
  saveThreads();
  renderMessages();
  renderThreadList();
  renderDashboard();

  state.isSending = true;
  elements.sendButton.disabled = true;
  elements.sendButton.querySelector("span").textContent = "Sending";

  const typingRow = document.createElement("article");
  typingRow.className = "message";
  typingRow.id = "typingIndicator";
  typingRow.innerHTML =
    '<div class="message-avatar" aria-hidden="true">✳</div><div class="message-content"><p class="message-label">Assistant</p><div class="typing-indicator" aria-label="Thinking"><span></span><span></span><span></span></div></div>';
  elements.messageList.append(typingRow);
  elements.chatScrollArea.scrollTop = elements.chatScrollArea.scrollHeight;

  try {
    const response = await fetch("/api/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: thread.messages
          .filter((message) => !message.error)
          .map(({ role, content: message }) => ({
            role,
            content: message,
          })),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(responseError(payload, response.status));

    const answer = normalizeAssistantContent(
      payload?.choices?.[0]?.message?.content ??
        payload?.choices?.[0]?.text ??
        payload?.output_text,
    );
    if (!answer) throw new Error("9Router returned an empty response.");

    thread.messages.push({ role: "assistant", content: answer });
    state.requests += 1;
    localStorage.setItem(REQUESTS_KEY, String(state.requests));
  } catch (error) {
    thread.messages.push({
      role: "assistant",
      content: error.message || "Could not complete the request.",
      error: true,
    });
  } finally {
    document.querySelector("#typingIndicator")?.remove();
    thread.updatedAt = Date.now();
    state.isSending = false;
    elements.sendButton.disabled = false;
    elements.sendButton.querySelector("span").textContent = "Send";
    saveThreads();
    renderMessages();
    renderThreadList();
    renderDashboard();
  }
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

[
  "#newChatButton",
  "#newConversationButton",
].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => createThread());
});

document.querySelector("#startChatButton").addEventListener("click", () => {
  if (activeThread()) setView("chat");
  else createThread();
});

document.querySelector("#viewAllChatsButton").addEventListener("click", () => {
  if (state.threads.length) openThread(state.threads[0].id);
  else createThread();
});

elements.modelInput.addEventListener("change", () => {
  const model = elements.modelInput.value.trim();
  if (!model) return;
  localStorage.setItem(MODEL_KEY, model);
  const thread = activeThread();
  if (thread) {
    thread.model = model;
    saveThreads();
  }
});

elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

elements.messageInput.addEventListener("input", () => {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 180)}px`;
});

document.querySelector("#sendButton").addEventListener("click", sendMessage);

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.messageInput.value = button.dataset.prompt;
    elements.messageInput.focus();
    elements.messageInput.dispatchEvent(new Event("input"));
  });
});

const settingsDialog = document.querySelector("#settingsDialog");
[
  "#openSettings",
  "#connectionSettingsButton",
].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => {
    settingsDialog.showModal();
  });
});

settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    state.threads = loadThreads();
    renderThreadList();
    renderDashboard();
    renderMessages();
  }
});

renderThreadList();
renderDashboard();
loadConfiguration().finally(refreshModels);