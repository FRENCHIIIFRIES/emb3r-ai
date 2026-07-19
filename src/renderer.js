const faceEl = document.getElementById("face-text");
const moodEl   = document.getElementById("mood");
const statusEl = document.getElementById("status");
const chat     = document.getElementById("chat");
const input    = document.getElementById("input");
const send     = document.getElementById("send");
const uploadButton = document.getElementById("uploadButton");
const fileInput    = document.getElementById("fileInput");
const appEl    = document.getElementById("app");
const petEl    = document.getElementById("pet");
const bootScreen = document.getElementById("bootScreen");
const bootThree = document.getElementById("bootThree");

const THREE_GLYPH = [
"██████╗ ",
"╚════██╗",
" █████╔╝",
" ╚═══██╗",
"██████╔╝",
"╚═════╝ ",
].join("\n");

const FLAME_FRAMES = [
[
"  .^    ",
"  :*:   ",
" ;xXx;  ",
" x#@#x  ",
"x@@#@@x ",
"@@@@@@@@",
],
[
"    ^.  ",
"   :*:  ",
"  ;xXx; ",
"  x#@#x ",
" x@@#@@x",
"@@@@@@@@",
],
[
"        ",
"  .;.   ",
" ;x@x;  ",
" x@@@x  ",
"x@@@@@x ",
"@@@@@@@@",
],
[
" .:^:.  ",
" :x*x:  ",
";x@#@x; ",
"x@@#@@x ",
"x@@@@@x ",
"@@@@@@@@",
],
[
"   :    ",
"   x    ",
"  x@x   ",
" x@@@x  ",
" @@@@@  ",
"@@@@@@@@",
],
[
"  .  .  ",
"  ;* :  ",
" ;x@x;  ",
" x@@@x  ",
"x@@@@@x ",
"@@@@@@@@",
],
].map(f => f.join("\n"));

// index 3 is the brightest "peak" frame - flag it so the JS can give it an extra flash color
const FLAME_PEAK_INDEX = 3;

const FACES = {
  idle:     "( ^_^ )",
  think1:   "( o_o )",
  think2:   "( -_- )",
  happy:    "( ^o^ )",
  sad:      "( ;_; )",
  sleeping: "( u_u ) zZz",
  error:    "( x_x )",
  music1:   "( ᵔ◡ᵔ )♪",
  music2:   "( ᵔ◡ᵔ )♫",
};

let mood   = 5;
let thinkTimer = null;
let idleTimer  = null;
let sleepTimer = null;
let moodDecayTimer = null;

let pendingUpload = null;

function bar(n) {
  n = Math.max(0, Math.min(5, n));
  return "#".repeat(n) + "-".repeat(5 - n);
}

function renderStats() {
  moodEl.textContent = bar(mood);
}

function setStatus(s) {
  statusEl.textContent = (s + "               ").slice(0, 15);
}

function setFace(state) {
  faceEl.textContent = FACES[state] || FACES.idle;
}

function stopThinking() {
  if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; }
}

function startThinking() {
  stopThinking();
  let flip = false;
  setFace("think1");
  thinkTimer = setInterval(() => {
    flip = !flip;
    setFace(flip ? "think2" : "think1");
  }, 400);
}

function resetIdleTimers() {
  if (idleTimer)  clearTimeout(idleTimer);
  if (sleepTimer) clearTimeout(sleepTimer);
  idleTimer = setTimeout(() => {
    if (!thinkTimer) { setFace(mood <= 2 ? "sad" : "idle"); setStatus("idle"); }
  }, 60_000);
  sleepTimer = setTimeout(() => {
    if (!thinkTimer) { setFace("sleeping"); setStatus("sleeping"); }
  }, 120_000);
}

function startMoodDecay() {
  if (moodDecayTimer) clearInterval(moodDecayTimer);
  moodDecayTimer = setInterval(() => {
    mood = Math.max(0, mood - 1);
    renderStats();
    if (!thinkTimer && mood <= 2) setFace("sad");
  }, 45_000);
}

