const { test } = require("node:test");
const assert = require("node:assert/strict");
const W = require("../src/renderer/workspace");

test("saved drafts and separate conversations survive window recreation", () => {
  const state = W.empty();
  const doc = W.newDocument(state, "express", "inspect muna, no changes");
  doc.purpose = "prompt"; doc.text = "Inspect first. Do not change files."; doc.details = "Plan only.";
  const first = W.activeThread(state);
  W.currentTurn(state).client = "Are you available?";
  W.currentTurn(state).rough = "Monday only";
  W.copied(W.currentTurn(state), "I'm available Monday.");
  W.newThread(state, "Another client");
  W.currentTurn(state).client = "Different project";
  const restored = W.restore(JSON.stringify(state));
  assert.equal(W.activeDocument(restored).purpose, "prompt");
  assert.equal(W.activeDocument(restored).details, "Plan only.");
  assert.equal(W.activeThread(restored).name, "Another client");
  assert.ok(!W.context(restored).includes("Monday"));
  restored.activeThreadId = first.id;
  assert.equal(W.currentTurn(restored).draft, "I'm available Monday.");
});

test("copying twice updates one turn and never claims a message was sent", () => {
  const state = W.empty(), turn = W.currentTurn(state);
  turn.client = "Status?";
  turn.rough = "Only the checkout script has been checked.";
  W.copied(turn, "Still investigating.");
  W.copied(turn, "Still investigating.");
  assert.equal(W.activeThread(state).turns.length, 1);
  assert.equal(turn.status, "copied");
  W.nextTurn(state).client = "Any update?";
  assert.match(W.context(state), /not confirmed sent/);
  assert.match(W.context(state), /Still investigating/);
  assert.match(W.context(state), /User's own notes: Only the checkout script/);
  assert.equal(W.activeThread(state).turns.length, 2);
});

test("a revised sent message becomes a copied draft until explicitly confirmed again", () => {
  const state = W.empty(), turn = W.currentTurn(state);
  turn.draft = "Original"; turn.sentText = "Original"; turn.status = "sent";
  W.copied(turn, "Revised");
  assert.equal(turn.status, "copied");
});

test("undo restores manual edits that existed before an AI revision", () => {
  const doc = W.newDocument(W.empty());
  doc.text = "My manual version";
  W.setDraft(doc, "text", "AI revision");
  assert.equal(W.undo(doc, "text"), true);
  assert.equal(doc.text, "My manual version");
  assert.equal(W.undo(doc, "text"), false);
});

test("context respects the budget, includes the whole latest message, and labels omitted history", () => {
  const state = W.empty();
  for (let i = 0; i < 8; i++) {
    W.currentTurn(state).client = "Client " + i + " " + "x".repeat(1500);
    W.copied(W.currentTurn(state), "Draft " + i + " " + "y".repeat(1500));
    W.nextTurn(state);
  }
  const latest = "LATEST UNIQUE MESSAGE " + "z".repeat(12000 - 22);
  W.currentTurn(state).client = latest;
  const context = W.context(state, 16000);
  assert.ok(context.length <= 16000);
  assert.ok(context.endsWith(latest));
  assert.match(context, /older messages were omitted/);
});

test("corrupt or unsupported storage restores a usable empty workspace", () => {
  for (const raw of ["not JSON", '{"version":200}', '{"version":1,"threads":[null],"documents":[null]}']) {
    const state = W.restore(raw);
    assert.ok(W.activeThread(state));
    assert.ok(W.currentTurn(state));
  }
});

test("cancelled and older completions cannot update a newer request", () => {
  const cancelled = [], gate = new W.RequestGate(id => cancelled.push(id));
  const first = gate.begin(), next = gate.begin();
  assert.deepEqual(cancelled, [first]);
  assert.equal(gate.accepts(first), false);
  assert.equal(gate.accepts(next), true);
  gate.cancel();
  assert.equal(gate.accepts(next), false);
  assert.deepEqual(cancelled, [first, next]);
});
