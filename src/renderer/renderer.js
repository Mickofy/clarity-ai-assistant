const views = {
  main: document.getElementById("mainView"),
  loading: document.getElementById("loadingView"),
  writingResult: document.getElementById("writingResultView"),
  understandResult: document.getElementById("understandResultView"),
  clientReply: document.getElementById("clientReplyView"),
};

const sourceText = document.getElementById("sourceText");
const charCount = document.getElementById("charCount");
const sourceScrollbar = document.getElementById("sourceScrollbar");
const sourceScrollThumb = document.getElementById("sourceScrollThumb");

const selectedSourceBtn = document.getElementById("selectedSourceBtn");
const clipboardSourceBtn = document.getElementById("clipboardSourceBtn");
const refreshBtn = document.getElementById("refreshBtn");

const inputStatus = document.getElementById("inputStatus");
const inputStatusText = document.getElementById("inputStatusText");

const notice = document.getElementById("notice");
const noticeTitle = document.getElementById("noticeTitle");
const noticeMessage = document.getElementById("noticeMessage");

const loadingTitle = document.getElementById("loadingTitle");

const writingResultEyebrow = document.getElementById("writingResultEyebrow");
const writingResultTitle = document.getElementById("writingResultTitle");

const intentCard = document.getElementById("intentCard");
const intentSummary = document.getElementById("intentSummary");

const clarificationCard = document.getElementById("clarificationCard");
const clarificationQuestion = document.getElementById("clarificationQuestion");

const suggestionCard = document.getElementById("suggestionCard");
const suggestionText = document.getElementById("suggestionText");

const copySuggestionBtn = document.getElementById("copySuggestionBtn");
const replaceSuggestionBtn = document.getElementById("replaceSuggestionBtn");

const simpleMeaning = document.getElementById("simpleMeaning");
const whatTheyWantCard = document.getElementById("whatTheyWantCard");
const whatTheyWant = document.getElementById("whatTheyWant");

const termsCard = document.getElementById("termsCard");
const termsList = document.getElementById("termsList");

const ambiguityCard = document.getElementById("ambiguityCard");
const ambiguityNote = document.getElementById("ambiguityNote");

const helpReplyBtn = document.getElementById("helpReplyBtn");

const clientContext = document.getElementById("clientContext");
const roughReply = document.getElementById("roughReply");

const createReplyBtn = document.getElementById("createReplyBtn");
const conversationCount = document.getElementById("conversationCount");
const clearConversationBtn = document.getElementById("clearConversationBtn");

const defaultInputSource = document.getElementById("defaultInputSource");
const explanationLanguage = document.getElementById("explanationLanguage");

const appVersion = document.getElementById("appVersion");
const appDeveloper = document.getElementById("appDeveloper");

const drawerToggleBtn = document.getElementById("drawerToggleBtn");
const drawerCloseBtn = document.getElementById("drawerCloseBtn");
const utilityDrawer = document.getElementById("utilityDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerNotice = document.getElementById("drawerNotice");

const updateDialog = document.getElementById("updateDialog");
const updateVersion = document.getElementById("updateVersion");
const updateLaterBtn = document.getElementById("updateLaterBtn");
const restartUpdateBtn = document.getElementById("restartUpdateBtn");
const updateError = document.getElementById("updateError");

const minimizeBtn = document.getElementById("minimizeBtn");
const closeBtn = document.getElementById("closeBtn");

const DEFAULT_SETTINGS = {
  shortcuts: {
    openAssistant: "CommandOrControl+Alt+F",
    quickGrammar: "CommandOrControl+Alt+R",
    quickUnderstand: "CommandOrControl+Alt+U",
  },

  defaultInputSource: "selected",
  understandExplanation: "simple_english",
};

let currentView = "main";
let currentSource = "selected";

let currentSettings = structuredClone(DEFAULT_SETTINGS);

let sourceBuffers = {
  selected: "",
  clipboard: "",
};

let sourceInitialized = {
  selected: false,
  clipboard: false,
};

let capturingShortcut = null;
let currentWritingMode = null;
let pendingClientContext = "";

let conversationHistory = [];
let drawerOpen = false;
let pendingUpdateVersion = null;

let sourceScrollbarDragging = false;
let sourceScrollbarPointerId = null;
let sourceScrollbarDragStartY = 0;
let sourceScrollbarDragStartScrollTop = 0;

async function loadAppInfo() {
  try {
    const info = await window.writingAssistant.getAppInfo();

    if (appVersion) {
      appVersion.textContent = info?.version || "—";
    }

    if (appDeveloper) {
      appDeveloper.textContent = info?.developer || "Mickofy";
    }
  } catch {
    if (appVersion) appVersion.textContent = "—";
    if (appDeveloper) appDeveloper.textContent = "Mickofy";
  }
}

function clearUpdateError() {
  if (!updateError) return;

  updateError.textContent = "";
  updateError.classList.add("hidden");
}

function closeUpdateDialog() {
  clearUpdateError();

  if (updateDialog?.open) {
    updateDialog.close();
  }
}

function openUpdateDialog(payload) {
  pendingUpdateVersion = payload?.version || null;

  if (updateVersion) {
    updateVersion.textContent = pendingUpdateVersion
      ? `v${pendingUpdateVersion}`
      : "NEW VERSION";
  }

  clearUpdateError();

  if (!updateDialog) return;

  if (!updateDialog.open) {
    updateDialog.showModal();
  }

  requestAnimationFrame(() => {
    restartUpdateBtn?.focus();
  });
}

function showView(name) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle("hidden", key !== name);

    if (key === name) {
      view.scrollTop = 0;
    }
  });

  currentView = name;

  if (name !== "main") {
    hideNotice();
  }
}

