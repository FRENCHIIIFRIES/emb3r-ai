const faceEl = document.getElementById("face-text");
// the container, for animations - the span inside is inline and ignores transforms
const faceBox  = document.getElementById("face");
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
const attachBar  = document.getElementById("attachBar");

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

  // Every face below is wired to a state the app can actually be in. A face
  // with no trigger is just a string nobody ever sees, so none are added
  // speculatively.
  wink:      "( ^_~ )",          // something the user did worked
  surprised: "( o_O )",          // a file arrived
  search1:   "( >_> )",          // reading an attachment: eyes scan across
  search2:   "( <_< )",
  delighted: "( ♥‿♥ )",          // replied while mood is full
  dizzy:     "( @_@ )",          // the model failed to load, not just a bad reply
  offline:   "( ·_· )",          // offline lock engaged: calm, deliberately shut
};

let mood   = 5;
// mirrors the main process's offline lock, so the resting face can reflect it
let offlineLockOn = false;
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
  // the class goes on the container, not the span - #face-text is inline and
  // would ignore the transform
  faceBox.classList.remove("thinking");
}

function startThinking() {
  stopThinking();
  let flip = false;
  setFace("think1");
  faceBox.classList.add("thinking");
  thinkTimer = setInterval(() => {
    flip = !flip;
    setFace(flip ? "think2" : "think1");
  }, 400);
}

// Reading an attachment is a different activity from thinking about a question,
// so it gets its own animation: the eyes track across the page rather than
// blinking in place. Reuses thinkTimer, since the two can never run at once.
function startSearching() {
  stopThinking();
  let flip = false;
  setFace("search1");
  faceBox.classList.add("thinking");
  thinkTimer = setInterval(() => {
    flip = !flip;
    setFace(flip ? "search2" : "search1");
  }, 320);
}

// A face shown briefly and then handed back to whatever the resting state is.
// Never fires while thinking, or it would fight the animation for the element.
function flashFace(state, ms = 1100) {
  if (thinkTimer) return;
  setFace(state);
  setTimeout(() => {
    if (!thinkTimer) setFace(restingFace());
  }, ms);
}

// One place that decides what "not doing anything" looks like, so the several
// callers that return to rest cannot drift apart.
function restingFace() {
  if (offlineLockOn) return "offline";
  return mood <= 2 ? "sad" : "idle";
}

