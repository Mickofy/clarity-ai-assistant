const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("writingAssistant", {
  refreshInput: (source) => ipcRenderer.invoke("refresh-input", source),

  improveText: (payload) => ipcRenderer.invoke("improve-text", payload),
  cancelRequest: (requestId) => ipcRenderer.invoke("cancel-writing-request", requestId),
  toggleMaximize: () => ipcRenderer.invoke("toggle-maximize-window"),

  copyResult: (text) => ipcRenderer.invoke("copy-result", text),

  replaceSelection: (text) => ipcRenderer.invoke("replace-selection", text),

  hideWindow: () => ipcRenderer.invoke("hide-window"),

  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),

  getSettings: () => ipcRenderer.invoke("get-settings"),

  getShortcutStatus: () => ipcRenderer.invoke("get-shortcut-status"),

  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  assistantFrameReady: (requestId) =>
    ipcRenderer.send("assistant-frame-ready", requestId),

  onAssistantOpened: (callback) => {
    if (typeof callback !== "function") return () => {};

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("assistant-opened", listener);

    return () => {
      ipcRenderer.removeListener("assistant-opened", listener);
    };
  },

});
