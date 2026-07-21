import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
// electron-updater is CommonJS, and it defines `autoUpdater` via a lazy
// Object.defineProperty getter rather than a plain `exports.autoUpdater = `
// assignment. Node's static CJS-export scanner (cjs-module-lexer) does not
// reliably detect that pattern, so `import { autoUpdater } from
// "electron-updater"` throws "Named export 'autoUpdater' not found" at
// startup on every platform - this is not a bug in a single build, it is in
// the import statement itself. A default import always gets the whole
// module.exports object regardless of what the lexer could statically see,
// and destructuring at runtime correctly triggers the getter.
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
import { GoogleGenAI } from "@google/genai";

const RELEASES_URL = "https://github.com/FRENCHIIIFRIES/emb3r-ai/releases/latest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// models live beside the config in userData rather than inside the app bundle:
// writing into the bundle breaks the code signature on macOS, needs privileges
// the app may not have, and loses every downloaded model on update
const MODELS_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "models")
  : path.join(__dirname, "models");
const CONFIG_PATH = path.join(app.getPath("userData"), "emb3r-config.json");
// conversations are small JSON, not multi-gigabyte weights, so unlike
// MODELS_DIR there is no reason to keep them out of userData in dev mode
const CONVERSATIONS_DIR = path.join(app.getPath("userData"), "conversations");
const DEFAULT_MODEL_FILE = "Llama-3.2-3B-Instruct-Q4_K_M.gguf";
const SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8888/callback";
const DEFAULT_PERSONALITY =
  "You are Ember, a small terminal-dwelling AI companion living inside a retro desktop pet app. Keep replies concise and warm.";
const MAX_PERSONALITY_LENGTH = 2000;

function defaultConfig() {
  return {
    internetConsent: false,
    activeModel: DEFAULT_MODEL_FILE,
    profiles: [{ id: "default", name: "" }],
    activeProfileId: "default",
    // null means "use DEFAULT_PERSONALITY" - kept distinct from the empty
    // string, which a user could deliberately choose to give Ember no
    // instructions at all
    systemPrompt: null,
    // a secret, same handling as the spotify tokens below: written from the
    // renderer, never read back to it, and excluded from emb3r:get-config
    geminiApiKey: "",
    spotifyClientId: "",
    spotifyAccessToken: null,
    spotifyRefreshToken: null,
    spotifyTokenExpiry: 0,
  };
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    // merge with defaults so older config files gain new fields safely
    return { ...defaultConfig(), ...parsed };
  } catch {
    return defaultConfig();
  }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

let config = loadConfig();
let chatSession = null;
let chatSequence = null;
let modelLoadError = null;
let mainWindow = null;

function activeProfile() {
  return config.profiles.find((p) => p.id === config.activeProfileId) || config.profiles[0];
}

function systemPrompt() {
  const profile = activeProfile();
  const name = profile && profile.name ? `The user's name is ${profile.name}.` : "";
  const base = typeof config.systemPrompt === "string" ? config.systemPrompt : DEFAULT_PERSONALITY;
  return `${base} ${name}`.trim();
}

// ---- Model catalog (real, verified Hugging Face GGUF repos) ----

