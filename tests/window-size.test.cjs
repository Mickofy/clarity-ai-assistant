const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_WINDOW_SIZE,
  clampWindowSize,
  createWindowSizeStore,
  normalizeWindowSize,
} = require("../src/window-size");

test("invalid saved sizes fall back to the standard window size", () => {
  assert.deepEqual(normalizeWindowSize({ width: "large", height: 700 }), DEFAULT_WINDOW_SIZE);
});

test("restores and persists the last normal window size", async () => {
  let saved = { width: 1120, height: 820 };
  const writes = [];
  const store = createWindowSizeStore({ read: () => saved, write: value => { writes.push(value); saved = value; }, delayMs: 10 });

  assert.deepEqual(store.load(), saved);
  store.set({ width: 1040, height: 800 });
  assert.deepEqual(store.get(), { width: 1040, height: 800 });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(saved, { width: 1040, height: 800 });
  assert.equal(writes.length, 1);
});

test("clamps the restored size to the current monitor work area", () => {
  assert.deepEqual(clampWindowSize({ width: 1200, height: 900 }, { width: 900, height: 650 }), { width: 860, height: 610 });
  assert.deepEqual(clampWindowSize({ width: 1200, height: 900 }, { width: 500, height: 400 }), { width: 460, height: 360 });
});

test("flushes the latest resize before shutdown", () => {
  const writes = [];
  const store = createWindowSizeStore({ write: value => writes.push(value), delayMs: 1000 });
  store.set({ width: 1000, height: 700 });
  store.flush();
  assert.deepEqual(writes, [{ width: 1000, height: 700 }]);
});
