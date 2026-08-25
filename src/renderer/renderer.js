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

const drawerToggleBtn = document.getElementById("drawerToggleBtn");

const drawerCloseBtn = document.getElementById("drawerCloseBtn");

const utilityDrawer = document.getElementById("utilityDrawer");

const drawerBackdrop = document.getElementById("drawerBackdrop");

const drawerNotice = document.getElementById("drawerNotice");

const minimizeBtn = document.getElementById("minimizeBtn");

const closeBtn = document.getElementById("closeBtn");

/* =========================================================
   DEFAULT SETTINGS
   ========================================================= */

const DEFAULT_SETTINGS = {
  shortcuts: {
    openAssistant: "CommandOrControl+Alt+F",

    quickGrammar: "CommandOrControl+Alt+R",

    quickUnderstand: "CommandOrControl+Alt+U",
  },

  defaultInputSource: "selected",

  understandExplanation: "simple_english",
};

/* =========================================================
   STATE
   ========================================================= */

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

/* =========================================================
   VIEWS
   ========================================================= */

function showView(name) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle("hidden", key !== name);

    if (key === name) {
      view.scrollTop = 0;
    }
  });

  currentView = name;

  /*
    The source textarea may have been hidden while
    another view was active.

    Recalculate the custom scrollbar after returning
    to the main view.
  */
  if (name === "main") {
    scheduleSourceScrollbarUpdate();
  }

  if (name !== "main") {
    hideNotice();
  }
}

/* =========================================================
   NOTICE
   ========================================================= */

function showNotice(title, message) {
  noticeTitle.textContent = title;

  noticeMessage.textContent = message;

  notice.classList.remove("hidden");
}

function hideNotice() {
  notice.classList.add("hidden");
}

/* =========================================================
   DRAWER NOTICE
   ========================================================= */

function showDrawerNotice(message) {
  drawerNotice.textContent = message;

  drawerNotice.classList.remove("hidden");
}

function hideDrawerNotice() {
  drawerNotice.textContent = "";

  drawerNotice.classList.add("hidden");
}

/* =========================================================
   DRAWER
   ========================================================= */

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

/* =========================================================
   CHARACTER COUNT
   ========================================================= */

function updateCharCount() {
  charCount.textContent = `${sourceText.value.length.toLocaleString()} / 12,000`;
}

/* =========================================================
   CUSTOM SOURCE SCROLLBAR
   ========================================================= */

function updateSourceScrollbar() {
  if (!sourceText || !sourceScrollbar || !sourceScrollThumb) {
    return;
  }

  const scrollHeight = sourceText.scrollHeight;

  const clientHeight = sourceText.clientHeight;

  /*
    Determine whether the textarea actually
    contains more content than it can display.
  */
  const canScroll = scrollHeight > clientHeight + 1;

  sourceScrollbar.classList.toggle("visible", canScroll);

  /*
    If there is nothing to scroll, hide the
    thumb completely.
  */
  if (!canScroll) {
    sourceScrollThumb.style.height = "0px";

    sourceScrollThumb.style.transform = "translateX(-50%) translateY(0px)";

    return;
  }

  const trackHeight = sourceScrollbar.clientHeight;

  /*
    The larger the visible portion of the text,
    the larger the thumb should be.
  */
  const visibleRatio = clientHeight / scrollHeight;

  /*
    Never let the thumb become too tiny.
  */
  const thumbHeight = Math.max(34, trackHeight * visibleRatio);

  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

  const scrollRatio =
    maxScrollTop > 0 ? sourceText.scrollTop / maxScrollTop : 0;

  const thumbTop = maxThumbTop * scrollRatio;

  sourceScrollThumb.style.height = `${thumbHeight}px`;

  sourceScrollThumb.style.transform = `translateX(-50%) translateY(${thumbTop}px)`;
}

function scheduleSourceScrollbarUpdate() {
  requestAnimationFrame(updateSourceScrollbar);
}