const MODEL_CATALOG = [
  { id: "llama-3.2-3b", name: "Llama 3.2 3B Instruct", tier: "Small", minRamGB: 4, sizeGB: 2.0,
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF", file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf" },
  { id: "qwen2.5-3b", name: "Qwen2.5 3B Instruct", tier: "Small", minRamGB: 4, sizeGB: 1.9,
    repo: "bartowski/Qwen2.5-3B-Instruct-GGUF", file: "Qwen2.5-3B-Instruct-Q4_K_M.gguf" },
  { id: "qwen2.5-7b", name: "Qwen2.5 7B Instruct", tier: "Medium", minRamGB: 8, sizeGB: 4.7,
    repo: "bartowski/Qwen2.5-7B-Instruct-GGUF", file: "Qwen2.5-7B-Instruct-Q4_K_M.gguf" },
  { id: "llama-3.1-8b", name: "Llama 3.1 8B Instruct", tier: "Medium", minRamGB: 8, sizeGB: 4.9,
    repo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", file: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf" },
  { id: "mistral-7b", name: "Mistral 7B Instruct v0.3", tier: "Medium", minRamGB: 8, sizeGB: 4.4,
    repo: "bartowski/Mistral-7B-Instruct-v0.3-GGUF", file: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf" },
  { id: "qwen2.5-14b", name: "Qwen2.5 14B Instruct", tier: "Large", minRamGB: 16, sizeGB: 9.0,
    repo: "bartowski/Qwen2.5-14B-Instruct-GGUF", file: "Qwen2.5-14B-Instruct-Q4_K_M.gguf" },
];

// the smallest model the machine can run, not the biggest it could hold.
// recommending the largest that fits meant a 16GB machine was offered a 9GB
// download on first launch, which is a poor first run: slow to fetch, slow to
// answer, and the most likely thing to fail. bigger models stay one click away
// in Settings.
function recommendModel(totalRamGB) {
  const fits = MODEL_CATALOG
    .filter((m) => m.minRamGB <= totalRamGB)
    .sort((a, b) => a.sizeGB - b.sizeGB);
  if (!fits.length) return null;
  // prefer the shipped default when it runs here - it is within 0.1GB of the
  // smallest entry, so there is no real cost to picking the better-known model
  return fits.find((m) => m.file === DEFAULT_MODEL_FILE) || fits[0];
}

function recommendTier(totalRamGB) {
  const model = recommendModel(totalRamGB);
  return model ? model.tier : "None";
}

function totalRamGB() {
  return Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
}

async function freeDiskGB(dir) {
  try {
    const stats = await fs.promises.statfs(dir);
    return (stats.bavail * stats.bsize) / (1024 ** 3);
  } catch {
    return null; // unsupported platform - skip the check rather than block
  }
}

// ---- Conversation storage ----
//
// One folder per profile under CONVERSATIONS_DIR, each conversation its own
// JSON file plus an index.json the renderer's history list reads from without
// having to open every conversation file just to show a title and a date.

let activeConversation = null; // { id, profileId, title, createdAt, updatedAt, messages }

function conversationsDirFor(profileId) {
  return path.join(CONVERSATIONS_DIR, profileId);
}

function conversationIndexPath(profileId) {
  return path.join(conversationsDirFor(profileId), "index.json");
}

function conversationFilePath(profileId, convId) {
  return path.join(conversationsDirFor(profileId), `${convId}.json`);
}

function readConversationIndex(profileId) {
  try {
    return JSON.parse(fs.readFileSync(conversationIndexPath(profileId), "utf-8"));
  } catch {
    return [];
  }
}

function writeConversationIndex(profileId, index) {
  fs.mkdirSync(conversationsDirFor(profileId), { recursive: true });
  fs.writeFileSync(conversationIndexPath(profileId), JSON.stringify(index, null, 2));
}

function loadConversationFile(profileId, convId) {
  try {
    return JSON.parse(fs.readFileSync(conversationFilePath(profileId, convId), "utf-8"));
  } catch {
    return null;
  }
}

function saveConversationFile(profileId, conv) {
  fs.mkdirSync(conversationsDirFor(profileId), { recursive: true });
  fs.writeFileSync(conversationFilePath(profileId, conv.id), JSON.stringify(conv, null, 2));

  const index = readConversationIndex(profileId).filter((c) => c.id !== conv.id);
  index.push({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt });
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  writeConversationIndex(profileId, index);
}

function deleteConversationFile(profileId, convId) {
  try {
    fs.unlinkSync(conversationFilePath(profileId, convId));
  } catch {
    // already gone - deleting an already-deleted conversation is not an error
  }
  writeConversationIndex(profileId, readConversationIndex(profileId).filter((c) => c.id !== convId));
}

function newConversation() {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: null, createdAt: now, updatedAt: now, messages: [] };
}

// first ~48 characters of the opening message, so the history list is
// scannable without opening every conversation
function deriveTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 48 ? clean.slice(0, 48) + "…" : clean;
}

// LlamaChatSession's own history format, distinct from the {role,text,ts}
// shape used on disk - kept separate so the storage format doesn't have to
// change if the library's shape ever does
function toChatHistory(conv) {
  const items = [{ type: "system", text: systemPrompt() }];
  for (const m of conv.messages) {
    items.push(m.role === "user" ? { type: "user", text: m.text } : { type: "model", response: [m.text] });
  }
  return items;
}

// loads convId if given and it exists, otherwise starts a fresh conversation,
// makes it the active one, and - if a session is already loaded - replays it
// into the model so continuing an old conversation actually carries memory of
// it rather than just showing old text above a blank context
function attachConversation(profileId, convId) {
  const conv = (convId && loadConversationFile(profileId, convId)) || newConversation();
  activeConversation = { ...conv, profileId };

  if (chatSession) {
    try {
      chatSession.setChatHistory(toChatHistory(activeConversation));
    } catch (err) {
      console.error("Could not restore conversation history:", err);
    }
  }

  const profile = config.profiles.find((p) => p.id === profileId);
  if (profile && profile.lastConversationId !== activeConversation.id) {
    profile.lastConversationId = activeConversation.id;
    saveConfig(config);
  }

  return activeConversation;
}

// ---- Local model loading ----

// window creation and model loading run concurrently - the renderer's boot
// animation reliably finishes well before a multi-gigabyte model does, so the
// renderer cannot just ask for the active conversation once at boot and
// expect an answer. It listens for this instead, which fires at every exit
// path of loadLocalModel, success or failure, so it never waits forever.
function notifyModelReady() {
  if (mainWindow) {
    mainWindow.webContents.send("emb3r:model-ready", { ready: !!chatSession, error: modelLoadError });
  }
}

