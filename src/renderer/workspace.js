(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ClarityWorkspace = api;
})(globalThis, function () {
  "use strict";
  const KEY = "clarity.workspaces.v1";
  const text = (value, max = 12000) => typeof value === "string" ? value.slice(0, max) : "";
  const id = () => globalThis.crypto.randomUUID();
  const versions = (value) => Array.isArray(value) ? value.filter(v => typeof v === "string").slice(-20).map(v => text(v)) : [];
  function turn() {
    return { id: id(), client: "", rough: "", draft: "", status: "draft", copiedText: "", sentText: "", question: "", answer: "", details: "", followup: "", suggestions: [], versions: [] };
  }
  function thread(name = "New conversation") {
    return { id: id(), name: text(name, 80), tone: "professional", length: "normal", turns: [turn()] };
  }
  function document(mode = "express", original = "") {
    return { id: id(), mode, purpose: "message", original: text(original), text: "", intent: "", question: "", answer: "", details: "", followup: "", operation: "rewrite", versions: [] };
  }
  function empty() {
    const first = thread();
    return { version: 1, view: "main", source: "selected", buffers: { selected: "", clipboard: "" }, documents: [], activeDocumentId: "", lastDocumentIds: {}, threads: [first], activeThreadId: first.id, understanding: null };
  }
  function restore(raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!parsed || parsed.version !== 1) return empty();
      const state = empty();
      state.view = ["main", "writingResult", "clientReply", "understandResult"].includes(parsed.view) ? parsed.view : "main";
      state.source = parsed.source === "clipboard" ? "clipboard" : "selected";
      state.buffers = { selected: text(parsed.buffers?.selected), clipboard: text(parsed.buffers?.clipboard) };
      state.documents = (Array.isArray(parsed.documents) ? parsed.documents : []).slice(0, 50).map(d => ({
        ...document(d?.mode === "grammar" ? "grammar" : "express"),
        id: text(d?.id, 80) || id(), purpose: d?.purpose === "prompt" ? "prompt" : "message",
        original: text(d?.original), text: text(d?.text), intent: text(d?.intent, 2000),
        question: text(d?.question, 2000), answer: text(d?.answer, 2000), details: text(d?.details, 6000),
        followup: text(d?.followup, 2000), operation: d?.operation === "develop" ? "develop" : "rewrite", versions: versions(d?.versions),
      }));
      state.activeDocumentId = state.documents.some(d => d.id === parsed.activeDocumentId) ? parsed.activeDocumentId : state.documents[0]?.id || "";
      for (const mode of ["express", "grammar"]) {
        state.lastDocumentIds[mode] = state.documents.find(d => d.mode === mode && d.id === parsed.lastDocumentIds?.[mode])?.id ||
          state.documents.filter(d => d.mode === mode).at(-1)?.id || "";
      }
      state.threads = (Array.isArray(parsed.threads) ? parsed.threads : []).slice(0, 50).map(t => ({
        id: text(t?.id, 80) || id(), name: text(t?.name, 80) || "New conversation",
        tone: ["professional", "friendly", "firm"].includes(t?.tone) ? t.tone : "professional",
        length: ["short", "normal", "detailed"].includes(t?.length) ? t.length : "normal",
        turns: (Array.isArray(t?.turns) ? t.turns : []).slice(0, 100).map(v => ({
          ...turn(), id: text(v?.id, 80) || id(), client: text(v?.client), rough: text(v?.rough), draft: text(v?.draft),
          status: ["copied", "sent"].includes(v?.status) ? v.status : "draft", copiedText: text(v?.copiedText), sentText: text(v?.sentText),
          question: text(v?.question, 2000), answer: text(v?.answer, 2000), details: text(v?.details, 6000),
          followup: text(v?.followup, 2000), versions: versions(v?.versions),
          suggestions: (Array.isArray(v?.suggestions) ? v.suggestions : []).filter(s => typeof s?.text === "string").slice(0, 3).map(s => ({ label: text(s.label, 80), text: text(s.text) })),
        })),
      }));
      if (!state.threads.length) state.threads = [thread()];
      state.threads.forEach(t => { if (!t.turns.length) t.turns = [turn()]; });
      state.activeThreadId = state.threads.some(t => t.id === parsed.activeThreadId) ? parsed.activeThreadId : state.threads[0].id;
      if (parsed.understanding && typeof parsed.understanding === "object") {
        state.understanding = {
          source: text(parsed.understanding.source),
          result: {
            simpleMeaning: text(parsed.understanding.result?.simpleMeaning),
            whatTheyWant: text(parsed.understanding.result?.whatTheyWant),
            ambiguityNote: text(parsed.understanding.result?.ambiguityNote),
            unfamiliarTerms: (Array.isArray(parsed.understanding.result?.unfamiliarTerms) ? parsed.understanding.result.unfamiliarTerms : []).slice(0, 4).map(t => ({ term: text(t?.term, 200), meaning: text(t?.meaning, 2000) })),
          },
        };
      }
      return state;
    } catch { return empty(); }
  }
  function activeThread(state) { return state.threads.find(t => t.id === state.activeThreadId) || state.threads[0]; }
  function currentTurn(state) { return activeThread(state).turns.at(-1); }
  function activeDocument(state) { return state.documents.find(d => d.id === state.activeDocumentId); }
  function newThread(state, name) {
    if (state.threads.length >= 50) throw new Error("You have 50 saved conversations. Delete one before starting another.");
    const value = thread(name);
    state.threads.push(value); state.activeThreadId = value.id; return value;
  }
  function newDocument(state, mode, original) {
    if (state.documents.length >= 50) throw new Error("You have 50 saved drafts. Delete one before starting another.");
    const value = document(mode, original);
    state.documents.push(value); state.activeDocumentId = value.id; return value;
  }
  function nextTurn(state) {
    const t = activeThread(state);
    if (t.turns.length >= 100) throw new Error("This conversation has 100 turns. Start a new conversation to continue.");
    if (!currentTurn(state).client && !currentTurn(state).draft) return currentTurn(state);
    const value = turn(); t.turns.push(value); return value;
  }
  function setDraft(target, field, value) {
    if (target[field] !== value) {
      target.versions = [...(target.versions || []), target[field] || ""].slice(-20);
      target[field] = value;
    }
  }
  function undo(target, field) {
    if (!target.versions?.length) return false;
    target[field] = target.versions.pop(); return true;
  }
  function copied(target, value) {
    target.draft = value; target.copiedText = value;
    // Copying is not evidence that a message was sent to the client.
    target.status = target.sentText === value ? "sent" : "copied";
  }
  function context(state, limit = 16000) {
    const t = activeThread(state), latest = currentTurn(state);
    const last = "LATEST CLIENT MESSAGE:\n" + latest.client;
    const history = [];
    let used = last.length + 140, omitted = false;
    for (const item of t.turns.slice(0, -1).reverse()) {
      const block = "Client: " + item.client + "\n" +
        (item.rough ? "User's own notes: " + item.rough + "\n" : "") +
        (item.details ? "User's additional facts or corrections: " + item.details + "\n" : "") +
        (item.draft ? (item.status === "sent" ? "You (confirmed sent): " : "Your " + item.status + " reply (not confirmed sent): ") + item.draft : "");
      if (used + block.length > limit) { omitted = true; break; }
      history.unshift(block); used += block.length + 2;
    }
    return [
      omitted ? "Some older messages were omitted for length. Ask if a missing fact is necessary." : "",
      history.length ? "RECENT CONVERSATION:\n" + history.join("\n\n") : "",
      last,
    ].filter(Boolean).join("\n\n");
  }
  // A stale or cancelled completion can never update a newer workspace.
  class RequestGate {
    constructor(cancel = () => {}) { this.cancelRemote = cancel; this.current = null; }
    begin() { this.cancel(); this.current = id(); return this.current; }
    accepts(requestId) { return this.current === requestId; }
    finish(requestId) { if (this.accepts(requestId)) this.current = null; }
    cancel() { if (this.current) { const old = this.current; this.current = null; this.cancelRemote(old); } }
  }
  return { KEY, empty, restore, activeThread, currentTurn, activeDocument, newThread, newDocument, nextTurn, setDraft, undo, copied, context, RequestGate };
});
