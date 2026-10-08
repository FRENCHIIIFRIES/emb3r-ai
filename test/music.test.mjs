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
  // "stop" is the button that stops her replying; on its own it is not about music
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
  // whatever the cover, what comes back is a colour the readability clamp can work with
  for (const c of [red, blue]) {
    assert.ok(c.s >= 45 && c.s <= 100, `saturation ${c.s}`);
    assert.ok(c.l >= 35 && c.l <= 70, `lightness ${c.l}`);
  }
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