function append(kind, who, text) {
  const line = document.createElement("div");
  line.className = kind;
  line.textContent = `${who} > ${text}`;
  chat.appendChild(line);
  chat.scrollTop = chat.scrollHeight;
}

// =============================
// Sound effects
// =============================

let audioCtx = null;
let soundsEnabled = true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function beep(freq, duration, type = "square", volume = 0.05) {
  if (!soundsEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playKeyClick() { beep(180 + Math.random() * 60, 0.02, "square", 0.02); }
function playSendBeep() { beep(660, 0.08, "square", 0.05); setTimeout(() => beep(880, 0.08, "square", 0.05), 90); }
function playReplyBeep() { beep(520, 0.1, "square", 0.04); }
function playErrorBeep() { beep(120, 0.25, "sawtooth", 0.05); }

function playBootChime() {
  // Game Boy style rising two-tone chime
  beep(523.25, 0.18, "square", 0.05); // C5
  setTimeout(() => beep(659.25, 0.18, "square", 0.05), 140); // E5
  setTimeout(() => beep(783.99, 0.3, "square", 0.06), 280);  // G5
}

input.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") playKeyClick();
});

// =============================
// Send
// =============================

async function onSend() {
  const text = input.value.trim();
  if (!text && !pendingUpload) return;
  input.value = "";
  send.disabled = true;
  petEl.classList.add("compact");

  playSendBeep();

  let messageToSend = text;
  if (pendingUpload) {
    append("sys", "sys", `attached: ${pendingUpload.name}`);
    messageToSend = `[Attached file: ${pendingUpload.name}]\n${pendingUpload.content}\n\n${text}`;
  }

  if (text) append("you", "you", text);

  mood = Math.min(5, mood + 1);
  renderStats();

  setStatus("thinking...");
  startThinking();
  resetIdleTimers();

  try {
    const reply = await window.emb3r.sendMessage(messageToSend);
    stopThinking();
    append("bot", "ember", reply);
    playReplyBeep();
    setFace("happy");
    setStatus("happy");
    setTimeout(() => { setFace(mood <= 2 ? "sad" : "idle"); setStatus("idle"); }, 1500);
  } catch (err) {
    stopThinking();
    append("err", "err", String(err?.message || err));
    playErrorBeep();
    setFace("error");
    setStatus("error");
    setTimeout(() => { setFace(mood <= 2 ? "sad" : "idle"); setStatus("idle"); }, 1500);
  } finally {
    send.disabled = false;
    pendingUpload = null;
    input.focus();
    resetIdleTimers();
  }
}

send.addEventListener("click", onSend);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") onSend(); });

// shrink the pet box while actively chatting, expand again once idle
input.addEventListener("focus", () => petEl.classList.add("compact"));
input.addEventListener("blur", () => {
  if (!input.value.trim() && !thinkTimer) petEl.classList.remove("compact");
});

// =============================
// File uploader
// =============================

uploadButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingUpload = { name: file.name, content: reader.result };
    append("sys", "sys", `ready to send: ${file.name} (${file.size} bytes) — type a message and hit send`);
  };
  reader.onerror = () => append("err", "err", `couldn't read file: ${file.name}`);
  reader.readAsText(file);
  fileInput.value = "";
});

// =============================
// Boot sequence (Game Boy style)
// =============================

function runBoot(onDone) {
  // logo zooms in via CSS animation already running on load
  setTimeout(() => {
    playBootChime();
    bootThree.classList.add("burning");

    // randomly pick frames so the flame flickers organically instead of a fixed loop
    let lastIndex = -1;
    const flameInterval = setInterval(() => {
      let idx;
      do { idx = Math.floor(Math.random() * FLAME_FRAMES.length); } while (idx === lastIndex);
      lastIndex = idx;
      bootThree.textContent = FLAME_FRAMES[idx];
      bootThree.classList.toggle("flash", idx === FLAME_PEAK_INDEX);
    }, 70 + Math.random() * 50);

    // after the flame burst, settle back into the actual "3" glyph
    setTimeout(() => {
      clearInterval(flameInterval);
      bootThree.classList.remove("flash");
      bootThree.textContent = THREE_GLYPH;
      bootThree.classList.remove("burning");
    }, 1300);
  }, 750);

  setTimeout(() => {
    bootScreen.classList.add("fade-out");
    setTimeout(onDone, 500);
  }, 2600);
}