function showNotice(title, message) {
  noticeTitle.textContent = title;
  noticeMessage.textContent = message;

  notice.classList.remove("hidden");
}

function hideNotice() {
  notice.classList.add("hidden");
}

function showDrawerNotice(message) {
  drawerNotice.textContent = message;
  drawerNotice.classList.remove("hidden");
}

function hideDrawerNotice() {
  drawerNotice.textContent = "";
  drawerNotice.classList.add("hidden");
}

function setDrawer(open) {
  drawerOpen = Boolean(open);

  utilityDrawer.classList.toggle("open", drawerOpen);
  drawerBackdrop.classList.toggle("open", drawerOpen);

  utilityDrawer.setAttribute("aria-hidden", String(!drawerOpen));
  drawerBackdrop.setAttribute("aria-hidden", String(!drawerOpen));

  drawerToggleBtn.setAttribute("aria-expanded", String(drawerOpen));

  if (!drawerOpen) {
    hideDrawerNotice();
    capturingShortcut = null;

    document
      .querySelectorAll(".shortcut-capture")
      .forEach((item) => item.classList.remove("capturing"));

    updateSettingsUi();
  }
}

function updateCharCount() {
  charCount.textContent = `${sourceText.value.length.toLocaleString()} / 12,000`;
}

function updateSourceScrollbar() {
  if (!sourceScrollbar || !sourceScrollThumb || !sourceText) {
    return;
  }

  const clientHeight = sourceText.clientHeight;
  const scrollHeight = sourceText.scrollHeight;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

  if (maxScrollTop <= 1) {
    sourceScrollbar.classList.remove("visible");
    sourceScrollThumb.style.height = "";
    sourceScrollThumb.style.transform = "translateX(-50%) translateY(0px)";
    return;
  }

  sourceScrollbar.classList.add("visible");

  const trackHeight = sourceScrollbar.clientHeight;
  const minimumThumbHeight = 34;

  const calculatedThumbHeight = trackHeight * (clientHeight / scrollHeight);

  const thumbHeight = Math.min(
    trackHeight,
    Math.max(minimumThumbHeight, calculatedThumbHeight),
  );

  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

  const thumbTop =
    maxScrollTop > 0 ? (sourceText.scrollTop / maxScrollTop) * maxThumbTop : 0;

  sourceScrollThumb.style.height = `${thumbHeight}px`;

  sourceScrollThumb.style.transform = `translateX(-50%) translateY(${thumbTop}px)`;
}

function scheduleSourceScrollbarUpdate() {
  requestAnimationFrame(() => {
    updateSourceScrollbar();
  });
}

function stopSourceScrollbarDrag(event) {
  if (!sourceScrollbarDragging) {
    return;
  }

  sourceScrollbarDragging = false;
  sourceScrollThumb?.classList.remove("dragging");

  if (
    sourceScrollThumb &&
    sourceScrollbarPointerId !== null &&
    sourceScrollThumb.hasPointerCapture?.(sourceScrollbarPointerId)
  ) {
    try {
      sourceScrollThumb.releasePointerCapture(sourceScrollbarPointerId);
    } catch {}
  }

  sourceScrollbarPointerId = null;

  event?.preventDefault?.();
}

