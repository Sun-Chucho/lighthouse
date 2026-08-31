const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lighthouseDesktop", {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke("desktop:get-version"),
  storeVerifiedSession: (session) => ipcRenderer.invoke("desktop:store-session", session),
  loadVerifiedSession: () => ipcRenderer.invoke("desktop:load-session"),
  clearVerifiedSession: () => ipcRenderer.invoke("desktop:clear-session"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:update-state", listener);
    return () => ipcRenderer.removeListener("desktop:update-state", listener);
  },
});

contextBridge.exposeInMainWorld("lighthouseHardware", {
  listPrinters: () => ipcRenderer.invoke("hardware:list-printers"),
  printRaw: (job) => ipcRenderer.invoke("hardware:print-receipt", job),
});
