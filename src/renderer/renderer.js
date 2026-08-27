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
let clientReplyOriginalIntent = "";
let clientReplyHistoryExpanded = false;

let clientReplyPreferences = null;
let clientReplyHistoryPanel = null;
let clientReplyHistoryToggle = null;
let clientReplyClarificationCard = null;
let clientReplyClarificationQuestion = null;
let clientReplyInputHelper = null;
let clientReplySuggestionsPanel = null;
let clientReplySuggestionsList = null;
let clientReplyEditorPanel = null;
let clientReplyEditor = null;
let clientReplyEditorLabel = null;
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

/*
  REPLACE SELECTION BACKGROUND PREP

  Replace Selection intentionally paints a neutral view before the main
  process hides Clarity and returns focus to the original source app.

  These helpers were referenced by the Replace Selection click handler but
  were accidentally missing from renderer.js. That caused a ReferenceError
  before the IPC call could run, making the button appear to do nothing.
*/
function prepareWindowForBackground() {
  hideNotice();

  if (loadingTitle) {
    loadingTitle.textContent = "Replacing selected text…";
  }

  if (loadingNote) {
    loadingNote.textContent = "Returning the result to your source app.";
  }

  showView("loading");
}

function waitForUiPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
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

function initializeClientReplyUi() {
  if (
    !clientReplyView ||
    !clientReplyHeading ||
    !clientReplyContextCard ||
    !clientReplyInputCard ||
    !clientReplyComposeActions
  ) {
    return;
  }

  const headingTitle = clientReplyHeading.querySelector("h2");
  const headingDescription = clientReplyHeading.querySelector("p");

  if (headingTitle) {
    headingTitle.textContent = "Create the right reply";
  }

  if (headingDescription) {
    headingDescription.textContent =
      "Add what you want to say, or leave it blank and Clarity can draft it.";
  }

  const contextLabel = clientReplyContextCard.querySelector(".card-label");

  if (contextLabel) {
    contextLabel.textContent = "CLIENT MESSAGE";
  }

  const roughLabel = clientReplyInputCard.querySelector(".card-label");

  if (roughLabel) {
    roughLabel.textContent = "WHAT DO YOU WANT TO SAY?";
  }

  roughReply.placeholder = CLIENT_REPLY_DEFAULT_PLACEHOLDER;

  clientReplyInputHelper = document.createElement("div");
  clientReplyInputHelper.className = "client-reply-helper";
  clientReplyInputHelper.textContent = CLIENT_REPLY_DEFAULT_HELPER;

  roughReply.insertAdjacentElement("afterend", clientReplyInputHelper);

  clientReplyPreferences = document.createElement("section");
  clientReplyPreferences.className = "client-reply-preferences";
  clientReplyPreferences.innerHTML = `
    <div class="client-preference-group">
      <div class="client-preference-label">TONE</div>
      <div class="client-segmented" role="group" aria-label="Reply tone">
        <button type="button" data-client-tone="professional">Professional</button>
        <button type="button" data-client-tone="friendly">Friendly</button>
        <button type="button" data-client-tone="firm">Firm</button>
      </div>
    </div>

    <div class="client-preference-group">
      <div class="client-preference-label">LENGTH</div>
      <div class="client-segmented" role="group" aria-label="Reply length">
        <button type="button" data-client-length="short">Short</button>
        <button type="button" data-client-length="normal">Normal</button>
        <button type="button" data-client-length="detailed">Detailed</button>
      </div>
    </div>
  `;

  clientReplyInputCard.insertAdjacentElement(
    "afterend",
    clientReplyPreferences,
  );

  clientReplyHistoryPanel = document.createElement("section");
  clientReplyHistoryPanel.className = "result-card client-history-panel hidden";

  clientReplyHistoryPanel.innerHTML = `
    <div class="card-label">RECENT CONVERSATION</div>
    <div class="client-history-list"></div>
  `;

  clientReplyContextCard.insertAdjacentElement(
    "afterend",
    clientReplyHistoryPanel,
  );

  clientReplyHistoryToggle = document.createElement("button");
  clientReplyHistoryToggle.type = "button";
  clientReplyHistoryToggle.className = "text-button client-history-toggle";
  clientReplyHistoryToggle.textContent = "VIEW";

  clearConversationBtn.insertAdjacentElement(
    "beforebegin",
    clientReplyHistoryToggle,
  );

  clientReplyClarificationCard = document.createElement("section");
  clientReplyClarificationCard.className =
    "result-card client-clarification-card hidden";

  clientReplyClarificationCard.innerHTML = `
    <div class="card-label">MORE CONTEXT NEEDED</div>

    <div
      class="card-text"
      id="clientReplyClarificationQuestion"
    ></div>
  `;

  clientReplyInputCard.insertAdjacentElement(
    "beforebegin",
    clientReplyClarificationCard,
  );

  clientReplyClarificationQuestion = clientReplyClarificationCard.querySelector(
    "#clientReplyClarificationQuestion",
  );

  clientReplySuggestionsPanel = document.createElement("section");
  clientReplySuggestionsPanel.className =
    "client-reply-stage client-suggestions-stage hidden";

  clientReplySuggestionsPanel.innerHTML = `
    <div class="client-stage-toolbar">
      <div>
        <div class="client-stage-kicker">3 SUGGESTIONS</div>
        <div class="client-stage-description">
          Choose the closest reply. You can edit it before copying.
        </div>
      </div>

      <button
        id="clientNewOptionsBtn"
        class="text-button"
        type="button"
      >
        NEW OPTIONS
      </button>
    </div>

    <div
      class="client-suggestion-list"
      id="clientSuggestionList"
      aria-live="polite"
    ></div>

    <div class="client-stage-actions">
      <button
        id="clientSuggestionsBackBtn"
        class="secondary-action"
        type="button"
      >
        BACK
      </button>
    </div>
  `;

  clientReplyComposeActions.insertAdjacentElement(
    "beforebegin",
    clientReplySuggestionsPanel,
  );

  clientReplySuggestionsList = clientReplySuggestionsPanel.querySelector(
    "#clientSuggestionList",
  );

  clientReplyEditorPanel = document.createElement("section");
  clientReplyEditorPanel.className =
    "client-reply-stage client-editor-stage hidden";

  clientReplyEditorPanel.innerHTML = `
    <div class="client-stage-toolbar client-editor-toolbar">
      <div>
        <div class="client-stage-kicker">YOUR REPLY</div>
        <div
          id="clientReplyEditorLabel"
          class="client-editor-option-label"
        >
          SELECTED OPTION
        </div>
      </div>

      <button
        id="clientEditorNewOptionsBtn"
        class="text-button"
        type="button"
      >
        NEW OPTIONS
      </button>
    </div>

    <div class="client-editor-card">
      <textarea
        id="clientReplyEditor"
        spellcheck="true"
        aria-label="Editable client reply"
      ></textarea>

      <div class="client-editor-meta">
        <span id="clientReplyEditorMeta">
          Editable — AI actions use the text currently shown here.
        </span>
      </div>
    </div>

    <div class="client-refine-actions" aria-label="Refine reply">
      <button type="button" data-client-refine="grammar">GRAMMAR</button>
      <button type="button" data-client-refine="improve">IMPROVE REPLY</button>
      <button type="button" data-client-refine="shorter">SHORTER</button>
    </div>

    <div class="client-stage-actions client-editor-actions">
      <button
        id="clientEditorBackBtn"
        class="secondary-action"
        type="button"
      >
        BACK TO OPTIONS
      </button>

      <button
        id="clientCopyReplyBtn"
        class="primary-action"
        type="button"
      >
        COPY REPLY
      </button>
    </div>
  `;

  clientReplySuggestionsPanel.insertAdjacentElement(
    "afterend",
    clientReplyEditorPanel,
  );

  clientReplyEditor =
    clientReplyEditorPanel.querySelector("#clientReplyEditor");

  clientReplyEditorLabel = clientReplyEditorPanel.querySelector(
    "#clientReplyEditorLabel",
  );

  clientReplyEditorMeta = clientReplyEditorPanel.querySelector(
    "#clientReplyEditorMeta",
  );

  createReplyBtn.textContent = "CREATE 3 REPLIES";

  clientReplyPreferences
    .querySelectorAll("[data-client-tone]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        clientReplyTone = button.dataset.clientTone || "professional";
        updateClientReplyPreferenceUi();
      });
    });

  clientReplyPreferences
    .querySelectorAll("[data-client-length]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        clientReplyLength = button.dataset.clientLength || "normal";
        updateClientReplyPreferenceUi();
      });
    });

  clientReplyHistoryToggle.addEventListener("click", () => {
    clientReplyHistoryExpanded = !clientReplyHistoryExpanded;
    renderClientReplyContext();
  });

  clientReplySuggestionsPanel
    .querySelector("#clientNewOptionsBtn")
    ?.addEventListener("click", () => generateClientReplySuggestions());

  clientReplySuggestionsPanel
    .querySelector("#clientSuggestionsBackBtn")
    ?.addEventListener("click", () => setClientReplyStage("compose"));

  clientReplyEditorPanel
    .querySelector("#clientEditorNewOptionsBtn")
    ?.addEventListener("click", () => generateClientReplySuggestions());

  clientReplyEditorPanel
    .querySelector("#clientEditorBackBtn")
    ?.addEventListener("click", () => setClientReplyStage("suggestions"));

  clientReplyEditorPanel
    .querySelector("#clientCopyReplyBtn")
    ?.addEventListener("click", copyClientReplyEditor);

  clientReplyEditorPanel
    .querySelectorAll("[data-client-refine]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        refineClientReply(button.dataset.clientRefine);
      });
    });

  updateClientReplyPreferenceUi();
  setClientReplyStage("compose");
}