async function loadLocalModel(filename, { conversationId } = {}) {
  const target = filename || config.activeModel || DEFAULT_MODEL_FILE;
  const modelPath = path.join(MODELS_DIR, target);

  if (!fs.existsSync(modelPath)) {
    modelLoadError = `Model file not found: ${target}. Download it from Settings first.`;
    chatSession = null;
    notifyModelReady();
    return;
  }

  console.log("Loading local model from:", modelPath);
  try {
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: modelPath });
    const context = await model.createContext();
    // keep the sequence: it is the only way to read how full the context is
    chatSequence = context.getSequence();
    chatSession = new LlamaChatSession({ contextSequence: chatSequence, systemPrompt: systemPrompt() });
    modelLoadError = null;
    console.log("Local model loaded:", target);
  } catch (err) {
    console.error("GPU load failed, retrying on CPU only:", err.message);
    try {
      const llama = await getLlama({ gpu: false });
      const model = await llama.loadModel({ modelPath: modelPath });
      const context = await model.createContext({ contextSize: 4096 });
      chatSequence = context.getSequence();
      chatSession = new LlamaChatSession({ contextSequence: chatSequence, systemPrompt: systemPrompt() });
      modelLoadError = null;
      console.log("Local model loaded on CPU fallback:", target);
    } catch (err2) {
      console.error("Local model failed to load entirely:", err2);
      modelLoadError = err2.message || String(err2);
      chatSession = null;
    }
  }

  if (chatSession) {
    const profile = activeProfile();
    // an explicit conversationId (passed when only the model changed, not the
    // profile) continues that conversation; otherwise fall back to whichever
    // conversation this profile was last in, or start a new one
    attachConversation(profile.id, conversationId || profile.lastConversationId);
  }

  notifyModelReady();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "src", "index.html"));
  return win;
}

// quitting or crashing mid-download leaves a .part behind that nothing else
// will ever claim, so sweep them at startup rather than letting them accumulate
function clearPartialDownloads() {
  try {
    for (const name of fs.readdirSync(MODELS_DIR)) {
      if (name.endsWith(".part")) fs.unlinkSync(path.join(MODELS_DIR, name));
    }
  } catch (err) {
    console.error("Could not clear partial downloads:", err);
  }
}

// ---- Auto-update ----
//
// Checking is automatic; downloading is not. The button in Settings is what
// starts a download, matching "let them download the update from the app"
// rather than a silent background install the user never asked for.
//
// macOS needs a channel split that Windows does not. electron-builder names
// the update feed file the same regardless of mac architecture - both the
// arm64 and x64 builds would independently produce "latest-mac.yml" and
// collide when uploaded to the same GitHub release (confirmed by reading
// app-builder-lib's own update-info generator: it only adds an arch suffix on
// Linux). The CI workflow builds the arm64 job under a distinct "arm64"
// channel for exactly this reason, so the client has to ask for that same
// channel on arm64 Macs or it will fetch the Intel build's feed and offer to
// "update" to a binary that will not run.
if (process.platform === "darwin" && process.arch === "arm64") {
  autoUpdater.channel = "arm64";
}
autoUpdater.autoDownload = false;

function sendUpdateStatus(payload) {
  if (mainWindow) mainWindow.webContents.send("emb3r:update-status", payload);
}

autoUpdater.on("checking-for-update", () => sendUpdateStatus({ state: "checking" }));
autoUpdater.on("update-available", (info) => sendUpdateStatus({ state: "available", version: info.version }));
autoUpdater.on("update-not-available", (info) => sendUpdateStatus({ state: "not-available", version: info.version }));
autoUpdater.on("download-progress", (p) => {
  sendUpdateStatus({ state: "downloading", percent: p.percent, transferred: p.transferred, total: p.total });
});
autoUpdater.on("update-downloaded", (info) => sendUpdateStatus({ state: "downloaded", version: info.version }));
autoUpdater.on("error", (err) => {
  console.error("Update error:", err);
  // this is the path an unsigned macOS build is expected to take: Squirrel.Mac
  // refuses to apply an update whose signature does not match a Developer ID
  // it trusts, and an ad-hoc signature is not one. Whatever the cause, the
  // fallback is the same either way - point at the page they'd have used
  // before this feature existed.
  sendUpdateStatus({ state: "error", message: err.message || String(err), releasesUrl: RELEASES_URL });
});

ipcMain.handle("emb3r:get-app-version", () => app.getVersion());