function setInputStatus(label, ready = false) {
  inputStatusText.textContent = label;
  inputStatus.classList.toggle("ready", ready);
}

function updateSourceTabs() {
  selectedSourceBtn.classList.toggle("active", currentSource === "selected");

  clipboardSourceBtn.classList.toggle("active", currentSource === "clipboard");
}

function loadCurrentSourceBuffer() {
  sourceText.value = sourceBuffers[currentSource] || "";

  updateCharCount();
  scheduleSourceScrollbarUpdate();

  if (currentSource === "selected") {
    setInputStatus(
      sourceText.value ? "SELECTION CAPTURED" : "NO SELECTION",
      Boolean(sourceText.value),
    );
  } else {
    setInputStatus(
      sourceText.value ? "CLIPBOARD LOADED" : "CLIPBOARD EMPTY",
      Boolean(sourceText.value),
    );
  }
}

async function refreshInput(source = currentSource) {
  hideNotice();

  refreshBtn.disabled = true;

  setInputStatus(
    source === "selected" ? "REFRESHING SELECTION…" : "REFRESHING CLIPBOARD…",
    false,
  );

  const result = await window.writingAssistant.refreshInput(source);

  refreshBtn.disabled = false;
  sourceInitialized[source] = true;

  if (!result?.ok || !result?.text) {
    sourceBuffers[source] = "";

    if (source === currentSource) {
      loadCurrentSourceBuffer();
    }

    if (source === "selected") {
      showNotice(
        "No text selected",
        "Highlight text in the source app and press Ctrl+R, or enter text manually.",
      );
    } else {
      showNotice(
        "Clipboard is empty",
        "Copy text in another app and press Ctrl+R, or enter text manually.",
      );
    }

    return false;
  }

  sourceBuffers[source] = result.text;

  if (source === currentSource) {
    loadCurrentSourceBuffer();
  }

  hideNotice();

  return true;
}

async function switchSource(source) {
  if (!["selected", "clipboard"].includes(source)) {
    return;
  }

  if (source === currentSource) {
    return;
  }

  sourceBuffers[currentSource] = sourceText.value;
  sourceInitialized[currentSource] = true;

  currentSource = source;

  updateSourceTabs();

  // IMPORTANT:
  // Switching back to Selected no longer triggers a capture.
  // This prevents the hide/show or focus flash the user was seeing.
  if (source === "selected") {
    loadCurrentSourceBuffer();

    if (!sourceText.value.trim()) {
      showNotice(
        "No text selected",
        "Highlight text in the source app and press Ctrl+R, or enter text manually.",
      );
    } else {
      hideNotice();
    }

    return;
  }

  // Clipboard is safe to read without changing focus, so on its first use
  // we load it automatically. Later tab switches preserve manual edits.
  if (!sourceInitialized.clipboard) {
    await refreshInput("clipboard");
    return;
  }

  loadCurrentSourceBuffer();

  if (!sourceText.value.trim()) {
    showNotice(
      "Clipboard is empty",
      "Copy text in another app and press Ctrl+R, or enter text manually.",
    );
  } else {
    hideNotice();
  }
}

function setLoading(mode) {
  const messages = {
    express: "Understanding what you want to say…",

    understand: "Making this easier to understand…",

    client_reply: "Building a clear client reply…",

    grammar: "Correcting the English…",
  };

  loadingTitle.textContent = messages[mode] || "Working on your message…";

  showView("loading");
}

function resetWritingResult() {
  intentCard.classList.add("hidden");
  clarificationCard.classList.add("hidden");
  suggestionCard.classList.remove("hidden");

  intentSummary.textContent = "";
  clarificationQuestion.textContent = "";
  suggestionText.value = "";
}

