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
const stopButton = document.getElementById("stopButton");
const statsEl    = document.getElementById("genStats");

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

// replaces the transcript with a single system note. profile names reach this,
// so the text goes in via textContent rather than being interpolated into markup
function systemNote(text) {
  const line = document.createElement("span");
  line.className = "dim";
  line.textContent = `// ${text}`;
  chat.replaceChildren(line);
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

  // the reply is written into this line as tokens arrive rather than appended
  // once at the end, so there is something to watch during a slow generation
  streamLine = beginStream();
  streamText = "";
  setGenerating(true);

  try {
    const result = await window.emb3r.sendMessage(messageToSend);
    stopThinking();

    if (!result.success) {
      if (streamLine && !streamText) streamLine.remove();
      append("err", "err", result.error);
      playErrorBeep();
      setFace("error");
      setStatus("error");
    } else {
      // the streamed text is already on screen; fall back to the returned text
      // if no chunks arrived (very short replies can complete in one go)
      if (!streamText && result.text) writeStream(result.text);
      if (result.stopped) append("sys", "sys", "stopped");
      playReplyBeep();
      setFace("happy");
      setStatus("happy");
    }
    setTimeout(() => { setFace(mood <= 2 ? "sad" : "idle"); setStatus("idle"); }, 1500);
  } catch (err) {
    stopThinking();
    if (streamLine && !streamText) streamLine.remove();
    append("err", "err", String(err?.message || err));
    playErrorBeep();
    setFace("error");
    setStatus("error");
    setTimeout(() => { setFace(mood <= 2 ? "sad" : "idle"); setStatus("idle"); }, 1500);
  } finally {
    setGenerating(false);
    streamLine = null;
    pendingUpload = null;
    input.focus();
    resetIdleTimers();
  }
}

// =============================
// Streaming replies
// =============================

let streamLine = null;
let streamText = "";

function beginStream() {
  const line = document.createElement("div");
  line.className = "bot";
  line.textContent = "ember > ";
  chat.appendChild(line);
  chat.scrollTop = chat.scrollHeight;
  return line;
}

function writeStream(chunk) {
  // the first token is the moment Ember actually starts talking, so drop the
  // thinking face then rather than when the whole reply is finished
  if (!streamText) {
    stopThinking();
    setFace("happy");
    setStatus("replying");
  }
  streamText += chunk;
  if (!streamLine) return;
  // textContent, never innerHTML - model output is untrusted text
  streamLine.textContent = `ember > ${streamText}`;
  chat.scrollTop = chat.scrollHeight;
}

// swaps the send button for a stop button while Ember is talking
function setGenerating(on) {
  send.disabled = on;
  input.disabled = on;
  stopButton.hidden = !on;
  if (!on) statsEl.textContent = "";
}

window.emb3r.onToken(({ text }) => writeStream(text));

window.emb3r.onGenStats(({ tokensPerSec, context }) => {
  const speed = tokensPerSec ? `${tokensPerSec.toFixed(1)} tok/s` : "";
  if (!context || !context.size) {
    statsEl.textContent = speed;
    return;
  }
  const pct = Math.round((context.used / context.size) * 100);
  // reuses the download meter so the two read as the same idiom
  statsEl.textContent = `ctx ${progressBar(pct, 10)}  ${speed}`;
});

stopButton.addEventListener("click", async () => {
  stopButton.disabled = true;
  await window.emb3r.stopGeneration();
  stopButton.disabled = false;
});

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

// Embers drifting up off the wordmark.
//
// The previous boot swapped the "3" out for ASCII flame frames, which meant the
// logo read "EMB_R" with noise in the middle for over a second - it took apart
// the wordmark at the exact moment it should have been establishing it. Sparks
// sit on top instead, so the letters are never touched.
const SPARK_CHARS = ["·", "˙", "•", "*", "˚", "'"];
const SPARK_COLORS = ["#ff6a00", "#ff8000", "#ffb020", "#ffd964", "#fff4c2"];

const SPARK_START_MS = 550;   // let the logo finish zooming first
const SPARK_STOP_MS = 2000;   // stop emitting
const BOOT_FADE_MS = 2350;    // begin fading the boot screen

