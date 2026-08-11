const { contextBridge, ipcRenderer, webUtils } = require("electron");
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
  onGeminiFallback: (callback) => {
    ipcRenderer.on("emb3r:gemini-fallback", (_event, data) => callback(data));
  },
  onWebSearchStart: (callback) => {
    ipcRenderer.on("emb3r:web-search-start", () => callback());
  },

  // Ember's voice. speak() returns raw PCM rather than an encoded file, so the
  // renderer never needs a blob URL and the CSP stays as it is.
  voiceStatus: () => ipcRenderer.invoke("emb3r:voice-status"),
  installVoice: () => ipcRenderer.invoke("emb3r:install-voice"),
  warmVoice: () => ipcRenderer.invoke("emb3r:warm-voice"),
  speak: (payload) => ipcRenderer.invoke("emb3r:speak", payload),
  stopSpeaking: () => ipcRenderer.invoke("emb3r:stop-speaking"),
  onVoiceProgress: (callback) => {
    ipcRenderer.on("emb3r:voice-progress", (_event, data) => callback(data));
  },

  // Ember's ears. The renderer captures and downsamples; the transcribing
  // happens in main, where the model already lives.
  earsStatus: () => ipcRenderer.invoke("emb3r:ears-status"),
  warmEars: () => ipcRenderer.invoke("emb3r:warm-ears"),
  transcribe: (payload) => ipcRenderer.invoke("emb3r:transcribe", payload),

  geminiKeyStatus: () => ipcRenderer.invoke("emb3r:gemini-key-status"),

  apiProviderStatus: () => ipcRenderer.invoke("emb3r:api-provider-status"),
  setApiProvider: (provider) => ipcRenderer.invoke("emb3r:set-api-provider", provider),
  setCustomApi: (payload) => ipcRenderer.invoke("emb3r:set-custom-api", payload),
  clearCustomApi: () => ipcRenderer.invoke("emb3r:clear-custom-api"),
  testCustomApi: () => ipcRenderer.invoke("emb3r:test-custom-api"),
  setGeminiKey: (key) => ipcRenderer.invoke("emb3r:set-gemini-key", key),
  clearGeminiKey: () => ipcRenderer.invoke("emb3r:clear-gemini-key"),
  testGeminiKey: () => ipcRenderer.invoke("emb3r:test-gemini-key"),
  setGeminiModel: (model) => ipcRenderer.invoke("emb3r:set-gemini-model", model),

  getActiveConversation: () => ipcRenderer.invoke("emb3r:get-active-conversation"),
  listConversations: () => ipcRenderer.invoke("emb3r:list-conversations"),
  newConversation: () => ipcRenderer.invoke("emb3r:new-conversation"),
  loadConversation: (id) => ipcRenderer.invoke("emb3r:load-conversation", id),
  deleteConversation: (id) => ipcRenderer.invoke("emb3r:delete-conversation", id),
  onModelReady: (callback) => {
    ipcRenderer.on("emb3r:model-ready", (_event, data) => callback(data));
  },
  getModelState: () => ipcRenderer.invoke("emb3r:get-model-state"),
  onModelLoadProgress: (callback) => {
    ipcRenderer.on("emb3r:model-load-progress", (_event, data) => callback(data));
  },

  getConfig: () => ipcRenderer.invoke("emb3r:get-config"),
  setInternetConsent: (granted) => ipcRenderer.invoke("emb3r:set-internet-consent", granted),

  netStatus: () => ipcRenderer.invoke("emb3r:net-status"),
  setOfflineLock: (on) => ipcRenderer.invoke("emb3r:set-offline-lock", on),
  onNetActivity: (callback) => {
    ipcRenderer.on("emb3r:net-activity", (_event, data) => callback(data));
  },

  getPersonality: () => ipcRenderer.invoke("emb3r:get-personality"),
  setPersonality: (text) => ipcRenderer.invoke("emb3r:set-personality", text),
  resetPersonality: () => ipcRenderer.invoke("emb3r:reset-personality"),
  // File objects no longer carry .path in Electron, and the renderer must not
  // be handed a way to read arbitrary paths - webUtils resolves the path for a
  // File the user actually chose, and nothing else.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return ""; }
  },
  readDocument: (filePath) => ipcRenderer.invoke("emb3r:read-document", filePath),
  inspectModelSource: (input) => ipcRenderer.invoke("emb3r:inspect-model-source", input),
  downloadCustomModel: (req) => ipcRenderer.invoke("emb3r:download-custom-model", req),
  addLocalModel: () => ipcRenderer.invoke("emb3r:add-local-model"),
  removeCustomModel: (key) => ipcRenderer.invoke("emb3r:remove-custom-model", key),
  setSafeMode: (on, pin) => ipcRenderer.invoke("emb3r:set-safe-mode", on, pin),
  setSafeModePin: (pin, currentPin) => ipcRenderer.invoke("emb3r:set-safe-mode-pin", pin, currentPin),

  listMemories: () => ipcRenderer.invoke("emb3r:list-memories"),
  setMemoryEnabled: (on) => ipcRenderer.invoke("emb3r:set-memory-enabled", on),
  addMemory: (text) => ipcRenderer.invoke("emb3r:add-memory", text),
  deleteMemory: (id) => ipcRenderer.invoke("emb3r:delete-memory", id),

  listProfiles: () => ipcRenderer.invoke("emb3r:list-profiles"),
  createProfile: (name) => ipcRenderer.invoke("emb3r:create-profile", name),
  switchProfile: (id) => ipcRenderer.invoke("emb3r:switch-profile", id),
  deleteProfile: (id) => ipcRenderer.invoke("emb3r:delete-profile", id),

  scanHardware: () => ipcRenderer.invoke("emb3r:scan-hardware"),
  setupState: () => ipcRenderer.invoke("emb3r:setup-state"),
  probeDownloadSpeed: () => ipcRenderer.invoke("emb3r:probe-download-speed"),
  onHardwareUpdated: (callback) => {
    ipcRenderer.on("emb3r:hardware-updated", (_event, data) => callback(data));
  },
  listModels: () => ipcRenderer.invoke("emb3r:list-models"),
  downloadModel: (modelId) => ipcRenderer.invoke("emb3r:download-model", modelId),
  cancelDownload: (modelId) => ipcRenderer.invoke("emb3r:cancel-download", modelId),
  selectModel: (filename) => ipcRenderer.invoke("emb3r:select-model", filename),
  deleteModel: (filename) => ipcRenderer.invoke("emb3r:delete-model", filename),

  introState: () => ipcRenderer.invoke("emb3r:intro-state"),
  introComplete: () => ipcRenderer.invoke("emb3r:intro-complete"),
  setProfileName: (name) => ipcRenderer.invoke("emb3r:set-profile-name", name),
  onDownloadProgress: (callback) => {
    ipcRenderer.on("emb3r:download-progress", (_event, data) => callback(data));
  },

  setSpotifyClientId: (id) => ipcRenderer.invoke("emb3r:set-spotify-client-id", id),
  connectSpotify: () => ipcRenderer.invoke("emb3r:connect-spotify"),
  disconnectSpotify: () => ipcRenderer.invoke("emb3r:disconnect-spotify"),
  spotifyStatus: () => ipcRenderer.invoke("emb3r:spotify-status"),
  getNowPlaying: () => ipcRenderer.invoke("emb3r:get-now-playing"),
});
