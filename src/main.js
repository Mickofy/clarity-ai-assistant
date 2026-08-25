const {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  ipcMain,
  screen,
} = require("electron");

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let lastExternalWindowHandle = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

const WRITING_API_URL = (process.env.WRITING_API_URL || "").replace(/\/+$/, "");
const WRITING_APP_TOKEN = process.env.WRITING_APP_TOKEN || "";

const WINDOW_WIDTH = 860;
const WINDOW_HEIGHT = 760;

const DEFAULT_SETTINGS = {
  shortcuts: {
    openAssistant: "CommandOrControl+Alt+F",
    quickGrammar: "CommandOrControl+Alt+R",
    quickUnderstand: "CommandOrControl+Alt+U",
  },
  defaultInputSource: "selected",
  understandExplanation: "simple_english",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));

    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      shortcuts: {
        ...DEFAULT_SETTINGS.shortcuts,
        ...(saved?.shortcuts || {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettingsFile(value) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(value, null, 2), "utf8");
}

let settings = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxHeight: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    movable: true,
    alwaysOnTop: true,
    backgroundColor: "#0d0d0d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("blur", () => {
    setTimeout(async () => {
      const foreground = await getForegroundWindowHandle();
      const self = getNativeWindowHandle();

      if (foreground && foreground !== self) {
        lastExternalWindowHandle = foreground;
      }
    }, 120);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getNativeWindowHandle() {
  try {
    const buffer = mainWindow?.getNativeWindowHandle();
    if (!buffer) return null;

    if (buffer.length >= 8) {
      return Number(buffer.readBigUInt64LE(0));
    }

    return buffer.readUInt32LE(0);
  } catch {
    return null;
  }
}

function placeWindow() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  const margin = 20;

  let x = Math.round(area.x + (area.width - WINDOW_WIDTH) / 2);
  let y = Math.round(area.y + (area.height - WINDOW_HEIGHT) / 2);

  if (WINDOW_WIDTH > area.width - margin * 2) {
    x = area.x + margin;
  }

  if (WINDOW_HEIGHT > area.height - margin * 2) {
    y = area.y + margin;
  }

  mainWindow.setPosition(x, y, false);
}

function runPowerShell(script, timeout = 3000) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Sta",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        script,
      ],
      { windowsHide: true, timeout },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(String(stdout || "").trim());
      },
    );
  });
}

