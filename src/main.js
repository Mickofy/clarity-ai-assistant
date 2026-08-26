const {
  app,
  BrowserWindow,
  ClipboardItem,
  globalShortcut,
  clipboard,
  ipcMain,
  screen,
} = require("electron");

const { Blob } = require("buffer");

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let lastExternalWindowHandle = null;
let assistantOpenRequestId = 0;
const assistantFrameWaiters = new Map();

/*
  V7.5.2 RENDERER READY CACHE

  "did-finish-load" is a one-time boot requirement for each BrowserWindow.

  Once a renderer has successfully loaded, a reused same-monitor window should
  never wait on webContents.isLoadingMainFrame() again. Windows/Electron can
  transiently report the main frame as loading even though the already-loaded
  renderer is perfectly usable, which caused the 200-300ms outliers seen in
  diagnostics.

  WeakMap keeps readiness scoped to each BrowserWindow and is automatically
  collectible after a recreated cross-monitor window is destroyed.
*/
const rendererReadyStates = new WeakMap();

const gotSingleInstanceLock = app.requestSingleInstanceLock();

const WRITING_API_URL = (process.env.WRITING_API_URL || "").replace(/\/+$/, "");
const WRITING_APP_TOKEN = process.env.WRITING_APP_TOKEN || "";

const CLARITY_UPDATE_URL = (process.env.CLARITY_UPDATE_URL || "").replace(
  /\/+$/,
  "",
);
const CLARITY_UPDATE_TOKEN = process.env.CLARITY_UPDATE_TOKEN || "";

const UPDATE_CHECK_DELAY_MS = 7000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let updaterConfigured = false;
let updateCheckTimeout = null;
let updateCheckInterval = null;
let updateReadyInfo = null;

const WINDOW_WIDTH = 860;
const WINDOW_HEIGHT = 760;

const SHORTCUT_DEFAULTS_VERSION = 2;

const DEFAULT_SETTINGS = {
  shortcutDefaultsVersion: SHORTCUT_DEFAULTS_VERSION,
  shortcuts: {
    openAssistant: "CommandOrControl+Alt+Q",
    quickExpress: "CommandOrControl+Alt+W",
    quickUnderstand: "CommandOrControl+Alt+E",
    quickClientReply: "CommandOrControl+Alt+R",
    quickGrammar: "CommandOrControl+Alt+T",
  },
  defaultInputSource: "selected",
  understandExplanation: "simple_english",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAssistantFrameReady(requestId, timeoutMs = 300) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (ready) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      if (assistantFrameWaiters.get(requestId) === finish) {
        assistantFrameWaiters.delete(requestId);
      }

      resolve(Boolean(ready));
    };

    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);

    assistantFrameWaiters.set(requestId, finish);
  });
}

function signalAssistantFrameReady(requestId) {
  const id = Number(requestId);

  if (!Number.isFinite(id)) {
    return;
  }

  const finish = assistantFrameWaiters.get(id);

  if (finish) {
    finish(true);
  }
}

function cancelAssistantFrameWaiters() {
  for (const finish of [...assistantFrameWaiters.values()]) {
    finish(false);
  }
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));

    /*
      SHORTCUT DEFAULTS V2 MIGRATION

      Clarity is moving from the old 3-shortcut layout to a deliberate
      one-hand 5-key cluster:

        Ctrl + Alt + Q  Open Assistant
        Ctrl + Alt + W  Quick Express
        Ctrl + Alt + E  Quick Understand
        Ctrl + Alt + R  Quick Client Reply
        Ctrl + Alt + T  Quick Grammar

      Apply this new set once when upgrading from an older settings file.
      After the migration, shortcutDefaultsVersion is saved with settings and
      every shortcut remains fully user-editable.
    */
    const migrateShortcutDefaults =
      Number(saved?.shortcutDefaultsVersion || 0) < SHORTCUT_DEFAULTS_VERSION;

    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      shortcutDefaultsVersion: SHORTCUT_DEFAULTS_VERSION,
      shortcuts: migrateShortcutDefaults
        ? structuredClone(DEFAULT_SETTINGS.shortcuts)
        : {
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

/*
  V7.5.9 SHORTCUT-AWARE CAPTURE

  Settings shortcuts are Electron accelerator strings, for example:

    CommandOrControl+Shift+R
    CommandOrControl+Alt+F

  The selected-text helper runs outside Electron, so convert the current
  accelerator to the Windows virtual-key codes that were physically used to
  launch the shortcut.

  This intentionally happens at capture time from the CURRENT settings.
  Changing a shortcut in Settings therefore changes capture behavior
  immediately without hardcoding any Quick Action key in PowerShell.
*/
const WINDOWS_VK_BY_ACCELERATOR_KEY = Object.freeze({
  BACKSPACE: 0x08,
  TAB: 0x09,
  ENTER: 0x0d,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CONTROL: 0x11,
  CTRL: 0x11,
  ALT: 0x12,
  PAUSE: 0x13,
  CAPSLOCK: 0x14,
  ESCAPE: 0x1b,
  ESC: 0x1b,
  SPACE: 0x20,
  PAGEUP: 0x21,
  PAGEDOWN: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  ARROWLEFT: 0x25,
  UP: 0x26,
  ARROWUP: 0x26,
  RIGHT: 0x27,
  ARROWRIGHT: 0x27,
  DOWN: 0x28,
  ARROWDOWN: 0x28,
  PRINTSCREEN: 0x2c,
  INSERT: 0x2d,
  DELETE: 0x2e,
  NUMLOCK: 0x90,
  SCROLLLOCK: 0x91,

  // Windows / Super key. Both sides are checked when this token is used.
  SUPER: [0x5b, 0x5c],
  META: [0x5b, 0x5c],
  COMMAND: [0x5b, 0x5c],
  CMD: [0x5b, 0x5c],

  // Common OEM punctuation virtual keys.
  ";": 0xba,
  "=": 0xbb,
  ",": 0xbc,
  "-": 0xbd,
  ".": 0xbe,
  "/": 0xbf,
  "`": 0xc0,
  "[": 0xdb,
  "\\": 0xdc,
  "]": 0xdd,
  "'": 0xde,
});

function acceleratorTokenToWindowsVirtualKeys(token) {
  const value = String(token || "").trim();

  if (!value) {
    return [];
  }

  const upper = value.toUpperCase();

  /*
    On Windows, Electron's CommandOrControl resolves to Ctrl.
  */
  if (
    upper === "COMMANDORCONTROL" ||
    upper === "COMMANDORCTRL" ||
    upper === "CMDORCTRL"
  ) {
    return [0x11];
  }

  const mapped =
    WINDOWS_VK_BY_ACCELERATOR_KEY[upper] ??
    WINDOWS_VK_BY_ACCELERATOR_KEY[value];

  if (Array.isArray(mapped)) {
    return mapped;
  }

  if (Number.isInteger(mapped)) {
    return [mapped];
  }

  /*
    A-Z and 0-9 have matching ASCII / Windows virtual-key values.
  */
  if (/^[A-Z]$/.test(upper) || /^[0-9]$/.test(upper)) {
    return [upper.charCodeAt(0)];
  }

  /*
    Electron supports F1-F24 accelerators.
  */
  const functionKeyMatch = /^F([1-9]|1[0-9]|2[0-4])$/.exec(upper);

  if (functionKeyMatch) {
    return [0x70 + Number(functionKeyMatch[1]) - 1];
  }

  /*
    Also support Num0-Num9 if the accelerator came from an alternate
    settings source.
  */
  const numpadMatch = /^NUM([0-9])$/.exec(upper);

  if (numpadMatch) {
    return [0x60 + Number(numpadMatch[1])];
  }

  return [];
}

function acceleratorToWindowsVirtualKeys(accelerator) {
  const unique = new Set();

  for (const token of String(accelerator || "").split("+")) {
    for (const keyCode of acceleratorTokenToWindowsVirtualKeys(token)) {
      if (Number.isInteger(keyCode) && keyCode >= 0 && keyCode <= 0xff) {
        unique.add(keyCode);
      }
    }
  }

  return [...unique];
}

function shortcutAcceleratorForAction(action = null) {
  const shortcuts = settings?.shortcuts || DEFAULT_SETTINGS.shortcuts;

  if (action === "express") {
    return shortcuts.quickExpress || "";
  }

  if (action === "understand") {
    return shortcuts.quickUnderstand || "";
  }

  if (action === "client_reply") {
    return shortcuts.quickClientReply || "";
  }

  if (action === "grammar") {
    return shortcuts.quickGrammar || "";
  }

  return shortcuts.openAssistant || "";
}

function createWindow(initialBounds = null) {
  const options = {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxHeight: WINDOW_HEIGHT,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    movable: true,
    alwaysOnTop: true,
    backgroundColor: "#0d0d0d",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (
    initialBounds &&
    Number.isFinite(initialBounds.x) &&
    Number.isFinite(initialBounds.y)
  ) {
    options.x = Math.round(initialBounds.x);
    options.y = Math.round(initialBounds.y);
  }

  const windowRef = new BrowserWindow(options);
  mainWindow = windowRef;

  let resolveRendererReady;

  const rendererReadyPromise = new Promise((resolve) => {
    resolveRendererReady = resolve;
  });

  const rendererReadyState = {
    ready: false,
    promise: rendererReadyPromise,
  };

  rendererReadyStates.set(windowRef, rendererReadyState);

  windowRef.webContents.once("did-finish-load", () => {
    rendererReadyState.ready = true;
    resolveRendererReady(true);
  });

  windowRef
    .loadFile(path.join(__dirname, "renderer", "index.html"))
    .catch((error) => {
      console.error("Could not load Clarity renderer:", error);

      /*
        Resolve the boot wait so a failed load cannot leave shortcut handling
        hanging forever. The existing frame-ready timeout still protects the
        visible first-paint path.
      */
      resolveRendererReady(false);
    });

  windowRef.on("blur", () => {
    setTimeout(async () => {
      /*
        If this BrowserWindow has already been replaced while switching
        monitors, ignore late blur work from the old native window.
      */
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow !== windowRef) {
        return;
      }

      const foreground = await getForegroundWindowHandle();
      const self = getNativeWindowHandle(windowRef);

      if (foreground && foreground !== self) {
        lastExternalWindowHandle = foreground;
      }
    }, 120);
  });

  windowRef.on("closed", () => {
    if (mainWindow === windowRef) {
      mainWindow = null;
    }
  });
}

function getNativeWindowHandle(windowRef = mainWindow) {
  try {
    const buffer = windowRef?.getNativeWindowHandle();
    if (!buffer) return null;

    if (buffer.length >= 8) {
      return Number(buffer.readBigUInt64LE(0));
    }

    return buffer.readUInt32LE(0);
  } catch {
    return null;
  }
}

function getCursorWindowPlacement() {
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

  return {
    display,
    bounds: {
      x,
      y,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    },
  };
}

function getWindowDisplay(windowRef = mainWindow) {
  if (!windowRef || windowRef.isDestroyed()) {
    return null;
  }

  try {
    return screen.getDisplayMatching(windowRef.getBounds());
  } catch {
    return null;
  }
}

function placeWindow(placement = null) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return placement || getCursorWindowPlacement();
  }

  const target = placement || getCursorWindowPlacement();

  mainWindow.setPosition(target.bounds.x, target.bounds.y, false);

  return target;
}