async function finishBoot() {
  bootScreen.remove();
  appEl.classList.add("visible");
  renderStats();
  setFace("idle");
  setStatus("idle");
  resetIdleTimers();
  startMoodDecay();
  await loadConfigIntoUI();
  input.focus();
}

runBoot(finishBoot);

// =============================
// Settings Panel
// =============================

const settingsButton = document.getElementById("settingsButton");
const settingsPanel  = document.getElementById("settingsPanel");
const closeSettings  = document.getElementById("closeSettings");
const soundToggle    = document.getElementById("soundToggle");

settingsButton.addEventListener("click", () => settingsPanel.classList.add("open"));
closeSettings.addEventListener("click", () => settingsPanel.classList.remove("open"));

document.addEventListener("click", (e) => {
    const clickedInsidePanel = settingsPanel.contains(e.target);
    const clickedButton = settingsButton.contains(e.target);
    const clickedModal = document.getElementById("consentModal").contains(e.target);
    if (settingsPanel.classList.contains("open") && !clickedInsidePanel && !clickedButton && !clickedModal) {
        settingsPanel.classList.remove("open");
    }
});

const savedSound = localStorage.getItem("emb3rSound");
soundsEnabled = savedSound === null ? true : savedSound === "true";
soundToggle.checked = soundsEnabled;
soundToggle.addEventListener("change", (e) => {
    soundsEnabled = e.target.checked;
    localStorage.setItem("emb3rSound", String(soundsEnabled));
});

// =============================
// Account (profiles)
// =============================

const profileListEl = document.getElementById("profileList");
const newProfileNameInput = document.getElementById("newProfileName");
const addProfileButton = document.getElementById("addProfileButton");

let profilesCache = { profiles: [], activeProfileId: null };

function renderProfileList() {
  profileListEl.innerHTML = "";
  profilesCache.profiles.forEach((p) => {
    const row = document.createElement("div");
    row.className = "profileRow";
    const isActive = p.id === profilesCache.activeProfileId;
    const label = document.createElement("span");
    label.textContent = `${p.name || "(unnamed)"}${isActive ? " ● active" : ""}`;
    row.appendChild(label);

    if (!isActive) {
      const useBtn = document.createElement("button");
      useBtn.textContent = "Switch";
      useBtn.addEventListener("click", async () => {
        const result = await window.emb3r.switchProfile(p.id);
        if (result.success) {
          profilesCache = { profiles: result.profiles, activeProfileId: result.activeProfileId };
          renderProfileList();
          chat.innerHTML = `<span class="dim">// switched profile to ${p.name || "(unnamed)"}</span>`;
        }
      });
      row.appendChild(useBtn);

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async () => {
        const result = await window.emb3r.deleteProfile(p.id);
        if (result.success) {
          profilesCache = { profiles: result.profiles, activeProfileId: result.activeProfileId };
          renderProfileList();
        }
      });
      row.appendChild(delBtn);
    }

    profileListEl.appendChild(row);
  });
}

async function refreshProfileList() {
  profilesCache = await window.emb3r.listProfiles();
  renderProfileList();
}

addProfileButton.addEventListener("click", async () => {
  const name = newProfileNameInput.value.trim();
  if (!name) return;
  const result = await window.emb3r.createProfile(name);
  if (result.success) {
    profilesCache = { profiles: result.profiles, activeProfileId: result.activeProfileId };
    newProfileNameInput.value = "";
    renderProfileList();
    chat.innerHTML = `<span class="dim">// new profile created: ${name}</span>`;
  }
});

