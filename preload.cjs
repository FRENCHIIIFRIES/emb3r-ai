const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("emb3r", {
  sendMessage: (message) => ipcRenderer.invoke("emb3r:send-message", message),
  getConfig: () => ipcRenderer.invoke("emb3r:get-config"),
  setInternetConsent: (granted) => ipcRenderer.invoke("emb3r:set-internet-consent", granted),

  listProfiles: () => ipcRenderer.invoke("emb3r:list-profiles"),
  createProfile: (name) => ipcRenderer.invoke("emb3r:create-profile", name),
  switchProfile: (id) => ipcRenderer.invoke("emb3r:switch-profile", id),
  deleteProfile: (id) => ipcRenderer.invoke("emb3r:delete-profile", id),

  scanHardware: () => ipcRenderer.invoke("emb3r:scan-hardware"),
  listModels: () => ipcRenderer.invoke("emb3r:list-models"),
  downloadModel: (modelId) => ipcRenderer.invoke("emb3r:download-model", modelId),
  selectModel: (filename) => ipcRenderer.invoke("emb3r:select-model", filename),
  onDownloadProgress: (callback) => {
    ipcRenderer.on("emb3r:download-progress", (_event, data) => callback(data));
  },

  setSpotifyClientId: (id) => ipcRenderer.invoke("emb3r:set-spotify-client-id", id),
  connectSpotify: () => ipcRenderer.invoke("emb3r:connect-spotify"),
  disconnectSpotify: () => ipcRenderer.invoke("emb3r:disconnect-spotify"),
  spotifyStatus: () => ipcRenderer.invoke("emb3r:spotify-status"),
  getNowPlaying: () => ipcRenderer.invoke("emb3r:get-now-playing"),
});
