const assert = require("node:assert/strict");
const test = require("node:test");
const { spawn } = require("node:child_process");
const path = require("node:path");

test("Electron conversation and writing flows", { timeout: 45000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // Only synthetic CI checks use --no-sandbox on Linux runners that lack the
  // Chromium SUID sandbox helper. Production Electron app settings are unchanged.
  const testEntry = path.join(__dirname, "support/conversation-check.cjs");
  const args = process.env.CI === "true" && process.platform === "linux"
    ? ["--no-sandbox", testEntry]
    : [testEntry];
  const child = spawn(require("electron"), args, {
    env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const timeout = setTimeout(() => child.kill(), 40000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(code, 0, output);
    assert.match(output, /CONVERSATION_CHECK_OK/);
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
});
