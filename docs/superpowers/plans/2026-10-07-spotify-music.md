# Spotify, done properly — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ember knows, shows, controls and reacts to the song playing on Spotify, and her accent follows the album cover, with every Spotify refusal said in words.

**Architecture:** The pure logic — what is a command, what is a music question, what Ember is told, what an error means, which colour a cover is, what she says to a new song — goes in a new `music.js` module with no Electron imports, tested with Node's built-in runner. `main.js` makes the Spotify requests through the existing network guard and wires the logic into `emb3r:send-message`. The renderer draws the now-playing line, paints the temporary accent, shows reactions and handles the shortcuts.

**Tech Stack:** Electron (ESM main process), Spotify Web API (PKCE), Node `node:test`, Electron `nativeImage`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-07-spotify-music-design.md`.
- Branch `feat/spotify-music`, on top of `fix/speech-idle-and-routing` (PR #70). Do not merge or release.
- The song is attached to a prompt **only when the local model answers** — never when `remoteFor()` routes to Gemini or a custom provider.
- Every new file the main process imports must be listed in `package.json` `build.files`.
- Reactions are written lines, never generated; not saved to the conversation.
- Music moods never overwrite the saved accent (`localStorage.emb3rAccentColor`).
- A Ctrl+Alt key press with AltGraph held is a character, not a shortcut.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

| File | Change |
|---|---|
| `music.js` | **new** — pure helpers |
| `test/music.test.mjs` | **new** — tests for every helper |
| `test/packaged-files.test.mjs` | **new** — every relative import of `main.js` is packaged |
| `package.json` | `test` script; `music.js` in `build.files` |
| `.github/workflows/build.yml` | run `npm test` before building |
| `main.js` | config keys, scopes, `spotifyApi`, now-playing, control, cover colour, command step, music context, host label |
| `preload.cjs` | `spotifyControl`, `spotifyCoverColour`, `setSpotifyReactions` |
| `src/index.html` | `#nowPlaying`, Spotify settings rows and notes, Music moods toggle, CSS |
| `src/renderer.js` | now-playing line, adaptive polling, health text, music moods, reactions, shortcuts, `paintAccent` |

---

### Task 1: `music.js` and its tests

**Files:** Create `music.js`, `test/music.test.mjs`, `test/packaged-files.test.mjs`. Modify `package.json`, `.github/workflows/build.yml`.

**Interfaces — produces:**
- `isMusicQuestion(text: string): boolean`
- `parseMusicCommand(text: string): "pause" | "play" | "next" | "previous" | null`
- `commandReply(action): string`
- `musicContext(np): string | null` — `np` is a now-playing object (below)
- `describeSpotifyError({ status?, body?, error?, during? }): { kind, text }`
- `dominantColour(bgra: Uint8Array | Buffer): { h, s, l } | null`
- `reactionLine(np, pick = Math.random): string | null`

Now-playing object: `{ connected, playing, id, track, artist, album, albumId, artUrl, progressMs, durationMs, error?, errorKind?, retryAfterMs?, reaction? }`.

