const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zarus", {
  // question recording (wake word or hotkey both trigger this)
  onToggleListen: (cb) => ipcRenderer.on("toggle-listen", () => cb()),
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onRespond: (cb) => ipcRenderer.on("respond", (_e, data) => cb(data)),
  sendAudio: (audioBase64, mime) =>
    ipcRenderer.send("audio", { audio: audioBase64, mime }),

  // always-on wake-word streaming
  onListenControl: (cb) => ipcRenderer.on("listen-control", (_e, on) => cb(on)),
  sendPcm: (int16) => ipcRenderer.send("pcm", int16),

  // enrollment
  onEnrollControl: (cb) =>
    ipcRenderer.on("enroll-control", (_e, on) => cb(on)),
  sendEnrollPcm: (int16) => ipcRenderer.send("pcm-enroll", int16),
  onEnrollProgress: (cb) =>
    ipcRenderer.on("enroll-progress", (_e, pct) => cb(pct)),
  onNotice: (cb) => ipcRenderer.on("notice", (_e, msg) => cb(msg)),
});