function prepareWindowForShortcutTarget() {
  /*
    V7.5.3 FAST READY PATH

    Same-monitor reuse should be completely synchronous when the existing
    BrowserWindow renderer has already completed its initial load.

    This avoids even entering an await/Promise continuation on that hot path.

    Missing/cross-monitor windows still wait for their genuine initial
    renderer boot before shortcut opening continues.
  */
  const diagnostics = {
    mode: "unknown",
    placementMs: 0,
    windowDisplayMs: 0,
    visibilityCheckMs: 0,
    switchDecisionMs: 0,
    destroyMs: 0,
    createWindowMs: 0,
    placeWindowMs: 0,
    rendererWaitMs: 0,
    rendererReadyCached: false,
    prepareAwaited: false,
    currentDisplayId: null,
    targetDisplayId: null,
    windowWasVisible: null,
  };

  const placementStarted = Date.now();
  const placement = getCursorWindowPlacement();
  diagnostics.placementMs = Date.now() - placementStarted;

  diagnostics.targetDisplayId =
    placement?.display?.id != null ? String(placement.display.id) : null;

  if (!mainWindow || mainWindow.isDestroyed()) {
    diagnostics.mode = "create-missing-window";
    diagnostics.prepareAwaited = true;

    const createStarted = Date.now();
    createWindow(placement.bounds);
    diagnostics.createWindowMs = Date.now() - createStarted;

    const rendererStarted = Date.now();

    return waitForRendererReady().then(() => {
      diagnostics.rendererWaitMs = Date.now() - rendererStarted;

      return {
        placement,
        diagnostics,
      };
    });
  }

  const displayStarted = Date.now();
  const currentDisplay = getWindowDisplay(mainWindow);
  diagnostics.windowDisplayMs = Date.now() - displayStarted;

  diagnostics.currentDisplayId =
    currentDisplay?.id != null ? String(currentDisplay.id) : null;

  const visibilityStarted = Date.now();
  const windowWasVisible = mainWindow.isVisible();
  diagnostics.visibilityCheckMs = Date.now() - visibilityStarted;

  diagnostics.windowWasVisible = Boolean(windowWasVisible);

  const decisionStarted = Date.now();
  const targetDisplay = placement.display;

  const switchingDisplays =
    !windowWasVisible &&
    currentDisplay &&
    targetDisplay &&
    String(currentDisplay.id) !== String(targetDisplay.id);

  diagnostics.switchDecisionMs = Date.now() - decisionStarted;

  if (switchingDisplays) {
    diagnostics.mode = "recreate-cross-monitor";
    diagnostics.prepareAwaited = true;

    /*
      Keep the proven multi-monitor flash protection.

      A hidden native window is never moved from one physical display to
      another. Recreate it directly on the target monitor and wait for that
      new renderer's real first load.
    */
    const previousWindow = mainWindow;
    mainWindow = null;

    const destroyStarted = Date.now();

    try {
      previousWindow.destroy();
    } catch {}

    diagnostics.destroyMs = Date.now() - destroyStarted;

    const createStarted = Date.now();
    createWindow(placement.bounds);
    diagnostics.createWindowMs = Date.now() - createStarted;

    const rendererStarted = Date.now();

    return waitForRendererReady().then(() => {
      diagnostics.rendererWaitMs = Date.now() - rendererStarted;

      return {
        placement,
        diagnostics,
      };
    });
  }

  diagnostics.mode = "reuse-same-monitor";

  /*
    SAME-MONITOR HOT PATH

    Position the already-loaded BrowserWindow.
  */
  const placeStarted = Date.now();
  placeWindow(placement);
  diagnostics.placeWindowMs = Date.now() - placeStarted;

  diagnostics.rendererReadyCached = Boolean(
    rendererReadyStates.get(mainWindow)?.ready,
  );

  /*
    If this BrowserWindow has already completed did-finish-load, return a
    plain object immediately. No Promise. No await. No event-loop yield.
  */
  if (diagnostics.rendererReadyCached) {
    diagnostics.rendererWaitMs = 0;
    diagnostics.prepareAwaited = false;

    return {
      placement,
      diagnostics,
    };
  }

  /*
    Defensive path only:
    if the current renderer somehow has not completed its first load yet,
    preserve the existing wait behavior.
  */
  diagnostics.prepareAwaited = true;

  const rendererStarted = Date.now();

  return waitForRendererReady().then(() => {
    diagnostics.rendererWaitMs = Date.now() - rendererStarted;

    diagnostics.rendererReadyCached = Boolean(
      rendererReadyStates.get(mainWindow)?.ready,
    );

    return {
      placement,
      diagnostics,
    };
  });
}

