// Talking to Ember: the decisions, kept apart from the microphone and the page
// so the tests can run every one of them. When has someone finished speaking?
// What does the Talk screen say is happening, and what will its button do? How
// tall is each bar of the meter?
//
// Pure, and a classic script loaded before renderer.js, so the tests run it in
// a context of their own exactly as the page does (test/talk.test.mjs).
(function (root) {
  "use strict";

  // ---- listening that ends by itself -----------------------------------------
  //
  // Holding a button down for as long as a question lasts is a walkie-talkie,
  // not a conversation. So a tap opens the microphone and this decides when the
  // sentence is over: fed the loudness of the microphone a few dozen times a
  // second, it answers "wait" (no voice yet), "speech" (hearing one), "done"
  // (they have stopped) or "silence" (nobody spoke, so stop listening).
  //
  // The line between a room and a voice is not a fixed number: a fan, a
  // laptop's own gain control and a quiet bedroom are all different rooms. The
  // room is measured as it goes - whatever is below the line - and a voice is
  // anything a few times louder than that, for long enough not to be a click.
  const DEFAULTS = {
    startMs: 150,     // this long above the line is a voice and not a cough
    endMs: 1300,      // this long below it, after a voice, is the end of the sentence
    giveUpMs: 8000,   // nobody has said anything
    maxMs: 60000,     // the listening model takes a minute at most
    floorMin: 0.012,  // quieter than this is never a voice
    floorStart: 0.02, // the loudest a room is taken to be before it has been heard
    ratio: 3,         // a voice is this many times the room
    roomMs: 3000,     // how slowly the room is allowed to get louder
  };

  function createEndpointer(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    let total = 0;      // how long it has listened
    let floor = null;   // the room
    let above = 0;      // unbroken time above the line
    let below = 0;      // unbroken time below it since a voice was heard
    let heard = false;
    let ended = null;

    function push(level, dtMs) {
      if (ended) return ended;
      const dt = Math.max(0, Number(dtMs) || 0);
      const v = Math.max(0, Number(level) || 0);
      total += dt;
      if (floor === null) floor = Math.min(v, o.floorStart);
      const line = Math.max(o.floorMin, floor * o.ratio);

      if (v >= line) {
        above += dt;
        below = 0;
        if (!heard && above >= o.startMs) heard = true;
      } else {
        above = 0;
        if (heard) below += dt;
        // the room is whatever is not a voice: quieter is believed at once,
        // louder only slowly, so a voice trailing off does not become the room
        floor = v < floor ? v : floor + (v - floor) * Math.min(1, dt / o.roomMs);
      }

      if (heard && below >= o.endMs) ended = "done";
      else if (total >= o.maxMs) ended = heard ? "done" : "silence";
      else if (!heard && total >= o.giveUpMs) ended = "silence";
      return ended || (heard ? "speech" : "wait");
    }

    return { push };
  }

  // ---- what the screen says ---------------------------------------------------
  //
  // One line that always says what is happening, and one button whose words are
  // what pressing it will do. The newest thing wins: a microphone open over the
  // end of her sentence is listening, not speaking.
  function talkStatus(s) {
    const now = s || {};
    if (now.listening) {
      const line = now.held ? "listening. let go to send"
        : now.heard ? "listening. it sends when you stop talking"
        : "listening. go ahead";
      return { line, button: "send", act: "send" };
    }
    if (now.opening) return { line: "opening the microphone", button: "talk", act: "none" };
    if (now.transcribing) return { line: "working out what you said", button: "talk", act: "none" };
    if (now.thinking) return { line: "thinking", button: "stop", act: "stop" };
    if (now.answering) return { line: "answering", button: "stop", act: "stop" };
    if (now.speaking) return { line: "speaking. press space to talk over her", button: "talk", act: "talk" };
    // the answer is written and her voice is being made: not yet your turn
    if (now.readying) return { line: "about to speak", button: "talk", act: "talk" };
    return { line: "your turn. press space, or tap talk", button: "talk", act: "talk" };
  }

  // ---- the meter --------------------------------------------------------------
  //
  // The last moments of loudness as bar heights from 0 to 1, oldest on the
  // left. A square root, because a murmur should still be seen: loudness that
  // is a tenth of a shout is not a tenth as present to the ear.
  const METER_FULL = 0.25;

  function meterHeights(previous, level, count) {
    const n = Math.max(1, count | 0);
    const v = Math.max(0, Number(level) || 0);
    const next = Array.from(previous || []).slice(-(n - 1));
    while (next.length < n - 1) next.unshift(0);
    next.push(Math.min(1, Math.sqrt(v / METER_FULL)));
    return next;
  }

  root.emb3rTalk = { createEndpointer, talkStatus, meterHeights };
})(globalThis);