function spawnSpark(layer) {
  const el = document.createElement("span");
  el.className = "spark";
  el.textContent = SPARK_CHARS[Math.floor(Math.random() * SPARK_CHARS.length)];

  // the "3" sits roughly 64-81% across the wordmark and is the thing that's
  // glowing, so embers come off it - with a little spread onto its neighbours
  const centre = 0.72;
  const spread = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
  el.style.left = (Math.max(0.04, Math.min(0.96, centre + spread)) * 100).toFixed(1) + "%";
  el.style.color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];

  // vary drift, distance and speed so they never look like a repeating loop
  el.style.setProperty("--dx", (Math.random() * 30 - 15).toFixed(1) + "px");
  el.style.setProperty("--dy", (-55 - Math.random() * 70).toFixed(1) + "px");
  el.style.setProperty("--dur", (1000 + Math.random() * 800).toFixed(0) + "ms");
  el.style.fontSize = (10 + Math.random() * 6).toFixed(1) + "px";
  // a spark is a point of light, so give it its own small halo
  el.style.textShadow = "0 0 6px currentColor";

  layer.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

function runBoot(onDone) {
  const layer = document.getElementById("sparkLayer");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  setTimeout(() => {
    playBootChime();
    bootThree.classList.add("glowing");

    // drifting particles are exactly what reduced-motion is asking us not to
    // do; the logo still warms, it just stays still
    if (reduced || !layer) return;

    const emit = () => {
      if (performance.now() - started > SPARK_STOP_MS - SPARK_START_MS) return;
      spawnSpark(layer);
      setTimeout(emit, 45 + Math.random() * 65);
    };
    const started = performance.now();
    emit();
  }, SPARK_START_MS);

  setTimeout(() => {
    bootScreen.classList.add("fade-out");
    setTimeout(onDone, 500);
  }, BOOT_FADE_MS);
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
  await maybeRunFirstTimeSetup();
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
          systemNote(`switched profile to ${p.name || "(unnamed)"}`);
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
    systemNote(`new profile created: ${name}`);
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
  setSetupButtonsEnabled(true);
});

// =============================
// First run setup
// =============================

const setupModal = document.getElementById("setupModal");
const setupHardwareEl = document.getElementById("setupHardware");
const setupPickEl = document.getElementById("setupPick");
const setupProgressEl = document.getElementById("setupProgress");
const setupDownloadBtn = document.getElementById("setupDownload");
const setupSkipBtn = document.getElementById("setupSkip");

let setupModelId = null;

function setSetupButtonsEnabled(enabled) {
  setupDownloadBtn.disabled = !enabled || !setupModelId;
  setupSkipBtn.disabled = !enabled;
}

function describePick(recommended, totalRam) {
  const title = document.createElement("div");
  title.className = "pickName";
  const meta = document.createElement("div");
  meta.className = "pickMeta";

  if (recommended) {
    title.textContent = `${recommended.name}  ★ recommended`;
    meta.textContent = `~${recommended.sizeGB}GB download • quickest way to get started • larger models available later in Settings`;
  } else {
    // nothing in the catalog fits, so say that plainly instead of offering a
    // download that could only ever fail to load
    title.textContent = "No model fits this machine";
    meta.textContent = `${totalRam}GB of RAM is below what the smallest model needs. You can still browse the full list in Settings.`;
  }

  setupPickEl.replaceChildren(title, meta);
}

async function maybeRunFirstTimeSetup() {
  const state = await window.emb3r.setupState();
  if (!state.needsSetup) return;

  const disk = state.freeDiskGB === null ? "" : ` • ${state.freeDiskGB.toFixed(0)}GB free`;
  setupHardwareEl.textContent =
    `${state.cpuModel}\n${state.cpuCores} cores • ${state.totalRamGB}GB RAM • ${state.platform}${disk}`;

  setupModelId = state.recommended ? state.recommended.id : null;
  describePick(state.recommended, state.totalRamGB);
  setSetupButtonsEnabled(true);
  setupModal.classList.add("open");
}

