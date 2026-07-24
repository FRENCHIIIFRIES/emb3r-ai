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
// last known context window, so attachment limits track the loaded model rather
// than a guess. refreshed after every reply and on model switch.
let lastContext = null;

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

// small clipboard button, revealed on hover of its containing line. copyText
// is a function rather than a captured string so a streaming line can hand
// back whatever it currently holds at click time
function makeCopyButton(copyText) {
  const btn = document.createElement("button");
  btn.className = "copyBtn";
  btn.type = "button";
  btn.title = "Copy";
  btn.textContent = "⧉";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyText());
      btn.textContent = "✓";
      btn.classList.add("copied");
    } catch {
      btn.textContent = "✗";
    }
    setTimeout(() => { btn.textContent = "⧉"; btn.classList.remove("copied"); }, 1000);
  });
  return btn;
}

// chat lines only, not error/system notices - those are not worth copying and
// a button on every line would be noise
function append(kind, who, text, { copyable = false } = {}) {
  const line = document.createElement("div");
  line.className = kind;

  const span = document.createElement("span");
  span.className = "msgText";
  span.textContent = `${who} > ${text}`;
  line.appendChild(span);

  if (copyable) line.appendChild(makeCopyButton(() => text));

  chat.appendChild(line);
  chat.scrollTop = chat.scrollHeight;
  return line;
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

// the exact string last sent to submitToModel, resent by the consent modal's
// handlers once the user answers - either via Gemini (allow) or forced local
// (deny), so declining still gets a reply rather than silently doing nothing
let pendingWebMessage = null;

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
    // fence the contents so the model can tell file from instruction. the old
    // form opened with a label and never closed it, leaving the question
    // looking like part of the document
    messageToSend =
      `The user attached a file named "${pendingUpload.name}". Its full contents are between the markers below.\n` +
      `--- BEGIN ${pendingUpload.name} ---\n` +
      `${pendingUpload.content}\n` +
      `--- END ${pendingUpload.name} ---\n\n` +
      `${text || "Summarise this file."}`;
  }

  if (text) append("you", "you", text, { copyable: true });

  mood = Math.min(5, mood + 1);
  renderStats();

  await submitToModel(messageToSend);
  pendingUpload = null;
  input.focus();
}

async function submitToModel(messageToSend, opts) {
  setStatus("thinking...");
  startThinking();
  resetIdleTimers();

  // reset to the default in case the previous exchange left it labelled for
  // Gemini - onAnswerSource corrects it again before any token arrives
  currentAnswerPrefix = "ember > ";

  // the reply is written into this line as tokens arrive rather than appended
  // once at the end, so there is something to watch during a slow generation
  streamLine = beginStream();
  streamText = "";
  setGenerating(true);

  try {
    const result = await window.emb3r.sendMessage(messageToSend, opts);
    stopThinking();

    if (result.needsConsent) {
      // nothing was generated - remove the empty line rather than treat this
      // like a failure, and ask instead of silently doing nothing
      if (streamLine) streamLine.remove();
      pendingWebMessage = messageToSend;
      consentModal.classList.add("open");
      setStatus("idle");
      return;
    }

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
      if (result.source === "gemini") appendSources(result.sources);
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
    resetIdleTimers();
  }
}

// =============================
// Streaming replies
// =============================

let streamLine = null;
let streamText = "";
let streamTextEl = null;

// set by emb3r:answer-source before generation starts, so the line already
// carries the right label by the time the first token arrives
let currentAnswerPrefix = "ember > ";

function beginStream() {
  const line = document.createElement("div");
  line.className = "bot";

  const span = document.createElement("span");
  span.className = "msgText";
  span.textContent = currentAnswerPrefix;
  line.appendChild(span);
  streamTextEl = span;

  // reads streamText live, so it copies whatever has arrived by the time the
  // button is actually clicked rather than a snapshot from when it was drawn
  line.appendChild(makeCopyButton(() => streamText));

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
  if (!streamTextEl) return;
  // textContent, never innerHTML - model output is untrusted text
  streamTextEl.textContent = `${currentAnswerPrefix}${streamText}`;
  chat.scrollTop = chat.scrollHeight;
}