- [ ] **Step 1: Write the failing tests** — `test/music.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMusicQuestion, parseMusicCommand, commandReply, musicContext,
  describeSpotifyError, dominantColour, reactionLine,
} from "../music.js";

test("music questions are recognised by the words people use", () => {
  for (const q of ["what am I listening to?", "who sings this?", "is this song sad?", "what album is this from"]) {
    assert.equal(isMusicQuestion(q), true, q);
  }
  for (const q of ["what is the capital of France?", "help me with my maths homework"]) {
    assert.equal(isMusicQuestion(q), false, q);
  }
});

test("a command is the whole message, not a word inside one", () => {
  assert.equal(parseMusicCommand("pause"), "pause");
  assert.equal(parseMusicCommand("Pause the music, please!"), "pause");
  assert.equal(parseMusicCommand("ember, skip this song"), "next");
  assert.equal(parseMusicCommand("next song"), "next");
  assert.equal(parseMusicCommand("go back"), "previous");
  assert.equal(parseMusicCommand("resume"), "play");
  assert.equal(parseMusicCommand("what does pause mean?"), null);
  assert.equal(parseMusicCommand("skip to the next question in my homework"), null);
  assert.equal(parseMusicCommand("stop"), null);
});

test("every command has her answer", () => {
  for (const a of ["pause", "play", "next", "previous"]) assert.ok(commandReply(a).length > 0);
});

test("the context names the song, the artist, the album and the place in it", () => {
  const np = { connected: true, playing: true, track: "Blinding Lights", artist: "The Weeknd", album: "After Hours", progressMs: 134000, durationMs: 200000 };
  assert.equal(musicContext(np),
    'Right now the user is listening to "Blinding Lights" by The Weeknd, from the album "After Hours" (2:14 of 3:20), on Spotify.');
  assert.match(musicContext({ ...np, playing: false }), /has paused "Blinding Lights"/);
  assert.equal(musicContext({ connected: true, playing: false }), "Nothing is playing on the user's Spotify right now.");
  assert.equal(musicContext({ connected: true, playing: false, error: "x" }), null);
  assert.equal(musicContext(null), null);
});

test("every refusal is said in words", () => {
  assert.equal(describeSpotifyError({ status: 401 }).kind, "auth");
  assert.equal(describeSpotifyError({ status: 403, body: { error: { message: "Active premium subscription required for the owner of the app." } } }).kind, "premium");
  assert.equal(describeSpotifyError({ status: 403, body: { error: { message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } }, during: "control" }).text,
    "Spotify refused: pausing and skipping need Spotify Premium");
  assert.equal(describeSpotifyError({ status: 403, body: { error: { message: "Insufficient client scope" } } }).kind, "scope");
  assert.equal(describeSpotifyError({ status: 404, body: { error: { message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } } }).kind, "no-device");
  assert.equal(describeSpotifyError({ status: 429, body: { error: { message: "Too many requests" }, reason: "QUOTA_EXCEEDED" } }).kind, "quota");
  assert.equal(describeSpotifyError({ status: 429 }).kind, "rate");
  assert.equal(describeSpotifyError({ error: { isOfflineLock: true } }).kind, "locked");
  assert.equal(describeSpotifyError({ error: new TypeError("fetch failed") }).kind, "network");
});

/** A cover as nativeImage.toBitmap() gives it: BGRA, four bytes a pixel. */
function cover(pixels) {
  return Uint8Array.from(pixels.flatMap(([r, g, b]) => [b, g, r, 255]));
}

test("a red cover is red, a grey one changes nothing, a mostly-blue one is blue", () => {
  const red = dominantColour(cover(Array(100).fill([220, 30, 40])));
  assert.ok(red.h < 10 || red.h > 350, `hue ${red.h}`);
  assert.equal(dominantColour(cover(Array(100).fill([128, 128, 128]))), null);
  const blue = dominantColour(cover([...Array(70).fill([30, 60, 210]), ...Array(30).fill([230, 200, 40])]));
  assert.ok(blue.h > 200 && blue.h < 250, `hue ${blue.h}`);
});

test("reaction lines are filled in, never left with a {field}", () => {
  const np = { track: "Blinding Lights", artist: "The Weeknd, Someone Else" };
  for (let i = 0; i < 50; i++) {
    const line = reactionLine(np, () => i / 50);
    assert.ok(line && !/[{}]/.test(line), line);
    assert.ok(!line.includes("Someone Else"), "names the first artist only");
  }
  assert.equal(reactionLine({}), null);
});
```

`test/packaged-files.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The installed app contains only what package.json's build.files lists. A
// module main.js imports but the list leaves out works in development and
// crashes the installed app - the shape of the v1.36 speech fault.
test("every file main.js imports is packaged", () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const files = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).build.files;
  const imports = [...main.matchAll(/from\s+["']\.\/([^"']+)["']/g)].map((m) => m[1]);
  for (const f of imports) assert.ok(files.includes(f), `${f} is imported by main.js but not in build.files`);
});
```

- [ ] **Step 2: Run them to see them fail** — `npm test` → fails: `Cannot find module '../music.js'`.

