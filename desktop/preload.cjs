// Lets the cards page close the app. Exposed as window.kioskApp; absent in a normal browser.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kioskApp", {
  quit: () => ipcRenderer.send("quit"),
});
