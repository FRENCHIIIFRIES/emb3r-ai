import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOX_DAYS, deckIdFor, isDeckId, newCard, schedule, dueCards, normalizeFront, addCards,
  parseDeck, cutNotes, CARD_SCHEMA, cardsPrompt, explainPrompt, answerPrompt, completeCards,
} from "../study.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 9, 0, 0);
let n = 0;
const makeId = () => `c${++n}`;

test("a deck is one per tutor, and one per language for Languages", () => {
  assert.equal(deckIdFor("maths"), "maths");
  assert.equal(deckIdFor("languages", "Hindi"), "languages-hindi");
  assert.equal(deckIdFor("languages", "  French "), "languages-french");
  assert.equal(deckIdFor("languages"), "languages-french");
  assert.equal(deckIdFor("languages", "Old English"), "languages-old-english");
  assert.equal(deckIdFor("astrology"), null);
  assert.equal(deckIdFor("languages", "../x"), null);
  assert.equal(deckIdFor("languages", "x"), null);
  for (const id of ["maths", "languages-hindi", "languages-old-english"]) assert.equal(isDeckId(id), true, id);
  for (const id of ["", "astrology", "languages", "languages-", "../maths", "maths/../x", "Maths", null, 3]) {
    assert.equal(isDeckId(id), false, String(id));
  }
});

test("Leitner boxes: the intervals are 0, 1, 3, 7 and 16 days", () => {
  assert.deepEqual(BOX_DAYS, [0, 1, 3, 7, 16]);
});

test("a new card starts in box 1, due now, trimmed and capped", () => {
  const c = newCard({ front: "  What is osmosis?  ", back: "x".repeat(900), source: "topic" }, NOW, "a");
  assert.equal(c.id, "a");
  assert.equal(c.front, "What is osmosis?");
  assert.equal(c.back.length, 600);
  assert.equal(c.box, 1);
  assert.equal(c.due, NOW);
  assert.equal(c.createdAt, NOW);
  assert.deepEqual(c.history, []);
  assert.equal(c.source, "topic");
});

test("good moves up one box, easy two, again back to one and later this session", () => {
  const c = newCard({ front: "f", back: "b", source: "topic" }, NOW, "a");
  const good = schedule(c, "good", NOW);
  assert.equal(good.box, 2);
  assert.equal(good.due, NOW + 1 * DAY);
  assert.deepEqual(good.history, [{ at: NOW, rating: "good" }]);
  assert.equal(c.box, 1, "the card passed in is not changed");

  const four = { ...c, box: 4 };
  const easy = schedule(four, "easy", NOW);
  assert.equal(easy.box, 5);
  assert.equal(easy.due, NOW + 16 * DAY);
  assert.equal(schedule({ ...c, box: 5 }, "good", NOW).box, 5, "box 5 is the top");
  assert.equal(schedule({ ...c, box: 2 }, "easy", NOW).due, NOW + 7 * DAY);

  const again = schedule({ ...c, box: 5 }, "again", NOW);
  assert.equal(again.box, 1);
  assert.equal(again.due, NOW + 60_000);
  assert.throws(() => schedule(c, "maybe", NOW));
});

test("due cards are the ones due now or earlier, the oldest first", () => {
  const deck = { version: 1, cards: [
    { id: "late", front: "a", back: "b", due: NOW + 1 },
    { id: "older", front: "a", back: "b", due: NOW - 5000 },
    { id: "now", front: "a", back: "b", due: NOW },
  ] };
  assert.deepEqual(dueCards(deck, NOW).map((c) => c.id), ["older", "now"]);
});

test("a front is compared without case, spacing or punctuation", () => {
  assert.equal(normalizeFront("  What IS   osmosis?! "), "what is osmosis");
  assert.equal(normalizeFront("Qu'est-ce que c'est ?"), "quest ce que cest");
  assert.equal(normalizeFront("¿Dónde está?"), "dónde está");
});