ipcMain.handle("emb3r:check-for-updates", async () => {
  if (!app.isPackaged) return { success: false, error: "Updates are only available in the packaged app." };
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle("emb3r:download-update", async () => {
  if (!app.isPackaged) return { success: false, error: "Updates are only available in the packaged app." };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle("emb3r:install-update", () => {
  // isSilent defaults to false, which on Windows shows the same assisted
  // installer UI a first-time install would - deliberately not overridden,
  // matching the oneClick:false choice already made for a fresh install
  autoUpdater.quitAndInstall();
  return { success: true };
});

ipcMain.handle("emb3r:open-releases-page", () => {
  shell.openExternal(RELEASES_URL);
});

app.whenReady().then(async () => {
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
  clearPartialDownloads();
  mainWindow = createWindow();
  try {
    await loadLocalModel();
  } catch (err) {
    console.error("Unexpected error during model load:", err);
    modelLoadError = err.message || String(err);
  }

  // a few seconds after launch, not competing with model loading for
  // attention, and not the very first thing a user sees
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => console.error("Startup update check failed:", err));
    }, 5000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- Config / consent IPC ----

ipcMain.handle("emb3r:get-config", () => {
  // never leak spotify tokens or the gemini key to the renderer
  const { spotifyAccessToken, spotifyRefreshToken, geminiApiKey, ...safe } = config;
  return safe;
});

ipcMain.handle("emb3r:set-internet-consent", (_e, granted) => {
  config.internetConsent = granted;
  saveConfig(config);
  return true;
});

// ---- Personality ----

// swaps just the system entry rather than reloading the model, since the rest
// of the conversation should survive a personality change
function refreshSystemPrompt() {
  if (!chatSession) return;
  try {
    const history = chatSession.getChatHistory().filter((h) => h.type !== "system");
    chatSession.setChatHistory([{ type: "system", text: systemPrompt() }, ...history]);
  } catch (err) {
    console.error("Could not refresh personality:", err);
  }
}

ipcMain.handle("emb3r:get-personality", () => ({
  current: config.systemPrompt,
  isDefault: config.systemPrompt === null,
  defaultPrompt: DEFAULT_PERSONALITY,
  maxLength: MAX_PERSONALITY_LENGTH,
}));

ipcMain.handle("emb3r:set-personality", (_e, text) => {
  if (typeof text !== "string") return { success: false, error: "Personality must be text." };
  // an empty string is a deliberate choice to give Ember no instructions at
  // all, and is kept distinct from null ("use the default")
  config.systemPrompt = text.slice(0, MAX_PERSONALITY_LENGTH);
  saveConfig(config);
  refreshSystemPrompt();
  return { success: true };
});

ipcMain.handle("emb3r:reset-personality", () => {
  config.systemPrompt = null;
  saveConfig(config);
  refreshSystemPrompt();
  return { success: true, defaultPrompt: DEFAULT_PERSONALITY };
});

// ---- Account / profile system ----

ipcMain.handle("emb3r:list-profiles", () => ({
  profiles: config.profiles,
  activeProfileId: config.activeProfileId,
}));

ipcMain.handle("emb3r:create-profile", (_e, name) => {
  const trimmed = (name || "").trim();
  if (!trimmed) return { success: false, error: "Name can't be empty." };
  const id = `p_${Date.now()}`;
  config.profiles.push({ id, name: trimmed });
  config.activeProfileId = id;
  saveConfig(config);
  if (chatSession) chatSession = null; // force system prompt refresh with new name next message
  loadLocalModel(); // reload session so system prompt picks up new profile name
  return { success: true, profiles: config.profiles, activeProfileId: config.activeProfileId };
});

ipcMain.handle("emb3r:switch-profile", (_e, id) => {
  const exists = config.profiles.find((p) => p.id === id);
  if (!exists) return { success: false, error: "Profile not found." };
  config.activeProfileId = id;
  saveConfig(config);
  chatSession = null;
  loadLocalModel();
  return { success: true, profiles: config.profiles, activeProfileId: config.activeProfileId };
});

ipcMain.handle("emb3r:delete-profile", (_e, id) => {
  if (config.profiles.length <= 1) return { success: false, error: "Can't delete the only profile." };
  config.profiles = config.profiles.filter((p) => p.id !== id);
  if (config.activeProfileId === id) {
    config.activeProfileId = config.profiles[0].id;
    chatSession = null;
    loadLocalModel();
  }
  saveConfig(config);
  return { success: true, profiles: config.profiles, activeProfileId: config.activeProfileId };
});

// ---- Hardware scanning ----

ipcMain.handle("emb3r:scan-hardware", () => {
  const totalRamGB = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
  const freeRamGB = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  const cpus = os.cpus();
  const cpuModel = cpus.length ? cpus[0].model : "Unknown CPU";
  const cpuCores = cpus.length;
  const platform = `${os.platform()} ${os.arch()}`;
  const recommendedTier = recommendTier(totalRamGB);
  return { totalRamGB, freeRamGB, cpuModel, cpuCores, platform, recommendedTier };
});

// ---- Model catalog / download / select ----

ipcMain.handle("emb3r:list-models", () => {
  const ram = totalRamGB();
  const best = recommendModel(ram);
  const models = MODEL_CATALOG.map((m) => ({
    ...m,
    downloaded: fs.existsSync(path.join(MODELS_DIR, m.file)),
    recommended: best ? m.id === best.id : false,
    fitsRam: m.minRamGB <= ram,
  }));
  return {
    models,
    activeModel: config.activeModel,
    recommendedTier: recommendTier(ram),
    recommendedId: best ? best.id : null,
    totalRamGB: ram,
  };
});

// drives the first-run screen: with no model on disk the app cannot answer
// anything, so it needs to say so up front rather than surfacing a load error
ipcMain.handle("emb3r:setup-state", async () => {
  const ram = totalRamGB();
  const best = recommendModel(ram);
  const anyDownloaded = MODEL_CATALOG.some((m) => fs.existsSync(path.join(MODELS_DIR, m.file)));
  const cpus = os.cpus();

  return {
    needsSetup: !anyDownloaded,
    totalRamGB: ram,
    freeDiskGB: await freeDiskGB(MODELS_DIR),
    cpuModel: cpus.length ? cpus[0].model : "Unknown CPU",
    cpuCores: cpus.length,
    platform: `${os.platform()} ${os.arch()}`,
    recommended: best,
  };
});

// a model download is gigabytes over many minutes, so a dead connection has to
// be detected by silence rather than by any sensible overall deadline
const DOWNLOAD_STALL_MS = 60_000;

function downloadFile(url, destPath, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + ".part";
    const file = fs.createWriteStream(tmpPath);

    let settled = false;
    let stallTimer = null;
    let currentReq = null;

    // every failure path has to drop the partial file, otherwise a cancelled or
    // broken download leaves gigabytes of .part behind
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      if (currentReq) currentReq.destroy();
      file.destroy();
      fs.unlink(tmpPath, () => {});
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      resolve();
    };

    file.on("error", fail);

    if (signal) {
      if (signal.aborted) return fail(new Error("Download cancelled."));
      signal.addEventListener("abort", () => fail(new Error("Download cancelled.")), { once: true });
    }

    function request(currentUrl, redirectsLeft) {
      let parsed;
      try {
        parsed = new URL(currentUrl);
      } catch {
        return fail(new Error("Malformed download URL."));
      }
      // a redirect must never be able to downgrade the transport
      if (parsed.protocol !== "https:") {
        return fail(new Error(`Refusing to download over ${parsed.protocol.replace(":", "")}.`));
      }

      currentReq = https.get(currentUrl, { headers: { "User-Agent": "emb3r-app" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return fail(new Error("Too many redirects."));
          res.resume();
          // Location is allowed to be relative
          return request(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;

        const resetStall = () => {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(
            () => fail(new Error("Download stalled - no data received for 60 seconds.")),
            DOWNLOAD_STALL_MS,
          );
        };
        resetStall();

        // throttle progress events: a multi-gigabyte download fires "data" many
        // thousands of times a second, and repainting the bar that often is
        // wasted work in the renderer
        let lastEmit = 0;
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          resetStall();
          if (!onProgress || total <= 0) return;
          const now = Date.now();
          if (now - lastEmit < 100 && downloaded < total) return;
          lastEmit = now;
          onProgress({
            percent: Math.round((downloaded / total) * 100),
            downloaded,
            total,
          });
        });
        res.on("error", fail);
        res.pipe(file);

        file.on("finish", () => {
          clearTimeout(stallTimer);
          // a truncated response still fires finish, so size has to be checked
          // before the file is promoted to its real name
          if (total > 0 && downloaded !== total) {
            return fail(new Error(`Download incomplete: received ${downloaded} of ${total} bytes.`));
          }
          file.close((err) => {
            if (err) return fail(err);
            fs.rename(tmpPath, destPath, (renameErr) => (renameErr ? fail(renameErr) : succeed()));
          });
        });
      });

      currentReq.on("error", fail);
    }

    request(url, 5);
  });
}

const activeDownloads = new Map();

ipcMain.handle("emb3r:download-model", async (_e, modelId) => {
  if (!config.internetConsent) return { success: false, error: "Internet access hasn't been granted yet." };
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!entry) return { success: false, error: "Unknown model." };
  const destPath = path.join(MODELS_DIR, entry.file);
  if (fs.existsSync(destPath)) return { success: true, alreadyDownloaded: true };
  if (activeDownloads.has(modelId)) return { success: false, error: "That model is already downloading." };

  // minRamGB was previously shown in the UI but never enforced, so a machine
  // could download a model that could only ever fail to load
  const ram = totalRamGB();
  if (entry.minRamGB > ram) {
    return {
      success: false,
      error: `${entry.name} needs ${entry.minRamGB}GB of RAM and this machine has ${ram}GB.`,
    };
  }

  // no point spending an hour on a download that cannot fit when it lands
  const free = await freeDiskGB(MODELS_DIR);
  if (free !== null && free < entry.sizeGB * 1.1) {
    return {
      success: false,
      error: `Need about ${Math.ceil(entry.sizeGB * 1.1)}GB free and only ${free.toFixed(1)}GB is available.`,
    };
  }

  const controller = new AbortController();
  activeDownloads.set(modelId, controller);

  const url = `https://huggingface.co/${entry.repo}/resolve/main/${entry.file}?download=true`;
  try {
    await downloadFile(
      url,
      destPath,
      ({ percent, downloaded, total }) => {
        if (mainWindow) {
          mainWindow.webContents.send("emb3r:download-progress", { id: modelId, percent, downloaded, total });
        }
      },
      controller.signal,
    );
    return { success: true };
  } catch (err) {
    // a cancellation is a deliberate act, not a failure to report as one
    if (controller.signal.aborted) return { success: false, cancelled: true };
    return { success: false, error: err.message || String(err) };
  } finally {
    activeDownloads.delete(modelId);
  }
});