// =============================
// Internet consent (gates model downloads)
// =============================

const consentModal = document.getElementById("consentModal");
const consentAllow = document.getElementById("consentAllow");
const consentDeny = document.getElementById("consentDeny");

let currentConfig = { internetConsent: false };
let pendingDownloadId = null;

async function loadConfigIntoUI() {
  currentConfig = await window.emb3r.getConfig();
  await refreshProfileList();
  await refreshModelList();
  spotifyClientIdInput.value = currentConfig.spotifyClientId || "";
  await refreshSpotifyStatus();
}

consentAllow.addEventListener("click", async () => {
  await window.emb3r.setInternetConsent(true);
  currentConfig.internetConsent = true;
  consentModal.classList.remove("open");
  if (pendingDownloadId) {
    const idToDownload = pendingDownloadId;
    pendingDownloadId = null;
    startDownload(idToDownload);
  }
  if (window.__pendingSpotifyConnect) {
    window.__pendingSpotifyConnect = false;
    doSpotifyConnect();
  }
});

consentDeny.addEventListener("click", () => {
  pendingDownloadId = null;
  window.__pendingSpotifyConnect = false;
  consentModal.classList.remove("open");
});

// =============================
// Model browser
// =============================

const modelListEl = document.getElementById("modelList");
let modelsCache = [];

function renderModelList() {
  modelListEl.innerHTML = "";
  modelsCache.forEach((m) => {
    const row = document.createElement("div");
    row.className = "modelRow";

    const isActive = m.file === modelsCache.activeModel;

    row.innerHTML = `
      <div class="modelName">${m.name} ${m.recommended ? '<span class="recommendedTag">★ recommended</span>' : ""} ${isActive ? '<span class="activeTag">● active</span>' : ""}</div>
      <div class="modelMeta">${m.tier} tier • ~${m.sizeGB}GB • needs ${m.minRamGB}GB+ RAM</div>
      <div class="modelProgress" id="progress-${m.id}"></div>
    `;

    const btn = document.createElement("button");
    if (!m.downloaded) {
      btn.textContent = "Download";
      btn.addEventListener("click", () => requestDownload(m.id));
    } else if (isActive) {
      btn.textContent = "Active";
      btn.disabled = true;
    } else {
      btn.textContent = "Use this model";
      btn.addEventListener("click", () => selectModel(m.file));
    }
    row.appendChild(btn);

    modelListEl.appendChild(row);
  });
}

async function refreshModelList() {
  const result = await window.emb3r.listModels();
  modelsCache = result.models;
  modelsCache.activeModel = result.activeModel;
  renderModelList();
}

function requestDownload(modelId) {
  if (!currentConfig.internetConsent) {
    pendingDownloadId = modelId;
    consentModal.classList.add("open");
    return;
  }
  startDownload(modelId);
}

async function startDownload(modelId) {
  const progressEl = document.getElementById(`progress-${modelId}`);
  if (progressEl) progressEl.textContent = "starting download...";
  const result = await window.emb3r.downloadModel(modelId);
  if (result.success) {
    if (progressEl) progressEl.textContent = "done!";
    await refreshModelList();
  } else {
    if (progressEl) progressEl.textContent = `failed: ${result.error}`;
  }
}

window.emb3r.onDownloadProgress(({ id, percent }) => {
  const progressEl = document.getElementById(`progress-${id}`);
  if (progressEl) progressEl.textContent = `downloading... ${percent}%`;
});

async function selectModel(filename) {
  const row = modelsCache.find((m) => m.file === filename);
  const progressEl = row ? document.getElementById(`progress-${row.id}`) : null;
  if (progressEl) progressEl.textContent = "switching model...";
  const result = await window.emb3r.selectModel(filename);
  if (result.success) {
    if (progressEl) progressEl.textContent = "";
    append("sys", "sys", `switched to ${filename}`);
  } else {
    if (progressEl) progressEl.textContent = `failed: ${result.error}`;
  }
  await refreshModelList();
}

