// The pure parts of emb3r's Spotify features: what counts as a question about
// music or as a command, what Ember is told about the song, what a refusal from
// Spotify means in words, which colour an album cover is, and what she says
// when a new song starts.
//
// Nothing in here touches Electron or the network, so all of it can be run by
// `npm test` on any machine - the requests themselves live in main.js, behind
// the network guard.

// ---------------------------------------------------------------- questions

// Deliberately a word list, like needsCurrentInfo and the memory matcher: no
// model call, so deciding costs nothing. A false positive only means the song
// rides along with a question it did not bear on.
const MUSIC_WORDS =
  /\b(song|songs|track|tracks|music|listening|listen|playing|artist|singer|sings|sang|sung|band|album|tune|lyrics|spotify)\b|\bthis one\b|\bwho(?:'s| is) this\b/i;

export function isMusicQuestion(text) {
  return typeof text === "string" && MUSIC_WORDS.test(text);
}

// ---------------------------------------------------------------- commands

// The whole message has to be the command. "What does pause mean?" is a
// question for the model; "pause" is a request to pause. Patterns are matched
// against the message after the polite and the vocative are taken off it.
const COMMANDS = [
  ["pause", /^(pause|pause (the |my )?(music|song|track|spotify)|stop (the |my )?(music|song))$/],
  ["play", /^(play|resume|unpause|play (the |my )?(music|song)|resume (the |my )?(music|song))$/],
  ["next", /^(skip|next|skip (this |the )?(song|track)|next (song|track)|skip it)$/],
  ["previous", /^(previous|go back|back|previous (song|track)|last (song|track)|go back a (song|track)|play (the )?(previous|last) (song|track))$/],
];

export function parseMusicCommand(text) {
  if (typeof text !== "string") return null;
  const t = text.toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\b(please|ember|hey|can you|could you)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 6) return null;
  for (const [action, pattern] of COMMANDS) {
    if (pattern.test(t)) return action;
  }
  return null;
}

const REPLIES = { pause: "Paused.", play: "Playing.", next: "Skipping.", previous: "Back one." };

export function commandReply(action) {
  return REPLIES[action] || "Done.";
}

// ---------------------------------------------------------------- context