ipcMain.handle("emb3r:cancel-download", (_e, modelId) => {
  const controller = activeDownloads.get(modelId);
  if (!controller) return { success: false, error: "No download in progress for that model." };
  controller.abort();
  return { success: true };
});

ipcMain.handle("emb3r:select-model", async (_e, filename) => {
  const entry = MODEL_CATALOG.find((m) => m.file === filename);
  const ram = totalRamGB();
  if (entry && entry.minRamGB > ram) {
    return {
      success: false,
      error: `${entry.name} needs ${entry.minRamGB}GB of RAM and this machine has ${ram}GB.`,
    };
  }

  const previous = config.activeModel;
  // switching models should not start a new conversation - only a profile
  // switch does that. loadLocalModel defaults to the profile's last
  // conversation when none is given, which would otherwise re-attach whatever
  // was active before this one rather than the one just in use
  const conversationId = activeConversation ? activeConversation.id : undefined;
  chatSession = null;
  modelLoadError = null;
  await loadLocalModel(filename, { conversationId });

  if (modelLoadError) {
    // the selection used to be saved before the load was attempted, so a model
    // that failed to load was still remembered and failed again on next launch
    const failure = modelLoadError;
    if (previous && previous !== filename) {
      modelLoadError = null;
      await loadLocalModel(previous, { conversationId });
    }
    return { success: false, error: failure };
  }

  config.activeModel = filename;
  saveConfig(config);
  return { success: true };
});