async function getForegroundWindowHandle() {
  if (process.platform !== "win32") return null;

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindowReader {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@;
[ForegroundWindowReader]::GetForegroundWindow().ToInt64()
`;

  try {
    const output = await runPowerShell(script);
    const hwnd = Number(output);
    return Number.isFinite(hwnd) && hwnd > 0 ? hwnd : null;
  } catch {
    return null;
  }
}

async function readClipboardText() {
  try {
    const result = clipboard.readText();
    const resolved = await Promise.resolve(result);

    if (typeof resolved === "string") {
      return resolved;
    }

    if (resolved && typeof resolved.text === "function") {
      const text = await resolved.text();
      return typeof text === "string" ? text : "";
    }

    return "";
  } catch (error) {
    console.warn("Could not read clipboard text:", error);
    return "";
  }
}

async function writeClipboardText(value) {
  try {
    const result = clipboard.writeText(String(value ?? ""));
    await Promise.resolve(result);
    return true;
  } catch (error) {
    console.warn("Could not write clipboard text:", error);
    return false;
  }
}

async function sendKeysToWindow(targetHwnd, keys) {
  if (process.platform !== "win32" || !targetHwnd) return false;

  const safeKeys = String(keys).replace(/'/g, "''");

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WindowActivator {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@;
Add-Type -AssemblyName System.Windows.Forms;
[WindowActivator]::SetForegroundWindow([IntPtr]${targetHwnd}) | Out-Null;
Start-Sleep -Milliseconds 110;
[System.Windows.Forms.SendKeys]::SendWait('${safeKeys}');
`;

  try {
    await runPowerShell(script, 3500);
    return true;
  } catch {
    return false;
  }
}

async function readSelectedTextViaUIAutomation(targetHwnd) {
  if (process.platform !== "win32" || !targetHwnd) {
    return { ok: false, text: "", reason: "uia-unavailable" };
  }

  const script = `
Add-Type -AssemblyName UIAutomationClient;
Add-Type -AssemblyName UIAutomationTypes;

$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]${targetHwnd});

if ($null -eq $root) {
  exit
}

$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::IsTextPatternAvailableProperty,
  $true
);

$elements = $root.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  $condition
);

foreach ($element in $elements) {
  try {
    $patternObject = $null;

    if (
      $element.TryGetCurrentPattern(
        [System.Windows.Automation.TextPattern]::Pattern,
        [ref]$patternObject
      )
    ) {
      $ranges = ([System.Windows.Automation.TextPattern]$patternObject).GetSelection();

      foreach ($range in $ranges) {
        $value = $range.GetText(-1);

        if ($value -and $value.Trim().Length -gt 0) {
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($value.Trim());
          [Convert]::ToBase64String($bytes);
          exit
        }
      }
    }
  } catch {}
}
`;

  try {
    const encoded = await runPowerShell(script, 4500);

    if (!encoded) {
      return { ok: false, text: "", reason: "uia-no-selection" };
    }

    const text = Buffer.from(encoded, "base64").toString("utf8").trim();

    if (!text) {
      return { ok: false, text: "", reason: "uia-no-selection" };
    }

    return { ok: true, text, reason: "uia-selection" };
  } catch {
    return { ok: false, text: "", reason: "uia-failed" };
  }
}

async function captureSelectedText(targetHwnd) {
  if (process.platform !== "win32") {
    return { ok: false, text: "", reason: "unsupported-platform" };
  }

  if (!targetHwnd) {
    return { ok: false, text: "", reason: "no-source-window" };
  }

  const marker = `__CLARITY_SELECTION_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}__`;

  const markerBase64 = Buffer.from(marker, "utf8").toString("base64");

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ClaritySelectionCapture {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@;
Add-Type -AssemblyName System.Windows.Forms;

$marker = [System.Text.Encoding]::UTF8.GetString(
  [Convert]::FromBase64String('${markerBase64}')
);

$snapshot = $null;
$copied = '';

try {
  try {
    $snapshot = [System.Windows.Forms.Clipboard]::GetDataObject();
  } catch {}

  [System.Windows.Forms.Clipboard]::SetText($marker);

  [ClaritySelectionCapture]::SetForegroundWindow([IntPtr]${targetHwnd}) | Out-Null;
  Start-Sleep -Milliseconds 110;

  [System.Windows.Forms.SendKeys]::SendWait('^c');
  Start-Sleep -Milliseconds 180;

  try {
    $copied = [System.Windows.Forms.Clipboard]::GetText();
  } catch {
    $copied = '';
  }
}
finally {
  try {
    if ($null -ne $snapshot) {
      [System.Windows.Forms.Clipboard]::SetDataObject($snapshot, $true);
    } else {
      [System.Windows.Forms.Clipboard]::Clear();
    }
  } catch {}
}

if ($copied -and $copied -ne $marker -and $copied.Trim().Length -gt 0) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($copied.Trim());
  [Convert]::ToBase64String($bytes);
}
`;

  try {
    const encoded = await runPowerShell(script, 5000);

    if (!encoded) {
      return { ok: false, text: "", reason: "no-selection" };
    }

    const text = Buffer.from(encoded, "base64").toString("utf8").trim();

    if (!text) {
      return { ok: false, text: "", reason: "no-selection" };
    }

    return { ok: true, text, reason: "selection" };
  } catch (error) {
    console.warn("Selected-text capture failed:", error);
    return { ok: false, text: "", reason: "capture-failed" };
  }
}

async function refreshSelectedText() {
  if (!lastExternalWindowHandle) {
    return { ok: false, text: "", reason: "no-source-window" };
  }

  // First try Windows UI Automation. This can read a retained selection
  // from many standard controls without changing focus or hiding Clarity.
  const uiaResult = await readSelectedTextViaUIAutomation(
    lastExternalWindowHandle,
  );

  if (uiaResult.ok) {
    return uiaResult;
  }

  // Fallback for apps that do not expose TextPattern through UI Automation.
  // Clarity stays visible: focus briefly moves to the source app for Ctrl+C,
  // then immediately returns to Clarity. The clipboard is restored afterward.
  const fallbackResult = await captureSelectedText(lastExternalWindowHandle);

  if (mainWindow) {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
  }

  return fallbackResult;
}

async function replaceSelection(text) {
  const value = typeof text === "string" ? text.trim() : "";

  if (!value) {
    return { ok: false, error: "There is no result to replace." };
  }

  if (!lastExternalWindowHandle) {
    return {
      ok: false,
      error: "The source window is no longer available. Use Copy instead.",
    };
  }

  const valueBase64 = Buffer.from(value, "utf8").toString("base64");

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ClarityPasteTarget {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@;
Add-Type -AssemblyName System.Windows.Forms;

$value = [System.Text.Encoding]::UTF8.GetString(
  [Convert]::FromBase64String('${valueBase64}')
);

$snapshot = $null;
$success = $false;

try {
  try {
    $snapshot = [System.Windows.Forms.Clipboard]::GetDataObject();
  } catch {}

  [System.Windows.Forms.Clipboard]::SetText($value);

  $activated = [ClarityPasteTarget]::SetForegroundWindow(
    [IntPtr]${lastExternalWindowHandle}
  );

  Start-Sleep -Milliseconds 110;

  if ($activated) {
    [System.Windows.Forms.SendKeys]::SendWait('^v');
    Start-Sleep -Milliseconds 200;
    $success = $true;
  }
}
finally {
  try {
    if ($null -ne $snapshot) {
      [System.Windows.Forms.Clipboard]::SetDataObject($snapshot, $true);
    } else {
      [System.Windows.Forms.Clipboard]::Clear();
    }
  } catch {}
}

if ($success) {
  'OK'
}
`;

  mainWindow?.hide();
  await delay(80);

  try {
    const output = await runPowerShell(script, 5000);

    if (output.trim() === "OK") {
      return { ok: true };
    }
  } catch (error) {
    console.warn("Replace selection failed:", error);
  }

  if (mainWindow) {
    placeWindow();
    mainWindow.show();
    mainWindow.focus();
  }

  return {
    ok: false,
    error: "Could not replace the selected text. Use Copy instead.",
  };
}

async function resolveInitialInput(action = null) {
  const foreground = await getForegroundWindowHandle();
  const self = getNativeWindowHandle();

  if (foreground && foreground !== self) {
    lastExternalWindowHandle = foreground;
  }

  const forceSelected = action === "grammar" || action === "understand";
  const source = forceSelected ? "selected" : settings.defaultInputSource;

  if (source === "clipboard") {
    const text = (await readClipboardText()).trim();

    return {
      source: "clipboard",
      text,
      captured: Boolean(text),
      reason: "clipboard",
    };
  }

  const selected = await captureSelectedText(lastExternalWindowHandle);

  return {
    source: "selected",
    text: selected.text,
    captured: selected.ok,
    reason: selected.reason,
  };
}

function waitForRendererReady() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve();
  }

  if (!mainWindow.webContents.isLoadingMainFrame()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    mainWindow.webContents.once("did-finish-load", resolve);
  });
}

