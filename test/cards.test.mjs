import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// src/cards.js is a classic script, as the page loads it
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../src/cards.js", import.meta.url), "utf8"), ctx);
const { startSession, current, flip, rate, isDone, left, mergeDrafts } = ctx.emb3rCards;

const deck = (ids) => ids.map((id) => ({ id, front: `front ${id}`, back: `back ${id}` }));

test("rating every card good ends the session, one card at a time", () => {
  let s = startSession(deck(["a", "b", "c"]));
  const seen = [];
  const counts = [left(s)];
  while (!isDone(s)) {
    seen.push(current(s).id);
    s = rate(s, "good").session;
    counts.push(left(s));
  }
  assert.deepEqual(seen, ["a", "b", "c"]);
  assert.deepEqual(counts, [3, 2, 1, 0]);
  assert.equal(current(s), null);
});

test("again puts the card back three cards later, or last when fewer remain", () => {
  let s = startSession(deck(["a", "b", "c", "d", "e"]));
  const r = rate(s, "again");
  assert.deepEqual({ ...r.rated }, { cardId: "a", rating: "again" });
  assert.deepEqual(Array.from(r.session.queue, (c) => c.id), ["b", "c", "d", "a", "e"]);

  s = startSession(deck(["a", "b"]));
  s = rate(s, "again").session;
  assert.deepEqual(Array.from(s.queue, (c) => c.id), ["b", "a"]);
});

test("a card rated again stays in the session until it is rated good or easy", () => {
  let s = startSession(deck(["a"]));
  s = rate(s, "again").session;
  assert.equal(isDone(s), false);
  assert.equal(current(s).id, "a");
  s = rate(s, "again").session;
  assert.equal(left(s), 1);
  s = rate(s, "easy").session;
  assert.equal(isDone(s), true);
});

test("flip shows the back and the next card starts on its front", () => {
  let s = startSession(deck(["a", "b"]));
  assert.equal(s.flipped, false);
  s = flip(s);
  assert.equal(s.flipped, true);
  s = flip(s);
  assert.equal(s.flipped, false);
  s = rate(flip(s), "good").session;
  assert.equal(s.flipped, false);
  assert.equal(current(s).id, "b");
});

test("a card can be rated before it is turned over", () => {
  const s = rate(startSession(deck(["a", "b"])), "good").session;
  assert.equal(current(s).id, "b");
});

// Cards arrive one at a time for a minute or more, which is exactly when a
// student starts mending the first of them.
test("drafts still arriving never undo what the student has already changed", () => {
  const written = [
    { front: "f1", back: "b1", source: "topic" },
    { front: "f2", back: "b2", source: "topic" },
    { front: "f3", back: "b3", source: "topic" },
  ];
  const shown = mergeDrafts([], written.slice(0, 2));
  assert.equal(shown.length, 2);
  assert.deepEqual({ ...shown[0] }, { front: "f1", back: "b1", source: "topic", keep: true, touched: false });
  // the student mends the first and drops the second
  shown[0].front = "f1, mended";
  shown[0].touched = true;
  shown[1].keep = false;
  shown[1].touched = true;
  const [first, second] = shown;

  // the model finishes a third card, and reports the list from its start again
  const next = mergeDrafts(shown, written);
  assert.equal(next.length, 3);
  assert.equal(next[0], first, "the very same draft, so its row on screen is left alone");
  assert.equal(next[0].front, "f1, mended");
  assert.equal(next[1], second);
  assert.equal(next[1].keep, false);
  assert.deepEqual({ ...next[2] }, { front: "f3", back: "b3", source: "topic", keep: true, touched: false });
});

test("a draft nobody has touched follows the model, and keeps its row when nothing changed", () => {
  const shown = mergeDrafts([], [{ front: "f1", back: "b1" }, { front: "f2", back: "b2" }]);
  const next = mergeDrafts(shown, [{ front: "f1", back: "b1" }, { front: "f2", back: "b2 and more" }]);
  assert.equal(next[0], shown[0]);
  assert.notEqual(next[1], shown[1]);
  assert.equal(next[1].back, "b2 and more");
  assert.equal(shown[1].back, "b2", "what it was given is not changed");
  assert.equal(mergeDrafts(shown, []).length, 0, "a new batch starts from nothing");
});

test("the session does not change what it was given", () => {
  const cards = deck(["a", "b"]);
  const s = startSession(cards);
  rate(s, "again");
  assert.deepEqual(cards.map((c) => c.id), ["a", "b"]);
  assert.deepEqual(Array.from(s.queue, (c) => c.id), ["a", "b"]);
  assert.throws(() => rate(s, "sometimes"));
});