// ---- Spotify integration (PKCE, no client secret needed) ----

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function waitForSpotifyCallback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, SPOTIFY_REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body style='font-family:monospace;background:#0b0f0b;color:#7CFF9E;padding:40px'>Spotify connected. You can close this tab and return to emb3r.</body></html>");
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No code received"));
    });
    server.listen(8888);
    setTimeout(() => {
      server.close(() => {});
      reject(new Error("Spotify login timed out"));
    }, 120000);
  });
}

ipcMain.handle("emb3r:set-spotify-client-id", (_e, id) => {
  config.spotifyClientId = (id || "").trim();
  saveConfig(config);
  return true;
});

ipcMain.handle("emb3r:connect-spotify", async () => {
  if (!config.internetConsent) return { success: false, error: "Grant internet access first." };
  if (!config.spotifyClientId) return { success: false, error: "Set your Spotify Client ID first." };
  try {
    const { verifier, challenge } = generatePKCE();
    const params = new URLSearchParams({
      client_id: config.spotifyClientId,
      response_type: "code",
      redirect_uri: SPOTIFY_REDIRECT_URI,
      scope: "user-read-currently-playing user-read-playback-state",
      code_challenge_method: "S256",
      code_challenge: challenge,
    });
    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    const callbackPromise = waitForSpotifyCallback();
    shell.openExternal(authUrl);
    const code = await callbackPromise;

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: config.spotifyClientId,
        code_verifier: verifier,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || "Token exchange failed");

    config.spotifyAccessToken = tokenData.access_token;
    config.spotifyRefreshToken = tokenData.refresh_token;
    config.spotifyTokenExpiry = Date.now() + tokenData.expires_in * 1000;
    saveConfig(config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle("emb3r:disconnect-spotify", () => {
  config.spotifyAccessToken = null;
  config.spotifyRefreshToken = null;
  config.spotifyTokenExpiry = 0;
  saveConfig(config);
  return true;
});

ipcMain.handle("emb3r:spotify-status", () => ({ connected: !!config.spotifyAccessToken }));

async function ensureSpotifyToken() {
  if (!config.spotifyAccessToken) return false;
  if (Date.now() < config.spotifyTokenExpiry - 5000) return true;
  if (!config.spotifyRefreshToken) return false;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.spotifyRefreshToken,
        client_id: config.spotifyClientId,
      }),
    });
    const data = await res.json();
    if (!res.ok) return false;
    config.spotifyAccessToken = data.access_token;
    config.spotifyTokenExpiry = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) config.spotifyRefreshToken = data.refresh_token;
    saveConfig(config);
    return true;
  } catch {
    return false;
  }
}