function renderWritingResult(mode, result) {
  resetWritingResult();

  currentWritingMode = mode;

  const labels = {
    express: ["EXPRESS CLEARLY", "Suggested message"],

    client_reply: ["CLIENT REPLY", "Suggested reply"],

    grammar: ["GRAMMAR ONLY", "Corrected text"],
  };

  const [eyebrow, title] = labels[mode] || labels.express;

  writingResultEyebrow.textContent = eyebrow;
  writingResultTitle.textContent = title;

  if (
    typeof result?.intentSummary === "string" &&
    result.intentSummary.trim()
  ) {
    intentSummary.textContent = result.intentSummary.trim();

    intentCard.classList.remove("hidden");
  }

  if (result?.needsClarification) {
    clarificationQuestion.textContent =
      result.clarificationQuestion?.trim() ||
      "Please add a little more context so the assistant does not guess your meaning.";

    clarificationCard.classList.remove("hidden");
  }

  suggestionText.value =
    typeof result?.text === "string" ? result.text.trim() : "";

  const hasResult = Boolean(suggestionText.value);

  suggestionCard.classList.toggle("hidden", !hasResult);

  copySuggestionBtn.disabled = !hasResult;

  replaceSuggestionBtn.disabled = !hasResult;

  showView("writingResult");
}

function renderUnderstandResult(result) {
  simpleMeaning.textContent =
    result?.simpleMeaning?.trim() || "No explanation returned.";

  whatTheyWant.textContent = result?.whatTheyWant?.trim() || "";

  whatTheyWantCard.classList.toggle("hidden", !whatTheyWant.textContent);

  termsList.innerHTML = "";

  const terms = Array.isArray(result?.unfamiliarTerms)
    ? result.unfamiliarTerms
    : [];

  const usefulTerms = terms
    .filter((item) => item?.term && item?.meaning)
    .slice(0, 4);

  usefulTerms.forEach((item) => {
    const row = document.createElement("div");

    row.className = "term-row";

    const term = document.createElement("strong");

    term.textContent = item.term;

    const meaning = document.createElement("span");

    meaning.textContent = item.meaning;

    row.append(term, meaning);

    termsList.appendChild(row);
  });

  termsCard.classList.toggle("hidden", usefulTerms.length === 0);

  ambiguityNote.textContent = result?.ambiguityNote?.trim() || "";

  ambiguityCard.classList.toggle("hidden", !ambiguityNote.textContent);

  showView("understandResult");
}

