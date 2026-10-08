# Spotify, done properly — design

**Date:** 7 October 2026
**Status:** approved in conversation; first of six features asked for on this date
**Branch:** `feat/spotify-music`, on top of `fix/speech-idle-and-routing` (PR #70, still open)

## What was asked

"Update the PC app where it links to Spotify and knows what song I'm listening
to." Asked to choose, the answer was **everything**: Ember knows the song when
asked, shows it on screen, controls playback, and reacts to new songs. Music
moods — her face and accent following the song — were asked for in the same
message and are built on the same data, so they are part of this design.

The other five features asked for on the same day (accessibility and shortcuts,
reminders and timers, chat export, study mode, the wake word) each get their own
design. They are listed at the end so the order is recorded.

## What exists, and what is wrong with it

Measured by reading `main.js` and `src/renderer.js` on this branch, and the
config on the development machine (booleans only — no secret was printed):

| | |
|---|---|
| Sign-in | PKCE, no client secret, callback on `http://127.0.0.1:8888`. Correct by Spotify's current rules |
| On this machine | a Client ID is set, an access and a refresh token are stored, consent is given |
| Polling | every 10 s from the renderer, `GET /me/player/currently-playing` |
| What happens with the answer | the face switches to `music1`/`music2`, status reads "vibing", and the song is written into `chat.title` — **a hover tooltip on the transcript**, which nobody sees |
| Does Ember know the song? | **No.** It never reaches the prompt. Asked "what am I listening to?", she cannot know |
| Errors | swallowed. Any refusal from Spotify comes back as `{ connected: true, playing: false }`, indistinguishable from silence |

That last row matters more since Spotify's February 2026 changes: the account
that owns a development-mode Client ID **must hold Premium**, and every app was
moved onto that rule on 9 March 2026. A refused app looks exactly like "nothing
is playing" in the current code. The owner here has Premium, so the account
route stays open, and so does playback control, which Spotify only allows for
Premium.

Verified against Spotify's documentation on 7 October 2026: the currently-playing
endpoint is still available on `user-read-currently-playing`; pause, play, next
and previous are still available on `user-modify-playback-state`, Premium only;
quota is counted per developer account, and an exhausted quota answers 429 with
`"reason": "QUOTA_EXCEEDED"`.

## The design

### 1. What you see

- **A now-playing line under her face**, inside `#pet` below `#stats`:
  `♪ Blinding Lights — The Weeknd`, or `‖ paused · Blinding Lights — The Weeknd`.
  It replaces the tooltip. In the compact header it stays, one line, smaller.
- **For screen readers** it is an `aria-live="polite"` region that announces
  "Now playing: Blinding Lights by The Weeknd" when the song changes — not every
  ten seconds, only on a change.
- **Her music faces** as today, while something plays.

### 2. Music moods

- While a song plays, **her accent takes the album cover's colour**. The main
  process fetches the smallest cover image Spotify offers (64 px), decodes it
  with Electron's `nativeImage`, and picks the dominant vivid colour: a hue
  histogram weighted by saturation and brightness, ignoring greys. A greyscale
  cover changes nothing.
- The colour goes through the same readability clamp as the colour wheel
  (WCAG 4.5:1 against the theme's background), so a dark cover cannot make the
  interface unreadable.
- It is **temporary**: never written over the accent you chose. Ten seconds
  after the music stops, or the moment the toggle is turned off, your own
  colour comes back.
- One fetch per album, remembered for the session. The request goes through the
  existing network guard, is shown in the connection log as "Spotify cover
  art", and is refused by the offline lock like everything else.
- **Settings → Display: "Music moods — Ember takes her colour from the album
  cover while a song plays"**, on by default. It does nothing until Spotify is
  connected and something plays.

### 3. Ember knows the song

- `isMusicQuestion(text)`: a word-list check like the others in `main.js` —
  song, track, music, listening, playing, artist, singer, sings, band, album,
  tune, lyrics, "this one". No model call.
- When it matches, Spotify is connected and something is playing or paused,
  the song goes **beside** the question, the way remembered facts do:
  `Right now the user is listening to "Blinding Lights" by The Weeknd, from the
  album "After Hours" (2:14 of 3:20), on Spotify.` — and is trimmed back out of
  the history afterwards by the same `forgetAttachmentContext` call.
- **Only when this computer answers.** If `remoteFor()` sends the question to
  Gemini or another provider, the song is not attached. The listening data
  stays on the machine; the cost is that a web answer will not know which song
  "this" is.
- The now-playing answer is refreshed before it is used if it is more than
  15 seconds old, so "what is this?" means the song playing now.

### 4. Ember controls it

- `parseMusicCommand(text)`: the **whole message** must be a command — "pause",
  "pause the music", "stop the music", "play", "resume", "skip", "next",
  "next song", "skip this song", "go back", "previous", "previous song", "last
  song" — with punctuation and "please"/"ember" ignored. A sentence that merely
  contains "pause" is a question for the model, not a command.
- Checked after student mode's guard and before the model-ready check, so it
  works while the model is still loading. Done without the model; she answers
  with a fixed line ("Paused.", "Skipping.", "Back one.", "Playing."), and the
  exchange is saved like any other, marked `source: "spotify"`.
- **Shortcuts:** Ctrl+Alt+P play/pause, Ctrl+Alt+→ next, Ctrl+Alt+← previous,
  inside the app. (They go on the shortcut sheet the accessibility design adds.)
- Control needs the `user-modify-playback-state` scope. The granted scopes are
  stored at sign-in; when control is missing, she says so —
  "I can't control Spotify yet - reconnect it in Settings, Spotify, to let me
  pause and skip." — rather than failing.
- Spotify's own refusals are said in words: no active device ("Spotify isn't
  playing on any device right now"), not Premium, quota.

### 5. She reacts to new songs

- **Settings → Spotify: "React when a new song starts"**, off by default.
- When the track changes, she is not replying, and the window is visible: a
  short line of hers, with a sparkle. **Picked from a set of written lines**
  ("Ooh, {song}. Good pick.", "{artist}! My flames approve.", …), not
  generated: no model time, no memory, and no invented facts about the song.
- Shown in the transcript but **not saved** into the conversation and not put
  in the model's history — it is a reaction, not part of what was said.

### 6. Honest status

- `describeSpotifyError(status, body)` turns every refusal into a sentence:
  401 → "sign-in expired - reconnect"; 403 naming Premium → "Spotify refused:
  the account that owns this Client ID needs Premium (Spotify's rule since
  March 2026)"; 403 otherwise → "Spotify refused: {its message}"; 429 with
  `QUOTA_EXCEEDED` → "Spotify's request quota is used up - checking less
  often"; 429 otherwise → rate limited; network failure → "couldn't reach
  Spotify"; offline lock → "the offline lock is on".
- Settings → Spotify shows it under the Connect button, with the time it was
  last checked, and whether control is allowed.
- **Polling:** every 10 s while emb3r is visible, every 30 s while it is hidden,
  not at all under the offline lock. On a quota answer it waits for
  `Retry-After`, or five minutes when none is given.

## Where the code goes

- **`music.js`** (new, an ES module beside `main.js`): the pure parts —
  `isMusicQuestion`, `parseMusicCommand`, `musicContext`, `commandReply`,
  `describeSpotifyError`, `dominantColour`, `reactionLine`, `nextPollDelay`.
  No Electron imports, so the checks can import it directly.
- **`main.js`**: the Spotify requests (now-playing, control, cover art), the
  scope storage, the command step in `emb3r:send-message`, the music context in
  `extras`, the cover-art host label. New IPC: `emb3r:spotify-control`,
  `emb3r:spotify-cover-colour`, and a richer `emb3r:get-now-playing`.
- **`preload.cjs`**: `spotifyControl(action)`, `spotifyCoverColour(albumId, url)`.
- **`src/index.html` / `src/renderer.js`**: the now-playing line, music moods,
  reactions, the shortcuts, and the Spotify and Display settings rows.
- **`package.json`**: `music.js` added to `build.files`. The packaged app
  includes only listed files; a module left off that list loads in development
  and crashes the installed app — the same shape as the v1.36 speech fault.

## How it is checked

- **`harnesses/music-test.mjs`** imports `music.js` and runs the real
  functions: which messages are commands and which are questions; that "what
  does pause mean?" is not a command; the context sentence; every error
  wording; `dominantColour` on synthetic covers (a red cover, a greyscale one,
  a two-colour one); that reaction lines never contain an unfilled `{field}`.
- **`harnesses/packaged-files-test.mjs`** reads every relative import in
  `main.js` and fails if `build.files` does not include it.
- **Screens** with the emb3r-shoot skill (real renderer, stubbed IPC): the
  now-playing line, a cover colour applied, Settings → Spotify in each state.
- **Live**, with Spotify playing on the development machine: the line updates,
  "what am I listening to?" is answered correctly, "skip" skips, the colour
  follows the cover and returns afterwards.

## Out of scope

- Lyrics: copyrighted text, and not something the API offers.
- Audio features (tempo, energy): closed to apps like this one since November
  2024, so moods come from the cover, not the sound.
- Music from other players: the account route only sees Spotify.

## The order of the rest

Approved on 7 October, each with its own design:

1. **This** — Spotify and music moods.
2. Accessibility and keyboard shortcuts — shortcuts for everything and a sheet
   listing them, replies announced to screen readers, faces described, the
   broken Font Size slider fixed, high contrast and an easy-read font, and
   "explain what I copied".
3. Reminders and focus timers.
4. Chat export, Markdown and PDF.
5. Study mode: flashcards and quizzes.
6. The "Hey Ember" wake word — last because it is the largest: an always-on
   microphone that must be opt-in and visible, and a new speech model.