// appends a small list of source links under a Gemini reply, in its own line
// so it's visually distinct from the answer text and never mixed into it
function appendSources(sources) {
  if (!sources || !sources.length) return;
  const line = document.createElement("div");
  line.className = "sys";
  const span = document.createElement("span");
  span.className = "msgText";
  span.textContent = "sources: " + sources.map((s) => s.title || s.uri).join(" · ");
  line.appendChild(span);
  chat.appendChild(line);
  chat.scrollTop = chat.scrollHeight;
}

window.emb3r.onAnswerSource(({ source }) => {
  currentAnswerPrefix = source === "gemini" ? "ember (web) > " : "ember > ";
  if (streamTextEl) streamTextEl.textContent = currentAnswerPrefix;
});

// a plain append() would land these below the (already on-screen, still
// empty) reply line that beginStream() creates before sendMessage is even
// called, reading as if the notice followed the reply it's actually about.
// Inserting before streamLine keeps chat order chronological.
function appendBeforeStream(kind, text) {
  const line = document.createElement("div");
  line.className = kind;
  const span = document.createElement("span");
  span.className = "msgText";
  span.textContent = `${kind} > ${text}`;
  line.appendChild(span);
  if (streamLine) chat.insertBefore(line, streamLine);
  else chat.appendChild(line);
  chat.scrollTop = chat.scrollHeight;
}

// fires when Gemini fails for any reason (quota, bad key, etc.) and main.js
// has already fallen back to the local model rather than dead-ending the
// conversation - onAnswerSource fires again right after this with "local",
// which corrects the prefix above on its own
window.emb3r.onGeminiFallback(({ reason }) => {
  appendBeforeStream("sys", reason);
});

// automatic web-access detection is silent by design - consent is asked once
// ever, not per message - so this is the one moment a user finds out *this*
// message is leaving the machine, rather than noticing after the fact from
// the subtler "ember (web) >" label on the reply itself
window.emb3r.onWebSearchStart(() => {
  appendBeforeStream("sys", "🌐 this looks like it needs current info - asking the web (Gemini)");
});

// swaps the send button for a stop button while Ember is talking
function setGenerating(on) {
  send.disabled = on;
  input.disabled = on;
  stopButton.hidden = !on;
  if (!on) statsEl.textContent = "";
}

window.emb3r.onToken(({ text }) => writeStream(text));

