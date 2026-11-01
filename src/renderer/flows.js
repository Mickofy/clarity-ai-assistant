/* Persistent writing workflows. The native capture and paste helpers stay in main.js. */
const Workspace = window.ClarityWorkspace;
let workspaceState;
let workspaceReady = false;
let storageProblem = "";
try { workspaceState = Workspace.restore(localStorage.getItem(Workspace.KEY)); }
catch { workspaceState = Workspace.empty(); storageProblem = "Local draft storage is unavailable."; }
const requestGate = new Workspace.RequestGate(id => {
  window.writingAssistant.cancelRequest(id).catch(() => {});
});
let lastRetry = null;
let clientMessageInput;
let drawerPreviousFocus = null;

function activeDocument() { return Workspace.activeDocument(workspaceState); }
function activeThread() { return Workspace.activeThread(workspaceState); }
function currentTurn() { return Workspace.currentTurn(workspaceState); }

function persistWorkspace() {
  if (!workspaceReady) return;
  workspaceState.view = currentView === "loading" ? workspaceState.view : currentView;
  workspaceState.source = currentSource;
  workspaceState.buffers = { ...sourceBuffers, [currentSource]: sourceText.value };
  const doc = activeDocument();
  if (doc && currentView === "writingResult") {
    doc.original = document.getElementById("writingOriginal").value;
    doc.text = suggestionText.value;
    doc.purpose = document.getElementById("writingPurpose").value;
    doc.answer = document.getElementById("writingClarificationAnswer").value;
    doc.followup = document.getElementById("writingFollowup").value;
    doc.details = document.getElementById("writingContextNotes").value;
  }
  if (clientMessageInput && currentView === "clientReply") {
    const turn = currentTurn();
    turn.client = clientMessageInput.value;
    turn.rough = roughReply.value;
    turn.draft = clientReplyEditor.value;
    turn.followup = document.getElementById("clientFollowup").value;
    turn.answer = document.getElementById("clientClarificationAnswer").value;
    turn.details = document.getElementById("clientContextNotes").value;
    if (turn.status === "sent" && turn.sentText !== turn.draft) turn.status = "draft";
    activeThread().tone = clientReplyTone;
    activeThread().length = clientReplyLength;
  }
  try {
    localStorage.setItem(Workspace.KEY, JSON.stringify(workspaceState));
    document.getElementById("saveStatus").textContent = storageProblem || "Saved on this device";
  } catch {
    document.getElementById("saveStatus").textContent = "Could not save locally. Keep this window open and copy your work.";
  }
}

function setRequestBusy(busy) {
  document.querySelectorAll("[data-ai], #generateWritingBtn, #developWritingBtn, #refineWritingBtn, #answerWritingBtn, #createReplyBtn, [data-writing-refine], [data-client-refine]")
    .forEach(button => { button.disabled = busy; });
  views.writingResult.setAttribute("aria-busy", String(busy));
  views.clientReply.setAttribute("aria-busy", String(busy));
}

function cancelWritingRequest(silent = false) {
  requestGate.cancel();
  setRequestBusy(false);
  if (silent) {
    lastRetry = null;
    document.getElementById("requestStatus").classList.add("hidden");
  } else {
    document.getElementById("requestMessage").textContent = "Cancelled. Your draft is preserved.";
    document.getElementById("cancelRequestBtn").classList.add("hidden");
    document.getElementById("retryRequestBtn").classList.toggle("hidden", !lastRetry);
  }
}

async function requestWriting(payload, label, retry) {
  persistWorkspace();
  hideNotice();
  const requestId = requestGate.begin();
  lastRetry = retry;
  document.getElementById("requestMessage").textContent = label;
  document.getElementById("requestStatus").classList.remove("hidden");
  document.getElementById("cancelRequestBtn").classList.remove("hidden");
  document.getElementById("retryRequestBtn").classList.add("hidden");
  setRequestBusy(true);
  let response;
  try { response = await window.writingAssistant.improveText({ ...payload, requestId }); }
  catch { response = { ok: false, error: "Could not reach the writing service. Your draft is preserved." }; }
  if (!requestGate.accepts(requestId)) return null;
  requestGate.finish(requestId);
  setRequestBusy(false);
  if (!response?.ok) {
    document.getElementById("requestMessage").textContent = response?.error || "Could not process the text. Try again.";
    document.getElementById("cancelRequestBtn").classList.add("hidden");
    document.getElementById("retryRequestBtn").classList.remove("hidden");
    return null;
  }
  document.getElementById("requestStatus").classList.add("hidden");
  lastRetry = null;
  return response;
}

function renderDraftSelect() {
  const select = document.getElementById("writingDraftSelect");
  select.replaceChildren();
  workspaceState.documents.forEach(doc => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = (doc.mode === "grammar" ? "Grammar · " : doc.purpose === "prompt" ? "Prompt · " : "Message · ") +
      (doc.original.trim().slice(0, 48) || "Untitled draft");
    select.append(option);
  });
  select.value = workspaceState.activeDocumentId;
}