/*
  PERSISTENT WINDOWS SELECTED-TEXT CAPTURE HELPER

  Why this exists:
  The stable one-shot capture path starts powershell.exe, loads WinForms,
  compiles Add-Type, captures the selection, and exits on every shortcut.

  Diagnostics showed that this costs roughly 2.5-3.9 seconds per capture.

  This helper starts one hidden STA PowerShell process when Clarity starts,
  loads everything once, then stays alive and accepts capture requests over
  stdin/stdout.

  IMPORTANT:
  - The existing one-shot capture remains below as a reliability fallback.
  - The proven 110ms focus wait + 180ms copy wait are unchanged.
  - UI / renderer / multi-monitor behavior is unchanged.
*/

let captureHelperProcess = null;
let captureHelperReady = false;
let captureHelperStartPromise = null;
let captureHelperRequestId = 0;

const captureHelperPending = new Map();

const CAPTURE_HELPER_START_TIMEOUT_MS = 7000;
const CAPTURE_HELPER_REQUEST_TIMEOUT_MS = 2000;

function encodePowerShellCommand(script) {
  return Buffer.from(String(script), "utf16le").toString("base64");
}

function rejectCaptureHelperPending(error) {
  for (const [id, pending] of captureHelperPending.entries()) {
    clearTimeout(pending.timer);
    pending.reject(error);
    captureHelperPending.delete(id);
  }
}

function stopCaptureHelper() {
  const child = captureHelperProcess;

  captureHelperProcess = null;
  captureHelperReady = false;
  captureHelperStartPromise = null;

  rejectCaptureHelperPending(new Error("Persistent capture helper stopped."));

  if (child && !child.killed) {
    try {
      child.kill();
    } catch {}
  }
}

function handleCaptureHelperResponseLine(line) {
  const value = String(line || "").trim();

  if (!value || value === "READY") {
    return;
  }

  try {
    const json = Buffer.from(value, "base64").toString("utf8");
    const payload = JSON.parse(json);
    const id = Number(payload?.id);

    if (!Number.isFinite(id)) {
      return;
    }

    const pending = captureHelperPending.get(id);

    if (!pending) {
      return;
    }

    captureHelperPending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(payload);
  } catch (error) {
    console.warn("Could not parse persistent capture helper response:", error);
  }
}

