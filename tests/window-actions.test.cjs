const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pasteAndResume } = require("../src/window-actions");
test("paste returns the preserved window without taking focus from the destination", async () => {
  const calls = [];
  const window = { isDestroyed: () => false, setOpacity: n => calls.push(["opacity", n]), showInactive: () => calls.push(["showInactive"]) };
  const result = await pasteAndResume("draft", { replace: async text => { calls.push(["replace", text]); return { ok: true }; }, getWindow: () => window, getGeneration: () => 1, wait: async ms => calls.push(["wait", ms]) });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [["replace", "draft"], ["wait", 750], ["opacity", 1], ["showInactive"]]);
});
test("a user hide or newer shortcut during paste prevents an obsolete window from returning", async () => {
  let generation = 1, shown = false;
  const window = { isDestroyed: () => false, setOpacity: () => {}, showInactive: () => { shown = true; } };
  await pasteAndResume("draft", { replace: async () => ({ ok: true }), getWindow: () => window, getGeneration: () => generation, wait: async () => { generation++; } });
  assert.equal(shown, false);
});
test("paste failure restores access to the draft and keeps the native error", async () => {
  let shown = false;
  const window = { isDestroyed: () => false, setOpacity: () => {}, showInactive: () => { shown = true; } };
  const result = await pasteAndResume("draft", { replace: async () => ({ ok: false, error: "No source window" }), getWindow: () => window, getGeneration: () => 1, wait: async () => assert.fail("A failed paste needs no clipboard wait") });
  assert.equal(shown, true);
  assert.equal(result.error, "No source window");
});
test("an unexpected paste exception also restores access to the draft", async () => {
  let shown = false;
  const window = { isDestroyed: () => false, setOpacity: () => {}, showInactive: () => { shown = true; } };
  const result = await pasteAndResume("draft", { replace: async () => { throw Error("native helper stopped"); }, getWindow: () => window, getGeneration: () => 1, wait: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(shown, true);
  assert.match(result.error, /draft is preserved/);
});