// =============================
// Hardware scan
// =============================

const scanHardwareButton = document.getElementById("scanHardwareButton");
const hardwareResult = document.getElementById("hardwareResult");

scanHardwareButton.addEventListener("click", async () => {
  hardwareResult.textContent = "scanning...";
  try {
    const info = await window.emb3r.scanHardware();
    hardwareResult.textContent =
`RAM: ${info.totalRamGB}GB total (${info.freeRamGB}GB free)
CPU: ${info.cpuModel} (${info.cpuCores} cores)
Platform: ${info.platform}

Recommended tier: ${info.recommendedTier}
See the Models section above — matching models are marked ★ recommended.`;
  } catch (err) {
    hardwareResult.textContent = `scan failed: ${err.message || err}`;
  }
});

// =============================
// Spotify integration
// =============================

const spotifyClientIdInput = document.getElementById("spotifyClientIdInput");
const spotifyConnectButton = document.getElementById("spotifyConnectButton");
const spotifyStatusText = document.getElementById("spotifyStatusText");

let spotifyConnected = false;
let spotifyPollTimer = null;
let lastNonMusicFace = "idle";

spotifyClientIdInput.addEventListener("change", async (e) => {
  await window.emb3r.setSpotifyClientId(e.target.value.trim());
});

spotifyConnectButton.addEventListener("click", async () => {
  if (spotifyConnected) {
    await window.emb3r.disconnectSpotify();
    spotifyConnected = false;
    stopSpotifyPolling();
    spotifyStatusText.textContent = "disconnected";
    spotifyConnectButton.textContent = "Connect Spotify";
    return;
  }

  if (!currentConfig.internetConsent) {
    pendingDownloadId = null; // not a model download, but reuse the same modal
    consentModal.classList.add("open");
    // stash a flag so consentAllow knows this was for spotify
    window.__pendingSpotifyConnect = true;
    return;
  }

  await doSpotifyConnect();
});

async function doSpotifyConnect() {
  spotifyStatusText.textContent = "opening Spotify login in your browser...";
  const result = await window.emb3r.connectSpotify();
  if (result.success) {
    spotifyConnected = true;
    spotifyConnectButton.textContent = "Disconnect Spotify";
    spotifyStatusText.textContent = "connected";
    startSpotifyPolling();
  } else {
    spotifyStatusText.textContent = `failed: ${result.error}`;
  }
}

async function refreshSpotifyStatus() {
  const status = await window.emb3r.spotifyStatus();
  spotifyConnected = status.connected;
  spotifyConnectButton.textContent = spotifyConnected ? "Disconnect Spotify" : "Connect Spotify";
  spotifyStatusText.textContent = spotifyConnected ? "connected" : "not connected";
  if (spotifyConnected) startSpotifyPolling();
}

function startSpotifyPolling() {
  stopSpotifyPolling();
  pollNowPlaying();
  spotifyPollTimer = setInterval(pollNowPlaying, 10000);
}

function stopSpotifyPolling() {
  if (spotifyPollTimer) { clearInterval(spotifyPollTimer); spotifyPollTimer = null; }
}

let musicFlip = false;

async function pollNowPlaying() {
  if (!spotifyConnected) return;
  try {
    const info = await window.emb3r.getNowPlaying();
    if (!thinkTimer) {
      if (info.playing) {
        musicFlip = !musicFlip;
        setFace(musicFlip ? "music1" : "music2");
        setStatus("vibing");
        chat.title = `♪ ${info.track} — ${info.artist}`;
      } else {
        setFace(mood <= 2 ? "sad" : "idle");
        setStatus("idle");
      }
    }
  } catch (e) {
    // silent fail, no need to spam errors for background polling
  }
}

// =============================
// Theme
// =============================

const themeSelect = document.getElementById("themeSelect");

function applyTheme(theme) {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("emb3rTheme", theme);
}