function startCaptureHelper() {
  if (process.platform !== "win32") {
    return Promise.resolve(false);
  }

  if (
    captureHelperProcess &&
    !captureHelperProcess.killed &&
    captureHelperReady
  ) {
    return Promise.resolve(true);
  }

  if (captureHelperStartPromise) {
    return captureHelperStartPromise;
  }

  const helperScript = String.raw`
$ErrorActionPreference = 'Stop';
$ProgressPreference = 'SilentlyContinue';
$InformationPreference = 'SilentlyContinue';
$VerbosePreference = 'SilentlyContinue';

Add-Type -AssemblyName System.Windows.Forms;

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class ClarityPersistentCapture {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetClipboardSequenceNumber();

  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
"@;

function Write-ClarityResponse {
  param(
    [Parameter(Mandatory = $true)]
    $Response
  );

  try {
    $responseJson =
      $Response | ConvertTo-Json -Compress;

    $responseBytes =
      [System.Text.Encoding]::UTF8.GetBytes(
        $responseJson
      );

    $responseLine =
      [Convert]::ToBase64String($responseBytes);

    [Console]::Out.WriteLine($responseLine);
    [Console]::Out.Flush();

    return $true;
  }
  catch {
    return $false;
  }
}

function Test-ClarityKeysReleased {
  param(
    [Parameter(Mandatory = $true)]
    [Int32[]]$KeyCodes
  );

  foreach ($keyCode in $KeyCodes) {
    $isDown =
      (([ClarityPersistentCapture]::GetAsyncKeyState(
        [Int32]$keyCode
      ) -band 0x8000) -ne 0);

    if ($isDown) {
      return $false;
    }
  }

  return $true;
}

[Console]::Out.WriteLine('READY');
[Console]::Out.Flush();

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) {
    continue;
  }

  $requestId = 0;

  try {
    $requestBytes = [Convert]::FromBase64String($line);

    $requestJson =
      [System.Text.Encoding]::UTF8.GetString(
        $requestBytes
      );

    $request = $requestJson | ConvertFrom-Json;

    $requestId = [Int64]$request.id;
    $selfHwnd = [Int64]$request.selfHwnd;

    $shortcutKeyCodes = @();

    if ($null -ne $request.shortcutKeyCodes) {
      foreach ($keyCode in @($request.shortcutKeyCodes)) {
        try {
          $resolvedKeyCode = [Int32]$keyCode;

          if (
            $resolvedKeyCode -ge 0 -and
            $resolvedKeyCode -le 255
          ) {
            $shortcutKeyCodes += $resolvedKeyCode;
          }
        }
        catch {
          # Ignore malformed individual key values.
        }
      }
    }

    $targetHwnd =
      [ClarityPersistentCapture]::GetForegroundWindow().ToInt64();

    if (
      $targetHwnd -le 0 -or
      ($selfHwnd -gt 0 -and $targetHwnd -eq $selfHwnd)
    ) {
      Write-ClarityResponse @{
        id = $requestId
        hwnd = $targetHwnd
        ok = $false
        reason = 'no-source-window'
        clipboardChanged = $false
      } | Out-Null;

      continue;
    }

    $sequenceBefore =
      [ClarityPersistentCapture]::GetClipboardSequenceNumber();

    [ClarityPersistentCapture]::SetForegroundWindow(
      [IntPtr]$targetHwnd
    ) | Out-Null;

    # ----------------------------------------------------------
    # V7.5.9 SHORTCUT-AWARE PRE-COPY WAIT
    #
    # The global shortcut itself is configurable in Settings.
    #
    # Do not hardcode Quick Grammar / Quick Understand keys here. Electron
    # sends the current accelerator's Windows virtual-key codes with every
    # capture request.
    #
    # 1. Wait for the source window to actually be foreground.
    # 2. Wait until the COMPLETE trigger chord is physically released.
    #    Example: Ctrl + Shift + R means Ctrl, Shift, AND R must all be UP.
    # 3. Require two consecutive all-up checks (~5ms stable) before Ctrl+C.
    #
    # The 500ms release ceiling is only a maximum. Normal quick releases
    # continue immediately.
    # ----------------------------------------------------------

    $focusTimer =
      [System.Diagnostics.Stopwatch]::StartNew();

    $focusReady = $false;

    while ($focusTimer.ElapsedMilliseconds -lt 110) {
      $foregroundNow =
        [ClarityPersistentCapture]::GetForegroundWindow().ToInt64();

      $focusReady =
        ($foregroundNow -eq $targetHwnd);

      if ($focusReady) {
        break;
      }

      Start-Sleep -Milliseconds 5;
    }

    $focusWaitMs =
      [Math]::Min(
        [Int32]$focusTimer.ElapsedMilliseconds,
        110
      );

    # If no shortcut key codes were understood for any reason, preserve
    # the old reliable behavior by falling back to the generic modifier set.
    if ($shortcutKeyCodes.Count -eq 0) {
      $shortcutKeyCodes = @(
        0x11, # Ctrl
        0x12, # Alt
        0x10, # Shift
        0x5B, # Left Windows
        0x5C  # Right Windows
      );
    }

    $shortcutReleaseTimer =
      [System.Diagnostics.Stopwatch]::StartNew();

    $shortcutReleased = $false;
    $stableReleaseChecks = 0;

    while (
      $shortcutReleaseTimer.ElapsedMilliseconds -lt 500
    ) {
      $allReleased =
        Test-ClarityKeysReleased -KeyCodes $shortcutKeyCodes;

      if ($allReleased) {
        $stableReleaseChecks += 1;

        if ($stableReleaseChecks -ge 2) {
          $shortcutReleased = $true;
          break;
        }
      }
      else {
        $stableReleaseChecks = 0;
      }

      Start-Sleep -Milliseconds 5;
    }

    $shortcutReleaseWaitMs =
      [Math]::Min(
        [Int32]$shortcutReleaseTimer.ElapsedMilliseconds,
        500
      );

    # Keep a compatibility diagnostic with the older logs.
    # In v7.5.9 this means the complete configured shortcut was released,
    # not merely generic modifiers.
    $modifiersReleased = [bool]$shortcutReleased;

    # If the physical shortcut is still held at the safety ceiling, do
    # not knowingly inject Ctrl+C into an active chord. Return a deterministic
    # capture miss instead of the previous random Windows race.
    if (-not $shortcutReleased) {
      Write-ClarityResponse @{
        id = $requestId
        hwnd = $targetHwnd
        ok = $false
        reason = 'shortcut-still-held'
        clipboardChanged = $false
        focusWaitMs = [Int32]$focusWaitMs
        shortcutReleaseWaitMs = [Int32]$shortcutReleaseWaitMs
        shortcutReleased = $false
        shortcutKeyCount = [Int32]$shortcutKeyCodes.Count
        copyWaitMs = 0
        focusReady = [bool]$focusReady
        modifiersReleased = $false
      } | Out-Null;

      continue;
    }

    [System.Windows.Forms.SendKeys]::SendWait('^c');

    # ----------------------------------------------------------
    # V7.5.8 RELIABLE ADAPTIVE COPY WAIT
    #
    # Instead of always waiting 180ms, poll the Windows clipboard sequence
    # number. As soon as Ctrl+C updates the clipboard, continue.
    #
    # Reliability ceiling remains the original 180ms.
    # ----------------------------------------------------------
    $copyTimer =
      [System.Diagnostics.Stopwatch]::StartNew();

    $sequenceAfter = $sequenceBefore;
    $clipboardChanged = $false;

    while ($copyTimer.ElapsedMilliseconds -lt 180) {
      $sequenceAfter =
        [ClarityPersistentCapture]::GetClipboardSequenceNumber();

      if ($sequenceAfter -ne $sequenceBefore) {
        $clipboardChanged = $true;
        break;
      }

      Start-Sleep -Milliseconds 5;
    }

    # One final boundary check in case the copy landed at the timeout edge.
    if (-not $clipboardChanged) {
      $sequenceAfter =
        [ClarityPersistentCapture]::GetClipboardSequenceNumber();

      $clipboardChanged =
        ($sequenceAfter -ne $sequenceBefore);
    }

    # Give clipboard providers a tiny stabilization window after they signal.
    if ($clipboardChanged) {
      Start-Sleep -Milliseconds 5;
    }

    $copyWaitMs =
      [Math]::Min(
        [Int32]$copyTimer.ElapsedMilliseconds,
        180
      );

    Write-ClarityResponse @{
      id = $requestId
      hwnd = $targetHwnd
      ok = [bool]$clipboardChanged
      reason = $(if ($clipboardChanged) {
        'copy-signaled'
      } else {
        'no-selection'
      })
      clipboardChanged = [bool]$clipboardChanged
      focusWaitMs = [Int32]$focusWaitMs
      shortcutReleaseWaitMs = [Int32]$shortcutReleaseWaitMs
      shortcutReleased = [bool]$shortcutReleased
      shortcutKeyCount = [Int32]$shortcutKeyCodes.Count
      copyWaitMs = [Int32]$copyWaitMs
      focusReady = [bool]$focusReady
      modifiersReleased = [bool]$modifiersReleased
    } | Out-Null;
  }
  catch {
    Write-ClarityResponse @{
      id = $requestId
      hwnd = 0
      ok = $false
      reason = 'helper-error'
      clipboardChanged = $false
    } | Out-Null;
  }
}
`;

  captureHelperStartPromise = new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-Sta",
        "-NonInteractive",
        "-OutputFormat",
        "Text",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        encodePowerShellCommand(helperScript),
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    captureHelperProcess = child;
    captureHelperReady = false;

    let stdoutBuffer = "";
    let startSettled = false;

    const finishStart = (ready) => {
      if (startSettled) {
        return;
      }

      startSettled = true;
      clearTimeout(startTimer);

      if (child !== captureHelperProcess) {
        resolve(false);
        return;
      }

      captureHelperReady = Boolean(ready);

      if (!ready) {
        captureHelperStartPromise = null;
      }

      resolve(Boolean(ready));
    };

    const startTimer = setTimeout(() => {
      console.warn("Persistent capture helper did not become ready in time.");

      if (child === captureHelperProcess) {
        try {
          child.kill();
        } catch {}

        captureHelperProcess = null;
        captureHelperReady = false;
        captureHelperStartPromise = null;
      }

      finishStart(false);
    }, CAPTURE_HELPER_START_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += String(chunk || "");

      while (true) {
        const newlineIndex = stdoutBuffer.indexOf("\n");

        if (newlineIndex < 0) {
          break;
        }

        const line = stdoutBuffer
          .slice(0, newlineIndex)
          .replace(/\r$/, "")
          .trim();

        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (!line) {
          continue;
        }

        if (line === "READY") {
          finishStart(true);
          continue;
        }

        handleCaptureHelperResponseLine(line);
      }
    });

    child.stderr.setEncoding("utf8");

    child.stderr.on("data", (chunk) => {
      const message = String(chunk || "").trim();

      if (message && !message.startsWith("#< CLIXML")) {
        console.warn("Persistent capture helper:", message);
      }
    });

    child.on("error", (error) => {
      console.warn("Could not start persistent capture helper:", error);

      if (child === captureHelperProcess) {
        captureHelperProcess = null;
        captureHelperReady = false;
        captureHelperStartPromise = null;
      }

      rejectCaptureHelperPending(error);
      finishStart(false);
    });

    child.on("exit", (code, signal) => {
      const wasCurrent = child === captureHelperProcess;

      if (wasCurrent) {
        captureHelperProcess = null;
        captureHelperReady = false;
        captureHelperStartPromise = null;

        rejectCaptureHelperPending(
          new Error(
            `Persistent capture helper exited (${code ?? "null"}/${signal ?? "none"}).`,
          ),
        );
      }

      if (!startSettled) {
        finishStart(false);
      }
    });
  });

  return captureHelperStartPromise;
}