function renderWritingResult(mode, result) {
  const doc = activeDocument();
  workspaceState.lastDocumentIds[mode] = doc.id;
  currentWritingMode = mode;
  views.writingResult.dataset.mode = mode;
  writingResultEyebrow.textContent = mode === "grammar" ? "GRAMMAR ONLY" : "EXPRESS CLEARLY";
  writingResultTitle.textContent = mode === "grammar" ? "Correct your writing" : doc.purpose === "prompt" ? "Shape your AI prompt" : "Express your thoughts";
  document.getElementById("writingOriginal").value = doc.original;
  document.getElementById("writingPurpose").value = doc.purpose;
  document.getElementById("writingPurposeHelp").textContent = doc.purpose === "prompt"
    ? "Organize the task, context, constraints, and requested output. Your instructions stay intact."
    : "Natural wording that preserves your meaning, uncertainty, and voice.";
  document.getElementById("generateWritingBtn").textContent = mode === "grammar" ? "Correct grammar" : doc.purpose === "prompt" ? "Build my prompt" : "Make it clear";
  document.getElementById("writingPurposeGroup").classList.toggle("hidden", mode === "grammar");
  document.getElementById("developWritingBtn").classList.toggle("hidden", mode === "grammar");
  intentSummary.textContent = doc.intent || "";
  intentCard.classList.toggle("hidden", !doc.intent);
  clarificationQuestion.textContent = doc.question || "";
  clarificationCard.classList.toggle("hidden", !doc.question);
  document.getElementById("writingClarificationAnswer").value = doc.answer || "";
  document.getElementById("writingFollowup").value = doc.followup || "";
  document.getElementById("writingContextNotes").value = doc.details || "";
  const originalCard = document.querySelector(".original-card");
  originalCard.open = !doc.text || Boolean(doc.question);
  originalCard.querySelector("summary").textContent = "Your rough thoughts" + (doc.text ? " · " + doc.original.slice(0, 75) : "");
  suggestionText.value = doc.text || "";
  suggestionCard.querySelector(".card-label").textContent = doc.operation === "develop" ? "IDEAS TO CONSIDER · EDITABLE" :
    mode === "grammar" ? "CORRECTED TEXT · EDITABLE" : doc.purpose === "prompt" ? "AI PROMPT · EDITABLE" : "YOUR MESSAGE · EDITABLE";
  suggestionCard.classList.toggle("hidden", !doc.text);
  document.getElementById("writingRefinement").classList.toggle("hidden", !doc.text);
  document.getElementById("undoWritingBtn").disabled = !doc.versions.length;
  copySuggestionBtn.disabled = !doc.text;
  replaceSuggestionBtn.disabled = !doc.text;
  renderDraftSelect();
  showView("writingResult");
  requestAnimationFrame(() => {
    if (currentView !== "writingResult") return;
    if (doc.question) clarificationCard.scrollIntoView({ block: "start" });
    else if (doc.text) suggestionCard.scrollIntoView({ block: "start" });
  });
}

function openWritingDocument(mode = "express", original, forceNew = false) {
  persistWorkspace();
  cancelWritingRequest(true);
  let doc = activeDocument();
  const previous = workspaceState.documents.find(d => d.id === workspaceState.lastDocumentIds[mode]) ||
    workspaceState.documents.filter(d => d.mode === mode).at(-1);
  if (!forceNew && original === undefined && doc?.mode !== mode) doc = previous;
  if (!forceNew && original !== undefined) doc = workspaceState.documents.find(d => d.mode === mode && d.original === original);
  if (forceNew || !doc || doc.mode !== mode) {
    doc = Workspace.newDocument(workspaceState, mode, original || "");
    doc.purpose = previous?.purpose || "message";
  }
  workspaceState.activeDocumentId = doc.id;
  renderWritingResult(mode, doc);
  persistWorkspace();
}

async function generateWriting(operation = "rewrite", refinement = "") {
  persistWorkspace();
  const doc = activeDocument();
  if (!doc?.original.trim()) {
    showNotice("Add your thoughts", "Rough notes, fragments, English, Taglish, or Tagalog are welcome.");
    document.getElementById("writingOriginal").focus();
    return;
  }
  if (operation === "refine" && !refinement.trim()) {
    showNotice("What would you like to change?", "Add a short instruction, or choose Shorter or More natural.");
    document.getElementById("writingFollowup").focus();
    return;
  }
  if (operation === "refine" && ((doc.details || "") + refinement).length > 5900) {
    showNotice("Consolidate your context", "Shorten the Additional facts or corrections field, then refine again."); return;
  }
  const context = "ORIGINAL USER NOTES (source of meaning and facts):\n" + doc.original +
    (doc.details ? "\n\nUSER CLARIFICATIONS:\n" + doc.details : "");
  const response = await requestWriting({
    mode: doc.mode, purpose: doc.purpose, operation, refinement,
    text: operation === "refine" ? doc.text || doc.original : doc.original,
    context, explanationLanguage: currentSettings.understandExplanation,
  }, operation === "develop" ? "Exploring your idea…" : operation === "refine" ? "Refining your draft…" : "Organizing your thoughts…",
  () => generateWriting(operation, refinement));
  if (!response) return;
  const result = response.result || {};
  if (typeof result.text === "string" && result.text.trim()) {
    Workspace.setDraft(doc, "text", result.text.trim());
    doc.operation = operation;
    if (operation === "refine") doc.details = (doc.details || "") + "\nUser revision: " + refinement;
  }
  doc.intent = result.intentSummary || "";
  doc.question = result.needsClarification ? result.clarificationQuestion || "What important detail is missing?" : "";
  if (!doc.question) { doc.answer = ""; doc.followup = ""; }
  renderWritingResult(doc.mode, doc);
  persistWorkspace();
  if (doc.question) document.getElementById("writingClarificationAnswer").focus();
}

