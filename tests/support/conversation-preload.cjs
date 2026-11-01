const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("writingAssistant", {
  getSettings: async () => ({
    shortcuts: {
      openAssistant: "CommandOrControl+Alt+Q",
      quickExpress: "CommandOrControl+Alt+W",
      quickUnderstand: "CommandOrControl+Alt+E",
      quickClientReply: "CommandOrControl+Alt+R",
      quickGrammar: "CommandOrControl+Alt+T",
    },
    defaultInputSource: "selected", understandExplanation: "simple_english",
  }),
  getAppInfo: async () => ({ version: "test", developer: "Mickofy" }),
  improveText: (payload) => ipcRenderer.invoke("test-improve", payload),
  copyResult: (text) => ipcRenderer.invoke("test-copy", text),
  replaceSelection: (text) => ipcRenderer.invoke("test-paste", text),
  refreshInput: async () => ({ ok: false, text: "" }),
  hideWindow: () => ipcRenderer.invoke("test-hide"),
  minimizeWindow: async () => true,
  onAssistantOpened: () => {},
  saveSettings: async () => ({ ok: true }),
});
