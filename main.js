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
// models live beside the config in userData rather than inside the app bundle:
// writing into the bundle breaks the code signature on macOS, needs privileges
// the app may not have, and loses every downloaded model on update
const MODELS_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "models")
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

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          resetStall();
          if (total > 0 && onProgress) onProgress(Math.round((downloaded / total) * 100));
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
      (percent) => {
        if (mainWindow) mainWindow.webContents.send("emb3r:download-progress", { id: modelId, percent });
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
  chatSession = null;
  modelLoadError = null;
  await loadLocalModel(filename);

  if (modelLoadError) {
    // the selection used to be saved before the load was attempted, so a model
    // that failed to load was still remembered and failed again on next launch
    const failure = modelLoadError;
    if (previous && previous !== filename) {
      modelLoadError = null;
      await loadLocalModel(previous);
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

ipcMain.handle("emb3r:send-message", async (_event, userMessage) => {
  if (!chatSession) {
    return modelLoadError
      ? `Ember can't reply right now: ${modelLoadError}`
      : "Local model is still loading. Please wait...";
  }
  return await chatSession.prompt(userMessage);
});
