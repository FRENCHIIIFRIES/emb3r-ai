import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// src/talk.js is a classic script, as the page loads it
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../src/talk.js", import.meta.url), "utf8"), ctx);
const { createEndpointer, talkStatus, meterHeights } = ctx.emb3rTalk;

const QUIET = 0.004;   // a room, after the browser's noise suppression
const VOICE = 0.12;    // someone talking at a laptop

// feeds a level for a length of time in 50 ms frames; returns each answer
function feed(ep, level, ms) {
  const said = [];
  for (let t = 0; t < ms; t += 50) said.push(ep.push(level, 50));
  return said;
}

test("quiet, a sentence, quiet again: it ends a little after the last word", () => {
  const ep = createEndpointer();
  assert.ok(feed(ep, QUIET, 600).every((a) => a === "wait"));
  const during = feed(ep, VOICE, 2000);
  assert.equal(during[0], "wait", "one loud frame is not yet a voice");
  assert.equal(during[during.length - 1], "speech");
  const after = feed(ep, QUIET, 2000);
  const doneAt = after.indexOf("done");
  assert.ok(doneAt >= 0, "it never ended");
  const ms = (doneAt + 1) * 50;
  assert.ok(ms >= 1000 && ms <= 1600, `ended ${ms} ms after the last word`);
  assert.ok(after.slice(0, doneAt).every((a) => a === "speech"));
});

test("nobody speaks: it gives up after eight seconds, and says so", () => {
  const ep = createEndpointer();
  const said = feed(ep, QUIET, 9000);
  const at = said.indexOf("silence");
  assert.equal((at + 1) * 50, 8000);
  assert.ok(said.slice(0, at).every((a) => a === "wait"));
});

test("a click or a cough is not a voice", () => {
  const ep = createEndpointer();
  feed(ep, QUIET, 500);
  feed(ep, 0.5, 100);
  const said = feed(ep, QUIET, 3000);
  assert.ok(said.every((a) => a === "wait"), "a tenth of a second of noise started a sentence");
});

test("a breath between words does not end the sentence", () => {
  const ep = createEndpointer();
  feed(ep, QUIET, 300);
  feed(ep, VOICE, 1500);
  assert.ok(feed(ep, QUIET, 700).every((a) => a === "speech"), "a pause of 0.7 s ended it");
  feed(ep, VOICE, 1000);
  assert.ok(feed(ep, QUIET, 2000).includes("done"));
});

test("a steady hum is the room and not a voice, and a voice over it still is", () => {
  const ep = createEndpointer();
  // a fan: louder than a quiet room, and constant
  assert.ok(feed(ep, 0.03, 4000).every((a) => a === "wait"));
  const during = feed(ep, 0.25, 1500);
  assert.equal(during[during.length - 1], "speech");
  assert.ok(feed(ep, 0.03, 2000).includes("done"), "back to the hum is the end of the sentence");
});

test("someone who starts talking the moment it opens is still heard", () => {
  const ep = createEndpointer();
  const during = feed(ep, VOICE, 1500);
  assert.equal(during[during.length - 1], "speech");
  assert.ok(feed(ep, QUIET, 2000).includes("done"));
});

test("it never listens for more than a minute", () => {
  const ep = createEndpointer();
  const said = feed(ep, VOICE, 61000);
  assert.equal((said.indexOf("done") + 1) * 50, 60000);
  // and having ended, it goes on saying so
  assert.equal(ep.push(VOICE, 50), "done");
  assert.equal(ep.push(QUIET, 50), "done");
});

test("the times can be set, for the test of a room that is never quiet", () => {
  const ep = createEndpointer({ endMs: 400, giveUpMs: 1000 });
  assert.ok(feed(ep, QUIET, 1000).includes("silence"));
  const other = createEndpointer({ endMs: 400 });
  feed(other, VOICE, 600);
  const after = feed(other, QUIET, 1000);
  assert.equal((after.indexOf("done") + 1) * 50, 400);
});

// One line that always says what is happening, and one button that always
// says what pressing it will do.
test("the Talk screen says what is happening and what its button does", () => {
  const at = (s) => ({ ...talkStatus(s) });
  assert.deepEqual(at({}), { line: "your turn. press space, or tap talk", button: "talk", act: "talk" });
  assert.deepEqual({ ...talkStatus() }, { line: "your turn. press space, or tap talk", button: "talk", act: "talk" });
  assert.deepEqual(at({ opening: true }), { line: "opening the microphone", button: "talk", act: "none" });
  assert.deepEqual(at({ listening: true }), { line: "listening. go ahead", button: "send", act: "send" });
  assert.deepEqual(at({ listening: true, heard: true }), { line: "listening. it sends when you stop talking", button: "send", act: "send" });
  assert.deepEqual(at({ listening: true, heard: true, held: true }), { line: "listening. let go to send", button: "send", act: "send" });
  assert.deepEqual(at({ transcribing: true }), { line: "working out what you said", button: "talk", act: "none" });
  assert.deepEqual(at({ thinking: true }), { line: "thinking", button: "stop", act: "stop" });
  assert.deepEqual(at({ answering: true }), { line: "answering", button: "stop", act: "stop" });
  assert.deepEqual(at({ speaking: true }), { line: "speaking. press space to talk over her", button: "talk", act: "talk" });
  // her answer is written and her voice is still being made: a few seconds in
  // which the screen must not say it is your turn, or you talk over her first word
  assert.deepEqual(at({ readying: true }), { line: "about to speak", button: "talk", act: "talk" });
  assert.equal(talkStatus({ readying: true, speaking: true }).line, "speaking. press space to talk over her");
});

test("what is happening now wins over what was happening a moment ago", () => {
  // talking over her: the microphone is open while the last of her sentence is still in the air
  assert.equal(talkStatus({ listening: true, speaking: true }).button, "send");
  assert.equal(talkStatus({ thinking: true, speaking: true }).button, "stop");
  assert.equal(talkStatus({ opening: true, speaking: true }).line, "opening the microphone");
});

// The meter: the last second and a half of loudness, oldest on the left.
test("the meter is a row of bar heights, quiet as a flat line and loud as tall", () => {
  let bars = meterHeights([], 0, 8);
  assert.equal(bars.length, 8);
  assert.ok(Array.from(bars).every((h) => h === 0));
  bars = meterHeights(bars, 0.25, 8);
  assert.equal(bars.length, 8);
  assert.equal(bars[7], 1, "a loud voice fills the bar");
  assert.equal(bars[6], 0, "and the bars before it are still the quiet that came first");
  bars = meterHeights(bars, 0.02, 8);
  assert.equal(bars[6], 1);
  assert.ok(bars[7] > 0.05 && bars[7] < 0.4, `a murmur is a short bar, not ${bars[7]}`);
  bars = meterHeights(bars, -1, 8);
  assert.equal(bars[7], 0, "nonsense in is a flat bar, never a crash");
});