window.emb3r.onGenStats(({ tokensPerSec, context }) => {
  if (context && context.size) lastContext = context;
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

// Roughly four characters per token for English text. Deliberately pessimistic:
// over-estimating means we refuse a file that would have just fit, which is far
// better than accepting one that silently pushes the conversation out of the
// context window.
const CHARS_PER_TOKEN = 4;

// a hard floor regardless of context size - on the smallest context (the
// 4096-token CPU fallback in main.js) the proportional budget alone still
// rejects perfectly ordinary files well under this size
const MIN_ATTACHMENT_CHARS = 20 * 1024;

// leave room for the system prompt, the question, and Ember's reply
function attachmentCharBudget() {
  const size = lastContext && lastContext.size ? lastContext.size : 4096;
  return Math.max(Math.floor(size * 0.7) * CHARS_PER_TOKEN, MIN_ATTACHMENT_CHARS);
}

// readAsText happily decodes a PDF or a PNG into mojibake and hands it over as
// if it were prose, which is why attaching one produced confident nonsense.
// Null bytes and a high proportion of replacement characters both mean we were
// given something that is not text.
function looksBinary(text) {
  if (text.includes("\u0000")) return true;
  const sample = text.slice(0, 4000);
  if (!sample.length) return false;
  const replacements = (sample.match(/�/g) || []).length;
  return replacements / sample.length > 0.02;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result || "");

    if (looksBinary(content)) {
      pendingUpload = null;
      append("err", "err",
        `${file.name} isn't a text file. Ember can only read text — try .txt, .md, code, .csv or .json.`);
      return;
    }

    const budget = attachmentCharBudget();
    if (content.length > budget) {
      pendingUpload = null;
      const kb = (n) => Math.round(n / 1024) + "KB";
      append("err", "err",
        `${file.name} is too big to read (${kb(content.length)}; the limit is about ${kb(budget)}). ` +
        `Send a smaller file or an excerpt — truncating it would make Ember answer from a fragment without telling you.`);
      return;
    }

    pendingUpload = { name: file.name, content };
    append("sys", "sys",
      `ready to send: ${file.name} (${Math.round(content.length / 1024)}KB) — type a message and hit send`);
  };
  reader.onerror = () => {
    pendingUpload = null;
    append("err", "err", `couldn't read file: ${file.name}`);
  };
  reader.readAsText(file);
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
  // know the context window before the first attachment, not after the first reply
  lastContext = await window.emb3r.contextUsage();
  await maybeRunFirstTimeSetup();
  input.focus();
}

runBoot(finishBoot);

// =============================
// Settings Panel
// =============================

const settingsButton = document.getElementById("settingsButton");
const closeSettings  = document.getElementById("closeSettings");
const soundToggle    = document.getElementById("soundToggle");
const settingsTabs   = document.querySelectorAll(".settingsTab");

settingsButton.addEventListener("click", () => appEl.classList.add("settingsOpen"));

settingsTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    settingsTabs.forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".settingsSection").forEach((s) => s.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.settingsSection[data-tab="${tab.dataset.tab}"]`).classList.add("active");
  });
});

// =============================
// Conversation history
// =============================

const historyWrap   = document.getElementById("historyWrap");
const historyButton = document.getElementById("historyButton");
const historyPanel  = document.getElementById("historyPanel");
const historyList   = document.getElementById("historyList");
const newChatButton = document.getElementById("newChatButton");

let activeConversationId = null;

// static rendering of a saved reply - the streaming machinery (beginStream /
// writeStream) exists to grow a line token by token, which restored history
// does not need since the full text is already known. Carries the same
// "(web)" label a live Gemini reply gets, so scrolling back still shows
// which answers left the machine - not just the live moment it happened.
function appendStaticBotLine(text, source) {
  const line = document.createElement("div");
  line.className = "bot";
  const span = document.createElement("span");
  span.className = "msgText";
  span.textContent = `${source === "gemini" ? "ember (web) > " : "ember > "}${text}`;
  line.appendChild(span);
  line.appendChild(makeCopyButton(() => text));
  chat.appendChild(line);
}

// repaints #chat from whatever conversation the main process currently has
// active. Called after boot, and again every time emb3r:model-ready fires -
// which covers profile switches and model switches too, since those all funnel
// through the same main-process path that can change which conversation is
// active.
async function renderActiveConversationHistory() {
  const conv = await window.emb3r.getActiveConversation();
  activeConversationId = conv ? conv.id : null;
  chat.replaceChildren();
  if (!conv || !conv.messages.length) return;
  for (const m of conv.messages) {
    if (m.role === "user") append("you", "you", m.text, { copyable: true });
    else appendStaticBotLine(m.text, m.source);
  }
  chat.scrollTop = chat.scrollHeight;
}

async function refreshHistoryList() {
  const conversations = await window.emb3r.listConversations();
  historyList.replaceChildren();

  if (!conversations.length) {
    const empty = document.createElement("div");
    empty.className = "historyEmpty";
    empty.textContent = "No saved chats yet";
    historyList.appendChild(empty);
    return;
  }

  for (const c of conversations) {
    const row = document.createElement("div");
    row.className = "historyRow" + (c.id === activeConversationId ? " active" : "");

    const title = document.createElement("span");
    title.className = "historyTitle";
    title.textContent = c.title || "New chat";
    row.appendChild(title);

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Delete this chat";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation(); // don't also trigger the row's own load-on-click
      await window.emb3r.deleteConversation(c.id);
      await renderActiveConversationHistory();
      await refreshHistoryList();
    });
    row.appendChild(delBtn);

    row.addEventListener("click", async () => {
      await window.emb3r.loadConversation(c.id);
      await renderActiveConversationHistory();
      historyWrap.classList.remove("open");
    });

    historyList.appendChild(row);
  }
}

historyButton.addEventListener("click", () => {
  const opening = !historyWrap.classList.contains("open");
  historyWrap.classList.toggle("open");
  if (opening) refreshHistoryList();
});

newChatButton.addEventListener("click", async () => {
  await window.emb3r.newConversation();
  await renderActiveConversationHistory();
  await refreshHistoryList();
  historyWrap.classList.remove("open");
});

// the very first thing to happen after the model finishes loading - or fails
// to - is that the active conversation may have changed, so always repaint.
// if the history popover happens to be open (e.g. it was open while switching
// profiles), refresh it too so it cannot show another profile's chats.
window.emb3r.onModelReady(() => {
  renderActiveConversationHistory();
  if (historyWrap.classList.contains("open")) refreshHistoryList();
});
closeSettings.addEventListener("click", () => appEl.classList.remove("settingsOpen"));

document.addEventListener("click", (e) => {
    if (historyWrap.classList.contains("open") && !historyWrap.contains(e.target)) {
        historyWrap.classList.remove("open");
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
  await refreshPersonality();
  await initUpdateUI();
  await refreshGeminiKeyStatus();
  // unlike the key, the model name isn't secret, so it's shown directly
  // rather than reduced to a configured/not-configured state
  geminiModelInput.value = currentConfig.geminiModel || "";
  renderNetStatus(await window.emb3r.netStatus());
}

// =============================
// Personality
// =============================

const personalityInput = document.getElementById("personalityInput");
const personalitySave = document.getElementById("personalitySave");
const personalityReset = document.getElementById("personalityReset");
const personalityStatus = document.getElementById("personalityStatus");
let defaultPersonality = "";

async function refreshPersonality() {
  const p = await window.emb3r.getPersonality();
  defaultPersonality = p.defaultPrompt;
  personalityInput.value = p.isDefault ? "" : p.current;
  personalityInput.placeholder = p.defaultPrompt;
  personalityInput.maxLength = p.maxLength;
  personalityStatus.textContent = "";
}

personalitySave.addEventListener("click", async () => {
  const text = personalityInput.value.trim();
  // an empty box is treated as "use the default" rather than "give Ember no
  // instructions at all" - the latter is supported by the IPC layer but there
  // is no UI path to it, since it is not a choice worth exposing a control for
  if (!text) {
    await window.emb3r.resetPersonality();
  } else {
    await window.emb3r.setPersonality(text);
  }
  personalityStatus.textContent = "saved";
  setTimeout(() => { personalityStatus.textContent = ""; }, 1500);
});

personalityReset.addEventListener("click", async () => {
  await window.emb3r.resetPersonality();
  personalityInput.value = "";
  personalityStatus.textContent = "reset to default";
  setTimeout(() => { personalityStatus.textContent = ""; }, 1500);
});

// =============================
// Gemini web access
// =============================

const geminiKeyInput  = document.getElementById("geminiKeyInput");
const geminiKeySave   = document.getElementById("geminiKeySave");
const geminiKeyClear  = document.getElementById("geminiKeyClear");
const geminiKeyStatus = document.getElementById("geminiKeyStatus");

// the key itself is never sent back from main - only whether one is set - so
// this reflects "configured" state, never the value the user pasted in
async function refreshGeminiKeyStatus() {
  const { configured } = await window.emb3r.geminiKeyStatus();
  geminiKeyInput.value = "";
  geminiKeyInput.placeholder = configured ? "•••••••• (key saved)" : "paste your key";
  geminiKeyStatus.textContent = configured ? "configured" : "not set";
}

geminiKeySave.addEventListener("click", async () => {
  const key = geminiKeyInput.value.trim();
  if (!key) return;
  const result = await window.emb3r.setGeminiKey(key);
  if (!result.success) {
    geminiKeyStatus.textContent = result.error;
    return;
  }
  await refreshGeminiKeyStatus();
  geminiKeyStatus.textContent = "saved";
  setTimeout(() => { geminiKeyStatus.textContent = "configured"; }, 1500);
});

geminiKeyClear.addEventListener("click", async () => {
  await window.emb3r.clearGeminiKey();
  await refreshGeminiKeyStatus();
});

const geminiModelInput  = document.getElementById("geminiModelInput");
const geminiModelSave   = document.getElementById("geminiModelSave");
const geminiModelReset  = document.getElementById("geminiModelReset");
const geminiModelStatus = document.getElementById("geminiModelStatus");

geminiModelSave.addEventListener("click", async () => {
  const model = geminiModelInput.value.trim();
  await window.emb3r.setGeminiModel(model);
  currentConfig.geminiModel = model;
  geminiModelStatus.textContent = model ? "saved" : "reset to default";
  setTimeout(() => { geminiModelStatus.textContent = ""; }, 1500);
});

geminiModelReset.addEventListener("click", async () => {
  geminiModelInput.value = "";
  await window.emb3r.setGeminiModel("");
  currentConfig.geminiModel = "";
  geminiModelStatus.textContent = "reset to default";
  setTimeout(() => { geminiModelStatus.textContent = ""; }, 1500);
});

// =============================
// Network activity + offline lock
// =============================

const netIndicator      = document.getElementById("netIndicator");
const netLabel          = document.getElementById("netLabel");
const netLogEl          = document.getElementById("netLog");
const offlineLockToggle = document.getElementById("offlineLockToggle");
const offlineLockStatus = document.getElementById("offlineLockStatus");

function renderNetLog(recent) {
  netLogEl.replaceChildren();

  if (!recent.length) {
    const empty = document.createElement("div");
    empty.className = "netEmpty";
    empty.textContent = "nothing has left this machine since launch";
    netLogEl.appendChild(empty);
    return;
  }

  for (const entry of recent) {
    const row = document.createElement("div");
    row.className = "netRow";
    if (entry.outcome === "blocked") row.classList.add("blocked");
    if (entry.outcome === "blocked-renderer") row.classList.add("blockedRenderer");

    const what = document.createElement("span");
    what.className = "netWhat";
    what.textContent = entry.outcome === "open" ? entry.what : `blocked: ${entry.what}`;
    row.appendChild(what);

    const meta = document.createElement("span");
    meta.className = "netMeta";
    const time = new Date(entry.at).toLocaleTimeString();
    meta.textContent = entry.count > 1 ? `×${entry.count}  ${time}` : time;
    row.appendChild(meta);

    netLogEl.appendChild(row);
  }
}

function renderNetStatus(status) {
  const active = Boolean(status.active);
  const locked = Boolean(status.locked);
  const recent = status.recent || [];

  netIndicator.classList.toggle("active", active);
  // the lock is only worth announcing when nothing is in flight - if something
  // is, that is the more urgent thing for the light to be saying
  netIndicator.classList.toggle("locked", locked && !active);

  if (active) {
    // name what is actually happening rather than a generic "connecting"
    const open = recent.find((r) => r.outcome === "open");
    netLabel.textContent = open ? open.what : "network activity";
  } else if (locked) {
    netLabel.textContent = "offline lock on";
  } else {
    netLabel.textContent = "no network activity";
  }

  offlineLockToggle.checked = locked;
  renderNetLog(recent);
}

window.emb3r.onNetActivity(renderNetStatus);

offlineLockToggle.addEventListener("change", async () => {
  const wanted = offlineLockToggle.checked;
  const result = await window.emb3r.setOfflineLock(wanted);

  if (!result.success) {
    // main refuses to lock with no model on disk - reflect that rather than
    // leaving the box showing a state that was not applied
    offlineLockToggle.checked = false;
    offlineLockStatus.textContent = result.error;
    return;
  }

  offlineLockStatus.textContent = wanted
    ? "on — outbound connections are refused"
    : "off — emb3r can connect for downloads, updates, and anything you enable";
  renderNetStatus(await window.emb3r.netStatus());
});

// =============================
// Updates
// =============================

const updateVersionEl   = document.getElementById("updateVersion");
const updateStatusEl    = document.getElementById("updateStatus");
const updateProgressEl  = document.getElementById("updateProgress");
const checkUpdateButton = document.getElementById("checkUpdateButton");
const downloadUpdateButton = document.getElementById("downloadUpdateButton");
const installUpdateButton  = document.getElementById("installUpdateButton");
const openReleasesButton   = document.getElementById("openReleasesButton");

async function initUpdateUI() {
  const version = await window.emb3r.getAppVersion();
  updateVersionEl.textContent = `Current version: v${version}`;
}

// only one of download / install / open-releases is ever relevant at a time
function showUpdateButtons({ download = false, install = false, openReleases = false } = {}) {
  downloadUpdateButton.hidden = !download;
  installUpdateButton.hidden = !install;
  openReleasesButton.hidden = !openReleases;
}

checkUpdateButton.addEventListener("click", async () => {
  checkUpdateButton.disabled = true;
  updateStatusEl.textContent = "checking...";
  showUpdateButtons();
  const result = await window.emb3r.checkForUpdates();
  checkUpdateButton.disabled = false;
  if (!result.success) updateStatusEl.textContent = result.error;
  // success just means the check started - the actual outcome (available /
  // not-available / error) arrives asynchronously via onUpdateStatus
});

downloadUpdateButton.addEventListener("click", async () => {
  downloadUpdateButton.disabled = true;
  const result = await window.emb3r.downloadUpdate();
  if (!result.success) {
    updateStatusEl.textContent = result.error;
    downloadUpdateButton.disabled = false;
  }
});

installUpdateButton.addEventListener("click", () => {
  window.emb3r.installUpdate();
});

openReleasesButton.addEventListener("click", () => {
  window.emb3r.openReleasesPage();
});

window.emb3r.onUpdateStatus((status) => {
  switch (status.state) {
    case "checking":
      updateStatusEl.textContent = "checking for updates...";
      showUpdateButtons();
      break;
    case "not-available":
      updateStatusEl.textContent = `you're up to date (v${status.version})`;
      showUpdateButtons();
      break;
    case "available":
      updateStatusEl.textContent = `update available: v${status.version}`;
      showUpdateButtons({ download: true });
      break;
    case "downloading": {
      const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
      updateProgressEl.textContent =
        `${progressBar(Math.round(status.percent))}  ${mb(status.transferred)} / ${mb(status.total)}`;
      updateStatusEl.textContent = "downloading update...";
      showUpdateButtons();
      break;
    }
    case "downloaded":
      updateProgressEl.textContent = "";
      updateStatusEl.textContent = `v${status.version} downloaded - restart to install`;
      showUpdateButtons({ install: true });
      break;
    case "error":
      updateProgressEl.textContent = "";
      // an ad-hoc-signed macOS build cannot apply an update silently - this is
      // the expected outcome there, not a sign anything else is broken
      updateStatusEl.textContent =
        `couldn't update automatically (${status.message}). ` +
        `You can still download it directly.`;
      showUpdateButtons({ openReleases: true });
      break;
  }
});

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
  if (pendingWebMessage) {
    const message = pendingWebMessage;
    pendingWebMessage = null;
    submitToModel(message);
  }
});