ipcMain.handle("emb3r:get-now-playing", async () => {
  const ok = await ensureSpotifyToken();
  if (!ok) return { connected: false, playing: false };
  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${config.spotifyAccessToken}` },
    });
    if (res.status === 204) return { connected: true, playing: false };
    if (!res.ok) return { connected: true, playing: false };
    const data = await res.json();
    if (!data || !data.item) return { connected: true, playing: false };
    return {
      connected: true,
      playing: !!data.is_playing,
      track: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(", "),
    };
  } catch (err) {
    return { connected: true, playing: false, error: err.message };
  }
});

// ---- Message handling ----

let activeGeneration = null;

// ---- Gemini web access ----
//
// A conservative, local, keyword-based guess at whether a question needs
// information newer than any model's training cutoff. This app's whole pitch
// is staying offline, so a false negative - the local model answering as it
// always has - is the safe direction to fail in. A false positive would
// silently send a local prompt to Google, which is the direction to avoid,
// so the list stays narrow and no LLM call is used to make this decision.
function needsCurrentInfo(text) {
  const t = text.toLowerCase();
  // "current" alone is here for phrasings like "current price of X", at the
  // acknowledged cost of also matching unrelated senses of the word (electrical
  // current, current draw) - a keyword list cannot disambiguate word sense, and
  // the safe failure mode (an occasional unnecessary web lookup, gated behind
  // consent and a configured key either way) is preferable to missing genuine
  // "what's happening right now" questions that use the word "current"
  const currentInfoPhrases = [
    "today", "right now", "current", "currently", "at the moment",
    "this week", "this month", "this year",
    "latest", "recent", "recently", "up to date", "up-to-date",
    "news", "weather", "forecast",
    "price of", "stock price", "share price", "exchange rate", "crypto price",
    "who won", "election result", "results of", "score",
    "what happened", "what's happening",
  ];
  if (currentInfoPhrases.some((p) => t.includes(p))) return true;

  // a year mentioned that is this year or later reads as wanting current
  // information even without any of the phrases above - "what's new in 2026"
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch && parseInt(yearMatch[1], 10) >= new Date().getFullYear()) return true;

  return false;
}

let geminiClient = null;
let geminiClientKey = null; // the key the cached client was built with

function getGeminiClient() {
  if (!config.geminiApiKey) return null;
  if (!geminiClient || geminiClientKey !== config.geminiApiKey) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    geminiClientKey = config.geminiApiKey;
  }
  return geminiClient;
}

const GEMINI_MODEL = "gemini-2.5-flash";

// answers one message via Gemini with Google Search grounding enabled,
// streaming through the same onTextChunk shape the local model uses so the
// renderer's existing streaming UI does not need a second code path
async function answerWithGemini(userMessage, onTextChunk, signal) {
  const client = getGeminiClient();
  if (!client) throw new Error("No Gemini API key configured.");

  const stream = await client.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: userMessage,
    config: { tools: [{ googleSearch: {} }] },
  });

  let text = "";
  let sources = [];
  for await (const chunk of stream) {
    if (signal.aborted) break;
    if (chunk.text) {
      text += chunk.text;
      onTextChunk(chunk.text);
    }
    const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      sources = chunks.map((c) => c.web).filter((w) => w?.uri).map((w) => ({ title: w.title || w.uri, uri: w.uri }));
    }
  }
  return { text, sources };
}

ipcMain.handle("emb3r:gemini-key-status", () => ({ configured: Boolean(config.geminiApiKey) }));

ipcMain.handle("emb3r:set-gemini-key", (_e, key) => {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed) return { success: false, error: "Enter a key first." };
  config.geminiApiKey = trimmed;
  saveConfig(config);
  geminiClient = null; // rebuild with the new key next time it's used
  return { success: true };
});

ipcMain.handle("emb3r:clear-gemini-key", () => {
  config.geminiApiKey = "";
  saveConfig(config);
  geminiClient = null;
  return { success: true };
});

// how full the context is. node-llama-cpp shifts context automatically once it
// fills, silently dropping the oldest turns - so this is really a "how soon
// will Ember start forgetting" gauge rather than a crash warning
function contextUsage() {
  if (!chatSequence) return null;
  try {
    return { used: chatSequence.nextTokenIndex, size: chatSequence.contextSize };
  } catch {
    return null;
  }
}

function generationStats(chunks, startedAt) {
  const seconds = (Date.now() - startedAt) / 1000;
  return {
    // onTextChunk fires per chunk of text rather than per token, so this is a
    // close approximation rather than an exact token count
    tokensPerSec: seconds > 0 ? chunks / seconds : 0,
    context: contextUsage(),
  };
}

ipcMain.handle("emb3r:send-message", async (_event, userMessage, opts = {}) => {
  if (!chatSession) {
    return {
      success: false,
      error: modelLoadError
        ? `Ember can't reply right now: ${modelLoadError}`
        : "Local model is still loading. Please wait...",
    };
  }
  if (activeGeneration) return { success: false, error: "Ember is already replying." };

  // a Gemini key configured with no consent granted must never fire silently -
  // the renderer catches needsConsent, shows the same modal already used for
  // model downloads, and resends with forceLocal or after consent is granted
  const wantsGemini = Boolean(config.geminiApiKey) && !opts.forceLocal && needsCurrentInfo(userMessage);
  if (wantsGemini && !config.internetConsent) {
    return { success: false, needsConsent: true, error: "This looks like it needs current information from the web." };
  }

  const controller = new AbortController();
  activeGeneration = controller;

  const startedAt = Date.now();
  let chunks = 0;
  let lastStatAt = 0;
  const onTextChunk = (chunk) => {
    chunks++;
    if (!mainWindow) return;
    mainWindow.webContents.send("emb3r:token", { text: chunk });
    // stats are for glancing at, so a few updates a second is plenty
    const now = Date.now();
    if (now - lastStatAt > 250) {
      lastStatAt = now;
      mainWindow.webContents.send("emb3r:gen-stats", generationStats(chunks, startedAt));
    }
  };

  try {
    let text, sources;
    const source = wantsGemini ? "gemini" : "local";
    // sent explicitly either way, so the renderer never has to assume "no
    // event means local" - it always knows which one is about to answer
    if (mainWindow) mainWindow.webContents.send("emb3r:answer-source", { source });

    if (wantsGemini) {
      ({ text, sources } = await answerWithGemini(userMessage, onTextChunk, controller.signal));
    } else {
      text = await chatSession.prompt(userMessage, {
        signal: controller.signal,
        // stop cleanly on abort instead of throwing, so pressing stop keeps
        // whatever Ember had already said
        stopOnAbortSignal: true,
        onTextChunk,
      });
    }

    // an empty reply means generation was stopped before anything came out -
    // nothing meaningful happened, so there is nothing worth persisting
    if (text && activeConversation) {
      const now = Date.now();
      const isFirstExchange = activeConversation.messages.length === 0;
      activeConversation.messages.push({ role: "user", text: userMessage, ts: now, source });
      activeConversation.messages.push({ role: "model", text, ts: now, source, sources });
      activeConversation.updatedAt = now;
      if (isFirstExchange) activeConversation.title = deriveTitle(userMessage);
      saveConversationFile(activeConversation.profileId, activeConversation);
      if (mainWindow) {
        mainWindow.webContents.send("emb3r:conversation-saved", {
          id: activeConversation.id,
          title: activeConversation.title,
        });
      }

      // a Gemini exchange never went through chatSession.prompt(), so the
      // local model's own history has no idea it happened. Replaying the
      // full persisted transcript keeps a mixed conversation coherent if the
      // next message goes back to the local model.
      if (wantsGemini) {
        try {
          chatSession.setChatHistory(toChatHistory(activeConversation));
        } catch (err) {
          console.error("Could not sync Gemini turn into local history:", err);
        }
      }
    }

    // sent once, here, after any Gemini-turn sync above - the renderer only
    // ever displays the pushed event stream, never the stats in the return
    // value below, so sending this earlier would have left the visible
    // context-usage figure showing pre-sync numbers until the next message
    if (mainWindow) mainWindow.webContents.send("emb3r:gen-stats", generationStats(chunks, startedAt));

    return {
      success: true,
      text,
      source,
      sources,
      stopped: controller.signal.aborted,
      stats: generationStats(chunks, startedAt),
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    activeGeneration = null;
  }
});

