const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("writingAssistant", {
  getClipboard: () => ipcRenderer.invoke("get-clipboard"),
  refreshInput: (source) => ipcRenderer.invoke("refresh-input", source),
  improveText: (payload) => ipcRenderer.invoke("improve-text", payload),
  copyResult: (text) => ipcRenderer.invoke("copy-result", text),
  replaceSelection: (text) => ipcRenderer.invoke("replace-selection", text),
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  onAssistantOpened: (callback) => {
    ipcRenderer.on("assistant-opened", (_event, payload) => callback(payload));
  },
});
