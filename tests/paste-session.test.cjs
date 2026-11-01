const assert = require("node:assert/strict");
const test = require("node:test");
const { createPasteSession } = require("../src/paste-session");

function setup(paste = async () => ({ ok: true })) {
  const calls = [];
  let requestId = 1;
  const window = {
    isDestroyed: () => false,
    setOpacity: (value) => calls.push(["opacity", value]),
    showInactive: () => calls.push(["showInactive"]),
  };
  return {
    calls,
    setRequestId: (id) => { requestId = id; },
    run: createPasteSession({
      getWindow: () => window,
      getOpenRequestId: () => requestId,
      paste,
      delay: async (ms) => calls.push(["delay", ms]),
    }),
  };
}

test("paste restores the window without taking focus, after the source has consumed paste", async () => {
  const session = setup();
  assert.deepEqual(await session.run("Hello"), { ok: true });
  assert.deepEqual(session.calls, [["delay", 800], ["opacity", 1], ["showInactive"]]);
});

test("paste failures restore the window and report an error", async () => {
  const session = setup(async () => { throw new Error("helper unavailable"); });
  assert.equal((await session.run("Hello")).ok, false);
  assert.deepEqual(session.calls, [["opacity", 1], ["showInactive"]]);
});

test("Close or a newer shortcut prevents an older paste from reopening Clarity", async () => {
  const session = setup(async () => {
    session.setRequestId(2);
    return { ok: true };
  });
  await session.run("Hello");
  assert.deepEqual(session.calls, [["delay", 800]]);
});

test("overlapping requests cannot paste twice", async () => {
  let finish;
  const session = setup(() => new Promise((resolve) => { finish = resolve; }));
  const first = session.run("First");
  assert.equal((await session.run("Second")).ok, false);
  finish({ ok: true });
  assert.equal((await first).ok, true);
});