const savedTheme = localStorage.getItem("emb3rTheme") || "dark";
themeSelect.value = savedTheme;
applyTheme(savedTheme);
themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));

// =============================
// Font size
// =============================

const fontSizeInput = document.getElementById("fontSize");

function applyFontSize(size) {
    document.documentElement.style.fontSize = size + "px";
    localStorage.setItem("emb3rFontSize", size);
}

const savedFontSize = localStorage.getItem("emb3rFontSize") || "20";
fontSizeInput.value = savedFontSize;
applyFontSize(savedFontSize);
fontSizeInput.addEventListener("input", (e) => applyFontSize(e.target.value));

// =============================
// Phosphor glow intensity
// =============================

const glowInput = document.getElementById("glowIntensity");

function applyGlow(intensity) {
    const n = Number(intensity);
    document.documentElement.style.setProperty("--glow-small", Math.max(0, n * 0.3) + "px");
    document.documentElement.style.setProperty("--glow-big", n + "px");
    localStorage.setItem("emb3rGlow", n);
}

const savedGlow = localStorage.getItem("emb3rGlow") || "6";
glowInput.value = savedGlow;
applyGlow(savedGlow);
glowInput.addEventListener("input", (e) => applyGlow(e.target.value));

// =============================
// Color wheel (HSV)
// =============================

const wheelCanvas = document.getElementById("colorWheel");
const wheelCtx     = wheelCanvas.getContext("2d");
const lightnessInput = document.getElementById("lightness");

const wheelSize = wheelCanvas.width;
const center = wheelSize / 2;
const radius = center - 2;

let currentHue = 140;
let currentSat = 80;

function drawWheel() {
    const img = wheelCtx.createImageData(wheelSize, wheelSize);
    for (let y = 0; y < wheelSize; y++) {
        for (let x = 0; x < wheelSize; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const idx = (y * wheelSize + x) * 4;
            if (dist <= radius) {
                let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angle < 0) angle += 360;
                const sat = Math.min(100, (dist / radius) * 100);
                const [r, g, b] = hsvToRgb(angle, sat, 100);
                img.data[idx] = r;
                img.data[idx + 1] = g;
                img.data[idx + 2] = b;
                img.data[idx + 3] = 255;
            } else {
                img.data[idx + 3] = 0;
            }
        }
    }
    wheelCtx.putImageData(img, 0, 0);
}

function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

function applyColor() {
    const lightness = Number(lightnessInput.value);
    const color = `hsl(${currentHue.toFixed(0)}, ${currentSat.toFixed(0)}%, ${lightness}%)`;
    document.documentElement.style.setProperty("--text-color", color);
    document.documentElement.style.setProperty("--hover-color", color + "33");
    localStorage.setItem("emb3rAccentColor", JSON.stringify({ h: currentHue, s: currentSat, l: lightness }));
}

function pickAt(clientX, clientY) {
    const rect = wheelCanvas.getBoundingClientRect();
    const x = clientX - rect.left - center;
    const y = clientY - rect.top - center;
    const dist = Math.min(radius, Math.sqrt(x * x + y * y));
    let angle = Math.atan2(y, x) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    currentHue = angle;
    currentSat = Math.min(100, (dist / radius) * 100);
    applyColor();
}

let dragging = false;
wheelCanvas.addEventListener("mousedown", (e) => { dragging = true; pickAt(e.clientX, e.clientY); });
window.addEventListener("mousemove", (e) => { if (dragging) pickAt(e.clientX, e.clientY); });
window.addEventListener("mouseup", () => { dragging = false; });
lightnessInput.addEventListener("input", applyColor);

drawWheel();

const savedColor = localStorage.getItem("emb3rAccentColor");
if (savedColor) {
    try {
        const { h, s, l } = JSON.parse(savedColor);
        currentHue = h; currentSat = s;
        lightnessInput.value = l;
        applyColor();
    } catch (e) {
        localStorage.removeItem("emb3rAccentColor");
    }
}