setupDownloadBtn.addEventListener("click", () => {
  if (!setupModelId) return;
  setSetupButtonsEnabled(false);
  setupProgressEl.textContent = "preparing...";
  requestDownload(setupModelId);
});

setupSkipBtn.addEventListener("click", () => {
  setupModal.classList.remove("open");
});

// =============================
// Model browser
// =============================

const modelListEl = document.getElementById("modelList");
let modelsCache = [];
const downloadingIds = new Set();

function renderModelList() {
  modelListEl.innerHTML = "";
  modelsCache.forEach((m) => {
    const row = document.createElement("div");
    row.className = "modelRow";

    const isActive = m.file === modelsCache.activeModel;

    const nameEl = document.createElement("div");
    nameEl.className = "modelName";
    nameEl.append(m.name);

    if (m.recommended) {
      const tag = document.createElement("span");
      tag.className = "recommendedTag";
      tag.textContent = "★ recommended";
      nameEl.append(" ", tag);
    }
    if (isActive) {
      const tag = document.createElement("span");
      tag.className = "activeTag";
      tag.textContent = "● active";
      nameEl.append(" ", tag);
    }

    const metaEl = document.createElement("div");
    metaEl.className = "modelMeta";
    metaEl.textContent = `${m.tier} tier • ~${m.sizeGB}GB • needs ${m.minRamGB}GB+ RAM`;

    const rowProgressEl = document.createElement("div");
    rowProgressEl.className = "modelProgress";
    rowProgressEl.id = `progress-${m.id}`;

    row.append(nameEl, metaEl, rowProgressEl);

    const btn = document.createElement("button");
    if (downloadingIds.has(m.id)) {
      btn.textContent = "Cancel";
      btn.addEventListener("click", () => cancelDownload(m.id));
    } else if (!m.downloaded) {
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

// an ASCII meter rather than a styled div, to match the mood bar and the rest
// of the terminal look
function progressBar(percent, width = 22) {
  const pct = Math.max(0, Math.min(100, percent));
  const filled = Math.round((pct / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${String(pct).padStart(3)}%`;
}

function formatGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(1) + "GB";
}

function downloadLine(percent, downloaded, total) {
  const bar = progressBar(percent);
  if (!total) return bar;
  return `${bar}  ${formatGB(downloaded)} / ${formatGB(total)}`;
}

// re-rendering the list swaps the row's Download button for Cancel, which also
// replaces the progress node - so it has to be looked up again after each render
function setProgressText(modelId, text) {
  const el = document.getElementById(`progress-${modelId}`);
  if (el) el.textContent = text;
  // the same download can be driven from the first-run screen, where the
  // settings row this would normally write to has not been rendered
  if (setupModal.classList.contains("open")) setupProgressEl.textContent = text;
}

async function startDownload(modelId) {
  downloadingIds.add(modelId);
  renderModelList();
  // start at an empty bar rather than a line of text, so the layout does not
  // jump when the first progress event lands
  setProgressText(modelId, `${progressBar(0)}  connecting...`);

  const result = await window.emb3r.downloadModel(modelId);
  downloadingIds.delete(modelId);

  if (result.success) {
    await refreshModelList();
    setProgressText(modelId, `${progressBar(100)}  done`);
    if (setupModal.classList.contains("open")) {
      await selectModel(modelsCache.find((m) => m.id === modelId).file);
      setupProgressEl.textContent = "ready.";
      setTimeout(() => setupModal.classList.remove("open"), 900);
    }
  } else {
    renderModelList();
    setProgressText(modelId, result.cancelled ? "cancelled" : `failed: ${result.error}`);
    setSetupButtonsEnabled(true);
  }
}

async function cancelDownload(modelId) {
  setProgressText(modelId, "cancelling...");
  await window.emb3r.cancelDownload(modelId);
}

window.emb3r.onDownloadProgress(({ id, percent, downloaded, total }) => {
  // goes through setProgressText so the first-run screen tracks the same
  // download as the settings row
  setProgressText(id, downloadLine(percent, downloaded, total));
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