/* =========================================================
   INPUT STATUS
   ========================================================= */

function setInputStatus(label, ready = false) {
  inputStatusText.textContent = label;

  inputStatus.classList.toggle("ready", ready);
}

/* =========================================================
   SOURCE TABS
   ========================================================= */

function updateSourceTabs() {
  selectedSourceBtn.classList.toggle("active", currentSource === "selected");

  clipboardSourceBtn.classList.toggle("active", currentSource === "clipboard");
}

/* =========================================================
   LOAD SOURCE BUFFER
   ========================================================= */

function loadCurrentSourceBuffer() {
  sourceText.value = sourceBuffers[currentSource] || "";

  updateCharCount();

  /*
    Recalculate after programmatically inserting
    Selected or Clipboard text.
  */
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

/* =========================================================
   REFRESH INPUT
   ========================================================= */

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

/* =========================================================
   SWITCH SOURCE
   ========================================================= */

async function switchSource(source) {
  if (!["selected", "clipboard"].includes(source)) {
    return;
  }

  if (source === currentSource) {
    return;
  }

  /*
    Save any manual edits from the source we are
    leaving before switching.
  */
  sourceBuffers[currentSource] = sourceText.value;

  sourceInitialized[currentSource] = true;

  currentSource = source;

  updateSourceTabs();

  /*
    IMPORTANT:

    Switching back to Selected does NOT automatically
    capture selection again.

    This prevents focus/hide/show flashing.
  */
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

  /*
    Clipboard can be loaded safely without changing
    focus.

    Load automatically the first time only.
  */
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

/* =========================================================
   LOADING
   ========================================================= */

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

/* =========================================================
   RESET WRITING RESULT
   ========================================================= */

function resetWritingResult() {
  intentCard.classList.add("hidden");

  clarificationCard.classList.add("hidden");

  suggestionCard.classList.remove("hidden");

  intentSummary.textContent = "";

  clarificationQuestion.textContent = "";

  suggestionText.value = "";
}

/* =========================================================
   RENDER WRITING RESULT
   ========================================================= */

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

/* =========================================================
   RENDER UNDERSTAND RESULT
   ========================================================= */

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

/* =========================================================
   CONVERSATION CONTEXT
   ========================================================= */

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
  conversationCount.textContent = `SESSION CONTEXT: ${
    conversationHistory.length
  } MESSAGE${conversationHistory.length === 1 ? "" : "S"}`;
}

/* =========================================================
   RUN MODE
   ========================================================= */

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

  /*
    Client Reply first opens the rough reply screen
    instead of immediately calling the API.
  */
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

/* =========================================================
   CREATE CLIENT REPLY
   ========================================================= */

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

/* =========================================================
   COMMIT CONVERSATION
   ========================================================= */

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

/* =========================================================
   SHORTCUT DISPLAY
   ========================================================= */

function displayShortcut(accelerator) {
  return accelerator.replace("CommandOrControl", "Ctrl").replaceAll("+", " + ");
}

/* =========================================================
   SETTINGS UI
   ========================================================= */

function updateSettingsUi() {
  document.querySelectorAll("[data-shortcut-setting]").forEach((button) => {
    const key = button.dataset.shortcutSetting;

    button.textContent = displayShortcut(currentSettings.shortcuts[key]);
  });

  defaultInputSource.value = currentSettings.defaultInputSource || "selected";

  explanationLanguage.value =
    currentSettings.understandExplanation || "simple_english";
}

/* =========================================================
   SAVE SETTINGS
   ========================================================= */

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

/* =========================================================
   ACCELERATOR FROM KEY EVENT
   ========================================================= */

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

/* =========================================================
   MAIN ACTION BUTTONS
   ========================================================= */

document.getElementById("actionList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");

  if (button) {
    runMode(button.dataset.action);
  }
});

/* =========================================================
   INPUT SOURCE SELECTOR
   ========================================================= */