consentDeny.addEventListener("click", () => {
  pendingDownloadId = null;
  window.__pendingSpotifyConnect = false;
  consentModal.classList.remove("open");
  setSetupButtonsEnabled(true);
  if (pendingWebMessage) {
    // declining "use the internet for this" should not just drop the
    // question - force it through the local model instead
    const message = pendingWebMessage;
    pendingWebMessage = null;
    submitToModel(message, { forceLocal: true });
  }
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
themeSelect.addEventListener("change", (e) => {
    applyTheme(e.target.value);
    // a custom accent color that was legible against the old background may
    // not be against the new one - recheck it, but leave the theme's own
    // default text color alone if the user never customized it
    if (localStorage.getItem("emb3rAccentColor")) applyColor();
});

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

function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
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

function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// WCAG relative luminance / contrast ratio, used below to keep the accent
// color legible against the current theme's background - a raw hue/sat/
// lightness pick can otherwise land arbitrarily close to it (e.g. a dark
// pick on the near-black dark-theme background is invisible)
function relativeLuminance([r, g, b]) {
    const [rl, gl, bl] = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(rgb, bgLuminance) {
    const l1 = relativeLuminance(rgb) + 0.05;
    const l2 = bgLuminance + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
}

const MIN_TEXT_CONTRAST = 4.5;
// your own messages are pushed this many lightness points further from the
// background than Ember's already-legible color, so the two never collide -
// color is the only thing telling "you" and "ember" lines apart. A second,
// stricter contrast target isn't enough on its own: at high natural contrast
// both would independently pass on the very first try and land on the exact
// same lightness (verified against a full hue/sat/lightness sweep - a fixed
// offset from the already-safe color has zero collisions there)
const USER_LIGHTNESS_OFFSET = 12;

// nudges lightness away from the background, in 1% steps, until the accent
// color reaches a readable contrast ratio - hue/saturation are left alone so
// the color the user picked is preserved as closely as possible
function legibleLightness(h, s, l, bgLuminance) {
    const towardsWhite = bgLuminance < 0.5;
    let lightness = l;
    for (let i = 0; i < 100; i++) {
        if (contrastRatio(hslToRgb(h, s, lightness), bgLuminance) >= MIN_TEXT_CONTRAST) break;
        lightness += towardsWhite ? 1 : -1;
        if (lightness <= 0 || lightness >= 100) { lightness = Math.max(0, Math.min(100, lightness)); break; }
    }
    return lightness;
}

function applyColor() {
    const requestedLightness = Number(lightnessInput.value);
    const bgHex = getComputedStyle(document.documentElement).getPropertyValue("--bg-color").trim();
    const bgLuminance = relativeLuminance(hexToRgb(bgHex));
    const towardsWhite = bgLuminance < 0.5;
    const safeLightness = legibleLightness(currentHue, currentSat, requestedLightness, bgLuminance);
    const userLightness = Math.max(0, Math.min(100,
        towardsWhite ? safeLightness + USER_LIGHTNESS_OFFSET : safeLightness - USER_LIGHTNESS_OFFSET));
    const color = `hsl(${currentHue.toFixed(0)}, ${currentSat.toFixed(0)}%, ${safeLightness}%)`;
    const userColor = `hsl(${currentHue.toFixed(0)}, ${currentSat.toFixed(0)}%, ${userLightness}%)`;
    document.documentElement.style.setProperty("--text-color", color);
    document.documentElement.style.setProperty("--user-text-color", userColor);
    document.documentElement.style.setProperty("--hover-color", color + "33");
    localStorage.setItem("emb3rAccentColor", JSON.stringify({ h: currentHue, s: currentSat, l: requestedLightness }));
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