function updateClientReplyPreferenceUi() {
  document.querySelectorAll("[data-client-tone]").forEach(button => {
    const active = button.dataset.clientTone === clientReplyTone;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-client-length]").forEach(button => {
    const active = button.dataset.clientLength === clientReplyLength;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function initializeClientReplyUi() {
  clientReplyHeading.querySelector("h2").textContent = "Keep the conversation going";
  clientReplyHeading.querySelector("p").textContent = "Add the client's message, shape your reply, and continue here.";
  clientReplyView.querySelector("[data-back]").classList.add("hidden");
  const toolbar = document.createElement("div");
  toolbar.className = "workspace-toolbar";
  toolbar.innerHTML = '<label>Conversation <select id="clientThreadSelect" aria-label="Saved client conversations"></select></label><button id="newClientThreadBtn" type="button">New conversation</button><details class="thread-tools"><summary>Manage</summary><label>Name <input id="clientThreadName" maxlength="80" aria-label="Conversation name"></label><button id="deleteClientThreadBtn" type="button">Delete conversation</button></details>';
  clientReplyHeading.insertAdjacentElement("beforebegin", toolbar);
  clientReplyContextCard.querySelector(".card-label").textContent = "LATEST CLIENT MESSAGE";
  clientContext.classList.remove("context-text");
  clientContext.replaceChildren();
  clientMessageInput = document.createElement("textarea");
  clientMessageInput.id = "clientMessageInput";
  clientMessageInput.setAttribute("aria-label", "Latest client message");
  clientMessageInput.maxLength = 12000;
  clientMessageInput.placeholder = "Paste or type the next client message here.";
  clientContext.append(clientMessageInput);
  roughReply.maxLength = 12000;
  roughReply.placeholder = CLIENT_REPLY_DEFAULT_PLACEHOLDER;
  clientReplyInputCard.querySelector(".card-label").textContent = "YOUR INTENT OR ROUGH RESPONSE";
  clientReplyPreferences = document.createElement("div");
  clientReplyPreferences.className = "client-reply-preferences";
  clientReplyPreferences.innerHTML = '<div><span>Tone</span><div class="client-segmented" role="group" aria-label="Reply tone"><button type="button" data-client-tone="professional">Professional</button><button type="button" data-client-tone="friendly">Friendly</button><button type="button" data-client-tone="firm">Firm</button></div></div><div><span>Length</span><div class="client-segmented" role="group" aria-label="Reply length"><button type="button" data-client-length="short">Short</button><button type="button" data-client-length="normal">Normal</button><button type="button" data-client-length="detailed">Detailed</button></div></div>';
  clientReplyInputCard.insertAdjacentElement("afterend", clientReplyPreferences);
  clientReplyPreferences.insertAdjacentHTML("beforeend", '<details class="client-context-notes"><summary>Additional facts or corrections</summary><label for="clientContextNotes">Later corrections take precedence.</label><textarea id="clientContextNotes" maxlength="6000"></textarea></details>');
  clientReplyHistoryPanel = document.createElement("details");
  clientReplyHistoryPanel.className = "result-card client-history-panel";
  clientReplyHistoryPanel.innerHTML = '<summary>Conversation history</summary><div class="client-history-list"></div>';
  clientReplyContextCard.insertAdjacentElement("beforebegin", clientReplyHistoryPanel);
  clientReplyClarificationCard = document.createElement("div");
  clientReplyClarificationCard.className = "result-card hidden";
  clientReplyClarificationCard.setAttribute("role", "status");
  clientReplyClarificationQuestion = document.createElement("p");
  clientReplyClarificationCard.append(clientReplyClarificationQuestion);
  clientReplyClarificationCard.insertAdjacentHTML("beforeend", '<label for="clientClarificationAnswer">Your answer</label><textarea id="clientClarificationAnswer" maxlength="2000" placeholder="A few rough notes are enough."></textarea><button id="clientClarificationBtn" type="button" data-ai>Continue with these details</button>');
  clientReplyInputCard.insertAdjacentElement("beforebegin", clientReplyClarificationCard);
  clientReplySuggestionsPanel = document.createElement("details");
  clientReplySuggestionsPanel.className = "result-card hidden";
  clientReplySuggestionsPanel.innerHTML = '<summary>View all three reply options</summary><div class="client-suggestion-list"></div>';
  clientReplySuggestionsList = clientReplySuggestionsPanel.querySelector(".client-suggestion-list");
  clientReplyEditorPanel = document.createElement("section");
  clientReplyEditorPanel.className = "client-editor-stage hidden";
  clientReplyEditorPanel.innerHTML = '<div class="card-label">YOUR REPLY · EDITABLE</div><textarea id="clientReplyEditor" maxlength="12000" aria-label="Editable client reply"></textarea><p id="clientReplyEditorMeta" class="helper-text">Draft · not confirmed sent</p><div class="client-refine-actions"><button type="button" data-client-refine="grammar">Grammar</button><button type="button" data-client-refine="improve">Improve reply</button><button type="button" data-client-refine="shorter">Shorter</button><button id="clientUndoBtn" type="button">Undo AI revision</button></div><label for="clientFollowup">What would you like to change?</label><textarea id="clientFollowup" maxlength="2000" placeholder="For example: make it warmer, but keep the same boundary."></textarea><button id="clientRefineBtn" type="button" data-ai>Refine reply</button><div class="result-actions"><button id="clientCopyReplyBtn" class="primary-action" type="button">Copy reply</button><button id="clientSentBtn" type="button">Mark as sent</button><button id="clientNextMessageBtn" class="secondary-action" type="button">Next client message</button></div>';
  clientReplyComposeActions.insertAdjacentElement("afterend", clientReplyEditorPanel);
  clientReplyEditorPanel.insertAdjacentElement("afterend", clientReplySuggestionsPanel);
  clientReplyEditor = document.getElementById("clientReplyEditor");
  clientReplyEditor.insertAdjacentHTML("beforebegin", '<p id="clientEditorContext" class="helper-text"></p>');
  clientReplyEditorMeta = document.getElementById("clientReplyEditorMeta");
  createReplyBtn.textContent = "Draft reply";
  clientReplyComposeActions.querySelector("[data-back]").classList.add("hidden");
  const inputDetails = document.createElement("details");
  inputDetails.id = "clientIntentDetails"; inputDetails.open = true;
  inputDetails.innerHTML = "<summary>Your rough response and reply preferences</summary>";
  clientReplyInputCard.insertAdjacentElement("beforebegin", inputDetails);
  inputDetails.append(clientReplyInputCard, clientReplyPreferences, clientReplyComposeActions);
  const clientDetails = document.createElement("details");
  clientDetails.id = "clientMessageDetails"; clientDetails.open = true;
  clientDetails.innerHTML = "<summary>Latest client message</summary>";
  clientReplyContextCard.insertAdjacentElement("beforebegin", clientDetails);
  clientDetails.append(clientReplyContextCard);
  document.getElementById("clientClarificationBtn").addEventListener("click", () => {
    persistWorkspace();
    const turn = currentTurn(); if (!turn.answer.trim()) return;
    const details = (turn.details || "") + "\n" + turn.question + "\nUser: " + turn.answer;
    if (details.length > 6000) { showNotice("Too much context", "Shorten the clarification details before continuing."); return; }
    turn.details = details; turn.answer = "";
    document.getElementById("clientContextNotes").value = details;
    generateClientReplySuggestions();
  });
  document.querySelectorAll("[data-client-tone]").forEach(button => button.addEventListener("click", () => {
    cancelWritingRequest(true); clientReplyTone = button.dataset.clientTone; updateClientReplyPreferenceUi(); persistWorkspace();
  }));
  document.querySelectorAll("[data-client-length]").forEach(button => button.addEventListener("click", () => {
    cancelWritingRequest(true); clientReplyLength = button.dataset.clientLength; updateClientReplyPreferenceUi(); persistWorkspace();
  }));
  document.getElementById("clientCopyReplyBtn").addEventListener("click", copyClientReplyEditor);
  document.querySelectorAll("[data-client-refine]").forEach(button => button.addEventListener("click", () => refineClientReply(button.dataset.clientRefine)));
  document.getElementById("clientRefineBtn").addEventListener("click", () => refineClientReply("custom"));
  document.getElementById("clientUndoBtn").addEventListener("click", () => {
    cancelWritingRequest(true); persistWorkspace(); Workspace.undo(currentTurn(), "draft"); hydrateThread(); persistWorkspace();
  });
  document.getElementById("clientNextMessageBtn").addEventListener("click", () => {
    cancelWritingRequest(true); persistWorkspace(); hideNotice();
    try { Workspace.nextTurn(workspaceState); hydrateThread(); persistWorkspace(); clientMessageInput.focus(); }
    catch (error) { showNotice("Conversation limit", error.message); }
  });
  document.getElementById("clientSentBtn").addEventListener("click", () => {
    persistWorkspace();
    const turn = currentTurn();
    if (!turn.draft.trim()) return;
    if (turn.status === "sent") { turn.status = turn.copiedText === turn.draft ? "copied" : "draft"; turn.sentText = ""; }
    else { turn.status = "sent"; turn.sentText = turn.draft; }
    hydrateThread(); persistWorkspace();
    showNotice(turn.status === "sent" ? "Marked as sent" : "Marked as unsent", "Conversation context now uses this status.");
  });
  document.getElementById("clientThreadSelect").addEventListener("change", event => {
    cancelWritingRequest(true); persistWorkspace(); workspaceState.activeThreadId = event.target.value; hydrateThread(); persistWorkspace();
  });
  document.getElementById("clientThreadName").addEventListener("input", event => {
    activeThread().name = event.target.value || "New conversation"; renderThreadSelect(); persistWorkspace();
  });
  document.getElementById("newClientThreadBtn").addEventListener("click", () => {
    cancelWritingRequest(true); persistWorkspace();
    try { Workspace.newThread(workspaceState); hydrateThread(); persistWorkspace(); clientMessageInput.focus(); }
    catch (error) { showNotice("Saved conversations", error.message); }
  });
  document.getElementById("deleteClientThreadBtn").addEventListener("click", () => {
    if (!window.confirm("Delete this conversation and its saved drafts from this device?")) return;
    cancelWritingRequest(true);
    workspaceState.threads = workspaceState.threads.filter(t => t.id !== workspaceState.activeThreadId);
    if (!workspaceState.threads.length) Workspace.newThread(workspaceState);
    workspaceState.activeThreadId = workspaceState.threads[0].id;
    hydrateThread(); persistWorkspace();
  });
}

function renderThreadSelect() {
  const select = document.getElementById("clientThreadSelect");
  select.replaceChildren();
  workspaceState.threads.forEach(thread => {
    const option = document.createElement("option"); option.value = thread.id; option.textContent = thread.name; select.append(option);
  });
  select.value = workspaceState.activeThreadId;
}

function hydrateThread() {
  const thread = activeThread(), turn = currentTurn();
  clientReplyTone = thread.tone;
  clientReplyLength = thread.length;
  clientMessageInput.value = turn.client;
  roughReply.value = turn.rough;
  clientReplyEditor.value = turn.draft;
  document.getElementById("clientEditorContext").textContent = "Replying to: " + turn.client.slice(0, 160);
  document.getElementById("clientSentBtn").textContent = turn.status === "sent" ? "Mark as unsent" : "Mark as sent";
  clientReplySuggestions = turn.suggestions || [];
  document.getElementById("clientFollowup").value = turn.followup || "";
  document.getElementById("clientClarificationAnswer").value = turn.answer || "";
  document.getElementById("clientContextNotes").value = turn.details || "";
  document.getElementById("clientThreadName").value = thread.name;
  if (turn.question) showClientReplyClarification({ question: turn.question });
  else hideClientReplyClarification();
  document.getElementById("clientIntentDetails").open = !turn.draft || Boolean(turn.question);
  document.getElementById("clientMessageDetails").open = !turn.draft;
  document.querySelector("#clientMessageDetails > summary").textContent = "Client: " + (turn.client.slice(0, 100) || "Add the next message");
  updateClientReplyPreferenceUi();
  renderThreadSelect();
  renderClientReplySuggestions();
  renderClientReplyContext();
  setClientReplyStage(turn.draft ? "editor" : "compose");
  clientReplyView.classList.toggle("has-draft", Boolean(turn.draft));
  requestAnimationFrame(() => {
    if (currentView !== "clientReply") return;
    if (turn.question) clientReplyClarificationCard.scrollIntoView({ block: "start" });
    else if (turn.draft) clientReplyEditorPanel.scrollIntoView({ block: "start" });
  });
}

function renderClientReplyContext() {
  const prior = activeThread().turns.slice(0, -1);
  conversationCount.textContent = prior.length + " PREVIOUS TURN" + (prior.length === 1 ? "" : "S") + " · RECENT CONTEXT USED";
  const list = clientReplyHistoryPanel.querySelector(".client-history-list");
  list.replaceChildren();
  prior.forEach(turn => {
    const row = document.createElement("article"); row.className = "client-history-row";
    const incoming = document.createElement("p"); incoming.textContent = "Client: " + turn.client;
    const reply = document.createElement("p");
    reply.textContent = (turn.status === "sent" ? "You (sent): " : "Your " + turn.status + " reply: ") + (turn.draft || "No draft");
    row.append(incoming, reply); list.append(row);
  });
  clientReplyHistoryPanel.classList.toggle("hidden", !prior.length);
  const turn = currentTurn();
  clientReplyEditorMeta.textContent = turn.status === "sent" ? "Confirmed sent" :
    turn.copiedText === turn.draft && turn.status === "copied" ? "Copied · not confirmed sent" : "Draft · not confirmed sent";
  document.getElementById("clientUndoBtn").disabled = !turn.versions.length;
}

function updateConversationCount() { if (clientReplyHistoryPanel) renderClientReplyContext(); }
function hideClientReplyClarification() { clientReplyClarificationCard?.classList.add("hidden"); }
function showClientReplyClarification({ question }) {
  clientReplyClarificationQuestion.textContent = question;
  clientReplyClarificationCard.classList.remove("hidden");
  document.getElementById("clientClarificationAnswer").focus();
}
function clientReplyLatestMessage() { return clientMessageInput.value.trim(); }
function setClientReplyStage(stage) {
  clientReplyStage = stage;
  clientReplyEditorPanel.classList.toggle("hidden", !currentTurn().draft);
  clientReplySuggestionsPanel.classList.toggle("hidden", !clientReplySuggestions.length);
}

function openClientReplyComposer(clientMessage = "") {
  persistWorkspace(); cancelWritingRequest(true);
  const value = String(clientMessage || "").trim(), turn = currentTurn();
  if (value && value !== turn.client) {
    if (turn.client || turn.draft || turn.rough) Workspace.nextTurn(workspaceState);
    currentTurn().client = value;
  }
  currentWritingMode = "client_reply";
  hydrateThread(); showView("clientReply"); persistWorkspace();
}

function clientReplyToneLabel() { return { professional: "Professional", friendly: "Friendly", firm: "Firm" }[clientReplyTone]; }
function clientReplyLengthLabel() { return { short: "Short", normal: "Normal", detailed: "Detailed" }[clientReplyLength]; }
function buildConversationContext() { return Workspace.context(workspaceState, 20000); }
function buildClientReplyAiContext() {
  return buildConversationContext() + "\n\nPREFERENCES:\nTone: " + clientReplyToneLabel() + "\nLength: " + clientReplyLengthLabel() +
    "\nUSER'S ROUGH INTENT:\n" + roughReply.value +
    "\nUSER CLARIFICATIONS:\n" + (currentTurn().details || "") +
    "\nPreserve facts, uncertainty, boundaries, and incomplete work. Copied drafts are not proof that a message was sent.";
}
function clientReplyVariationProfiles() {
  return [
    { label: clientReplyToneLabel(), directive: "Balanced, natural wording in the requested tone." },
    { label: "Warmer", directive: "Slightly warmer delivery with the same facts and boundaries." },
    { label: "More direct", directive: "More direct wording without increasing certainty or commitments." },
  ];
}
function renderClientReplySuggestions() {
  clientReplySuggestionsPanel.querySelector("summary").textContent = "View reply options (" + clientReplySuggestions.length + ")";
  clientReplySuggestionsList.replaceChildren();
  clientReplySuggestions.forEach((suggestion, index) => {
    const card = document.createElement("article"); card.className = "client-suggestion-card";
    const heading = document.createElement("strong"); heading.textContent = suggestion.label;
    const preview = document.createElement("p"); preview.textContent = suggestion.text;
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Use this reply";
    button.addEventListener("click", () => chooseClientReplySuggestion(index));
    card.append(heading, preview, button); clientReplySuggestionsList.append(card);
  });
}
async function generateClientReplySuggestions() {
  persistWorkspace();
  if (!clientReplyLatestMessage()) {
    showNotice("Add the client's message", "Paste or type it here to keep this conversation going.");
    clientMessageInput.focus(); return;
  }
  const turn = currentTurn(), profiles = clientReplyVariationProfiles();
  if (activeThread().name === "New conversation") activeThread().name = turn.client.slice(0, 48);
  const response = await requestWriting({
    text: roughReply.value.trim() || "Draft from the latest client message. Ask for a required missing fact or decision; never invent one.",
    context: buildClientReplyAiContext() + "\nTHREE VARIATIONS:\n" + profiles.map(p => p.label + ": " + p.directive).join("\n"),
    mode: "client_reply_options", explanationLanguage: currentSettings.understandExplanation,
  }, "Creating your reply and alternatives…", generateClientReplySuggestions);
  if (!response) return;
  const result = response.result || {};
  if (result.needsClarification) {
    turn.question = result.clarificationQuestion || "What important detail should the reply include?";
    showClientReplyClarification({ question: turn.question }); persistWorkspace(); return;
  }
  const replies = [...new Set((Array.isArray(result.replies) ? result.replies : []).filter(r => typeof r === "string" && r.trim()).map(r => r.trim()))];
  if (!replies.length) { showNotice("No reply returned", "Your notes are preserved. Try Draft reply again."); return; }
  turn.question = ""; turn.answer = "";
  hideClientReplyClarification();
  turn.suggestions = replies.slice(0, 3).map((text, index) => ({ label: profiles[index].label, text }));
  clientReplySuggestions = turn.suggestions;
  Workspace.setDraft(turn, "draft", replies[0]);
  turn.status = "draft";
  hydrateThread(); persistWorkspace();
}
function chooseClientReplySuggestion(index) {
  persistWorkspace(); cancelWritingRequest(true);
  const suggestion = clientReplySuggestions[index]; if (!suggestion) return;
  Workspace.setDraft(currentTurn(), "draft", suggestion.text); currentTurn().status = "draft";
  hydrateThread(); persistWorkspace(); clientReplyEditor.focus();
}
async function refineClientReply(kind) {
  persistWorkspace();
  const turn = currentTurn();
  if (!turn.draft.trim()) return;
  const directives = { grammar: "Correct grammar conservatively. Keep the wording and meaning close.", improve: "Improve clarity and flow while keeping the meaning, facts, boundaries, and uncertainty.", shorter: "Make this shorter while preserving all important facts and commitments.", custom: turn.followup };
  const refinement = directives[kind];
  if (!refinement?.trim()) { showNotice("Add an instruction", "Tell Clarity what you want to change."); return; }
  if (((turn.details || "") + refinement).length > 5900) {
    showNotice("Consolidate your context", "Shorten the Additional facts or corrections field, then refine again."); return;
  }
  const response = await requestWriting({
    text: turn.draft, context: buildClientReplyAiContext(), mode: kind === "grammar" ? "grammar" : "client_reply",
    operation: "refine", refinement, explanationLanguage: currentSettings.understandExplanation,
  }, "Refining your reply…", () => refineClientReply(kind));
  if (!response) return;
  if (response.result?.needsClarification) {
    turn.question = response.result.clarificationQuestion;
    showClientReplyClarification({ question: turn.question }); persistWorkspace(); return;
  }
  if (typeof response.result?.text === "string" && response.result.text.trim()) {
    Workspace.setDraft(turn, "draft", response.result.text.trim()); turn.status = "draft"; turn.followup = "";
    turn.details = (turn.details || "") + "\nUser revision: " + refinement;
    hydrateThread(); persistWorkspace();
  }
}
async function copyClientReplyEditor() {
  cancelWritingRequest(true);
  const value = clientReplyEditor.value.trim(); if (!value) return;
  persistWorkspace();
  const target = currentTurn();
  let success = false;
  try { success = await window.writingAssistant.copyResult(value); } catch {}
  if (!success) { showNotice("Could not copy", "Your draft is preserved. Try Copy reply again."); return; }
  Workspace.copied(target, value);
  if (target === currentTurn()) renderClientReplyContext();
  persistWorkspace();
  showNotice("Copied", "Your conversation stays open. Add the next client message when ready.");
}
async function createClientReply() { return generateClientReplySuggestions(); }

async function runMode(mode, importedText) {
  persistWorkspace(); cancelWritingRequest(true);
  const value = typeof importedText === "string" ? importedText.trim() : sourceText.value.trim();
  try {
    if (mode === "client_reply") { openClientReplyComposer(value); return; }
    if (mode === "express" || mode === "grammar") {
      openWritingDocument(mode, value || undefined);
      if (value && !activeDocument().text) await generateWriting();
      return;
    }
    if (!value) { showNotice("Add some text", "Select, paste, or type something to understand."); sourceText.focus(); return; }
    const response = await requestWriting({ text: value, mode: "understand", explanationLanguage: currentSettings.understandExplanation },
      "Making this easier to understand…", () => runMode(mode, value));
    if (response) {
      workspaceState.understanding = { source: value, result: response.result };
      renderUnderstandResult(response.result); persistWorkspace();
    }
  } catch (error) { showNotice("Could not open the workspace", error.message); }
}

function navigateWorkspace(name) {
  persistWorkspace(); cancelWritingRequest(true); hideNotice();
  try {
    if (name === "express") openWritingDocument("express");
    else if (name === "clientReply") { hydrateThread(); showView("clientReply"); persistWorkspace(); }
    else { showView("main"); persistWorkspace(); }
  } catch (error) { showNotice("Could not open the workspace", error.message); }
}

let pendingCapturedInput = null;
function handleAssistantOpened(payload) {
  setDrawer(false);
  currentSettings = { ...currentSettings, ...(payload?.settings || {}), shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(payload?.settings?.shortcuts || currentSettings.shortcuts) } };
  updateSettingsUi();
  if (payload?.phase === "capture") {
    if (payload.action) cancelWritingRequest(true);
    // Keep the saved workspace visible while Windows captures the new input.
    notifyAssistantFrameReady(payload.requestId);
    return;
  }
  const value = String(payload?.text || "").trim();
  if (payload?.action) {
    document.getElementById("captureImport").classList.add("hidden");
    if (value) runMode(payload.action, value);
    else showNotice("Could not capture selected text", "Your draft is preserved. Select text and try the shortcut again, or paste it here.");
    return;
  }
  if (value && currentView === "main" && !sourceText.value.trim()) {
    currentSource = payload.source === "clipboard" ? "clipboard" : "selected";
    sourceBuffers[currentSource] = value; sourceInitialized[currentSource] = true;
    updateSourceTabs(); loadCurrentSourceBuffer(); persistWorkspace();
  } else if (value && value !== sourceText.value.trim() && payload?.reason !== "startup") {
    pendingCapturedInput = value;
    document.getElementById("captureImport").classList.remove("hidden");
  }
}

function initializeWorkspaces() {
  currentSource = workspaceState.source;
  sourceBuffers = { ...workspaceState.buffers };
  sourceInitialized = { selected: true, clipboard: true };
  updateSourceTabs(); loadCurrentSourceBuffer(); hydrateThread();
  const desiredView = workspaceState.view;
  if (desiredView === "writingResult" && activeDocument()) renderWritingResult(activeDocument().mode, activeDocument());
  else if (desiredView === "clientReply") showView("clientReply");
  else if (desiredView === "understandResult" && workspaceState.understanding) renderUnderstandResult(workspaceState.understanding.result);
  else showView("main");
  workspaceReady = true;
  persistWorkspace();
  document.querySelectorAll("[data-workspace]").forEach(button => button.addEventListener("click", () => navigateWorkspace(button.dataset.workspace)));
  document.getElementById("cancelRequestBtn").addEventListener("click", () => cancelWritingRequest());
  document.getElementById("retryRequestBtn").addEventListener("click", () => lastRetry?.());
  document.getElementById("dismissCaptureBtn").addEventListener("click", () => {
    pendingCapturedInput = null; document.getElementById("captureImport").classList.add("hidden");
  });
  document.getElementById("useCaptureBtn").addEventListener("click", () => {
    const value = pendingCapturedInput; if (!value) return;
    pendingCapturedInput = null; document.getElementById("captureImport").classList.add("hidden");
    if (currentView === "clientReply") openClientReplyComposer(value);
    else if (currentView === "writingResult") runMode(activeDocument()?.mode || "express", value);
    else { sourceBuffers[currentSource] = value; loadCurrentSourceBuffer(); persistWorkspace(); }
  });
  document.getElementById("generateWritingBtn").addEventListener("click", () => generateWriting());
  document.getElementById("developWritingBtn").addEventListener("click", () => generateWriting("develop"));
  document.getElementById("refineWritingBtn").addEventListener("click", () => generateWriting("refine", document.getElementById("writingFollowup").value));
  document.querySelectorAll("[data-writing-refine]").forEach(button => button.addEventListener("click", () => generateWriting("refine", button.dataset.writingRefine)));
  document.getElementById("writingPurpose").addEventListener("change", event => {
    cancelWritingRequest(true); persistWorkspace(); activeDocument().purpose = event.target.value;
    renderWritingResult(activeDocument().mode, activeDocument()); persistWorkspace();
  });
  document.getElementById("writingDraftSelect").addEventListener("change", event => {
    cancelWritingRequest(true); persistWorkspace(); workspaceState.activeDocumentId = event.target.value;
    renderWritingResult(activeDocument().mode, activeDocument()); persistWorkspace();
  });
  document.getElementById("newWritingDraftBtn").addEventListener("click", () => {
    try { openWritingDocument(activeDocument()?.mode || "express", "", true); document.getElementById("writingOriginal").focus(); }
    catch (error) { showNotice("Saved drafts", error.message); }
  });
  document.getElementById("deleteWritingDraftBtn").addEventListener("click", () => {
    if (!window.confirm("Delete this saved writing draft from this device?")) return;
    cancelWritingRequest(true);
    workspaceState.documents = workspaceState.documents.filter(d => d.id !== workspaceState.activeDocumentId);
    if (!workspaceState.documents.length) Workspace.newDocument(workspaceState);
    workspaceState.activeDocumentId = workspaceState.documents[0].id;
    renderWritingResult(activeDocument().mode, activeDocument()); persistWorkspace();
  });
  document.getElementById("answerWritingBtn").addEventListener("click", () => {
    persistWorkspace();
    const doc = activeDocument(); if (!doc.answer.trim()) return;
    const details = (doc.details || "") + "\n" + doc.question + "\nUser: " + doc.answer;
    if (details.length > 6000) { showNotice("Too much context", "Shorten the clarification details before continuing."); return; }
    doc.details = details;
    document.getElementById("writingContextNotes").value = details;
    generateWriting();
  });
  document.getElementById("undoWritingBtn").addEventListener("click", () => {
    cancelWritingRequest(true); persistWorkspace(); Workspace.undo(activeDocument(), "text");
    renderWritingResult(activeDocument().mode, activeDocument()); persistWorkspace();
  });
  document.getElementById("clearSavedWorkspacesBtn").addEventListener("click", () => {
    if (!window.confirm("Clear all saved writing drafts and client conversations on this device?")) return;
    cancelWritingRequest(true); workspaceState = Workspace.empty();
    sourceBuffers = workspaceState.buffers; sourceText.value = ""; hydrateThread();
    showView("main"); setDrawer(false); persistWorkspace();
    showNotice("Saved work cleared", "You can start a new draft or conversation.");
  });
  document.addEventListener("input", event => {
    if (event.target.matches("textarea") && requestGate.current) cancelWritingRequest();
    persistWorkspace();
  });
  window.addEventListener("beforeunload", persistWorkspace);
  document.getElementById("expandBtn").addEventListener("click", () => window.writingAssistant.toggleMaximize());
}