async function snapshotClipboardForPersistentCapture() {
  if (
    typeof clipboard.read !== "function" ||
    typeof ClipboardItem !== "function"
  ) {
    throw new Error("Electron clipboard snapshot API is unavailable.");
  }

  const items = await clipboard.read();
  const snapshot = [];

  for (const item of items || []) {
    const representations = [];

    for (const type of item.types || []) {
      try {
        const value = await item.getType(type);

        if (
          type === "electron application/bookmark" &&
          value &&
          typeof value === "object"
        ) {
          representations.push({
            type,
            kind: "bookmark",
            value: {
              title: String(value.title || ""),
              url: String(value.url || ""),
            },
          });

          continue;
        }

        if (value && typeof value.arrayBuffer === "function") {
          const buffer = Buffer.from(await value.arrayBuffer());

          representations.push({
            type,
            kind: "blob",
            buffer,
          });

          continue;
        }

        if (typeof value === "string") {
          representations.push({
            type,
            kind: "string",
            value,
          });
        }
      } catch (error) {
        console.warn(
          `Could not snapshot clipboard format "${type}":`,
          error?.message || error,
        );
      }
    }

    if (representations.length) {
      snapshot.push(representations);
    }
  }

  return snapshot;
}

async function restoreClipboardAfterPersistentCapture(snapshot) {
  if (!Array.isArray(snapshot)) {
    return false;
  }

  if (!snapshot.length) {
    await Promise.resolve(clipboard.clear());
    return true;
  }

  const items = [];

  for (const representations of snapshot) {
    const data = {};

    for (const entry of representations || []) {
      if (!entry?.type) {
        continue;
      }

      if (entry.kind === "bookmark") {
        data[entry.type] = {
          title: String(entry.value?.title || ""),
          url: String(entry.value?.url || ""),
        };
      } else if (entry.kind === "blob") {
        data[entry.type] = new Blob([
          Buffer.isBuffer(entry.buffer)
            ? entry.buffer
            : Buffer.from(entry.buffer || []),
        ]);
      } else if (entry.kind === "string") {
        data[entry.type] = String(entry.value || "");
      }
    }

    if (Object.keys(data).length) {
      items.push(new ClipboardItem(data));
    }
  }

  if (!items.length) {
    await Promise.resolve(clipboard.clear());
    return true;
  }

  await clipboard.write(items);
  return true;
}