selectedSourceBtn.addEventListener("click", () => switchSource("selected"));

clipboardSourceBtn.addEventListener("click", () => switchSource("clipboard"));

/* =========================================================
   REFRESH
   ========================================================= */

refreshBtn.addEventListener("click", () => refreshInput(currentSource));

/* =========================================================
   SOURCE TEXT INPUT
   ========================================================= */

sourceText.addEventListener("input", () => {
  sourceBuffers[currentSource] = sourceText.value;

  sourceInitialized[currentSource] = true;

  updateCharCount();

  /*
      Recalculate custom scrollbar whenever the user
      types, pastes or deletes content.
    */
  scheduleSourceScrollbarUpdate();

  if (sourceText.value.trim()) {
    hideNotice();
  }
});

/* =========================================================
   SOURCE SCROLL
   ========================================================= */

sourceText.addEventListener("scroll", updateSourceScrollbar);

/* =========================================================
   CUSTOM SCROLLBAR INTERACTION
   ========================================================= */

if (sourceScrollbar && sourceScrollThumb) {
  let sourceScrollbarDragging = false;

  let sourceScrollbarStartY = 0;

  let sourceScrollbarStartScrollTop = 0;

  /* -------------------------------------------------------
     START DRAGGING THUMB
     ------------------------------------------------------- */

  sourceScrollThumb.addEventListener("pointerdown", (event) => {
    sourceScrollbarDragging = true;

    sourceScrollbarStartY = event.clientY;

    sourceScrollbarStartScrollTop = sourceText.scrollTop;

    sourceScrollThumb.classList.add("dragging");

    sourceScrollThumb.setPointerCapture(event.pointerId);

    event.preventDefault();
    event.stopPropagation();
  });

  /* -------------------------------------------------------
     DRAG THUMB
     ------------------------------------------------------- */

  sourceScrollThumb.addEventListener("pointermove", (event) => {
    if (!sourceScrollbarDragging) {
      return;
    }

    const trackHeight = sourceScrollbar.clientHeight;

    const thumbHeight = sourceScrollThumb.offsetHeight;

    const availableTrack = trackHeight - thumbHeight;

    const maxScroll = sourceText.scrollHeight - sourceText.clientHeight;

    if (availableTrack <= 0 || maxScroll <= 0) {
      return;
    }

    const pointerDelta = event.clientY - sourceScrollbarStartY;

    const scrollDelta = pointerDelta * (maxScroll / availableTrack);

    sourceText.scrollTop = sourceScrollbarStartScrollTop + scrollDelta;
  });

  /* -------------------------------------------------------
     STOP DRAGGING
     ------------------------------------------------------- */

  function stopSourceScrollbarDrag(event) {
    if (!sourceScrollbarDragging) {
      return;
    }

    sourceScrollbarDragging = false;

    sourceScrollThumb.classList.remove("dragging");

    if (sourceScrollThumb.hasPointerCapture(event.pointerId)) {
      sourceScrollThumb.releasePointerCapture(event.pointerId);
    }
  }

  sourceScrollThumb.addEventListener("pointerup", stopSourceScrollbarDrag);

  sourceScrollThumb.addEventListener("pointercancel", stopSourceScrollbarDrag);

  /* -------------------------------------------------------
     CLICK TRACK TO JUMP
     ------------------------------------------------------- */

  sourceScrollbar.addEventListener("pointerdown", (event) => {
    /*
        Clicking the thumb itself is already handled
        by the drag code above.
      */
    if (event.target === sourceScrollThumb) {
      return;
    }

    const rect = sourceScrollbar.getBoundingClientRect();

    const trackHeight = sourceScrollbar.clientHeight;

    const thumbHeight = sourceScrollThumb.offsetHeight;

    const availableTrack = trackHeight - thumbHeight;

    const maxScroll = sourceText.scrollHeight - sourceText.clientHeight;

    if (availableTrack <= 0 || maxScroll <= 0) {
      return;
    }

    /*
        Center the thumb around the point that
        the user clicked.
      */
    const requestedThumbTop = Math.min(
      availableTrack,

      Math.max(
        0,

        event.clientY - rect.top - thumbHeight / 2,
      ),
    );

    sourceText.scrollTop = (requestedThumbTop / availableTrack) * maxScroll;
  });
}

