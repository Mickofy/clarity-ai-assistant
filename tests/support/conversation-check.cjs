const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

app.disableHardwareAcceleration();
let window;
let copies = [];
let requests = [];
let hides = 0;
let failCopy = false;
let rejectRequest = false;
let deferred = null;

ipcMain.handle("test-copy", (_event, text) => {
  if (failCopy) return false;
  copies.push(text);
  return true;
});
ipcMain.handle("test-hide", () => { hides += 1; return true; });
ipcMain.handle("test-paste", () => ({ ok: true }));
ipcMain.handle("test-improve", async (_event, payload) => {
  requests.push(payload);
  if (rejectRequest) throw new Error("offline");
  if (deferred) return new Promise((resolve) => { deferred.resolve = resolve; });
  return payload.mode === "client_reply_options"
    ? { ok: true, result: { needsClarification: false, replies: ["I'll review it.", "Let me take a look.", "I'll check it."] } }
    : { ok: true, result: { text: "I will check it." } };
});

const evaluate = (code) => window.webContents.executeJavaScript(code);
async function until(code) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${code}`);
}
async function click(id) {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
}
async function type(id, value) {
  await evaluate(`(() => {
    const field = document.getElementById(${JSON.stringify(id)});
    field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
async function screenshot(name) {
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const folder = path.join(os.tmpdir(), "clarity-conversation-check");
  await fs.mkdir(folder, { recursive: true });
  const capture = await window.webContents.capturePage();
  const file = path.join(folder, `${name}.png`);
  await fs.writeFile(file, capture.toPNG());
  console.log(`SCREENSHOT ${file}`);
}

app.whenReady().then(async () => {
  window = new BrowserWindow({
    width: 860, height: 760, show: false, frame: false,
    webPreferences: {
      preload: path.join(__dirname, "conversation-preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  });
  const errors = [];
  window.webContents.on("console-message", (_event, level, message) => {
    if (level === 3 && !message.includes("test-improve")) errors.push(message);
  });
  await window.loadFile(path.join(__dirname, "../../src/renderer/index.html"));
  await until("document.getElementById('clientNextMessageBtn') !== null");
  // Next Message saves the current turn even when Copy was never clicked.
  await type("sourceText", "Can you check the invoice?");
  await evaluate("document.querySelector('[data-action=client_reply]').click()");
  await type("roughReply", "will check the invoice");
  await click("createReplyBtn");
  await until("clientReplyStage === 'suggestions' && currentView === 'clientReply'");
  await evaluate("document.querySelector('.client-suggestion-list button').click()");
  await type("clientReplyEditor", "I'll check the invoice today.");
  await click("clientNextMessageBtn");
  assert.equal(await evaluate("conversationHistory.length"), 2, "Next Message must save the uncopied turn");
  assert.deepEqual(await evaluate("conversationHistory.map(entry => entry.text)"), [
    "Can you check the invoice?", "I'll check the invoice today.",
  ]);
  assert.equal(copies.length, 0, "Next Message must not change the clipboard");
  await click("clearConversationBtn");
  await evaluate("showView('main')");
  await type("sourceText", "Can you review the design?");
  await evaluate("document.querySelector('[data-action=client_reply]').click()");
  assert.equal(await evaluate("document.getElementById('clientContext').value"), "Can you review the design?");
  await screenshot("compose");
  await type("roughReply", "i will check it");
  await click("createReplyBtn");
  await until("!document.querySelector('.client-suggestions-stage').classList.contains('hidden')");
  await evaluate("document.querySelector('.client-suggestion-list button').click()");
  await type("clientReplyEditor", "I'll review it this afternoon.");
  failCopy = true;
  await click("clientCopyReplyBtn");
  await until("!document.getElementById('clientCopyReplyBtn').disabled");
  assert.equal(await evaluate("conversationHistory.length"), 0, "failed copy must not record a turn");
  assert.equal(await evaluate("clientReplyEditor.value"), "I'll review it this afternoon.");
  failCopy = false;
  await click("clientCopyReplyBtn");
  await until("conversationHistory.length === 2");
  await click("clientCopyReplyBtn");
  await until("!document.getElementById('clientCopyReplyBtn').disabled");
  assert.equal(await evaluate("conversationHistory.length"), 2, "repeated copies must not duplicate turns");
  assert.equal(hides, 0);
  assert.equal(await evaluate("currentView"), "clientReply");
  assert.equal(await evaluate("clientReplyStage"), "editor");
  await screenshot("editor");
  await type("clientReplyEditor", "I'll review the desktop design this afternoon.");
  await click("clientNextMessageBtn");
  await until("document.activeElement.id === 'clientContext'");
  assert.equal(await evaluate("conversationHistory.length"), 2, "Next Message must not duplicate a copied turn");
  assert.equal(await evaluate("conversationHistory.at(-1).text"), "I'll review the desktop design this afternoon.", "save edits made after copying");
  assert.equal(await evaluate("clientContext.value"), "", "next message must not reuse the old source");
  assert.equal(await evaluate("roughReply.value"), "");
  await type("clientContext", "Could you check the mobile version too?");
  await type("roughReply", "yes mobile too");
  await click("createReplyBtn");
  await until("clientReplyStage === 'suggestions' && currentView === 'clientReply'");
  assert.match(requests.at(-1).context, /Can you review the design\?/);
  assert.match(requests.at(-1).context, /I'll review the desktop design this afternoon\./);
  assert.match(requests.at(-1).context, /LATEST CLIENT MESSAGE:\nCould you check the mobile version too\?/);
  await evaluate("document.querySelector('.client-suggestion-list button').click()");
  await evaluate("document.querySelector('[data-client-refine=grammar]').click()");
  await until("currentView === 'clientReply' && clientReplyEditor.value === 'I will check it.'");
  assert.equal(requests.at(-1).mode, "grammar");
  // A cancelled request must not replace the screen after navigation.
  deferred = {};
  await evaluate("document.querySelector('[data-client-refine=improve]').click()");
  await until("currentView === 'loading'");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
  deferred.resolve({ ok: true, result: { text: "Late result" } });
  deferred = null;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(await evaluate("currentView"), "clientReply");
  assert.equal(await evaluate("clientReplyEditor.value"), "I will check it.");
  // Rejected IPC must leave an editable draft and a useful error.
  rejectRequest = true;
  await evaluate("document.querySelector('[data-client-refine=improve]').click()");
  await until("currentView === 'clientReply' && !notice.classList.contains('hidden')");
  assert.equal(await evaluate("clientReplyEditor.value"), "I will check it.");
  rejectRequest = false;
  await click("clientNextMessageBtn");
  assert.equal(await evaluate("conversationHistory.length"), 4, "uncopied follow-up must preserve both turns");
  assert.equal(await evaluate("conversationHistory.at(-1).text"), "I will check it.");
  await click("clearConversationBtn");
  assert.equal(await evaluate("conversationHistory.length"), 0);
  // Recent history is bounded without truncating the latest client message.
  const contextLength = await evaluate(`(() => {
    conversationHistory = Array.from({length:8}, (_, i) => ({role:i%2?'user':'client', text:'x'.repeat(12000)}));
    clientContext.value = 'latest '.repeat(1700);
    return buildClientReplyOptionsAiContext(clientReplyVariationProfiles()).length;
  })()`);
  assert.ok(contextLength <= 20000, `context length ${contextLength}`);
  // Copy and Replace in Grammar/Express keep the result on screen.
  await evaluate("showView('main')");
  await type("sourceText", "i will check it");
  await evaluate("document.querySelector('[data-action=grammar]').click()");
  await until("currentView === 'writingResult'");
  await click("copySuggestionBtn");
  await until("!copySuggestionBtn.disabled");
  await click("replaceSuggestionBtn");
  await until("!replaceSuggestionBtn.disabled");
  assert.equal(await evaluate("currentView"), "writingResult");
  assert.equal(await evaluate("suggestionText.value"), "I will check it.");
  assert.equal(hides, 0);
  assert.equal(copies.length, 3);
  assert.deepEqual(errors, []);
  console.log("CONVERSATION_CHECK_OK");
  app.exit(0);
}).catch((error) => {
  console.error(error.stack);
  app.exit(1);
});
