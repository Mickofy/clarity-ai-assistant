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
const loadingNote = document.querySelector(".loading-note");

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

/*
  CLIENT REPLY UX V3

  Keep the existing HTML as a progressive fallback, then enhance it from
  renderer.js. The initial three-reply generation now uses one structured
  backend request and can return a clarification question when important
  user-specific facts are missing.
*/
const clientReplyView = views.clientReply;
const clientReplyHeading = clientReplyView?.querySelector(".client-heading");
const clientReplyContextCard = clientContext?.closest(".compact-card");
const clientReplyInputCard = roughReply?.closest(".reply-card");
const clientReplyComposeActions = createReplyBtn?.closest(".result-actions");

const CLIENT_REPLY_DEFAULT_PLACEHOLDER =
  "Optional — type your intent, key points, or rough notes. Leave blank and Clarity can draft when enough information is available.";

const CLIENT_REPLY_DEFAULT_HELPER =
  "OPTIONAL · English, Taglish, Tagalog, fragments, or rough notes are okay.";

let clientReplyStage = "compose";
let clientReplyTone = "professional";
let clientReplyLength = "normal";
let clientReplySuggestions = [];

let clientReplyPreferences = null;
let clientReplyHistoryPanel = null;
let clientReplyClarificationCard = null;
let clientReplyClarificationQuestion = null;
let clientReplySuggestionsPanel = null;
let clientReplySuggestionsList = null;
let clientReplyEditorPanel = null;
let clientReplyEditor = null;
let clientReplyEditorMeta = null;

const defaultInputSource = document.getElementById("defaultInputSource");
const explanationLanguage = document.getElementById("explanationLanguage");

const appVersion = document.getElementById("appVersion");
const appDeveloper = document.getElementById("appDeveloper");

const drawerToggleBtn = document.getElementById("drawerToggleBtn");
const drawerCloseBtn = document.getElementById("drawerCloseBtn");
const utilityDrawer = document.getElementById("utilityDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerNotice = document.getElementById("drawerNotice");

const minimizeBtn = document.getElementById("minimizeBtn");
const closeBtn = document.getElementById("closeBtn");

const DEFAULT_SETTINGS = {
  shortcuts: {
    openAssistant: "CommandOrControl+Alt+Q",
    quickExpress: "CommandOrControl+Alt+W",
    quickUnderstand: "CommandOrControl+Alt+E",
    quickClientReply: "CommandOrControl+Alt+R",
    quickGrammar: "CommandOrControl+Alt+T",
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

let drawerOpen = false;

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

function showView(name) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle("hidden", key !== name);

    if (key === name) {
      view.scrollTop = 0;
    }
  });

  currentView = name;
  document.querySelectorAll("[data-workspace]").forEach(button => {
    const active = button.dataset.workspace === name || (button.dataset.workspace === "express" && name === "writingResult");
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (workspaceReady && name !== "loading") persistWorkspace();

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
  const wasOpen = drawerOpen;
  if (open && !wasOpen) drawerPreviousFocus = document.activeElement;
  drawerOpen = Boolean(open);

  utilityDrawer.classList.toggle("open", drawerOpen);
  drawerBackdrop.classList.toggle("open", drawerOpen);

  utilityDrawer.setAttribute("aria-hidden", String(!drawerOpen));
  utilityDrawer.setAttribute("aria-modal", String(drawerOpen));
  utilityDrawer.inert = !drawerOpen;
  Array.from(utilityDrawer.parentElement.children).forEach(element => {
    if (element !== utilityDrawer && element !== drawerBackdrop) element.inert = drawerOpen;
  });
  drawerBackdrop.setAttribute("aria-hidden", String(!drawerOpen));

  drawerToggleBtn.setAttribute("aria-expanded", String(drawerOpen));
  if (drawerOpen && !wasOpen) requestAnimationFrame(() => drawerCloseBtn.focus());
  if (!drawerOpen && wasOpen) drawerPreviousFocus?.focus();

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
    // A failed capture never clears a manually written draft.

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

  if (sourceBuffers[source]?.trim() && sourceBuffers[source] !== result.text &&
      !window.confirm("Replace the current Home input with imported text? Your saved writing drafts are kept.")) {
    loadCurrentSourceBuffer(); return false;
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

/*
  Hide/minimize immediately.

  We no longer replace the current screen with a generic "Ready…" frame
  before hiding. The main process now waits for the exact next shortcut
  screen to be painted before revealing the BrowserWindow again.
*/
async function hideClarityWindow() {
  persistWorkspace();
  cancelWritingRequest(true);
  return window.writingAssistant.hideWindow();
}

async function minimizeClarityWindow() {
  persistWorkspace();
  return window.writingAssistant.minimizeWindow();
}

function notifyAssistantFrameReady(requestId) {
  const id = Number(requestId);

  if (!Number.isFinite(id)) {
    return;
  }

  /*
    main.js shows the BrowserWindow at opacity 0 before waiting here, so the
    page is considered visible by Chromium and requestAnimationFrame can run
    normally.

    Wait for fonts, then two animation frames:
      frame 1 -> DOM/style/layout settle
      frame 2 -> painted loading frame is ready to present
  */
  Promise.resolve(document.fonts?.ready)
    .catch(() => undefined)
    .then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.writingAssistant.assistantFrameReady(id);
        });
      });
    });
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