async function captureSelectedTextWithPersistentHelper(
  shortcutAccelerator = "",
) {
  if (process.platform !== "win32") {
    throw new Error(
      "Persistent selected-text helper is only available on Windows.",
    );
  }

  const ready = await startCaptureHelper();

  if (
    !ready ||
    !captureHelperProcess ||
    captureHelperProcess.killed ||
    !captureHelperReady
  ) {
    throw new Error("Persistent selected-text helper is unavailable.");
  }

  const timing = {
    snapshotMs: 0,
    helperMs: 0,
    focusWaitMs: null,
    shortcutReleaseWaitMs: null,
    shortcutReleased: null,
    shortcutKeyCount: null,
    copyWaitMs: null,
    focusReady: null,
    modifiersReleased: null,
    readMs: 0,
    restoreMs: 0,
  };

  /*
    V7.4 RELIABILITY FIX

    PowerShell no longer owns clipboard snapshot/restore.

    Electron 44 snapshots every available clipboard representation before
    Ctrl+C. The persistent PowerShell helper only sends the copy shortcut and
    reports whether Windows' clipboard sequence changed.

    This keeps the helper responsive for the next shortcut instead of blocking
    inside WinForms Clipboard.SetDataObject(..., $true).
  */
  const snapshotStarted = Date.now();
  const clipboardSnapshot = await snapshotClipboardForPersistentCapture();

  timing.snapshotMs = Date.now() - snapshotStarted;

  const child = captureHelperProcess;
  const id = ++captureHelperRequestId;
  const selfHwnd = getNativeWindowHandle() || 0;

  const shortcutKeyCodes = acceleratorToWindowsVirtualKeys(shortcutAccelerator);

  const request = Buffer.from(
    JSON.stringify({
      id,
      selfHwnd,
      shortcutAccelerator,
      shortcutKeyCodes,
    }),
    "utf8",
  ).toString("base64");

  let payload = null;
  let text = "";
  let restoreNeeded = false;

  try {
    const helperStarted = Date.now();

    payload = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        captureHelperPending.delete(id);

        if (child === captureHelperProcess) {
          stopCaptureHelper();
        }

        reject(new Error("Persistent selected-text capture timed out."));
      }, CAPTURE_HELPER_REQUEST_TIMEOUT_MS);

      captureHelperPending.set(id, {
        timer,
        resolve,
        reject,
      });

      child.stdin.write(`${request}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }

        const pending = captureHelperPending.get(id);

        if (pending) {
          captureHelperPending.delete(id);
          clearTimeout(pending.timer);
          pending.reject(error);
        }
      });
    });

    timing.helperMs = Date.now() - helperStarted;

    timing.focusWaitMs = Number.isFinite(Number(payload?.focusWaitMs))
      ? Number(payload.focusWaitMs)
      : null;

    timing.shortcutReleaseWaitMs = Number.isFinite(
      Number(payload?.shortcutReleaseWaitMs),
    )
      ? Number(payload.shortcutReleaseWaitMs)
      : null;

    timing.shortcutReleased =
      typeof payload?.shortcutReleased === "boolean"
        ? payload.shortcutReleased
        : null;

    timing.shortcutKeyCount = Number.isFinite(Number(payload?.shortcutKeyCount))
      ? Number(payload.shortcutKeyCount)
      : null;

    timing.copyWaitMs = Number.isFinite(Number(payload?.copyWaitMs))
      ? Number(payload.copyWaitMs)
      : null;

    timing.focusReady =
      typeof payload?.focusReady === "boolean" ? payload.focusReady : null;

    timing.modifiersReleased =
      typeof payload?.modifiersReleased === "boolean"
        ? payload.modifiersReleased
        : null;

    if (payload?.reason === "helper-error") {
      throw new Error(
        "Persistent selected-text helper reported an internal error.",
      );
    }

    restoreNeeded = Boolean(payload?.clipboardChanged);

    if (restoreNeeded) {
      const readStarted = Date.now();

      text = (await readClipboardText()).trim();

      timing.readMs = Date.now() - readStarted;
    }
  } finally {
    /*
      Restore the user's clipboard from the fully materialized Electron
      snapshot. This is outside the PowerShell helper, so even a comparatively
      expensive clipboard restoration cannot prevent the helper from accepting
      the next request.
    */
    if (restoreNeeded) {
      const restoreStarted = Date.now();

      try {
        await restoreClipboardAfterPersistentCapture(clipboardSnapshot);
      } catch (error) {
        console.warn(
          "Could not restore clipboard after persistent capture:",
          error?.message || error,
        );
      }

      timing.restoreMs = Date.now() - restoreStarted;
    }
  }

  const targetHwnd = Number(payload?.hwnd);

  const resolvedTargetHwnd =
    Number.isFinite(targetHwnd) && targetHwnd > 0 ? targetHwnd : null;

  const ok = Boolean(payload?.clipboardChanged && text);

  return {
    ok,
    text,
    reason: ok
      ? "selection"
      : payload?.reason === "no-source-window"
        ? "no-source-window"
        : payload?.reason === "shortcut-still-held"
          ? "shortcut-still-held"
          : "no-selection",
    targetHwnd: resolvedTargetHwnd,
    timing,
  };
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

/*
  Faster initial Selected Text capture.

  This combines:
    - GetForegroundWindow()
    - Ctrl+C capture
    - clipboard restore

  into one PowerShell process.

  It is used for the GLOBAL SHORTCUT opening flow only.
  Existing Ctrl+R refresh continues using the existing
  UI Automation + fallback flow below.
*/
async function captureSelectedTextFromForegroundOneShot() {
  if (process.platform !== "win32") {
    return {
      ok: false,
      text: "",
      reason: "unsupported-platform",
      targetHwnd: null,
    };
  }

  const selfHwnd = getNativeWindowHandle() || 0;

  const marker = `__CLARITY_SELECTION_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}__`;

  const markerBase64 = Buffer.from(marker, "utf8").toString("base64");

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class ClarityForegroundCapture {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@;

Add-Type -AssemblyName System.Windows.Forms;

$targetHwnd = [ClarityForegroundCapture]::GetForegroundWindow().ToInt64();
$selfHwnd = [Int64]${selfHwnd};

$marker = [System.Text.Encoding]::UTF8.GetString(
  [Convert]::FromBase64String('${markerBase64}')
);

if (
  $targetHwnd -le 0 -or
  ($selfHwnd -gt 0 -and $targetHwnd -eq $selfHwnd)
) {
  $payload = @{
    hwnd = $targetHwnd
    ok = $false
    reason = 'no-source-window'
    text = ''
  } | ConvertTo-Json -Compress;

  $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload);
  [Convert]::ToBase64String($payloadBytes);
  exit;
}

$snapshot = $null;
$copied = '';

try {
  try {
    $snapshot = [System.Windows.Forms.Clipboard]::GetDataObject();
  } catch {}

  [System.Windows.Forms.Clipboard]::SetText($marker);

  [ClarityForegroundCapture]::SetForegroundWindow(
    [IntPtr]$targetHwnd
  ) | Out-Null;

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

$ok = (
  $copied -and
  $copied -ne $marker -and
  $copied.Trim().Length -gt 0
);

if ($ok) {
  $reason = 'selection';

  $textBytes = [System.Text.Encoding]::UTF8.GetBytes(
    $copied.Trim()
  );

  $encodedText = [Convert]::ToBase64String($textBytes);
}
else {
  $reason = 'no-selection';
  $encodedText = '';
}

$payload = @{
  hwnd = $targetHwnd
  ok = [bool]$ok
  reason = $reason
  text = $encodedText
} | ConvertTo-Json -Compress;

$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload);

[Convert]::ToBase64String($payloadBytes);
`;

  try {
    const encodedPayload = await runPowerShell(script, 5000);

    if (!encodedPayload) {
      return {
        ok: false,
        text: "",
        reason: "capture-failed",
        targetHwnd: null,
      };
    }

    const payloadJson = Buffer.from(encodedPayload, "base64").toString("utf8");

    const payload = JSON.parse(payloadJson);

    const targetHwnd = Number(payload?.hwnd);

    const resolvedTargetHwnd =
      Number.isFinite(targetHwnd) && targetHwnd > 0 ? targetHwnd : null;

    let text = "";

    if (typeof payload?.text === "string" && payload.text) {
      text = Buffer.from(payload.text, "base64").toString("utf8").trim();
    }

    return {
      ok: Boolean(payload?.ok && text),
      text,
      reason:
        typeof payload?.reason === "string"
          ? payload.reason
          : text
            ? "selection"
            : "no-selection",
      targetHwnd: resolvedTargetHwnd,
    };
  } catch (error) {
    console.warn("Foreground selected-text capture failed:", error);

    return {
      ok: false,
      text: "",
      reason: "capture-failed",
      targetHwnd: null,
    };
  }
}