async function showStartupWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  await waitForRendererReady();

  let input = {
    source: settings?.defaultInputSource || "selected",
    text: "",
    captured: false,
    reason: "startup",
  };

  if (input.source === "clipboard") {
    const text = (await readClipboardText()).trim();
    input = {
      source: "clipboard",
      text,
      captured: Boolean(text),
      reason: "clipboard",
    };
  }

  placeWindow();

  mainWindow.webContents.send("assistant-opened", {
    ...input,
    action: null,
    settings,
  });

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
}

async function showAssistant(action = null) {
  let input = {
    source: settings?.defaultInputSource || "selected",
    text: "",
    captured: false,
    reason: "no-selection",
  };

  try {
    input = await resolveInitialInput(action);
  } catch (error) {
    console.error("Could not resolve initial input:", error);
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  await waitForRendererReady();

  placeWindow();

  mainWindow.webContents.send("assistant-opened", {
    ...input,
    action,
    settings,
  });

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
}

function registerCurrentShortcuts(candidateSettings) {
  globalShortcut.unregisterAll();

  const shortcuts = candidateSettings.shortcuts;
  const entries = [
    ["Open Assistant", shortcuts.openAssistant, () => showAssistant(null)],
    ["Quick Grammar", shortcuts.quickGrammar, () => showAssistant("grammar")],
    [
      "Quick Understand",
      shortcuts.quickUnderstand,
      () => showAssistant("understand"),
    ],
  ];

  const values = entries.map(([, value]) => value);

  if (values.some((value) => !value)) {
    return { ok: false, error: "All three global shortcuts are required." };
  }

  if (new Set(values).size !== values.length) {
    return {
      ok: false,
      error: "Global shortcuts must use different key combinations.",
    };
  }

  for (const [label, accelerator, callback] of entries) {
    const registered = globalShortcut.register(accelerator, callback);

    if (!registered) {
      globalShortcut.unregisterAll();
      return {
        ok: false,
        error: `Could not register ${label}: ${accelerator}. Another application may already be using it.`,
      };
    }
  }

  return { ok: true };
}

async function callWritingApi(payload) {
  if (!WRITING_API_URL) {
    return { ok: false, error: "WRITING_API_URL is not configured." };
  }

  if (!WRITING_APP_TOKEN) {
    return { ok: false, error: "WRITING_APP_TOKEN is not configured." };
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const context =
    typeof payload?.context === "string" ? payload.context.trim() : "";
  const mode = typeof payload?.mode === "string" ? payload.mode : "express";

  if (!text) {
    return {
      ok: false,
      error:
        mode === "client_reply"
          ? "Write a rough reply first."
          : "No text was provided.",
    };
  }

  if (text.length > 12000) {
    return { ok: false, error: "Maximum input is 12,000 characters." };
  }

  if (context.length > 20000) {
    return { ok: false, error: "Conversation context is too long." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${WRITING_API_URL}/improve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WRITING_APP_TOKEN}`,
      },
      body: JSON.stringify({
        text,
        context,
        mode,
        explanationLanguage:
          payload?.explanationLanguage ||
          settings.understandExplanation ||
          "simple_english",
      }),
      signal: controller.signal,
    });

    let data;

    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        error: "The writing service returned an invalid response.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || "The writing service is unavailable.",
      };
    }

    if (!data?.ok || !data?.result) {
      return {
        ok: false,
        error: "The writing service returned an invalid result.",
      };
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        error: "The request took too long. Please try again.",
      };
    }

    return { ok: false, error: "Could not connect to the writing service." };
  } finally {
    clearTimeout(timeout);
  }
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    placeWindow();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    settings = loadSettings();
    createWindow();

    let registration = registerCurrentShortcuts(settings);

    if (!registration.ok) {
      console.warn(registration.error);
      settings = structuredClone(DEFAULT_SETTINGS);
      registration = registerCurrentShortcuts(settings);
    }

    ipcMain.handle("get-clipboard", async () => {
      return readClipboardText();
    });

    ipcMain.handle("refresh-input", async (_event, source) => {
      if (source === "clipboard") {
        const text = (await readClipboardText()).trim();
        return { ok: Boolean(text), text, reason: "clipboard" };
      }

      return refreshSelectedText();
    });

    ipcMain.handle("copy-result", async (_event, value) => {
      if (typeof value !== "string") {
        return false;
      }

      return writeClipboardText(value);
    });

    ipcMain.handle("replace-selection", async (_event, value) => {
      return replaceSelection(value);
    });

    ipcMain.handle("hide-window", () => {
      mainWindow?.hide();
      return true;
    });

    ipcMain.handle("minimize-window", () => {
      mainWindow?.minimize();
      return true;
    });

    ipcMain.handle("improve-text", async (_event, payload) => {
      return callWritingApi(payload);
    });

    ipcMain.handle("get-settings", () => settings);

    ipcMain.handle("save-settings", (_event, candidate) => {
      const nextSettings = {
        ...settings,
        ...candidate,
        shortcuts: {
          ...settings.shortcuts,
          ...(candidate?.shortcuts || {}),
        },
      };

      if (
        !["selected", "clipboard"].includes(nextSettings.defaultInputSource)
      ) {
        return { ok: false, error: "Invalid default input source." };
      }

      if (
        !["simple_english", "taglish"].includes(
          nextSettings.understandExplanation,
        )
      ) {
        return { ok: false, error: "Invalid explanation language." };
      }

      const previous = settings;
      const registrationResult = registerCurrentShortcuts(nextSettings);

      if (!registrationResult.ok) {
        registerCurrentShortcuts(previous);
        return registrationResult;
      }

      settings = nextSettings;
      saveSettingsFile(settings);

      return { ok: true, settings };
    });

    await showStartupWindow();
  });

  app.on("activate", () => {
    showStartupWindow().catch((error) => {
      console.error("Could not show Clarity:", error);
    });
  });
} else {
  app.quit();
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Keep the process alive so global shortcuts continue to work.
});
