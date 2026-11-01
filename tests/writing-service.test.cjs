const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createWritingService } = require("../src/writing-service");
const response = result => new Response(JSON.stringify({ ok: true, result }));
const options = { url: "https://writing.invalid/", token: "test-private-app-token" };

test("the desktop forwards writing purpose and revision context without returning its credential", async () => {
  let outbound;
  const service = createWritingService({ ...options, fetchImpl: async (url, init) => { outbound = { url, init }; return response({ text: "Plan only." }); } });
  const result = await service.run({ text: "plan first", mode: "express", purpose: "prompt", operation: "refine", refinement: "Preserve plan only", context: "Original notes" }, 1);
  assert.equal(outbound.url, "https://writing.invalid/improve");
  assert.equal(outbound.init.headers.Authorization, "Bearer " + options.token);
  assert.deepEqual(JSON.parse(outbound.init.body), { text: "plan first", mode: "express", purpose: "prompt", operation: "refine", refinement: "Preserve plan only", context: "Original notes", explanationLanguage: "simple_english" });
  assert.equal(result.ok, true);
  assert.ok(!JSON.stringify(result).includes(options.token));
});

test("cancellation belongs to the originating renderer and actually aborts fetch", async () => {
  let signal;
  const service = createWritingService({ ...options, fetchImpl: async (_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  } });
  const pending = service.run({ text: "draft", requestId: "request-one" }, 10);
  assert.equal(service.cancel("request-one", 20), false);
  assert.equal(signal.aborted, false);
  assert.equal(service.cancel("request-one", 10), true);
  assert.equal((await pending).cancelled, true);
  assert.equal(service.cancel("request-one", 10), false);
});

test("a newer renderer request supersedes its own previous request", async () => {
  let calls = 0;
  const service = createWritingService({ ...options, fetchImpl: async (_url, init) => {
    if (++calls === 2) return response({ text: "New draft" });
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  } });
  const old = service.run({ text: "old", requestId: "old" }, 10);
  const fresh = await service.run({ text: "new", requestId: "new" }, 10);
  assert.equal((await old).cancelled, true);
  assert.equal(fresh.result.text, "New draft");
});

test("timeouts and invalid service responses preserve useful errors", async () => {
  const service = createWritingService({ ...options, timeoutMs: 10, fetchImpl: async (_url, init) => new Promise((_r, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout")))) });
  assert.match((await service.run({ text: "notes" }, 1)).error, /too long/);
  const malformed = createWritingService({ ...options, fetchImpl: async () => new Response("not JSON") });
  assert.match((await malformed.run({ text: "notes" }, 1)).error, /invalid response/);
});

test("large inputs and context are rejected before network access", async () => {
  let requests = 0;
  const service = createWritingService({ ...options, fetchImpl: async () => { requests++; return response({ text: "" }); } });
  assert.equal((await service.run({ text: "x".repeat(12001) }, 1)).ok, false);
  assert.equal((await service.run({ text: "x", context: "x".repeat(40001) }, 1)).ok, false);
  assert.equal((await service.run({ text: "x", refinement: "x".repeat(2001) }, 1)).ok, false);
  assert.equal(requests, 0);
});