/*
  FAST INITIAL SHORTCUT CAPTURE

  Try the already-warmed persistent PowerShell helper first.

  If the helper is unavailable, crashes, or times out, automatically fall
  back to the exact stable one-shot capture that was already working.
*/
async function captureSelectedTextFromForeground(shortcutAccelerator = "") {
  const started = Date.now();

  try {
    const result =
      await captureSelectedTextWithPersistentHelper(shortcutAccelerator);

    console.log(
      "[CLARITY CAPTURE PERF]",
      JSON.stringify({
        path: "persistent-helper",
        ms: Date.now() - started,
        snapshotMs: result.timing?.snapshotMs ?? null,
        helperMs: result.timing?.helperMs ?? null,
        shortcut: shortcutAccelerator || null,
        shortcutKeyCodes: acceleratorToWindowsVirtualKeys(shortcutAccelerator),
        focusWaitMs: result.timing?.focusWaitMs ?? null,
        shortcutReleaseWaitMs: result.timing?.shortcutReleaseWaitMs ?? null,
        shortcutReleased: result.timing?.shortcutReleased ?? null,
        shortcutKeyCount: result.timing?.shortcutKeyCount ?? null,
        copyWaitMs: result.timing?.copyWaitMs ?? null,
        focusReady: result.timing?.focusReady ?? null,
        modifiersReleased: result.timing?.modifiersReleased ?? null,
        readMs: result.timing?.readMs ?? null,
        restoreMs: result.timing?.restoreMs ?? null,
        ok: result.ok,
        reason: result.reason,
      }),
    );

    return result;
  } catch (error) {
    console.warn(
      "Persistent selected-text capture failed; using stable fallback:",
      error?.message || error,
    );

    const fallbackStarted = Date.now();

    const result = await captureSelectedTextFromForegroundOneShot();

    console.log(
      "[CLARITY CAPTURE PERF]",
      JSON.stringify({
        path: "one-shot-fallback",
        helperAttemptMs: fallbackStarted - started,
        fallbackMs: Date.now() - fallbackStarted,
        totalMs: Date.now() - started,
        ok: result.ok,
        reason: result.reason,
      }),
    );

    /*
      Warm a new helper again in the background for the next shortcut.
    */
    startCaptureHelper().catch(() => {});

    return result;
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
  const forceSelected = Boolean(action);
  const source = forceSelected ? "selected" : settings.defaultInputSource;

  /*
    Clipboard is handled directly by Electron.

    This avoids the previous unnecessary PowerShell
    foreground-window lookup when Clipboard is selected.
  */
  if (source === "clipboard") {
    const text = (await readClipboardText()).trim();

    return {
      source: "clipboard",
      text,
      captured: Boolean(text),
      reason: "clipboard",
    };
  }

  /*
    For initial Selected Text capture, foreground-window
    detection + Ctrl+C happen in one PowerShell process.
  */
  const shortcutAccelerator = shortcutAcceleratorForAction(action);

  const selected = await captureSelectedTextFromForeground(shortcutAccelerator);

  if (selected.targetHwnd) {
    lastExternalWindowHandle = selected.targetHwnd;
  }

  return {
    source: "selected",
    text: selected.text,
    captured: selected.ok,
    reason: selected.reason,
  };
}

function waitForRendererReady(windowRef = mainWindow) {
  if (!windowRef || windowRef.isDestroyed()) {
    return Promise.resolve();
  }

  const cachedState = rendererReadyStates.get(windowRef);

  /*
    FAST REUSE PATH

    Once this BrowserWindow completed its initial did-finish-load, the
    renderer/preload listeners already exist. Do not consult
    isLoadingMainFrame() again for normal same-monitor reopen.
  */
  if (cachedState?.ready) {
    return Promise.resolve();
  }

  /*
    Brand-new BrowserWindow:
    wait only for its one initial renderer boot promise.
  */
  if (cachedState?.promise) {
    return cachedState.promise;
  }

  /*
    Defensive fallback for any BrowserWindow that did not originate from
    createWindow(). This should not normally be used.
  */
  if (!windowRef.webContents.isLoadingMainFrame()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    windowRef.webContents.once("did-finish-load", resolve);
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

  try {
    mainWindow.setOpacity(1);
  } catch {}

  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
}

async function showAssistant(action = null) {
  /*
    V7.1 DIAGNOSTICS ONLY

    This does not change the shortcut/capture/rendering behavior.
    It only measures where the time is going so we can optimize one
    bottleneck at a time instead of guessing.
  */
  const perfStart = Date.now();
  const perf = {
    action: action || "open-assistant",
    prepareWindowMs: 0,
    prepareMode: "",
    placementMs: 0,
    windowDisplayMs: 0,
    visibilityCheckMs: 0,
    switchDecisionMs: 0,
    destroyMs: 0,
    createWindowMs: 0,
    placeWindowMs: 0,
    rendererWaitMs: 0,
    rendererReadyCached: false,
    prepareAwaited: false,
    firstPaintMs: 0,
    captureMs: 0,
    totalMs: 0,
    recreatedWindow: false,
    frameReady: false,
    captured: false,
    captureReason: "",
  };

  const requestId = ++assistantOpenRequestId;

  /*
    Any older shortcut preparation is now obsolete.
  */
  cancelAssistantFrameWaiters();

  const forceSelected = Boolean(action);
  const source = forceSelected ? "selected" : settings.defaultInputSource;

  /*
    V7.5.3 keeps the v7.5 window strategy but removes the Promise/await
    yield entirely when the same-monitor renderer is already cached as ready.
  */
  const previousWindow = mainWindow;
  const prepareStarted = Date.now();

  const preparationResult = prepareWindowForShortcutTarget();

  /*
    Same-monitor + cached renderer returns a normal object and continues
    synchronously.

    New/cross-monitor windows return a Promise because they genuinely need
    their initial renderer boot.
  */
  const preparationWasAsync = Boolean(
    preparationResult && typeof preparationResult.then === "function",
  );

  const windowPreparation = preparationWasAsync
    ? await preparationResult
    : preparationResult;

  perf.prepareWindowMs = Date.now() - prepareStarted;

  const prepareDiagnostics = windowPreparation?.diagnostics || {};

  perf.prepareMode = prepareDiagnostics.mode || "";

  perf.placementMs = prepareDiagnostics.placementMs || 0;

  perf.windowDisplayMs = prepareDiagnostics.windowDisplayMs || 0;

  perf.visibilityCheckMs = prepareDiagnostics.visibilityCheckMs || 0;

  perf.switchDecisionMs = prepareDiagnostics.switchDecisionMs || 0;

  perf.destroyMs = prepareDiagnostics.destroyMs || 0;

  perf.createWindowMs = prepareDiagnostics.createWindowMs || 0;

  perf.placeWindowMs = prepareDiagnostics.placeWindowMs || 0;

  perf.rendererWaitMs = prepareDiagnostics.rendererWaitMs || 0;

  perf.rendererReadyCached = Boolean(prepareDiagnostics.rendererReadyCached);

  perf.prepareAwaited = Boolean(
    preparationWasAsync || prepareDiagnostics.prepareAwaited,
  );

  perf.recreatedWindow = Boolean(
    previousWindow && mainWindow && previousWindow !== mainWindow,
  );

  if (
    requestId !== assistantOpenRequestId ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  try {
    mainWindow.webContents.setBackgroundThrottling(false);
  } catch {}

  try {
    mainWindow.setOpacity(0);
  } catch {}

  mainWindow.setAlwaysOnTop(true);

  const paintStarted = Date.now();
  const frameReady = waitForAssistantFrameReady(requestId, 900);

  mainWindow.webContents.send("assistant-opened", {
    source,
    text: "",
    captured: false,
    reason: source === "selected" ? "capturing" : "loading",
    phase: "capture",
    action,
    requestId,
    settings,
  });

  mainWindow.showInactive();

  const didPaintExpectedFrame = await frameReady;

  perf.firstPaintMs = Date.now() - paintStarted;
  perf.frameReady = Boolean(didPaintExpectedFrame);

  if (
    requestId !== assistantOpenRequestId ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    try {
      mainWindow?.webContents?.setBackgroundThrottling(true);
    } catch {}

    return;
  }

  if (!didPaintExpectedFrame) {
    await delay(60);
  }

  if (
    requestId !== assistantOpenRequestId ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  try {
    mainWindow.setOpacity(1);
  } catch {}

  try {
    mainWindow.webContents.setBackgroundThrottling(true);
  } catch {}

  let input = {
    source,
    text: "",
    captured: false,
    reason: source === "clipboard" ? "clipboard" : "no-selection",
  };

  const captureStarted = Date.now();

  try {
    input = await resolveInitialInput(action);
  } catch (error) {
    console.error("Could not resolve initial input:", error);
  }

  perf.captureMs = Date.now() - captureStarted;
  perf.captured = Boolean(input?.captured);
  perf.captureReason = input?.reason || "";

  if (
    requestId !== assistantOpenRequestId ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  try {
    mainWindow.setOpacity(1);
  } catch {}

  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();

  mainWindow.webContents.send("assistant-opened", {
    ...input,
    action,
    phase: "ready",
    requestId,
    settings,
  });

  perf.totalMs = Date.now() - perfStart;

  /*
    One compact line per shortcut so logging itself has minimal impact.

    Example:
    [CLARITY PERF] {"action":"grammar","prepareWindowMs":145,...}
  */
  console.log("[CLARITY PERF]", JSON.stringify(perf));
}

function registerCurrentShortcuts(candidateSettings) {
  globalShortcut.unregisterAll();

  const shortcuts = candidateSettings.shortcuts;
  const entries = [
    ["Open Assistant", shortcuts.openAssistant, () => showAssistant(null)],
    ["Quick Express", shortcuts.quickExpress, () => showAssistant("express")],
    [
      "Quick Understand",
      shortcuts.quickUnderstand,
      () => showAssistant("understand"),
    ],
    [
      "Quick Client Reply",
      shortcuts.quickClientReply,
      () => showAssistant("client_reply"),
    ],
    ["Quick Grammar", shortcuts.quickGrammar, () => showAssistant("grammar")],
  ];

  const values = entries.map(([, value]) => value);

  if (values.some((value) => !value)) {
    return { ok: false, error: "All five global shortcuts are required." };
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

function canUseAutoUpdater() {
  return (
    app.isPackaged &&
    Boolean(CLARITY_UPDATE_URL) &&
    Boolean(CLARITY_UPDATE_TOKEN)
  );
}

function sanitizeUpdaterError(error) {
  if (!error) return "Unknown updater error.";

  const message =
    typeof error?.message === "string" ? error.message : String(error);

  /*
    Never print the update token if a lower-level library ever includes
    request details in an error message.
  */
  if (!CLARITY_UPDATE_TOKEN) {
    return message;
  }

  return message.split(CLARITY_UPDATE_TOKEN).join("[REDACTED]");
}

async function showUpdateReadyUi(info) {
  updateReadyInfo = {
    version:
      typeof info?.version === "string" && info.version.trim()
        ? info.version.trim()
        : null,
  };

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  await waitForRendererReady();

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  placeWindow();

  try {
    mainWindow.setOpacity(1);
  } catch {}

  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();

  mainWindow.webContents.send("update-ready", {
    version: updateReadyInfo.version || app.getVersion(),
  });
}

function installDownloadedUpdate() {
  if (!updateReadyInfo) {
    return {
      ok: false,
      error: "No downloaded update is ready to install.",
    };
  }

  /*
    Return to the renderer first, then let electron-updater quit Clarity
    and launch the NSIS installer on the next turn of the event loop.
  */
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      console.warn(
        "Could not restart Clarity for update:",
        sanitizeUpdaterError(error),
      );
    }
  });

  return { ok: true };
}

function configureAutoUpdater() {
  if (updaterConfigured) {
    return canUseAutoUpdater();
  }

  updaterConfigured = true;

  /*
    Never run the updater during `npm start`.
    electron-updater is intended to update the packaged NSIS application.
  */
  if (!app.isPackaged) {
    console.log("Auto-update disabled in development mode.");
    return false;
  }

  if (!CLARITY_UPDATE_URL) {
    console.warn("Auto-update disabled: CLARITY_UPDATE_URL is not configured.");
    return false;
  }

  if (!CLARITY_UPDATE_TOKEN) {
    console.warn(
      "Auto-update disabled: CLARITY_UPDATE_TOKEN is not configured.",
    );
    return false;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  /*
    The R2 bucket remains private. Every updater request goes through the
    authenticated Cloudflare Worker gateway.
  */
  autoUpdater.requestHeaders = {
    Authorization: `Bearer ${CLARITY_UPDATE_TOKEN}`,
    "Cache-Control": "no-cache",
  };

  autoUpdater.setFeedURL({
    provider: "generic",
    url: CLARITY_UPDATE_URL,
  });

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for Clarity updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(
      `Clarity update available: ${info?.version || "new version"}. Downloading in the background.`,
    );
  });

  autoUpdater.on("update-not-available", () => {
    console.log("Clarity is up to date.");
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(
      `Clarity update downloaded: ${info?.version || "new version"}.`,
    );

    showUpdateReadyUi(info).catch((error) => {
      console.warn(
        "Could not show Clarity update UI:",
        sanitizeUpdaterError(error),
      );
    });
  });

  autoUpdater.on("error", (error) => {
    /*
      Updater failures must never stop the writing assistant from working.
    */
    console.warn("Clarity updater:", sanitizeUpdaterError(error));
  });

  return true;
}

async function checkForUpdatesQuietly() {
  if (!configureAutoUpdater() || !canUseAutoUpdater()) {
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    /*
      checkForUpdates can reject in addition to emitting the error event.
      Keep the failure quiet so Clarity remains fully usable offline.
    */
    console.warn("Clarity update check failed:", sanitizeUpdaterError(error));
  }
}

function startAutoUpdater() {
  if (!configureAutoUpdater() || !canUseAutoUpdater()) {
    return;
  }

  if (updateCheckTimeout || updateCheckInterval) {
    return;
  }

  /*
    Give Clarity a few seconds to finish opening before the first network
    request. After that, check periodically while the background process
    remains alive.
  */
  updateCheckTimeout = setTimeout(() => {
    updateCheckTimeout = null;

    checkForUpdatesQuietly().catch((error) => {
      console.warn("Clarity update check failed:", sanitizeUpdaterError(error));
    });
  }, UPDATE_CHECK_DELAY_MS);

  updateCheckInterval = setInterval(() => {
    checkForUpdatesQuietly().catch((error) => {
      console.warn("Clarity update check failed:", sanitizeUpdaterError(error));
    });
  }, UPDATE_CHECK_INTERVAL_MS);

  /*
    These timers should not be the only reason Node keeps the process alive.
    Clarity already intentionally remains alive for global shortcuts.
  */
  updateCheckTimeout.unref?.();
  updateCheckInterval.unref?.();
}

function stopAutoUpdaterTimers() {
  if (updateCheckTimeout) {
    clearTimeout(updateCheckTimeout);
    updateCheckTimeout = null;
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
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

    try {
      mainWindow.setOpacity(1);
    } catch {}

    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.clarityaiassistant.desktop");
    }
    settings = loadSettings();

    /*
      Warm the persistent selected-text helper in the background.
      Do not await it: Clarity's startup UI should remain immediate.
    */
    startCaptureHelper()
      .then((ready) => {
        if (ready) {
          console.log("Persistent selected-text capture helper is ready.");
        }
      })
      .catch((error) => {
        console.warn("Could not warm persistent capture helper:", error);
      });

    createWindow();

    let registration = registerCurrentShortcuts(settings);

    if (!registration.ok) {
      console.warn(registration.error);
      settings = structuredClone(DEFAULT_SETTINGS);
      registration = registerCurrentShortcuts(settings);
    }

    ipcMain.on("assistant-frame-ready", (_event, requestId) => {
      signalAssistantFrameReady(requestId);
    });

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
      /*
        Cancel any shortcut/capture that is still in progress so its final
        payload cannot reopen Clarity after the user closes it.
      */
      assistantOpenRequestId += 1;
      cancelAssistantFrameWaiters();

      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.setBackgroundThrottling(true);
        } catch {}

        mainWindow.hide();

        /*
          Keep the hidden window in a normal state. Shortcut opening will set
          opacity back to 0 before its transparent pre-render phase.
        */
        try {
          mainWindow.setOpacity(1);
        } catch {}
      }

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

    ipcMain.handle("get-app-info", () => {
      return {
        name: app.getName(),
        version: app.getVersion(),
        developer: "Mickofy",
      };
    });

    ipcMain.handle("install-update", () => {
      return installDownloadedUpdate();
    });

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
    startAutoUpdater();
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
  stopAutoUpdaterTimers();
  stopCaptureHelper();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Keep the process alive so global shortcuts continue to work.
});