function displayShortcut(accelerator) {
  return String(accelerator || "").replace("CommandOrControl", "Ctrl").replaceAll("+", " + ");
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

initializeClientReplyUi();
initializeWorkspaces();

/* Home is explicit; drafts stay in their workspace. */
document.querySelectorAll("[data-back]").forEach(button => button.addEventListener("click", () => navigateWorkspace("main")));
createReplyBtn.addEventListener("click", createClientReply);

copySuggestionBtn.addEventListener("click", async () => {
  cancelWritingRequest(true);
  const text = suggestionText.value.trim(); if (!text) return;
  let copied = false; try { copied = await window.writingAssistant.copyResult(text); } catch {}
  showNotice(copied ? "Copied" : "Could not copy", copied ? "Your draft stays open." : "Your draft is preserved. Try Copy again.");
});
let replacingSelection = false;
replaceSuggestionBtn.addEventListener("click", async () => {
  const text = suggestionText.value.trim(); if (!text || replacingSelection) return;
  cancelWritingRequest(true); persistWorkspace(); replacingSelection = true; replaceSuggestionBtn.disabled = true;
  try {
    const result = await window.writingAssistant.replaceSelection(text);
    showNotice(result?.ok ? "Paste shortcut sent" : "Could not replace the selection", result?.ok ? "Your draft is kept open. Check the text in your source app." : result?.error || "Use Copy instead.");
  } catch { showNotice("Could not replace the selection", "Your draft is preserved. Use Copy instead."); }
  finally { replacingSelection = false; replaceSuggestionBtn.disabled = false; }
});
helpReplyBtn.addEventListener("click", () => {
  openClientReplyComposer(workspaceState.understanding?.source || sourceText.value.trim());
});

clearConversationBtn.addEventListener("click", () => {
  if (!window.confirm("Clear the messages and draft in this conversation?")) return;
  cancelWritingRequest(true); activeThread().turns = Workspace.empty().threads[0].turns;
  hydrateThread(); persistWorkspace();
});

/* Window and drawer */
drawerToggleBtn.addEventListener("click", () => setDrawer(!drawerOpen));

drawerCloseBtn.addEventListener("click", () => setDrawer(false));

drawerBackdrop.addEventListener("click", () => setDrawer(false));

minimizeBtn.addEventListener("click", () => {
  minimizeClarityWindow();
});

closeBtn.addEventListener("click", () => {
  hideClarityWindow();
});

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
  if (drawerOpen && event.key === "Tab" && !capturingShortcut) {
    const items = [...utilityDrawer.querySelectorAll("button:not(:disabled), input, select, textarea, summary")]
      .filter(element => element.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
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

    event.preventDefault();
    if (requestGate.current) cancelWritingRequest();
    else await hideClarityWindow();

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
    (currentView === "clientReply" || currentView === "writingResult")
  ) {
    event.preventDefault();

    if (currentView === "writingResult") {
      if (event.target.id === "writingFollowup") generateWriting("refine", event.target.value);
      else generateWriting();
    } else if (event.target.id === "clientFollowup") refineClientReply("custom");
    else createClientReply();
  }
});

window.writingAssistant.onAssistantOpened(handleAssistantOpened);

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