function clock(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// What the model is told, beside the question. Saying so when nothing is
// playing matters as much as naming the song: without it, a small model asked
// "what am I listening to?" invents one.
export function musicContext(np) {
  if (!np) return null;
  if (!np.track) {
    return np.connected && !np.error ? "Nothing is playing on the user's Spotify right now." : null;
  }
  const state = np.playing ? "is listening to" : "has paused";
  const album = np.album ? `, from the album "${np.album}"` : "";
  const place = np.durationMs ? ` (${clock(np.progressMs)} of ${clock(np.durationMs)})` : "";
  return `Right now the user ${state} "${np.track}" by ${np.artist}${album}${place}, on Spotify.`;
}

// ---------------------------------------------------------------- refusals

// Every way Spotify can say no, said in words. The previous code turned all of
// them into "nothing is playing", which is how an app refused since March 2026
// - when Spotify began requiring Premium of the account that owns a Client ID -
// would have looked exactly like silence.
export function describeSpotifyError({ status, body, error, during = "read" } = {}) {
  if (error) {
    if (error.isOfflineLock || error.name === "OfflineLockError") {
      return { kind: "locked", text: "the offline lock is on, so emb3r is not asking Spotify" };
    }
    return { kind: "network", text: "couldn't reach Spotify - check the connection" };
  }
  const message = String(
    (body && body.error && (body.error.message || body.error)) || (body && body.error_description) || "",
  ).trim();
  const reason = String((body && ((body.error && body.error.reason) || body.reason)) || "");

  if (status === 401) return { kind: "auth", text: "the Spotify sign-in has expired - reconnect it" };
  if (status === 403) {
    if (/scope/i.test(message)) {
      return { kind: "scope", text: "Spotify hasn't given emb3r that permission - disconnect and connect again" };
    }
    if (/premium/i.test(message) || reason === "PREMIUM_REQUIRED") {
      return during === "control"
        ? { kind: "premium", text: "Spotify refused: pausing and skipping need Spotify Premium" }
        : { kind: "premium", text: "Spotify refused: the account that owns this Client ID needs Premium - Spotify's rule since March 2026" };
    }
    return { kind: "refused", text: `Spotify refused: ${message || "no reason given"}` };
  }
  if (status === 404 && /device/i.test(`${message} ${reason}`)) {
    return { kind: "no-device", text: "Spotify isn't playing on any device right now" };
  }
  if (status === 429) {
    return reason === "QUOTA_EXCEEDED" || /quota/i.test(message)
      ? { kind: "quota", text: "Spotify's request quota is used up - checking less often" }
      : { kind: "rate", text: "Spotify asked emb3r to slow down - checking less often" };
  }
  return { kind: "other", text: `Spotify answered ${status}${message ? `: ${message}` : ""}` };
}

// ---------------------------------------------------------------- cover colour

// The colour a cover reads as, from its pixels in the BGRA order
// nativeImage.toBitmap() gives them. Hue is counted in 10-degree bins, each
// pixel weighted by how saturated and how bright it is, so a small vivid patch
// can outweigh a large dull one, and greys and near-blacks do not count at all.
// A cover with almost no colour in it gives null: it changes nothing.
export function dominantColour(bgra) {
  const bins = new Float64Array(36);
  const hues = new Float64Array(36);
  const sats = new Float64Array(36);
  const vals = new Float64Array(36);
  let pixels = 0;
  let coloured = 0;
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    if (bgra[i + 3] < 128) continue;
    pixels++;
    const b = bgra[i] / 255;
    const g = bgra[i + 1] / 255;
    const r = bgra[i + 2] / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    const s = max === 0 ? 0 : d / max;
    if (s < 0.25 || max < 0.2) continue;
    coloured++;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const bin = Math.min(35, Math.floor(h / 10));
    const w = s * max;
    bins[bin] += w;
    hues[bin] += h * w;
    sats[bin] += s * w;
    vals[bin] += max * w;
  }
  if (!pixels || coloured / pixels < 0.05) return null;

  // a bin with strong neighbours wins over an isolated one of the same weight
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < 36; i++) {
    const score = bins[i] + 0.5 * (bins[(i + 35) % 36] + bins[(i + 1) % 36]);
    if (bins[i] > 0 && score > bestScore) { bestScore = score; best = i; }
  }
  const w = bins[best];
  const h = hues[best] / w;
  const sv = sats[best] / w;
  const v = vals[best] / w;

  // HSV to HSL, then held where the readability clamp can do its work without
  // turning the colour into grey or white
  const l = v * (1 - sv / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return {
    h: Math.round(h),
    s: Math.round(Math.max(45, Math.min(100, sl * 100))),
    l: Math.round(Math.max(35, Math.min(70, l * 100))),
  };
}

// ---------------------------------------------------------------- reactions

// Written, not generated: no model time, no memory, and nothing she says can
// be an invented fact about the song.
const REACTIONS = [
  "Ooh, {track}. Good pick.",
  "{artist}! My flames approve.",
  "Now playing: {track}. I'm listening too.",
  "{track} - turning my fire up a notch.",
  "Ah, {artist}. Nice.",
  "New song, new mood: {track}.",
  "{track}? I'll keep the coil warm for this one.",
  "Okay, {artist}. Good choice.",
];

export function reactionLine(np, pick = Math.random) {
  if (!np || !np.track) return null;
  const firstArtist = String(np.artist || "").split(",")[0].trim() || "this one";
  const line = REACTIONS[Math.floor(pick() * REACTIONS.length) % REACTIONS.length];
  return line.replace("{track}", np.track).replace("{artist}", firstArtist);
}
