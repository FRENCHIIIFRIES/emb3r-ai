const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("emb3r", {
  sendMessage: (message) => ipcRenderer.invoke("emb3r:send-message", message),
  stopGeneration: () => ipcRenderer.invoke("emb3r:stop-generation"),
  contextUsage: () => ipcRenderer.invoke("emb3r:context-usage"),
  onToken: (callback) => {
    ipcRenderer.on("emb3r:token", (_event, data) => callback(data));
  },
  onGenStats: (callback) => {
    ipcRenderer.on("emb3r:gen-stats", (_event, data) => callback(data));
  },

  getActiveConversation: () => ipcRenderer.invoke("emb3r:get-active-conversation"),
  listConversations: () => ipcRenderer.invoke("emb3r:list-conversations"),
  newConversation: () => ipcRenderer.invoke("emb3r:new-conversation"),
  loadConversation: (id) => ipcRenderer.invoke("emb3r:load-conversation", id),
  deleteConversation: (id) => ipcRenderer.invoke("emb3r:delete-conversation", id),
  onConversationSaved: (callback) => {
    ipcRenderer.on("emb3r:conversation-saved", (_event, data) => callback(data));
  },
  onModelReady: (callback) => {
    ipcRenderer.on("emb3r:model-ready", (_event, data) => callback(data));
  },

  getConfig: () => ipcRenderer.invoke("emb3r:get-config"),
  setInternetConsent: (granted) => ipcRenderer.invoke("emb3r:set-internet-consent", granted),

  getPersonality: () => ipcRenderer.invoke("emb3r:get-personality"),
  setPersonality: (text) => ipcRenderer.invoke("emb3r:set-personality", text),
  resetPersonality: () => ipcRenderer.invoke("emb3r:reset-personality"),

  listProfiles: () => ipcRenderer.invoke("emb3r:list-profiles"),
  createProfile: (name) => ipcRenderer.invoke("emb3r:create-profile", name),
  switchProfile: (id) => ipcRenderer.invoke("emb3r:switch-profile", id),
  deleteProfile: (id) => ipcRenderer.invoke("emb3r:delete-profile", id),

  scanHardware: () => ipcRenderer.invoke("emb3r:scan-hardware"),
  setupState: () => ipcRenderer.invoke("emb3r:setup-state"),
  listModels: () => ipcRenderer.invoke("emb3r:list-models"),
  downloadModel: (modelId) => ipcRenderer.invoke("emb3r:download-model", modelId),
  cancelDownload: (modelId) => ipcRenderer.invoke("emb3r:cancel-download", modelId),
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