function buildConversationContext(latestClientText) {
  const recent = conversationHistory.slice(-6);

  const history = recent
    .map(
      (entry) => `${entry.role === "client" ? "Client" : "You"}: ${entry.text}`,
    )
    .join("\n");

  return [
    history ? `RECENT CONVERSATION:\n${history}` : "",

    `LATEST CLIENT MESSAGE:\n${latestClientText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function updateConversationCount() {
  conversationCount.textContent = `SESSION CONTEXT: ${conversationHistory.length} MESSAGE${conversationHistory.length === 1 ? "" : "S"}`;
}

async function runMode(mode) {
  sourceBuffers[currentSource] = sourceText.value;

  sourceInitialized[currentSource] = true;

  const text = sourceText.value.trim();

  if (!text) {
    showNotice(
      "No text to process",
      "Select, copy, paste, or type some text first.",
    );

    sourceText.focus();

    return;
  }

  if (mode === "client_reply") {
    pendingClientContext = text;

    clientContext.textContent = buildConversationContext(text);

    roughReply.value = "";

    updateConversationCount();

    showView("clientReply");

    roughReply.focus();

    return;
  }

  setLoading(mode);

  const response = await window.writingAssistant.improveText({
    text,
    mode,

    explanationLanguage: currentSettings.understandExplanation,
  });

  if (!response?.ok) {
    showView("main");

    showNotice(
      "Could not process the text",
      response?.error || "Try again in a moment.",
    );

    return;
  }

  if (mode === "understand") {
    renderUnderstandResult(response.result);
  } else {
    renderWritingResult(mode, response.result);
  }
}

async function createClientReply() {
  const text = roughReply.value.trim();

  if (!text) {
    showNotice(
      "Write a rough response first",
      "English, Taglish, or Tagalog is okay.",
    );

    roughReply.focus();

    return;
  }

  const context = buildConversationContext(
    pendingClientContext || sourceText.value.trim(),
  );

  setLoading("client_reply");

  const response = await window.writingAssistant.improveText({
    text,
    context,
    mode: "client_reply",

    explanationLanguage: currentSettings.understandExplanation,
  });

  if (!response?.ok) {
    showView("clientReply");

    showNotice(
      "Could not create the reply",
      response?.error || "Try again in a moment.",
    );

    return;
  }

  renderWritingResult("client_reply", response.result);
}

function commitConversationReply(finalText) {
  if (currentWritingMode !== "client_reply" || !finalText.trim()) {
    return;
  }

  const clientText = pendingClientContext || sourceText.value.trim();

  if (clientText) {
    conversationHistory.push({
      role: "client",
      text: clientText,
    });
  }

  conversationHistory.push({
    role: "user",
    text: finalText.trim(),
  });

  conversationHistory = conversationHistory.slice(-8);

  pendingClientContext = "";

  updateConversationCount();
}

function displayShortcut(accelerator) {
  return accelerator.replace("CommandOrControl", "Ctrl").replaceAll("+", " + ");
}

function updateSettingsUi() {
  document.querySelectorAll("[data-shortcut-setting]").forEach((button) => {
    const key = button.dataset.shortcutSetting;

    button.textContent = displayShortcut(currentSettings.shortcuts[key]);
  });

  defaultInputSource.value = currentSettings.defaultInputSource || "selected";

  explanationLanguage.value =
    currentSettings.understandExplanation || "simple_english";
}

async function saveSettings(partial) {
  hideDrawerNotice();

  const candidate = {
    ...currentSettings,
    ...partial,

    shortcuts: {
      ...currentSettings.shortcuts,
      ...(partial?.shortcuts || {}),
    },
  };

  const result = await window.writingAssistant.saveSettings(candidate);

  if (!result?.ok) {
    showDrawerNotice(result?.error || "Could not save settings.");

    updateSettingsUi();

    return false;
  }

  currentSettings = result.settings;

  updateSettingsUi();

  return true;
}

function acceleratorFromEvent(event) {
  const parts = [];

  if (event.ctrlKey || event.metaKey) {
    parts.push("CommandOrControl");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  let key = event.key;

  if (["Control", "Shift", "Alt", "Meta"].includes(key)) {
    return null;
  }

  if (key === " ") {
    key = "Space";
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  parts.push(key);

  return parts.length >= 2 ? parts.join("+") : null;
}

/* Main action buttons */
document.getElementById("actionList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");

  if (button) {
    runMode(button.dataset.action);
  }
});

/* Input source selector */
selectedSourceBtn.addEventListener("click", () => switchSource("selected"));

clipboardSourceBtn.addEventListener("click", () => switchSource("clipboard"));

refreshBtn.addEventListener("click", () => refreshInput(currentSource));

sourceText.addEventListener("input", () => {
  sourceBuffers[currentSource] = sourceText.value;

  sourceInitialized[currentSource] = true;

  updateCharCount();
  scheduleSourceScrollbarUpdate();

  if (sourceText.value.trim()) {
    hideNotice();
  }
});

sourceText.addEventListener("scroll", updateSourceScrollbar, { passive: true });

sourceScrollThumb?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();

  sourceScrollbarDragging = true;
  sourceScrollbarPointerId = event.pointerId;

  sourceScrollbarDragStartY = event.clientY;

  sourceScrollbarDragStartScrollTop = sourceText.scrollTop;

  sourceScrollThumb.classList.add("dragging");

  try {
    sourceScrollThumb.setPointerCapture(event.pointerId);
  } catch {}
});

sourceScrollThumb?.addEventListener("pointermove", (event) => {
  if (
    !sourceScrollbarDragging ||
    event.pointerId !== sourceScrollbarPointerId
  ) {
    return;
  }

  event.preventDefault();

  const trackHeight = sourceScrollbar?.clientHeight || 0;

  const thumbHeight = sourceScrollThumb.offsetHeight;

  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

  const maxScrollTop = Math.max(
    0,
    sourceText.scrollHeight - sourceText.clientHeight,
  );

  if (maxThumbTop <= 0 || maxScrollTop <= 0) {
    return;
  }

  const deltaY = event.clientY - sourceScrollbarDragStartY;

  sourceText.scrollTop =
    sourceScrollbarDragStartScrollTop + deltaY * (maxScrollTop / maxThumbTop);
});

sourceScrollThumb?.addEventListener("pointerup", stopSourceScrollbarDrag);

sourceScrollThumb?.addEventListener("pointercancel", stopSourceScrollbarDrag);

sourceScrollbar?.addEventListener("pointerdown", (event) => {
  if (event.target === sourceScrollThumb) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const rect = sourceScrollbar.getBoundingClientRect();

  const thumbHeight = sourceScrollThumb?.offsetHeight || 0;

  const trackHeight = sourceScrollbar.clientHeight;

  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

  const maxScrollTop = Math.max(
    0,
    sourceText.scrollHeight - sourceText.clientHeight,
  );

  if (maxThumbTop <= 0 || maxScrollTop <= 0) {
    return;
  }

  const desiredThumbTop = Math.max(
    0,
    Math.min(maxThumbTop, event.clientY - rect.top - thumbHeight / 2),
  );

  sourceText.scrollTop = (desiredThumbTop / maxThumbTop) * maxScrollTop;

  updateSourceScrollbar();
});

window.addEventListener("resize", scheduleSourceScrollbarUpdate);

/* Back buttons */
document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => showView("main"));
});

createReplyBtn.addEventListener("click", createClientReply);

copySuggestionBtn.addEventListener("click", async () => {
  const text = suggestionText.value.trim();

  if (!text) {
    return;
  }

  commitConversationReply(text);

  await window.writingAssistant.copyResult(text);

  await window.writingAssistant.hideWindow();
});

replaceSuggestionBtn.addEventListener("click", async () => {
  const text = suggestionText.value.trim();

  if (!text) {
    return;
  }

  const result = await window.writingAssistant.replaceSelection(text);

  if (!result?.ok) {
    showNotice(
      "Could not replace the selection",
      result?.error || "Use Copy instead.",
    );

    return;
  }

  commitConversationReply(text);
});

helpReplyBtn.addEventListener("click", () => {
  pendingClientContext = sourceText.value.trim();

  clientContext.textContent = buildConversationContext(pendingClientContext);

  roughReply.value = "";

  updateConversationCount();

  showView("clientReply");

  roughReply.focus();
});

clearConversationBtn.addEventListener("click", () => {
  conversationHistory = [];

  updateConversationCount();

  if (pendingClientContext) {
    clientContext.textContent = buildConversationContext(pendingClientContext);
  }
});

/* Window + drawer */
drawerToggleBtn.addEventListener("click", () => setDrawer(!drawerOpen));

drawerCloseBtn.addEventListener("click", () => setDrawer(false));

drawerBackdrop.addEventListener("click", () => setDrawer(false));

updateLaterBtn?.addEventListener("click", () => {
  closeUpdateDialog();
});

updateDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeUpdateDialog();
});

restartUpdateBtn?.addEventListener("click", async () => {
  clearUpdateError();

  restartUpdateBtn.disabled = true;
  restartUpdateBtn.textContent = "RESTARTING…";

  try {
    const result = await window.writingAssistant.installUpdate();

    if (!result?.ok) {
      throw new Error(result?.error || "Could not start the update.");
    }
  } catch (error) {
    restartUpdateBtn.disabled = false;
    restartUpdateBtn.textContent = "RESTART UPDATE";

    if (updateError) {
      updateError.textContent =
        error?.message || "Could not restart Clarity for the update.";
      updateError.classList.remove("hidden");
    }
  }
});

minimizeBtn.addEventListener("click", () =>
  window.writingAssistant.minimizeWindow(),
);

closeBtn.addEventListener("click", () => window.writingAssistant.hideWindow());

/* Settings */
defaultInputSource.addEventListener("change", async () => {
  await saveSettings({
    defaultInputSource: defaultInputSource.value,
  });
});

explanationLanguage.addEventListener("change", async () => {
  await saveSettings({
    understandExplanation: explanationLanguage.value,
  });
});

document.querySelectorAll("[data-shortcut-setting]").forEach((button) => {
  button.addEventListener("click", () => {
    capturingShortcut = button.dataset.shortcutSetting;

    document
      .querySelectorAll(".shortcut-capture")
      .forEach((item) => item.classList.remove("capturing"));

    button.classList.add("capturing");

    button.textContent = "Press keys…";
  });
});

/* Keyboard */
document.addEventListener("keydown", async (event) => {
  if (updateDialog?.open && event.key === "Escape") {
    event.preventDefault();
    closeUpdateDialog();
    return;
  }

  if (capturingShortcut) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      capturingShortcut = null;

      updateSettingsUi();

      document
        .querySelectorAll(".shortcut-capture")
        .forEach((item) => item.classList.remove("capturing"));

      return;
    }

    const accelerator = acceleratorFromEvent(event);

    if (!accelerator) {
      return;
    }

    const key = capturingShortcut;

    capturingShortcut = null;

    const success = await saveSettings({
      shortcuts: {
        [key]: accelerator,
      },
    });

    document
      .querySelectorAll(".shortcut-capture")
      .forEach((item) => item.classList.remove("capturing"));

    if (!success) {
      updateSettingsUi();
    }

    return;
  }

  if (event.key === "Escape") {
    if (drawerOpen) {
      event.preventDefault();
      setDrawer(false);
      return;
    }

    if (currentView === "main") {
      await window.writingAssistant.hideWindow();
    } else {
      showView("main");
    }

    return;
  }

  if (
    currentView === "main" &&
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "r"
  ) {
    event.preventDefault();

    await refreshInput(currentSource);

    return;
  }

  if (
    currentView === "main" &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    const modes = {
      1: "express",
      2: "understand",
      3: "client_reply",
      4: "grammar",
    };

    const mode = modes[event.key];

    if (mode) {
      event.preventDefault();

      runMode(mode);

      return;
    }
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter" &&
    currentView === "clientReply"
  ) {
    event.preventDefault();

    createClientReply();
  }
});

/* When an update has finished downloading */
window.writingAssistant.onUpdateReady((payload) => {
  openUpdateDialog(payload);
});

/* When a global shortcut opens Clarity */
window.writingAssistant.onAssistantOpened(async (payload) => {
  setDrawer(false);

  currentSettings =
    payload?.settings ||
    (await window.writingAssistant.getSettings()) ||
    structuredClone(DEFAULT_SETTINGS);

  updateSettingsUi();

  currentSource =
    payload?.source || currentSettings.defaultInputSource || "selected";

  sourceBuffers[currentSource] = payload?.text || "";

  sourceInitialized[currentSource] = true;

  updateSourceTabs();
  loadCurrentSourceBuffer();
  showView("main");

  if (payload?.action && sourceText.value.trim()) {
    runMode(payload.action);
    return;
  }

  if (!payload?.captured && currentSource === "selected") {
    showNotice(
      "No text selected",
      "Highlight text in the source app and press Ctrl+R, or enter text manually.",
    );
  }
});

/* =========================================================
   REUSABLE CUSTOM VERTICAL SCROLLBARS
   Uses the exact same track/thumb classes as the source input.
   Native Windows/Chromium scrollbars are hidden, so there are
   no arrow buttons anywhere these custom scrollbars are used.
   ========================================================= */

const customScrollbarTargets = [
  ".drawer-scroll",
  ".result-scroll",
  ".context-text",
  ".suggestion-card textarea",
  ".reply-card textarea",
];

const customScrollbarInstances = new Map();

function scheduleAllCustomScrollbarUpdates() {
  if (scheduleAllCustomScrollbarUpdates.pending) {
    return;
  }

  scheduleAllCustomScrollbarUpdates.pending = true;

  requestAnimationFrame(() => {
    scheduleAllCustomScrollbarUpdates.pending = false;

    for (const instance of customScrollbarInstances.values()) {
      instance.update();
    }
  });
}

scheduleAllCustomScrollbarUpdates.pending = false;

function isCustomScrollbarTargetVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.left < window.innerWidth &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight
  );
}

function attachCustomVerticalScrollbar(scrollElement) {
  if (!scrollElement || customScrollbarInstances.has(scrollElement)) {
    return;
  }

  scrollElement.classList.add("clarity-custom-scroll-target");

  const scrollbar = document.createElement("div");
  scrollbar.className = "source-scrollbar clarity-global-scrollbar";
  scrollbar.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("div");
  thumb.className = "source-scroll-thumb";

  scrollbar.appendChild(thumb);
  document.body.appendChild(scrollbar);

  let dragging = false;
  let pointerId = null;
  let dragStartY = 0;
  let dragStartScrollTop = 0;

  const update = () => {
    if (!document.body.contains(scrollElement)) {
      scrollbar.remove();
      customScrollbarInstances.delete(scrollElement);
      return;
    }

    const clientHeight = scrollElement.clientHeight;
    const scrollHeight = scrollElement.scrollHeight;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

    if (!isCustomScrollbarTargetVisible(scrollElement) || maxScrollTop <= 1) {
      scrollbar.classList.remove("visible");
      return;
    }

    const rect = scrollElement.getBoundingClientRect();

    const inset = 4;
    const scrollbarWidth = 8;

    scrollbar.style.top = `${Math.round(rect.top + inset)}px`;

    scrollbar.style.left = `${Math.round(rect.right - inset - scrollbarWidth)}px`;

    scrollbar.style.height = `${Math.max(
      0,
      Math.round(rect.height - inset * 2),
    )}px`;

    scrollbar.classList.add("visible");

    const trackHeight = scrollbar.clientHeight;
    const minimumThumbHeight = 34;

    const calculatedThumbHeight = trackHeight * (clientHeight / scrollHeight);

    const thumbHeight = Math.min(
      trackHeight,
      Math.max(minimumThumbHeight, calculatedThumbHeight),
    );

    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

    const thumbTop =
      maxScrollTop > 0
        ? (scrollElement.scrollTop / maxScrollTop) * maxThumbTop
        : 0;

    thumb.style.height = `${thumbHeight}px`;

    thumb.style.transform = `translateX(-50%) translateY(${thumbTop}px)`;
  };

  const stopDragging = (event) => {
    if (!dragging) {
      return;
    }

    dragging = false;
    thumb.classList.remove("dragging");

    if (pointerId !== null && thumb.hasPointerCapture?.(pointerId)) {
      try {
        thumb.releasePointerCapture(pointerId);
      } catch {}
    }

    pointerId = null;
    event?.preventDefault?.();
  };

  scrollElement.addEventListener("scroll", update, { passive: true });

  scrollElement.addEventListener("input", scheduleAllCustomScrollbarUpdates);

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    dragging = true;
    pointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartScrollTop = scrollElement.scrollTop;

    thumb.classList.add("dragging");

    try {
      thumb.setPointerCapture(event.pointerId);
    } catch {}
  });

  thumb.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }

    event.preventDefault();

    const trackHeight = scrollbar.clientHeight;

    const thumbHeight = thumb.offsetHeight;

    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

    const maxScrollTop = Math.max(
      0,
      scrollElement.scrollHeight - scrollElement.clientHeight,
    );

    if (maxThumbTop <= 0 || maxScrollTop <= 0) {
      return;
    }

    const deltaY = event.clientY - dragStartY;

    scrollElement.scrollTop =
      dragStartScrollTop + deltaY * (maxScrollTop / maxThumbTop);
  });

  thumb.addEventListener("pointerup", stopDragging);

  thumb.addEventListener("pointercancel", stopDragging);

  scrollbar.addEventListener("pointerdown", (event) => {
    if (event.target === thumb || event.button !== 0) {
      return;
    }

    event.preventDefault();

    const rect = scrollbar.getBoundingClientRect();

    const thumbHeight = thumb.offsetHeight;

    const trackHeight = scrollbar.clientHeight;

    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

    const maxScrollTop = Math.max(
      0,
      scrollElement.scrollHeight - scrollElement.clientHeight,
    );

    if (maxThumbTop <= 0 || maxScrollTop <= 0) {
      return;
    }

    const desiredThumbTop = Math.max(
      0,
      Math.min(maxThumbTop, event.clientY - rect.top - thumbHeight / 2),
    );

    scrollElement.scrollTop = (desiredThumbTop / maxThumbTop) * maxScrollTop;

    update();
  });

  const resizeObserver = new ResizeObserver(update);

  resizeObserver.observe(scrollElement);

  customScrollbarInstances.set(scrollElement, {
    scrollbar,
    thumb,
    update,
    resizeObserver,
  });

  update();
}

function initializeCustomVerticalScrollbars() {
  document
    .querySelectorAll(customScrollbarTargets.join(","))
    .forEach((element) => {
      attachCustomVerticalScrollbar(element);
    });

  scheduleAllCustomScrollbarUpdates();
}

window.addEventListener("resize", scheduleAllCustomScrollbarUpdates);

document.addEventListener("transitionend", scheduleAllCustomScrollbarUpdates);

const customScrollbarMutationObserver = new MutationObserver(() => {
  initializeCustomVerticalScrollbars();
});

customScrollbarMutationObserver.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["class"],
});

initializeCustomVerticalScrollbars();

/* Initial renderer state */
(async () => {
  currentSettings =
    (await window.writingAssistant.getSettings()) ||
    structuredClone(DEFAULT_SETTINGS);

  updateSettingsUi();
  await loadAppInfo();
  updateCharCount();
  updateConversationCount();
  scheduleSourceScrollbarUpdate();
})();
