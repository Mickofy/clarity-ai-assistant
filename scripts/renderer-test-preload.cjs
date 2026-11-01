const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("writingAssistant", {
  getSettings: () => ipcRenderer.invoke("test-settings"),
  getAppInfo: async () => ({ version: "test", developer: "Mickofy" }),
  saveSettings: async settings => ({ ok: true, settings }),
  refreshInput: async () => ({ ok: false, text: "" }),
  improveText: payload => ipcRenderer.invoke("test-improve", payload),
  cancelRequest: id => ipcRenderer.invoke("test-cancel", id),
  copyResult: text => ipcRenderer.invoke("test-copy", text),
  replaceSelection: async () => ({ ok: true }),
  hideWindow: () => ipcRenderer.invoke("test-hide"),
  minimizeWindow: async () => true,
  toggleMaximize: async () => true,
  assistantFrameReady: () => {},
  onAssistantOpened: callback => { ipcRenderer.on("test-open", (_event, payload) => callback(payload)); return () => {}; },
});