- [ ] **Step 3: Write `music.js`** (complete file in the commit; the shapes above). Points that matter:
  - `parseMusicCommand` lowercases, strips `.,!?` and the words please/ember/hey, rejects more than six words, then matches whole-message patterns.
  - `musicContext` formats `m:ss` and returns the "Nothing is playing" sentence only for a connected answer with no error.
  - `describeSpotifyError` checks scope before Premium; `during: "control"` words Premium for the listener, otherwise for the Client ID's owner.
  - `dominantColour` bins hue in 10° steps weighted by HSV saturation × value, skips pixels below 0.25 saturation or 0.2 value, returns `null` when under 5% of pixels are coloured, and returns HSL with saturation lifted to at least 45 and lightness held between 35 and 70 before the renderer's readability clamp.

- [ ] **Step 4: `package.json`** — add `"test": "node --test test/"` to `scripts`, and `"music.js"` to `build.files` after `"main.js"`. In `.github/workflows/build.yml`, after the install step, add a step `name: Unit tests`, `run: npm test`.

- [ ] **Step 5: Run** — `npm test` → all pass.

- [ ] **Step 6: Commit** — `git add music.js test package.json .github/workflows/build.yml` and commit "The music logic on its own, and tests that run it".

### Task 2: Spotify requests in `main.js`

**Files:** Modify `main.js`, `preload.cjs`.

**Interfaces — consumes:** Task 1's exports. **Produces:** IPC `emb3r:get-now-playing` → now-playing object; `emb3r:spotify-control(action)` → `{ success, action?, reply?, error? }`; `emb3r:spotify-cover-colour(albumId, url)` → `{h,s,l} | null`; `emb3r:set-spotify-reactions(on)`; `emb3r:spotify-status` → `{ connected, canControl, lastError, reactions }`. Functions `readNowPlaying()`, `spotifyControl(action)`, `currentMusicContext()` for Task 3.

- [ ] **Step 1:** import the helpers: `import { isMusicQuestion, parseMusicCommand, commandReply, musicContext, describeSpotifyError, dominantColour, reactionLine } from "./music.js";` and add `nativeImage` to the electron import.
- [ ] **Step 2:** `defaultConfig()` gains `spotifyScopes: ""` and `spotifyReactions: false`.
- [ ] **Step 3:** `connect-spotify` asks for `user-read-currently-playing user-read-playback-state user-modify-playback-state` and stores `config.spotifyScopes = tokenData.scope || ""`. `disconnect-spotify` clears it.
- [ ] **Step 4:** add `spotifyApi(method, path, during)`: offline lock → `describeSpotifyError({ error: { isOfflineLock: true } })` without a request; token via `ensureSpotifyToken`; 204 → ok; non-2xx → described error with `retryAfterMs` from `Retry-After`, else 5 min for quota and 30 s for rate.
- [ ] **Step 5:** replace `emb3r:get-now-playing` with `readNowPlaying()`: richer object; smallest cover image; `spotifyLast = { at, data }`; a `reaction` only when the track id changes after the first answer, reactions are on, and it is playing; errors returned as `{ connected: true, playing: false, error, errorKind, retryAfterMs }` and remembered in `spotifyLastError`.
- [ ] **Step 6:** add `spotifyControl(action)` with `toggle` resolved by reading now-playing first; refuses without the scope in Ember's words; clears `spotifyLast` after a change.
- [ ] **Step 7:** add `emb3r:spotify-cover-colour`: only `https://i.scdn.co/` URLs; cached per album; `nativeImage.createFromBuffer` → resize 32×32 → `dominantColour(toBitmap())`.
- [ ] **Step 8:** `describeHost`: `scdn.co` → "Spotify cover art", before the `spotify.com` rule.
- [ ] **Step 9:** `emb3r:spotify-status` returns `canControl` (scope present) , `lastError` text and `reactions`; `emb3r:set-spotify-reactions` saves the toggle.
- [ ] **Step 10:** preload: `spotifyControl`, `spotifyCoverColour`, `setSpotifyReactions`.
- [ ] **Step 11:** `node --check main.js` passes; `npm test` passes. Commit "Spotify answers in words, and can be asked to pause and skip".

### Task 3: Ember knows the song, and does what she is told

**Files:** Modify `main.js`.

