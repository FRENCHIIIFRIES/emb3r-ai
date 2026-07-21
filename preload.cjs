const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("emb3r", {
  getAppVersion: () => ipcRenderer.invoke("emb3r:get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("emb3r:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("emb3r:download-update"),
  installUpdate: () => ipcRenderer.invoke("emb3r:install-update"),
  openReleasesPage: () => ipcRenderer.invoke("emb3r:open-releases-page"),
  onUpdateStatus: (callback) => {
    ipcRenderer.on("emb3r:update-status", (_event, data) => callback(data));
  },

  sendMessage: (message, opts) => ipcRenderer.invoke("emb3r:send-message", message, opts),
  stopGeneration: () => ipcRenderer.invoke("emb3r:stop-generation"),
  contextUsage: () => ipcRenderer.invoke("emb3r:context-usage"),
  onToken: (callback) => {
    ipcRenderer.on("emb3r:token", (_event, data) => callback(data));
  },
  onGenStats: (callback) => {
    ipcRenderer.on("emb3r:gen-stats", (_event, data) => callback(data));
  },
  onAnswerSource: (callback) => {
    ipcRenderer.on("emb3r:answer-source", (_event, data) => callback(data));
  },

  geminiKeyStatus: () => ipcRenderer.invoke("emb3r:gemini-key-status"),
  setGeminiKey: (key) => ipcRenderer.invoke("emb3r:set-gemini-key", key),
  clearGeminiKey: () => ipcRenderer.invoke("emb3r:clear-gemini-key"),

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