function updateClientReplyPreferenceUi() {
  clientReplyPreferences
    ?.querySelectorAll("[data-client-tone]")
    .forEach((button) => {
      const active = button.dataset.clientTone === clientReplyTone;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

  clientReplyPreferences
    ?.querySelectorAll("[data-client-length]")
    .forEach((button) => {
      const active = button.dataset.clientLength === clientReplyLength;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}

function resetClientReplyFieldGuidance() {
  if (roughReply) {
    roughReply.placeholder = CLIENT_REPLY_DEFAULT_PLACEHOLDER;
  }

  if (clientReplyInputHelper) {
    clientReplyInputHelper.textContent = CLIENT_REPLY_DEFAULT_HELPER;
  }

  if (createReplyBtn) {
    createReplyBtn.textContent = "CREATE 3 REPLIES";
  }
}

function hideClientReplyClarification({ resetGuidance = true } = {}) {
  if (clientReplyClarificationCard) {
    clientReplyClarificationCard.classList.add("hidden");
  }

  if (clientReplyClarificationQuestion) {
    clientReplyClarificationQuestion.textContent = "";
  }

  if (resetGuidance) {
    resetClientReplyFieldGuidance();
  }
}

function showClientReplyClarification({
  question = "",
  placeholderExample = "",
} = {}) {
  if (!clientReplyClarificationCard) {
    return;
  }

  if (clientReplyClarificationQuestion) {
    clientReplyClarificationQuestion.textContent =
      String(question || "").trim() ||
      "Add the missing information so Clarity does not have to guess.";
  }

  const example =
    typeof placeholderExample === "string" ? placeholderExample.trim() : "";

  if (roughReply) {
    roughReply.placeholder =
      example && /^e\.g\./i.test(example)
        ? example
        : example
          ? `e.g. ${example}`
          : "Add the missing information here — rough notes are enough.";
  }

  if (clientReplyInputHelper) {
    clientReplyInputHelper.textContent =
      "OPTIONAL · English, Taglish, Tagalog, fragments, or rough notes are okay.";
  }

  if (createReplyBtn) {
    createReplyBtn.textContent = "CREATE REPLIES WITH THESE DETAILS";
  }

  clientReplyClarificationCard.classList.remove("hidden");

  requestAnimationFrame(() => {
    roughReply?.focus();
  });
}

function clientReplyLatestMessage() {
  return pendingClientContext || sourceText.value.trim();
}

function renderClientReplyContext() {
  const latest = clientReplyLatestMessage();

  clientContext.textContent = latest || "No client message is available.";

  updateConversationCount();

  const historyList = clientReplyHistoryPanel?.querySelector(
    ".client-history-list",
  );

  if (historyList) {
    historyList.innerHTML = "";

    conversationHistory.slice(-6).forEach((entry) => {
      const row = document.createElement("div");
      row.className = "client-history-row";

      const role = document.createElement("span");
      role.className = "client-history-role";
      role.textContent = entry.role === "client" ? "CLIENT" : "YOU";

      const text = document.createElement("div");
      text.className = "client-history-text";
      text.textContent = entry.text;

      row.append(role, text);
      historyList.appendChild(row);
    });
  }

  const hasHistory = conversationHistory.length > 0;

  if (clientReplyHistoryToggle) {
    clientReplyHistoryToggle.classList.toggle("hidden", !hasHistory);

    clientReplyHistoryToggle.textContent = clientReplyHistoryExpanded
      ? "HIDE"
      : "VIEW";
  }

  clientReplyHistoryPanel?.classList.toggle(
    "hidden",
    !hasHistory || !clientReplyHistoryExpanded,
  );
}

function setClientReplyHeading(stage) {
  const title = clientReplyHeading?.querySelector("h2");
  const description = clientReplyHeading?.querySelector("p");

  if (!title || !description) {
    return;
  }

  if (stage === "suggestions") {
    title.textContent = "Choose a reply";
    description.textContent =
      "Pick the closest option. You can edit it before copying.";
    return;
  }

  if (stage === "editor") {
    title.textContent = "Edit your reply";
    description.textContent =
      "Make any changes, then use AI tools or copy when ready.";
    return;
  }

  title.textContent = "Create the right reply";
  description.textContent =
    "Add what you want to say, or leave it blank and Clarity can draft it.";
}

function setClientReplyStage(stage) {
  clientReplyStage = stage;

  const composing = stage === "compose";
  const choosing = stage === "suggestions";
  const editing = stage === "editor";

  clientReplyView
    ?.querySelector(".conversation-strip")
    ?.classList.toggle("hidden", !composing);

  clientReplyContextCard?.classList.toggle("hidden", !composing);
  clientReplyInputCard?.classList.toggle("hidden", !composing);
  clientReplyPreferences?.classList.toggle("hidden", !composing);
  clientReplyComposeActions?.classList.toggle("hidden", !composing);

  if (!composing) {
    clientReplyHistoryPanel?.classList.add("hidden");
    clientReplyClarificationCard?.classList.add("hidden");
  } else {
    renderClientReplyContext();
  }

  clientReplySuggestionsPanel?.classList.toggle("hidden", !choosing);

  clientReplyEditorPanel?.classList.toggle("hidden", !editing);

  setClientReplyHeading(stage);

  if (editing) {
    requestAnimationFrame(() => {
      clientReplyEditor?.focus();
    });
  } else if (composing) {
    requestAnimationFrame(() => {
      roughReply?.focus();
    });
  }
}

function openClientReplyComposer(clientMessage) {
  pendingClientContext = String(clientMessage || "").trim();

  clientReplyOriginalIntent = "";
  clientReplySuggestions = [];
  clientReplyHistoryExpanded = false;

  roughReply.value = "";

  hideClientReplyClarification();
  renderClientReplyContext();
  updateClientReplyPreferenceUi();

  showView("clientReply");
  setClientReplyStage("compose");
}

function clientReplyToneLabel() {
  return (
    {
      professional: "Professional",
      friendly: "Friendly",
      firm: "Firm",
    }[clientReplyTone] || "Professional"
  );
}

function clientReplyLengthLabel() {
  return (
    {
      short: "Short",
      normal: "Normal",
      detailed: "Detailed",
    }[clientReplyLength] || "Normal"
  );
}

function clientReplyVariationProfiles() {
  if (clientReplyTone === "friendly") {
    return [
      {
        label: "Friendly",
        description: "Natural, warm, and easy to send.",
        directive:
          "Use a friendly, natural, conversational client tone while staying professional.",
      },
      {
        label: "Warm & Professional",
        description: "Friendly with a little more polish.",
        directive:
          "Use a warm professional tone: approachable, polished, and client-safe.",
      },
      {
        label: "Friendly & Direct",
        description: "Warm but more concise and decisive.",
        directive:
          "Use a friendly but direct tone. Be clear and decisive without sounding cold.",
      },
    ];
  }

  if (clientReplyTone === "firm") {
    return [
      {
        label: "Firm & Professional",
        description: "Clear boundaries without sounding harsh.",
        directive:
          "Use a firm professional tone. Set clear expectations without sounding rude or defensive.",
      },
      {
        label: "Firm but Warm",
        description: "Keeps the boundary with a softer delivery.",
        directive:
          "Keep the message firm, but soften the delivery with a respectful and collaborative tone.",
      },
      {
        label: "Direct & Firm",
        description: "Straight to the point and confident.",
        directive:
          "Be direct, confident, and firm. Avoid unnecessary filler while remaining respectful.",
      },
    ];
  }

  return [
    {
      label: "Professional",
      description: "Balanced, polished, and client-safe.",
      directive:
        "Use a polished professional tone that feels natural, clear, and client-ready.",
    },
    {
      label: "Warm Professional",
      description: "Professional with a more human tone.",
      directive:
        "Use a professional tone with a little more warmth and conversational flow.",
    },
    {
      label: "Direct Professional",
      description: "Clearer and more decisive.",
      directive:
        "Use a professional, direct tone. Be concise and decisive without sounding abrupt.",
    },
  ];
}

function buildClientReplyAiContext({
  variationDirective = "",
  taskDirective = "",
  forceLength = "",
} = {}) {
  const latest = clientReplyLatestMessage();

  const baseContext = buildConversationContext(latest);

  const length = forceLength || clientReplyLengthLabel();

  const instructions = [
    "CLIENT REPLY PREFERENCES:",
    `Tone: ${clientReplyToneLabel()}`,
    `Length: ${length}`,
    variationDirective ? `Variation: ${variationDirective}` : "",
    "",
    "CLIENT REPLY RULES:",
    "- Reply to the latest client message, using recent conversation only as supporting context.",
    "- Preserve the user's intent and factual meaning.",
    "- Do not invent prices, deadlines, promises, completed work, availability, or other facts that are not supported.",
    "- Keep the reply natural and ready to send.",
    "- Do not add labels, analysis, explanations, or quotation marks around the reply.",
    taskDirective ? `- Current task: ${taskDirective}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${baseContext}\n\n${instructions}`.trim();
}

function buildClientReplyOptionsAiContext(profiles) {
  const latest = clientReplyLatestMessage();
  const baseContext = buildConversationContext(latest);

  const variationInstructions = profiles
    .map(
      (profile, index) =>
        `${index + 1}. ${profile.label}: ${profile.directive}`,
    )
    .join("\n");

  return [
    baseContext,
    "",
    "CLIENT REPLY PREFERENCES:",
    `Base tone: ${clientReplyToneLabel()}`,
    `Length: ${clientReplyLengthLabel()}`,
    "",
    "CREATE THESE THREE VARIATIONS:",
    variationInstructions,
    "",
    "IMPORTANT:",
    "- All three replies must preserve the same facts and user intent.",
    "- Make the wording and delivery meaningfully different.",
    "- Never invent facts, experience, deadlines, prices, availability, promises, approvals, work status, or completed work.",
    "- Ask for clarification only when the client's actual question cannot be answered truthfully without an important missing fact or real user decision.",
    "- Do not block generation for optional enrichment such as exact dates, exact durations, metrics, extra technical detail, or extra outcomes unless the client explicitly requires them.",
    "- If the user's rough notes support a truthful but slightly general answer, generate the replies instead of asking another question.",
    "- Preserve uncertainty or ongoing status rather than inventing a completed outcome.",
  ].join("\n");
}

function clientReplyRequestText() {
  const rough = clientReplyOriginalIntent.trim();

  if (rough) {
    return rough;
  }

  /*
    CLIENT REPLY BLANK-INTENT FALLBACK

    The initial options mode can draft from the client message when the user
    intentionally leaves the rough-response field blank. The actual client
    message and conversation are also supplied in the context field.
  */
  return [
    "DRAFT MODE — the user has NOT written a rough reply.",
    "Create reply options from the client message and conversation context.",
    "Do not treat these instructions as the message to rewrite.",
    "If a meaningful answer requires missing user-specific facts or a real decision, request clarification instead of inventing them.",
  ].join("\n");
}

function normalizeClientReplyResult(response) {
  const text =
    typeof response?.result?.text === "string"
      ? response.result.text.trim()
      : "";

  return text;
}

function setClientReplyLoading(title, note) {
  loadingTitle.textContent = title;

  if (loadingNote) {
    loadingNote.textContent = note;
  }

  showView("loading");
}

function renderClientReplySuggestions() {
  if (!clientReplySuggestionsList) {
    return;
  }

  clientReplySuggestionsList.innerHTML = "";

  clientReplySuggestions.forEach((suggestion, index) => {
    const card = document.createElement("article");
    card.className = "client-suggestion-card";

    const top = document.createElement("div");
    top.className = "client-suggestion-top";

    const identity = document.createElement("div");

    const option = document.createElement("div");
    option.className = "client-suggestion-option";
    option.textContent = `0${index + 1} · ${suggestion.label}`;

    const description = document.createElement("div");
    description.className = "client-suggestion-description";
    description.textContent = suggestion.description;

    identity.append(option, description);

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "client-use-button";
    useButton.textContent = "USE THIS";

    useButton.addEventListener("click", () => {
      chooseClientReplySuggestion(index);
    });

    top.append(identity, useButton);

    const preview = document.createElement("div");
    preview.className = "client-suggestion-preview";
    preview.textContent = suggestion.text;

    card.append(top, preview);
    clientReplySuggestionsList.appendChild(card);
  });
}

async function generateClientReplySuggestions() {
  const latest = clientReplyLatestMessage();

  if (!latest) {
    showNotice(
      "No client message",
      "Add or select the client's message first.",
    );

    setClientReplyStage("compose");
    return;
  }

  if (clientReplyStage === "compose") {
    clientReplyOriginalIntent = roughReply.value.trim();
  }

  currentWritingMode = "client_reply";

  setClientReplyLoading(
    "Creating 3 reply options…",
    `${clientReplyToneLabel()} tone · ${clientReplyLengthLabel()} length`,
  );

  const profiles = clientReplyVariationProfiles();

  const response = await window.writingAssistant.improveText({
    text: clientReplyRequestText(),
    context: buildClientReplyOptionsAiContext(profiles),
    mode: "client_reply_options",
    explanationLanguage: currentSettings.understandExplanation,
  });

  if (!response?.ok) {
    showView("clientReply");
    setClientReplyStage("compose");

    showNotice(
      "Could not create reply options",
      response?.error || "Try again in a moment.",
    );

    return;
  }

  const result = response.result || {};

  if (result.needsClarification) {
    showView("clientReply");
    setClientReplyStage("compose");

    showClientReplyClarification({
      question:
        result.clarificationQuestion ||
        "Add the missing information so Clarity does not have to guess.",
      placeholderExample: result.placeholderExample,
    });

    return;
  }

  hideClientReplyClarification();

  const replies = Array.isArray(result.replies) ? result.replies : [];

  const unique = [];
  const seen = new Set();

  for (const reply of replies) {
    if (typeof reply !== "string") {
      continue;
    }

    const text = reply.trim();

    if (!text) {
      continue;
    }

    const key = text.replace(/\s+/g, " ").toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(text);
  }

  if (unique.length < 3) {
    hideClientReplyClarification();

    showView("clientReply");
    setClientReplyStage("compose");

    showNotice(
      "Could not create all 3 reply options",
      "The writing service returned fewer than 3 distinct replies. Try again.",
    );

    return;
  }

  clientReplySuggestions = unique.slice(0, 3).map((text, index) => ({
    ...profiles[index],
    text,
  }));

  renderClientReplySuggestions();

  showView("clientReply");
  setClientReplyStage("suggestions");
}

function chooseClientReplySuggestion(index) {
  const suggestion = clientReplySuggestions[index];

  if (!suggestion || !clientReplyEditor) {
    return;
  }

  currentWritingMode = "client_reply";

  clientReplyEditor.value = suggestion.text;

  if (clientReplyEditorLabel) {
    clientReplyEditorLabel.textContent = suggestion.label;
  }

  if (clientReplyEditorMeta) {
    clientReplyEditorMeta.textContent =
      "Editable — Grammar and Improve Reply use the text currently shown here.";
  }

  setClientReplyStage("editor");
}

async function refineClientReply(kind) {
  const currentText = clientReplyEditor?.value.trim() || "";

  if (!currentText) {
    showNotice("Nothing to improve", "Write or choose a reply first.");

    clientReplyEditor?.focus();
    return;
  }

  if (kind === "grammar") {
    setClientReplyLoading(
      "Checking the grammar…",
      "Keeping your meaning and wording as close as possible.",
    );

    const response = await window.writingAssistant.improveText({
      text: currentText,
      mode: "grammar",
      explanationLanguage: currentSettings.understandExplanation,
    });

    showView("clientReply");
    setClientReplyStage("editor");

    if (!response?.ok) {
      showNotice(
        "Could not fix the grammar",
        response?.error || "Try again in a moment.",
      );
      return;
    }

    const updated = normalizeClientReplyResult(response);

    if (updated) {
      clientReplyEditor.value = updated;
    }

    return;
  }

  const isShorter = kind === "shorter";

  setClientReplyLoading(
    isShorter ? "Making the reply shorter…" : "Improving your reply…",
    isShorter
      ? "Keeping the important meaning while removing extra words."
      : "Improving clarity, tone, and flow without changing your intent.",
  );

  const response = await window.writingAssistant.improveText({
    text: currentText,
    context: buildClientReplyAiContext({
      forceLength: isShorter ? "Short" : "",
      taskDirective: isShorter
        ? "Make the CURRENT REPLY shorter and more concise. Preserve every important fact and commitment. Do not add new information."
        : "Improve the CURRENT REPLY's clarity, professionalism, tone, and flow. Preserve the user's meaning and do not add unsupported information.",
    }),
    mode: "client_reply",
    explanationLanguage: currentSettings.understandExplanation,
  });

  showView("clientReply");
  setClientReplyStage("editor");

  if (!response?.ok) {
    showNotice(
      isShorter ? "Could not shorten the reply" : "Could not improve the reply",
      response?.error || "Try again in a moment.",
    );

    return;
  }

  const updated = normalizeClientReplyResult(response);

  if (updated) {
    clientReplyEditor.value = updated;
  }
}

async function copyClientReplyEditor() {
  const text = clientReplyEditor?.value.trim() || "";

  if (!text) {
    return;
  }

  commitConversationReply(text);

  await window.writingAssistant.copyResult(text);

  await hideClarityWindow();
}

function setLoading(mode) {
  const states = {
    express: {
      title: "Organizing your thoughts…",
      note: "Creating a clearer version.",
    },

    understand: {
      title: "Making this easier to understand…",
      note: "Analyzing selected text.",
    },

    client_reply: {
      title: "Creating reply options…",
      note: "Building client-ready responses from your message and context.",
    },

    grammar: {
      title: "Correcting the English…",
      note: "Processing selected text.",
    },
  };

  const state = states[mode] || {
    title: "Working on your message…",
    note: "Processing your text.",
  };

  loadingTitle.textContent = state.title;

  if (loadingNote) {
    loadingNote.textContent = state.note;
  }

  showView("loading");
}

/*
  FIRST SCREEN FOR GLOBAL SHORTCUTS

  This view is prepared before the BrowserWindow becomes opaque.

  It replaces:
    - a blank/black BrowserWindow
    - the old Home screen
    - the previous Result screen

  with a deliberate Clarity loading state.
*/
function setShortcutCaptureLoading(action, reason) {
  let title = "Capturing selection…";
  let note = "Reading text from the active window.";

  if (action === "express") {
    title = "Reading selected text…";
    note = "Preparing Express Clearly.";
  } else if (action === "understand") {
    title = "Reading selected text…";
    note = "Preparing Understand This.";
  } else if (action === "client_reply") {
    title = "Reading client message…";
    note = "Preparing Client Reply.";
  } else if (action === "grammar") {
    title = "Reading selected text…";
    note = "Preparing Grammar Only.";
  } else if (reason === "loading") {
    title = "Loading clipboard…";
    note = "Reading copied text.";
  }

  loadingTitle.textContent = title;

  if (loadingNote) {
    loadingNote.textContent = note;
  }

  showView("loading");
}

/*
  Hide/minimize immediately.

  We no longer replace the current screen with a generic "Ready…" frame
  before hiding. The main process now waits for the exact next shortcut
  screen to be painted before revealing the BrowserWindow again.
*/
async function hideClarityWindow() {
  return window.writingAssistant.hideWindow();
}

async function minimizeClarityWindow() {
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
  conversationCount.textContent = `CONVERSATION CONTEXT · ${conversationHistory.length} MESSAGE${
    conversationHistory.length === 1 ? "" : "S"
  }`;
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
    openClientReplyComposer(text);
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
  clientReplyOriginalIntent = roughReply.value.trim();
  await generateClientReplySuggestions();
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

  clientReplyOriginalIntent = "";
  clientReplySuggestions = [];
  clientReplyHistoryExpanded = false;
  hideClientReplyClarification();

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

initializeClientReplyUi();

/* Back buttons */
document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    if (currentView === "clientReply" && button.closest("#clientReplyView")) {
      if (clientReplyStage === "editor") {
        setClientReplyStage("suggestions");
        return;
      }

      if (clientReplyStage === "suggestions") {
        setClientReplyStage("compose");
        return;
      }
    }

    showView("main");
  });
});

createReplyBtn.addEventListener("click", createClientReply);

copySuggestionBtn.addEventListener("click", async () => {
  const text = suggestionText.value.trim();

  if (!text) {
    return;
  }

  commitConversationReply(text);

  await window.writingAssistant.copyResult(text);

  await hideClarityWindow();
});

replaceSuggestionBtn.addEventListener("click", async () => {
  const text = suggestionText.value.trim();

  if (!text) {
    return;
  }

  /*
    replaceSelection() hides Clarity from the main process so Windows can
    focus the source application and paste into it. Paint a neutral screen
    first so the next shortcut never restores this old result frame.
  */
  prepareWindowForBackground();
  await waitForUiPaint();

  const result = await window.writingAssistant.replaceSelection(text);

  if (!result?.ok) {
    /*
      Replace failed and Clarity was restored by the main process.
      Return to the existing result instead of leaving the loading view up.
    */
    showView("writingResult");

    showNotice(
      "Could not replace the selection",
      result?.error || "Use Copy instead.",
    );

    return;
  }

  commitConversationReply(text);
});

helpReplyBtn.addEventListener("click", () => {
  openClientReplyComposer(sourceText.value.trim());
});

clearConversationBtn.addEventListener("click", () => {
  conversationHistory = [];
  clientReplyHistoryExpanded = false;
  renderClientReplyContext();
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
      await hideClarityWindow();
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
    currentView === "clientReply" &&
    clientReplyStage === "compose"
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

  const isTemporaryCapture =
    payload?.phase === "capture" ||
    payload?.reason === "capturing" ||
    payload?.reason === "loading";

  sourceInitialized[currentSource] = !isTemporaryCapture;

  updateSourceTabs();
  loadCurrentSourceBuffer();

  /*
    FIRST / HIDDEN FRAME

    Build the exact screen that should be visible BEFORE main.js reveals
    the native BrowserWindow. After it has painted, notify the main process.

    This is what prevents a cached previous screen or the old "Ready…"
    frame from flashing when the window moves to another monitor.
  */
  if (payload?.phase === "capture") {
    /*
      Always use the dedicated loading view for the first shortcut frame.

      Normal Open Assistant:
        Capturing selection… / Loading clipboard…

      Quick Grammar:
        Reading selected text… / Preparing Grammar Only.

      Quick Understand:
        Reading selected text… / Preparing Understand This.

      main.js keeps the native window fully transparent until the renderer
      confirms that this state has painted.
    */
    hideNotice();

    setShortcutCaptureLoading(payload?.action || null, payload?.reason || null);

    notifyAssistantFrameReady(payload.requestId);
    return;
  }

  /*
    FINAL quick-action payload.

    Go directly from the already-visible shortcut loading screen into the
    requested operation. Never route through the home screen first.
  */
  if (payload?.action && sourceText.value.trim()) {
    hideNotice();
    runMode(payload.action);
    return;
  }

  if (payload?.action && !sourceText.value.trim()) {
    /*
      V7.5.8 QUICK-ACTION FAILURE UX

      Never make a failed quick-action capture look like
      the user opened the normal assistant.

      Stay on the dedicated quick-action screen and explain what happened.
      This keeps shortcut intent intact even if Windows does not return a
      selected-text copy.
    */
    hideNotice();

    setShortcutCaptureLoading(payload.action, "capturing");

    loadingTitle.textContent = "Couldn’t capture selected text.";

    if (loadingNote) {
      const retryMessages = {
        express: "Keep the text highlighted, then use Quick Express again.",
        understand:
          "Keep the text highlighted, then use Quick Understand again.",
        client_reply:
          "Keep the client message highlighted, then use Quick Client Reply again.",
        grammar: "Keep the text highlighted, then use Quick Grammar again.",
      };

      loadingNote.textContent =
        retryMessages[payload.action] ||
        "Keep the text highlighted, then try the quick action again.";
    }

    return;
  }

  /*
    Normal Open Assistant final state.
  */
  showView("main");

  if (!payload?.captured && currentSource === "selected") {
    showNotice(
      "No text selected",
      "Highlight text in the source app and press Ctrl+R, or enter text manually.",
    );

    return;
  }

  if (!payload?.captured && currentSource === "clipboard") {
    showNotice(
      "Clipboard is empty",
      "Copy text in another app and press Ctrl+R, or enter text manually.",
    );

    return;
  }

  hideNotice();
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