- [ ] **Step 1:** factor the safe-mode persistence into `persistFixedExchange(userMessage, reply, source)` and use it there.
- [ ] **Step 2:** after the safe-mode block, the command step: when Spotify is connected and `parseMusicCommand` matches, run `spotifyControl`, send `answer-source { source: "spotify", model: "Spotify" }` and the reply as one token, persist with source `spotify`, return.
- [ ] **Step 3:** `currentMusicContext()`: nothing without Spotify or under the lock; reuses `spotifyLast` when under 15 s old, otherwise `readNowPlaying()`; returns `musicContext(np)`.
- [ ] **Step 4:** in the message handler, `const music = !remote && isMusicQuestion(userMessage) ? await currentMusicContext() : null;` and `extras = [memories, music, attachmentContext]`.
- [ ] **Step 5:** `node --check main.js`; commit "She knows what is playing when you ask, and pauses when you tell her".

### Task 4: The now-playing line, honest status, adaptive polling

**Files:** Modify `src/index.html`, `src/renderer.js`.

- [ ] **Step 1:** `#nowPlaying` after `#stats`, `aria-live="polite"`, `hidden`; CSS: 13px, 70% of the accent, one line with ellipsis; compact 12px.
- [ ] **Step 2:** `renderNowPlaying(info)`: visible `♪ track — artist` / `‖ paused · …` (aria-hidden) plus a screen-reader span "Now playing: track by artist" — rewritten only when the text changes, so the live region speaks only on a change. Remove the `chat.title` tooltip.
- [ ] **Step 3:** polling becomes a `setTimeout` chain: 10 s visible, 30 s hidden, or the `retryAfterMs` Spotify asked for; `visibilitychange` re-polls on return.
- [ ] **Step 4:** the music faces no longer overwrite other faces: on "not playing", return to rest only if a music face is showing.
- [ ] **Step 5:** Settings → Spotify status: `connected`, plus the last error, plus "reconnect to let Ember pause and skip" when control is missing; the new notes. Commit "The song where you can see it, and Spotify's answer where you can read it".

### Task 5: Music moods

**Files:** Modify `src/index.html`, `src/renderer.js`.

- [ ] **Step 1:** split `applyColor()` into `paintAccent(h, s, l)` (paints, never saves) and the saving wrapper; `--hover-color` becomes `hsla(h, s%, l%, 0.2)` — `color + "33"` produced `hsl(...)33`, which CSS rejects. Add `reapplySavedAccent()`.
- [ ] **Step 2:** `updateMusicMood(info)`: one cover-colour request per album; grey covers change nothing; ten seconds after the music stops, `reapplySavedAccent()`. Theme change repaints the mood colour if one is showing.
- [ ] **Step 3:** Display toggle `#musicMoodToggle` (localStorage `emb3rMusicMoods`, on unless turned off), added to both CSS toggle-row lists. Commit "Her colour follows the album cover, and gives yours back".

### Task 6: Reactions

**Files:** Modify `src/index.html`, `src/renderer.js`.

- [ ] **Step 1:** `#spotifyReactToggle` row in Settings → Spotify, wired to `setSpotifyReactions`.
- [ ] **Step 2:** `reactToSong(text)`: a bot line, never over a reply in progress, with a sparkle; not persisted. Commit "She says something when a new song starts, if asked to".

### Task 7: Shortcuts

**Files:** Modify `src/renderer.js`.

- [ ] **Step 1:** document `keydown`: Ctrl+Alt+P → toggle, Ctrl+Alt+→ → next, Ctrl+Alt+← → previous; ignored with Shift/Meta or AltGraph held, or when Spotify is not connected. The result goes in the transcript as a sys line and the line refreshes. Commit "Spotify from the keyboard, without stealing AltGr".

### Task 8: Proof

- [ ] Screens with the emb3r-shoot skill: the now-playing line (playing, paused), a cover colour applied, Settings → Spotify healthy / missing control / refused.
- [ ] The hover fix shown: computed background of an active settings tab with a custom accent, before and after.
- [ ] Live, with Spotify playing: the line, "what am I listening to?", "skip", Ctrl+Alt+P, the colour following and returning.