/* =========================================================
   WINDOW RESIZE
   ========================================================= */

window.addEventListener("resize", scheduleSourceScrollbarUpdate);

/* =========================================================
   BACK BUTTONS
   ========================================================= */

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => showView("main"));
});

/* =========================================================
   CREATE CLIENT REPLY BUTTON
   ========================================================= */

createReplyBtn.addEventListener("click", createClientReply);

/* =========================================================
   COPY SUGGESTION
   ========================================================= */

copySuggestionBtn.addEventListener("click", async () => {
  const text = suggestionText.value.trim();

  if (!text) {
    return;
  }

  commitConversationReply(text);

  await window.writingAssistant.copyResult(text);

  await window.writingAssistant.hideWindow();
});

/* =========================================================
   REPLACE SELECTION
   ========================================================= */

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

/* =========================================================
   HELP ME REPLY
   ========================================================= */

helpReplyBtn.addEventListener("click", () => {
  pendingClientContext = sourceText.value.trim();

  clientContext.textContent = buildConversationContext(pendingClientContext);

  roughReply.value = "";

  updateConversationCount();

  showView("clientReply");

  roughReply.focus();
});

/* =========================================================
   CLEAR CONVERSATION
   ========================================================= */

clearConversationBtn.addEventListener("click", () => {
  conversationHistory = [];

  updateConversationCount();

  if (pendingClientContext) {
    clientContext.textContent = buildConversationContext(pendingClientContext);
  }
});

/* =========================================================
   WINDOW + DRAWER
   ========================================================= */

drawerToggleBtn.addEventListener("click", () => setDrawer(!drawerOpen));

drawerCloseBtn.addEventListener("click", () => setDrawer(false));

drawerBackdrop.addEventListener("click", () => setDrawer(false));

minimizeBtn.addEventListener("click", () =>
  window.writingAssistant.minimizeWindow(),
);

closeBtn.addEventListener("click", () => window.writingAssistant.hideWindow());

/* =========================================================
   SETTINGS
   ========================================================= */

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

/* =========================================================
   SHORTCUT CAPTURE BUTTONS
   ========================================================= */

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

/* =========================================================
   KEYBOARD
   ========================================================= */

document.addEventListener(
  "keydown",

  async (event) => {
    /*
      -------------------------------------------------------
      Shortcut capture mode
      -------------------------------------------------------
    */
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

    /*
      -------------------------------------------------------
      Escape
      -------------------------------------------------------
    */
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

    /*
      -------------------------------------------------------
      Ctrl + R
      -------------------------------------------------------
    */
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

    /*
      -------------------------------------------------------
      Alt + 1 / 2 / 3 / 4
      -------------------------------------------------------
    */
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

    /*
      -------------------------------------------------------
      Ctrl + Enter in Client Reply
      -------------------------------------------------------
    */
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      currentView === "clientReply"
    ) {
      event.preventDefault();

      createClientReply();
    }
  },
);

/* =========================================================
   WHEN A GLOBAL SHORTCUT OPENS CLARITY
   ========================================================= */

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

  /*
        loadCurrentSourceBuffer() automatically
        recalculates the custom scrollbar.
      */
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
   INITIAL RENDERER STATE
   ========================================================= */

(async () => {
  currentSettings =
    (await window.writingAssistant.getSettings()) ||
    structuredClone(DEFAULT_SETTINGS);

  updateSettingsUi();

  updateCharCount();

  updateConversationCount();

  /*
    Initial custom scrollbar calculation.
  */
  scheduleSourceScrollbarUpdate();
})();