function resetIdleTimers() {
  if (idleTimer)  clearTimeout(idleTimer);
  if (sleepTimer) clearTimeout(sleepTimer);
  idleTimer = setTimeout(() => {
    if (!thinkTimer) { setFace(restingFace()); setStatus("idle"); }
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

// =============================
// Reactions
// =============================
//
// Decoration only: nothing here carries meaning that is not already in the
// text, so switching it all off costs the user no information. Two gates -
// the Settings toggle, and the operating system's own reduced-motion setting,
// which is honoured in CSS as well but checked here so we do not build DOM
// nobody is going to see.

let animationsEnabled = true;

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function reactionsAllowed() {
  return animationsEnabled && !prefersReducedMotion();
}

const SPARKLE_CHARS = ["·", "✦", "✧", "*", "˚"];

// Sparkles rise off the reply itself rather than off the pet, because #pet is
// overflow:hidden and would clip them - and because the reply is the thing
// being reacted to.
function sparkleOn(line, count = 5) {
  if (!reactionsAllowed() || !line) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "sparkle";
    el.textContent = SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)];
    // spread across the line, kept off the extreme edges
    el.style.left = (6 + Math.random() * 84).toFixed(1) + "%";
    el.style.fontSize = (9 + Math.random() * 5).toFixed(1) + "px";
    // inherits the theme colour, so it stays legible in light mode too
    el.style.color = "currentColor";
    el.style.textShadow = "0 0 6px currentColor";
    el.style.setProperty("--dx", (Math.random() * 18 - 9).toFixed(1) + "px");
    el.style.setProperty("--dy", (-18 - Math.random() * 16).toFixed(1) + "px");
    el.style.setProperty("--dur", (700 + Math.random() * 500).toFixed(0) + "ms");
    // stagger, so they twinkle rather than firing as one block
    el.style.animationDelay = (Math.random() * 220).toFixed(0) + "ms";
    line.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

function heartOn(line) {
  if (!reactionsAllowed() || !line) return;
  const el = document.createElement("span");
  el.className = "heartPop";
  el.textContent = "♥";
  el.style.left = (60 + Math.random() * 22).toFixed(1) + "%";
  el.style.fontSize = "15px";
  // deliberately not the theme colour: this one is meant to be noticed
  el.style.color = "#ff8fa3";
  el.style.textShadow = "0 0 8px #ff6b85";
  el.style.setProperty("--dx", (Math.random() * 14 - 7).toFixed(1) + "px");
  el.style.setProperty("--dy", (-34 - Math.random() * 14).toFixed(1) + "px");
  el.style.setProperty("--dur", (1200 + Math.random() * 400).toFixed(0) + "ms");
  line.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

// Stopping mid-sentence leaves the reply visibly unfinished, so the effect is a
// puff dispersing rather than anything celebratory - the answer went out, not up.
const PUFF_CHARS = ["˚", "°", "·", "∘"];

function puffOn(line, count = 6) {
  if (!reactionsAllowed() || !line) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "sparkle";                 // same rise-and-fade keyframe
    el.textContent = PUFF_CHARS[Math.floor(Math.random() * PUFF_CHARS.length)];
    el.style.left = (58 + Math.random() * 34).toFixed(1) + "%";
    el.style.fontSize = (10 + Math.random() * 6).toFixed(1) + "px";
    el.style.color = "currentColor";
    el.style.opacity = "0.55";
    // drifts sideways and barely climbs, unlike a sparkle
    el.style.setProperty("--dx", (Math.random() * 34 - 17).toFixed(1) + "px");
    el.style.setProperty("--dy", (-8 - Math.random() * 10).toFixed(1) + "px");
    el.style.setProperty("--dur", (900 + Math.random() * 600).toFixed(0) + "ms");
    el.style.animationDelay = (Math.random() * 260).toFixed(0) + "ms";
    line.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

// A short burst of noise on a failure. Deliberately monochrome and brief: an
// error should read as something going wrong, not as another decoration.
const GLITCH_CHARS = ["▚", "▞", "▘", "▝", "░", "▒"];

function glitchOn(line, count = 7) {
  if (!reactionsAllowed() || !line) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "sparkle";
    el.textContent = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    el.style.left = (4 + Math.random() * 88).toFixed(1) + "%";
    el.style.fontSize = (8 + Math.random() * 4).toFixed(1) + "px";
    el.style.color = "#e0524a";
    el.style.textShadow = "0 0 5px #e0524a";
    // scatter rather than rise, so it reads as interference
    el.style.setProperty("--dx", (Math.random() * 26 - 13).toFixed(1) + "px");
    el.style.setProperty("--dy", (Math.random() * 18 - 9).toFixed(1) + "px");
    el.style.setProperty("--dur", (380 + Math.random() * 220).toFixed(0) + "ms");
    el.style.animationDelay = (Math.random() * 120).toFixed(0) + "ms";
    line.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

// No drifting-zZz effect to match: #pet is overflow:hidden and #face is not a
// positioned ancestor, so anything absolutely positioned there is clipped or
// lands against the wrong box. The sleeping face already carries "zZz" in its
// own text, which is the same information without fighting the layout.

// The heart is for "happy to help", which is a narrower thing than "finished
// replying" - firing it on every answer would make it meaningless within a
// minute. It needs an actual warm moment: the user being appreciative, or
// Ember saying something plainly positive.
const APPRECIATION = /\b(thanks|thank you|thankyou|ty|cheers|appreciate it|appreciated|nice one|good bot|well done|you're the best|youre the best|love (it|this|you)|awesome|brilliant|perfect)\b/i;
const WARM_REPLY = /\b(happy to help|glad (i|to)|you're welcome|youre welcome|my pleasure|any time|anytime|great question|good question|nice work|well done|congratulations|congrats)\b/i;

function deservesHeart(userText, replyText) {
  if (userText && APPRECIATION.test(userText)) return true;
  // only the opening of the reply, so the phrase is the sentiment of the answer
  // rather than something quoted halfway down a long one
  if (replyText && WARM_REPLY.test(replyText.slice(0, 240))) return true;
  return false;
}

// A conversation switch used to replace the transcript within a single frame,
// which read as a glitch rather than a change of subject. Fades out, swaps,
// fades back in - and falls straight through to the swap when reactions are
// off, so nothing waits on an animation that is not running.
function withTopicTransition(repaint) {
  if (!reactionsAllowed()) return Promise.resolve(repaint());
  chat.classList.add("swapping");
  return new Promise((resolve) => {
    setTimeout(async () => {
      await repaint();
      chat.classList.remove("swapping");
      resolve();
    }, 180); // matches the CSS transition
  });
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
      flashFace("wink", 900);
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

// what the user actually typed, kept apart from the prompt that gets built
// around it - with a file attached the prompt is mostly document, and matching
// "thanks" against that would fire the heart on someone else's prose
let lastUserMessage = "";

async function onSend() {
  const text = input.value.trim();
  if (!text && !pendingUpload) return;
  lastUserMessage = text;
  input.value = "";
  send.disabled = true;
  petEl.classList.add("compact");

  playSendBeep();

  let messageToSend = text;
  // true when the reply will be built from an attached file, either read whole
  // or searched - both mean the answer is grounded in the document
  let usedRetrieval = false;
  if (pendingUpload) {
    usedRetrieval = true;
    const question = text || "Summarise this file.";
    const budget = attachmentCharBudget();

    if (pendingUpload.text.length <= budget) {
      // it fits, so retrieval would only lose information. Fence the contents
      // so the model can tell file from instruction - the original form opened
      // with a label and never closed it, leaving the question looking like
      // part of the document.
      messageToSend =
        `The user attached a file named "${pendingUpload.name}". Its full contents are between the markers below.\n` +
        `--- BEGIN ${pendingUpload.name} ---\n` +
        `${pendingUpload.text}\n` +
        `--- END ${pendingUpload.name} ---\n\n` +
        `${question}`;
      append("sys", "sys", `reading ${pendingUpload.name} in full`);
    } else {
      const result = retrieveExcerpts(pendingUpload, question, budget);
      messageToSend = buildRetrievalPrompt(pendingUpload, question, result);

      // say what was actually searched and used, so an answer drawn from three
      // sections of a large document is never mistaken for one drawn from all
      // of it
      if (!result.excerpts.length) {
        append("sys", "sys",
          result.searchedAll
            ? `searched all ${result.sectionCount} sections of ${pendingUpload.name} — nothing matched that question`
            : `that question has no searchable words in it — try naming something from ${pendingUpload.name}`);
      } else {
        const which = result.excerpts.map((e) => e.i + 1).join(", ");
        append("sys", "sys",
          `searched ${result.sectionCount} sections of ${pendingUpload.name}, using ${result.excerpts.length} ` +
          `(section${result.excerpts.length > 1 ? "s" : ""} ${which})`);
      }
    }
  }

  if (text) append("you", "you", text, { copyable: true });

  mood = Math.min(5, mood + 1);
  renderStats();

  await submitToModel(messageToSend, undefined, { fromDocument: usedRetrieval });
  // the attachment deliberately survives, so follow-ups can query it again.
  // Cleared with the ✕ on the attachment bar.
  input.focus();
}

// `ui` is kept separate from `opts`: opts is forwarded to the main process,
// and adding presentation flags to it would send them across IPC for no reason.
async function submitToModel(messageToSend, opts, ui = {}) {
  // The scanning face means "this answer is being built from your file", which
  // is true for the whole reply - not "searching now", which finished in
  // milliseconds before the model was ever called.
  if (ui.fromDocument) {
    setStatus("reading...");
    startSearching();
  } else {
    setStatus("thinking...");
    startThinking();
  }
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
      // a fuller face at full mood, so the bar above it means something visible
      setFace(mood >= 5 ? "delighted" : "happy");
      setStatus("happy");

      // on the reply line itself, so the reaction is attached to the thing
      // being reacted to
      sparkleOn(streamLine);
      if (deservesHeart(lastUserMessage, streamText || result.text)) heartOn(streamLine);
    }
    setTimeout(() => { setFace(restingFace()); setStatus("idle"); }, 1500);
  } catch (err) {
    stopThinking();
    if (streamLine && !streamText) streamLine.remove();
    const errLine = append("err", "err", String(err?.message || err));
    playErrorBeep();
    // a model that failed to load is a different kind of wrong from a reply
    // that went badly, and the face says which
    const loadFailure = /load|model|memory|not found/i.test(String(err?.message || err));
    setFace(loadFailure ? "dizzy" : "error");
    setStatus("error");
    glitchOn(errLine);
    setTimeout(() => { setFace(restingFace()); setStatus("idle"); }, 1500);
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
  // the reply line is captured before awaiting: the stream finishing clears
  // streamLine, and the puff belongs on the sentence that got cut off
  const stopped = streamLine;
  await window.emb3r.stopGeneration();
  puffOn(stopped);
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

// How much of the prompt the file's excerpts may occupy. This is the limit on
// what reaches the *model*, and is unrelated to how large a file may be - see
// MAX_ATTACHMENT_BYTES. Leaves room for the system prompt, the question and
// Ember's reply.
function attachmentCharBudget() {
  const size = lastContext && lastContext.size ? lastContext.size : 4096;
  return Math.max(Math.floor(size * 0.7) * CHARS_PER_TOKEN, MIN_ATTACHMENT_CHARS);
}

// ============================================================
// Large attachments: retrieval, not stuffing
// ============================================================
//
// A 5MB file is roughly 1.3 million tokens. The smallest context here is
// 4096, so a whole document is still well over 300x too large to put in a
// prompt - no model in the catalogue changes that, and truncating it silently
// would mean Ember answering confidently from page one of a textbook.
//
// So the file is never sent whole. It is split into fixed-size sections, and
// each question retrieves only the sections that look relevant, by keyword.
// Keyword rather than semantic search because embedding it locally would take
// minutes to hours on a CPU, while this is instant and needs no extra model
// download.
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// Big enough to hold a coherent passage, small enough that a handful fit in a
// 4096-token context. Also the scoring granularity: a match's position divided
// by this gives its section, so no separate index of offsets is needed.
const SECTION_CHARS = 1500;
const MAX_EXCERPTS = 6;

// words too common to say anything about relevance, plus the question-asking
// vocabulary that appears in nearly every prompt
const STOPWORDS = new Set(("the a an and or of to in on at by for with from as is are was were be been being " +
  "it its this that these those there here what which who whom whose how why when where do does did done " +
  "can could should would will shall may might must have has had i me my we our you your he she they them " +
  "not no nor so if then than too very just about into over under again more most some such only own same")
  .split(" "));

function tokenizeQuery(s) {
  // \p{L}\p{N} so this is not English-only
  return (String(s).toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);
}

// Scores every section against the question and returns the best few, in
// document order so they read naturally rather than in score order.
//
// Deliberately avoids building an inverted index: for a 20MB file that is
// millions of Map entries and hundreds of megabytes of overhead. Scanning one
// pre-lowercased copy of the text with indexOf is native-speed, needs one extra
// copy of the string, and is fast enough to run per question.
function retrieveExcerpts(doc, question, budgetChars) {
  const terms = [...new Set(tokenizeQuery(question))]
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

  const sectionCount = Math.max(1, Math.ceil(doc.lowerText.length / SECTION_CHARS));
  const scores = new Float64Array(sectionCount);
  const matchedTerms = [];

  for (const term of terms) {
    const positions = [];
    let from = 0;
    for (;;) {
      const at = doc.lowerText.indexOf(term, from);
      if (at === -1) break;
      positions.push(at);
      from = at + term.length;
      // a term this common is noise, not signal - stop rather than spend
      // the rest of the budget counting it
      if (positions.length >= 20000) break;
    }
    if (!positions.length) continue;
    matchedTerms.push(term);
    // rarer terms are the informative ones
    const idf = Math.log(1 + sectionCount / positions.length);
    for (const pos of positions) scores[Math.floor(pos / SECTION_CHARS)] += idf;
  }

  const ranked = [];
  for (let i = 0; i < sectionCount; i++) if (scores[i] > 0) ranked.push({ i, score: scores[i] });
  ranked.sort((a, b) => b.score - a.score);

  const picked = [];
  let used = 0;
  for (const { i } of ranked.slice(0, MAX_EXCERPTS)) {
    const text = doc.text.slice(i * SECTION_CHARS, (i + 1) * SECTION_CHARS);
    if (used + text.length > budgetChars) break;
    used += text.length;
    picked.push({ i, text });
  }
  picked.sort((a, b) => a.i - b.i);

  return { excerpts: picked, sectionCount, matchedTerms, searchedAll: terms.length > 0 };
}

// Builds the prompt from retrieved sections rather than the whole file, and is
// explicit with the model that it is seeing extracts - otherwise it answers as
// though it had read everything and the gaps become invented.
function buildRetrievalPrompt(doc, question, result) {
  const label = `${doc.name}`;
  if (!result.excerpts.length) {
    return `The user attached a file named "${label}" and asked a question, but no section of it matched the question.\n` +
      `Say plainly that you could not find anything relevant in the file, and do not guess at its contents.\n\n` +
      `Question: ${question}`;
  }

  const blocks = result.excerpts
    .map((e) => `--- ${label} · section ${e.i + 1} of ${result.sectionCount} ---\n${e.text}`)
    .join("\n\n");

  return `The user attached a file named "${label}". It is too large to include in full, so these are the ` +
    `${result.excerpts.length} section(s) most relevant to their question, out of ${result.sectionCount}. ` +
    `Other parts of the file are not shown.\n\n` +
    `${blocks}\n\n--- end of extracts ---\n\n` +
    `Answer using only these extracts. If they do not contain the answer, say so rather than assuming ` +
    `the rest of the file agrees with you.\n\nQuestion: ${question}`;
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

function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  return Math.max(1, Math.round(bytes / 1024)) + "KB";
}

// the attachment stays available for follow-up questions rather than being
// consumed by one send - the point of attaching a large document is asking
// several things about it
function renderAttachBar() {
  attachBar.replaceChildren();
  if (!pendingUpload) {
    attachBar.hidden = true;
    return;
  }
  attachBar.hidden = false;

  const label = document.createElement("span");
  label.className = "attachLabel";
  label.textContent =
    `📎 ${pendingUpload.name} · ${humanSize(pendingUpload.sizeBytes)} · ${pendingUpload.sectionCount} sections searchable`;
  attachBar.appendChild(label);

  const clear = document.createElement("button");
  clear.id = "attachClear";
  clear.type = "button";
  clear.title = "Remove this attachment";
  clear.textContent = "✕";
  clear.addEventListener("click", () => {
    pendingUpload = null;
    renderAttachBar();
    append("sys", "sys", "attachment removed");
  });
  attachBar.appendChild(clear);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  // checked before reading: pulling a 500MB file into a string to discover it
  // is too large would hang the window first and report second
  if (file.size > MAX_ATTACHMENT_BYTES) {
    append("err", "err",
      `${file.name} is ${humanSize(file.size)}, over the ${humanSize(MAX_ATTACHMENT_BYTES)} limit for one file. ` +
      `Split it up or attach a smaller part — Ember will not read half a file and pretend otherwise.`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result || "");

    if (looksBinary(content)) {
      append("err", "err",
        `${file.name} isn't a text file. Ember can only read text — try .txt, .md, code, .csv or .json.`);
      return;
    }
    if (!content.trim()) {
      append("err", "err", `${file.name} looks empty — nothing to read.`);
      return;
    }

    // one lowercased copy is the whole search index; see retrieveExcerpts
    pendingUpload = {
      name: file.name,
      sizeBytes: file.size,
      text: content,
      lowerText: content.toLowerCase(),
      sectionCount: Math.max(1, Math.ceil(content.length / SECTION_CHARS)),
    };
    renderAttachBar();

    const whole = content.length <= attachmentCharBudget();
    append("sys", "sys",
      whole
        ? `attached ${file.name} (${humanSize(file.size)}) — small enough to read in full. Ask away.`
        : `attached ${file.name} (${humanSize(file.size)}, ${pendingUpload.sectionCount} sections) — too big to read at ` +
          `once, so each question will search it and use the most relevant parts. Ask away.`);
    // only for a file big enough to need searching - reacting to every small
    // paste would make the expression meaningless
    if (!whole) flashFace("surprised", 1300);
  };
  reader.onerror = () => {
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
// no fixed fade timer any more - see waitForModelThenReveal(). The wordmark's
// own zoom/chime/glow beat is still timed, since that part is pure branding
// and has nothing to do with whether a model is loading.

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

function runBoot() {
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

// =============================
// Boot progress: the fire spirit
// =============================
//
// The old boot screen faded out on a fixed timer regardless of whether the
// model had actually finished loading - on a slow disk or a big model, the
// chat UI could appear before there was anything to chat with, and typing
// into it just produced "Ember can't reply right now: still loading" instead
// of feeling broken outright. This waits for the real thing.
//
// getLlama() itself (the native binding / GPU probe, measured at ~17s on real
// hardware in the hardware-aware work) has no progress signal at all - there
// is a real stretch here with genuinely nothing to report. The spirit's idle
// fidgeting exists specifically to cover that gap: the alternative is a
// frozen-looking screen for several seconds before any real number arrives.

const bootProgressEl  = document.getElementById("bootProgress");
const bootSpiritEl    = document.getElementById("bootSpirit");
const bootStatusEl    = document.getElementById("bootStatusLine");
const bootDetailEl    = document.getElementById("bootStatusDetail");
const bootFirstRunEl  = document.getElementById("bootFirstRun");
const bootBrazierEl   = document.getElementById("bootBrazier");
const bootLetterEls   = [...document.querySelectorAll("#bootLogo .bootLetter")];
// the brazier is the arrival point, not a progress step - the torches are the
// ones the spirit walks past, so it is excluded from the count that lights them
const torchFlameEls   = [...document.querySelectorAll("#torchRow .torch:not(.brazier) .torchFlame")];

// Two lines: a themed one that says what the fire is doing, and a factual one
// underneath naming the real step. The theme is decoration; the detail line is
// the part that has to stay true, so it carries the actual phase and, where a
// genuine number exists, the percentage.
const PHASE_THEME = {
  "warming up":        "striking the flint",
  "retrying on CPU":   "relighting on the hearth",
  "loading weights":   "feeding the fire",
  "preparing context": "banking the coals",
  "ready":             "lit",
};

// how far the simulated warm-up creep is allowed to go before it must stop
// and wait for a real number - matches LOAD_PHASE_SPAN.weights[0] in main.js,
// since real weights-loading progress will always start at or above this
const WARMUP_CAP = 0.05;

let bootOverall = 0;
let bootFinished = false;
let warmupCreepTimer = null;
let fidgetTimer = null;

function stopWarmupCreep() {
  if (warmupCreepTimer) { clearInterval(warmupCreepTimer); warmupCreepTimer = null; }
}

// Approaches WARMUP_CAP but never reaches it - an honest "something is
// happening, we just don't know how far along" rather than a fabricated
// percentage. Real progress always starts at or above the cap, so it can
// never be overtaken by this.
function startWarmupCreep() {
  stopWarmupCreep();
  warmupCreepTimer = setInterval(() => {
    // no status argument: the creep moves the bar, it does not change what the
    // screen claims is happening. Re-reading the visible text and passing it
    // back would feed the themed headline through the phase lookup and end up
    // mirroring it into the factual line.
    updateBootProgress(bootOverall + (WARMUP_CAP - bootOverall) * 0.04);
  }, 150);
}

function scheduleFidget() {
  if (bootFinished) return;
  fidgetTimer = setTimeout(() => {
    if (bootFinished || !bootSpiritEl) return;
    // remove-reflow-readd, not just add: the class may still be present from
    // the previous fidget, and re-adding an already-present class does not
    // restart a CSS animation
    bootSpiritEl.classList.remove("fidget");
    void bootSpiritEl.offsetWidth;
    bootSpiritEl.classList.add("fidget");
    scheduleFidget();
  }, 900 + Math.random() * 1300);
}

function stopFidget() {
  if (fidgetTimer) { clearTimeout(fidgetTimer); fidgetTimer = null; }
}

// The themed headline and the factual line move together, so they can never
// disagree about which phase is running.
function setBootStatus(status, detail) {
  if (!status) return;
  if (bootStatusEl) bootStatusEl.textContent = PHASE_THEME[status] || status;
  if (bootDetailEl) bootDetailEl.textContent = detail || status;
}

function updateBootProgress(fraction, status, detail) {
  bootOverall = Math.max(0, Math.min(1, fraction));
  if (bootSpiritEl) bootSpiritEl.style.left = (bootOverall * 100).toFixed(1) + "%";
  const lit = Math.min(torchFlameEls.length, Math.floor(bootOverall * torchFlameEls.length + 1e-6));
  torchFlameEls.forEach((el, i) => { if (i < lit) el.classList.add("lit"); });

  // heat runs through the wordmark at the same rate, so the letters and the
  // torches are visibly the same process
  const caught = Math.min(bootLetterEls.length,
                          Math.floor(bootOverall * bootLetterEls.length + 1e-6));
  bootLetterEls.forEach((el, i) => el.classList.toggle("caught", i < caught));

  // the brazier is the arrival, so it only catches on genuine completion -
  // never on the creep, which deliberately never reaches 1
  if (bootBrazierEl) bootBrazierEl.classList.toggle("lit", bootOverall >= 1);

  setBootStatus(status, detail);
}

function handleLoadProgress({ phase, phaseProgress, overall, status }) {
  if (bootFinished) return;
  if (phase === "warmup") {
    // a genuine restart (first warm-up, or a GPU->CPU fallback) - the torches
    // un-light too, since leaving one lit while the status says "retrying"
    // would show something that did not actually happen
    stopWarmupCreep();
    torchFlameEls.forEach((el) => el.classList.remove("lit"));
    bootLetterEls.forEach((el) => el.classList.remove("caught"));
    updateBootProgress(0, status, status);
    startWarmupCreep();
  } else {
    stopWarmupCreep();
    // only weights and context carry a real per-phase number; the warm-up
    // deliberately has none, so no percentage is shown for it
    const pct = typeof phaseProgress === "number"
      ? ` · ${Math.round(phaseProgress * 100)}%`
      : "";
    updateBootProgress(overall, status, status + pct);
  }
}

// Registers listeners before the state check below, not after - if the load
// finishes in the gap while that check is in flight, the event still lands on
// a listener that was already there. Checking first and listening second
// would leave a real race.
async function waitForModelThenReveal() {
  const MIN_BOOT_MS = 1400; // let the wordmark's own beat finish even on an instant load
  const started = performance.now();
  let revealed = false;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    bootFinished = true;
    stopWarmupCreep();
    stopFidget();
    const elapsed = performance.now() - started;
    setTimeout(() => {
      bootScreen.classList.add("fade-out");
      setTimeout(finishBoot, 500);
    }, Math.max(0, MIN_BOOT_MS - elapsed));
  };

  window.emb3r.onModelLoadProgress(handleLoadProgress);
  // model-ready firing at all - regardless of success or failure - is the
  // signal that the attempt is over. What to do about a failure is the
  // existing "can't reply right now" handling once the user actually sends
  // something; this only decides when it is safe to show the chat UI at all.
  window.emb3r.onModelReady(() => {
    if (revealed) return; // this listener also covers later profile/model switches
    // a satisfying "fully lit" moment before the fade, rather than cutting
    // straight from "in progress" to gone - the brazier flare needs a beat of
    // its own or it is gone before it has been seen
    updateBootProgress(1, "ready", "model loaded");
    setTimeout(reveal, 650);
  });

  const state = await window.emb3r.getModelState();
  if (state.needsSetup) {
    // a fresh install has no model to wait for, so the torches would never
    // light. Naming that beats cutting silently to the setup screen and
    // leaving the boot sequence looking like it was skipped.
    if (bootFirstRunEl) bootFirstRunEl.hidden = false;
    setTimeout(reveal, 900);
    return;
  }
  if (state.ready || state.error) {
    reveal();
    return;
  }

  // there is a real load in flight - show the torch row and start waiting
  setTimeout(() => bootProgressEl && bootProgressEl.classList.add("visible"), 650);
  updateBootProgress(0, "warming up", "starting up");
  startWarmupCreep();
  scheduleFidget();
}

runBoot();
waitForModelThenReveal();

// =============================
// Settings Panel
// =============================

const settingsButton = document.getElementById("settingsButton");
const closeSettings  = document.getElementById("closeSettings");
const soundToggle    = document.getElementById("soundToggle");
const animToggle     = document.getElementById("animToggle");
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
  // an attachment belongs to the conversation it was added to. This is the one
  // funnel every switch passes through, so dropping it here stops a document
  // quietly following the user into an unrelated chat.
  if (pendingUpload) {
    pendingUpload = null;
    renderAttachBar();
  }
  activeConversationId = conv ? conv.id : null;

  await withTopicTransition(() => {
    chat.replaceChildren();
    if (!conv || !conv.messages.length) return;
    for (const m of conv.messages) {
      if (m.role === "user") append("you", "you", m.text, { copyable: true });
      else appendStaticBotLine(m.text, m.source);
    }
    chat.scrollTop = chat.scrollHeight;
  });
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

// same shape as the sound preference above: on unless turned off, remembered
// across launches. The OS reduced-motion setting is honoured independently of
// this, so leaving it on never overrides someone's system preference.
const savedAnimations = localStorage.getItem("emb3rAnimations");
animationsEnabled = savedAnimations === null ? true : savedAnimations === "true";
animToggle.checked = animationsEnabled;
animToggle.addEventListener("change", (e) => {
    animationsEnabled = e.target.checked;
    localStorage.setItem("emb3rAnimations", String(animationsEnabled));
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

  // the pet reflects the lock too, but only once it is at rest - overwriting a
  // thinking or searching animation to announce a settings change would be the
  // face reporting the wrong thing
  const lockChanged = locked !== offlineLockOn;
  offlineLockOn = locked;
  if (lockChanged && !thinkTimer) setFace(restingFace());

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

// "4.9GB, roughly 13 min" beats "4.9GB" when someone is deciding whether to
// start a download now or later
function describeDownloadTime(sizeGB, mbps) {
  if (!mbps || mbps <= 0) return null;
  const minutes = (sizeGB * 8 * 1000) / mbps / 60;
  if (minutes < 1.5) return "under a minute";
  if (minutes < 60) return `roughly ${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `roughly ${hours < 2 ? hours.toFixed(1) : Math.round(hours)} hr`;
}

function describePick(state) {
  const { recommended, totalRamGB, why, speedNote } = state;
  const title = document.createElement("div");
  title.className = "pickName";
  const meta = document.createElement("div");
  meta.className = "pickMeta";

  if (!recommended) {
    // nothing in the catalog fits, so say that plainly instead of offering a
    // download that could only ever fail to load
    title.textContent = "No model fits this machine";
    meta.textContent = `${totalRamGB}GB of RAM is below what the smallest model needs. You can still browse the full list in Settings.`;
    setupPickEl.replaceChildren(title, meta);
    return;
  }

  title.textContent = `${recommended.name}  ★ recommended`;

  const lines = [
    `${recommended.sizeGB}GB download${speedNote ? ` • ${speedNote}` : ""}`,
    why,
    recommended.strength,
  ].filter(Boolean);
  meta.textContent = lines.join("\n");

  // filled in asynchronously once the speed probe returns
  const timing = document.createElement("div");
  timing.className = "pickMeta";
  timing.id = "setupTiming";
  timing.textContent = "estimating download time...";

  setupPickEl.replaceChildren(title, meta, timing);
}

// runs after the modal is already visible, so a slow or blocked probe never
// delays the thing the user is waiting to see
async function fillDownloadEstimate(sizeGB) {
  const el = document.getElementById("setupTiming");
  if (!el) return;
  const result = await window.emb3r.probeDownloadSpeed();
  if (!result || !result.ok) {
    el.textContent = result && result.reason === "no-consent"
      ? "download time depends on your connection"
      : "could not measure your connection — time will depend on it";
    return;
  }
  const time = describeDownloadTime(sizeGB, result.mbps);
  el.textContent = time
    ? `about ${time} at your current speed (~${result.mbps} Mbps)`
    : `measured ~${result.mbps} Mbps`;
}

function describeGpu(gpu) {
  if (!gpu || !gpu.backend) return "no usable GPU — will run on the CPU";
  const where = gpu.unifiedMemory ? "unified memory" : `${gpu.totalVramGB}GB VRAM`;
  return `${gpu.name || gpu.backend} • ${where} • ${gpu.backend}`;
}

async function maybeRunFirstTimeSetup() {
  const state = await window.emb3r.setupState();
  if (!state.needsSetup) return;

  const disk = state.freeDiskGB === null ? "" : ` • ${state.freeDiskGB.toFixed(0)}GB free`;
  setupHardwareEl.textContent =
    `${state.cpuModel}\n${state.cpuCores} cores • ${state.totalRamGB}GB RAM • ${state.platform}${disk}\n` +
    describeGpu(state.gpu);

  setupModelId = state.recommended ? state.recommended.id : null;
  describePick(state);
  setSetupButtonsEnabled(true);
  setupModal.classList.add("open");

  if (state.recommended) fillDownloadEstimate(state.recommended.sizeGB);
}

// The GPU probe can finish after the setup screen is already up, in which case
// the recommendation it shows was made without knowing about the GPU. Redo it
// rather than leaving a worse suggestion on screen. Only while the modal is
// open and untouched - never yank the choice out from under someone mid-click.
window.emb3r.onHardwareUpdated(async () => {
  if (!setupModal.classList.contains("open")) {
    await refreshModelList();
    return;
  }
  if (setupDownloadBtn.disabled) return; // a download is already under way
  const state = await window.emb3r.setupState();
  if (!state.needsSetup) return;
  setupHardwareEl.textContent =
    `${state.cpuModel}\n${state.cpuCores} cores • ${state.totalRamGB}GB RAM • ${state.platform}` +
    (state.freeDiskGB === null ? "" : ` • ${state.freeDiskGB.toFixed(0)}GB free`) + "\n" +
    describeGpu(state.gpu);
  setupModelId = state.recommended ? state.recommended.id : null;
  describePick(state);
  if (state.recommended) fillDownloadEstimate(state.recommended.sizeGB);
});

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
    metaEl.textContent =
      `~${m.sizeGB}GB • needs ${m.minRamGB}GB+ RAM` + (m.speedNote ? ` • ${m.speedNote}` : "");

    // the whole point of the list is choosing between them, which a tier label
    // and a filesize cannot help anyone do
    const tradeoffEl = document.createElement("div");
    tradeoffEl.className = "modelTradeoff";
    tradeoffEl.textContent = [m.strength, m.limit].filter(Boolean).join(" ");

    const rowProgressEl = document.createElement("div");
    rowProgressEl.className = "modelProgress";
    rowProgressEl.id = `progress-${m.id}`;

    row.append(nameEl, metaEl, tradeoffEl, rowProgressEl);

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
        setFace(restingFace());
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