ipcMain.handle("emb3r:stop-generation", () => {
  if (!activeGeneration) return { success: false, error: "Nothing is generating." };
  activeGeneration.abort();
  return { success: true };
});

ipcMain.handle("emb3r:context-usage", () => contextUsage());

// ---- Conversation history IPC ----

ipcMain.handle("emb3r:get-active-conversation", () => {
  if (!activeConversation) return null;
  const { id, title, messages } = activeConversation;
  return { id, title, messages };
});

ipcMain.handle("emb3r:list-conversations", () => {
  const profile = activeProfile();
  if (!profile) return [];
  return readConversationIndex(profile.id);
});

ipcMain.handle("emb3r:new-conversation", () => {
  const profile = activeProfile();
  if (!profile) return { success: false, error: "No active profile." };
  const conv = attachConversation(profile.id, null);
  return { success: true, id: conv.id };
});

ipcMain.handle("emb3r:load-conversation", (_e, convId) => {
  const profile = activeProfile();
  if (!profile) return { success: false, error: "No active profile." };
  const conv = attachConversation(profile.id, convId);
  return { success: true, id: conv.id, title: conv.title, messages: conv.messages };
});

ipcMain.handle("emb3r:delete-conversation", (_e, convId) => {
  const profile = activeProfile();
  if (!profile) return { success: false, error: "No active profile." };
  deleteConversationFile(profile.id, convId);
  // deleting the conversation you are currently in needs somewhere to land -
  // the next most recent one, or a fresh conversation if none are left
  if (activeConversation && activeConversation.id === convId) {
    const index = readConversationIndex(profile.id);
    attachConversation(profile.id, index[0] ? index[0].id : null);
  }
  return { success: true, activeId: activeConversation ? activeConversation.id : null };
});
