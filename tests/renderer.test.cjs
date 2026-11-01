const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
test("desktop renderer workflows run in an isolated Electron profile with mocked IPC", { timeout: 60000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "clarity-ui-test-"));
  let result;
  try {
    result = await new Promise(resolve => execFile(require("electron"), [path.resolve("scripts/renderer-harness.cjs"), profile], { env, timeout: 55000, windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  } finally {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("clarity-ui-test-")) {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  assert.equal(result.error, null, result.stdout + "\n" + result.stderr);
  assert.match(result.stdout, /RENDERER_WORKFLOWS_PASSED/);
});
