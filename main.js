import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getLlama, LlamaChatSession } from "node-llama-cpp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "models")
  : path.join(__dirname, "models");
const CONFIG_PATH = path.join(app.getPath("userData"), "emb3r-config.json");
const DEFAULT_MODEL_FILE = "Llama-3.2-3B-Instruct-Q4_K_M.gguf";
const SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8888/callback";

function defaultConfig() {
  return {
    internetConsent: false,
    activeModel: DEFAULT_MODEL_FILE,
    profiles: [{ id: "default", name: "" }],
    activeProfileId: "default",
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
let modelLoadError = null;
let mainWindow = null;

function activeProfile() {
  return config.profiles.find((p) => p.id === config.activeProfileId) || config.profiles[0];
}

function systemPrompt() {
  const profile = activeProfile();
  const name = profile && profile.name ? `The user's name is ${profile.name}.` : "";
  return `You are Ember, a small terminal-dwelling AI companion living inside a retro desktop pet app. Keep replies concise and warm. ${name}`.trim();
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

function recommendTier(totalRamGB) {
  if (totalRamGB < 8) return "Small";
  if (totalRamGB < 16) return "Medium";
  if (totalRamGB < 32) return "Large";
  return "Extra Large";
}

// ---- Local model loading ----

async function loadLocalModel(filename) {
  const target = filename || config.activeModel || DEFAULT_MODEL_FILE;
  const modelPath = path.join(MODELS_DIR, target);

  if (!fs.existsSync(modelPath)) {
    modelLoadError = `Model file not found: ${target}. Download it from Settings first.`;
    chatSession = null;
    return;
  }

  console.log("Loading local model from:", modelPath);
  try {
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: modelPath });
    const context = await model.createContext();
    chatSession = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: systemPrompt() });
    modelLoadError = null;
    console.log("Local model loaded:", target);
  } catch (err) {
    console.error("GPU load failed, retrying on CPU only:", err.message);
    try {
      const llama = await getLlama({ gpu: false });
      const model = await llama.loadModel({ modelPath: modelPath });
      const context = await model.createContext({ contextSize: 4096 });
      chatSession = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: systemPrompt() });
      modelLoadError = null;
      console.log("Local model loaded on CPU fallback:", target);
    } catch (err2) {
      console.error("Local model failed to load entirely:", err2);
      modelLoadError = err2.message || String(err2);
      chatSession = null;
    }
  }
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

app.whenReady().then(async () => {
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
  mainWindow = createWindow();
  try {
    await loadLocalModel();
  } catch (err) {
    console.error("Unexpected error during model load:", err);
    modelLoadError = err.message || String(err);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- Config / consent IPC ----

ipcMain.handle("emb3r:get-config", () => {
  // never leak spotify tokens to the renderer
  const { spotifyAccessToken, spotifyRefreshToken, ...safe } = config;
  return safe;
});

ipcMain.handle("emb3r:set-internet-consent", (_e, granted) => {
  config.internetConsent = granted;
  saveConfig(config);
  return true;
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
  const totalRamGB = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
  const recommendedTier = recommendTier(totalRamGB);
  const models = MODEL_CATALOG.map((m) => ({
    ...m,
    downloaded: fs.existsSync(path.join(MODELS_DIR, m.file)),
    recommended: m.tier === recommendedTier,
  }));
  return { models, activeModel: config.activeModel, recommendedTier, totalRamGB };
});

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + ".part";
    const file = fs.createWriteStream(tmpPath);

    function request(currentUrl, redirectsLeft) {
      https.get(currentUrl, { headers: { "User-Agent": "emb3r-app" } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
          res.resume();
          request(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(tmpPath, () => {});
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (total > 0 && onProgress) onProgress(Math.round((downloaded / total) * 100));
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.rename(tmpPath, destPath, (err) => (err ? reject(err) : resolve()));
          });
        });
      }).on("error", (err) => {
        file.close();
        fs.unlink(tmpPath, () => {});
        reject(err);
      });
    }
    request(url, 5);
  });
}

ipcMain.handle("emb3r:download-model", async (_e, modelId) => {
  if (!config.internetConsent) return { success: false, error: "Internet access hasn't been granted yet." };
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!entry) return { success: false, error: "Unknown model." };
  const destPath = path.join(MODELS_DIR, entry.file);
  if (fs.existsSync(destPath)) return { success: true, alreadyDownloaded: true };
  const url = `https://huggingface.co/${entry.repo}/resolve/main/${entry.file}?download=true`;
  try {
    await downloadFile(url, destPath, (percent) => {
      if (mainWindow) mainWindow.webContents.send("emb3r:download-progress", { id: modelId, percent });
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle("emb3r:select-model", async (_e, filename) => {
  config.activeModel = filename;
  saveConfig(config);
  chatSession = null;
  modelLoadError = null;
  await loadLocalModel(filename);
  return { success: !modelLoadError, error: modelLoadError };
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

ipcMain.handle("emb3r:send-message", async (_event, userMessage) => {
  if (!chatSession) {
    return modelLoadError
      ? `Ember can't reply right now: ${modelLoadError}`
      : "Local model is still loading. Please wait...";
  }
  return await chatSession.prompt(userMessage);
});
