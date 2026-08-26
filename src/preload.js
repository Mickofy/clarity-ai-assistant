const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("writingAssistant", {
  refreshInput: (source) => ipcRenderer.invoke("refresh-input", source),

  improveText: (payload) => ipcRenderer.invoke("improve-text", payload),

  copyResult: (text) => ipcRenderer.invoke("copy-result", text),

  replaceSelection: (text) => ipcRenderer.invoke("replace-selection", text),

  hideWindow: () => ipcRenderer.invoke("hide-window"),

  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),

  getSettings: () => ipcRenderer.invoke("get-settings"),

  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  installUpdate: () => ipcRenderer.invoke("install-update"),

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

  onUpdateReady: (callback) => {
    if (typeof callback !== "function") return () => {};

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update-ready", listener);

    return () => {
      ipcRenderer.removeListener("update-ready", listener);
    };
  },
});
