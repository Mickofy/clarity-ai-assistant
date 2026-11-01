const { test } = require("node:test");
const assert = require("node:assert/strict");
const { registerShortcutSet } = require("../src/shortcut-registry");

function mockRegistry(failOn = null) {
  const calls = [];
  return {
    calls,
    api: {
      unregisterAll: () => calls.push(["unregisterAll"]),
      register: accelerator => {
        calls.push(["register", accelerator]);
        return accelerator !== failOn;
      },
    },
  };
}

function entries() {
  return ["Q", "W", "E", "R", "T"].map((key, index) => ["Shortcut " + index, "Ctrl+Alt+" + key, () => {}]);
}

test("registers each configured shortcut", () => {
  const registry = mockRegistry();
  assert.deepEqual(registerShortcutSet(registry.api, entries()), { ok: true });
  assert.equal(registry.calls.filter(([name]) => name === "register").length, 5);
});

test("reports a conflict and removes partial registrations", () => {
  const registry = mockRegistry("Ctrl+Alt+E");
  const result = registerShortcutSet(registry.api, entries());
  assert.equal(result.ok, false);
  assert.match(result.error, /Shortcut 2/);
  assert.deepEqual(registry.calls.at(-1), ["unregisterAll"]);
});

test("rejects duplicate shortcuts before attempting registration", () => {
  const registry = mockRegistry();
  const duplicate = entries();
  duplicate[1][1] = duplicate[0][1];
  const result = registerShortcutSet(registry.api, duplicate);
  assert.equal(result.ok, false);
  assert.match(result.error, /different key combinations/);
  assert.equal(registry.calls.some(([name]) => name === "register"), false);
});