test("adding cards skips empty ones and duplicates, of the deck and of each other", () => {
  const deck = { version: 1, cards: [newCard({ front: "what is osmosis", back: "b", source: "topic" }, NOW, "x")] };
  const r = addCards(deck, [
    { front: "  ", back: "x", source: "topic" },
    { front: "What is osmosis?", back: "dup of the deck", source: "topic" },
    { front: "What is diffusion?", back: "spreading out", source: "topic" },
    { front: "what is diffusion", back: "dup of the drafts", source: "topic" },
    { front: "What is a cell wall?", back: "", source: "topic" },
  ], NOW, makeId);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 4);
  assert.equal(r.deck.cards.length, 2);
  assert.equal(deck.cards.length, 1, "the deck passed in is not changed");
  assert.equal(r.deck.cards[1].front, "What is diffusion?");
});

test("a deck never grows past 2,000 cards", () => {
  const full = { version: 1, cards: Array.from({ length: 1999 }, (_, i) => newCard({ front: `q${i}`, back: "a", source: "topic" }, NOW, `k${i}`)) };
  const r = addCards(full, [{ front: "one more", back: "a", source: "topic" }, { front: "and another", back: "a", source: "topic" }], NOW, makeId);
  assert.equal(r.deck.cards.length, 2000);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
});

test("an unreadable or damaged deck reads as an empty one", () => {
  for (const text of ["", "{nope", "null", "[]", '{"cards":"x"}']) {
    assert.deepEqual(parseDeck(text), { version: 1, cards: [] }, text);
  }
  assert.deepEqual(parseDeck('{"cards":[{"front":"x"}]}'), { version: 1, cards: [] });
  const ok = parseDeck(JSON.stringify({ version: 1, cards: [{ id: "a", front: "f", back: "b", box: 9, due: NOW }] }));
  assert.equal(ok.cards.length, 1);
  assert.equal(ok.cards[0].box, 5, "a box out of range is brought back into it");
});

test("long notes are cut at a sentence, short ones left alone", () => {
  const sentence = "Water moves from a dilute solution to a concentrated one. ";
  const long = sentence.repeat(400);
  const cut = cutNotes(long);
  assert.equal(cut.cut, true);
  assert.ok(cut.text.length <= 6000, String(cut.text.length));
  assert.ok(cut.text.endsWith("."), cut.text.slice(-20));
  assert.deepEqual(cutNotes("short notes."), { text: "short notes.", cut: false });
});

test("the schema asks for at most ten cards, each a front and a back", () => {
  assert.equal(CARD_SCHEMA.type, "array");
  assert.equal(CARD_SCHEMA.maxItems, 10);
  assert.deepEqual(CARD_SCHEMA.items.required, ["front", "back"]);
});

test("the card prompt follows the source and the language", () => {
  const fr = cardsPrompt("languages", { topic: "food", language: "French" });
  assert.match(fr, /French/);
  assert.match(fr, /food/);
  const notes = cardsPrompt("biology", { notes: "Osmosis is the movement of water." });
  assert.match(notes, /only from these notes/i);
  assert.match(notes, /Osmosis is the movement of water\./);
  const topic = cardsPrompt("maths", { topic: "completing the square" });
  assert.match(topic, /completing the square/);
  assert.match(topic, /10/);
  assert.throws(() => cardsPrompt("maths", {}));
});

test("explaining a card, differently, and answering the check question", () => {
  const card = { front: "What does the mitochondrion do?", back: "Releases energy from glucose." };
  const e = explainPrompt(card);
  assert.match(e, /mitochondrion/);
  assert.match(e, /step by step/i);
  assert.match(e, /one question/i);
  assert.match(explainPrompt(card, { differently: true }), /different/i);
  const a = answerPrompt(card, "It is the power station...", "it makes energy");
  assert.match(a, /it makes energy/);
});

test("complete cards are read out of half-finished JSON, and only complete ones", () => {
  assert.deepEqual(completeCards('[{"front":"a","back":"b"},{"front":"c","ba'), [{ front: "a", back: "b" }]);
  assert.deepEqual(completeCards('[{"front":"a } b","back":"x \\" { y"}'), [{ front: "a } b", back: 'x " { y' }]);
  assert.deepEqual(completeCards(""), []);
  assert.deepEqual(completeCards("[]"), []);
  assert.deepEqual(completeCards('[{"front":"a"},{"front":"c","back":"d"}]'), [{ front: "c", back: "d" }]);
  assert.deepEqual(completeCards('[{"front":"a","back":"b"},{"front":"c","back":"d"}]').length, 2);
});
