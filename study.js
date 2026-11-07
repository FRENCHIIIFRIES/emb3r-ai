// Study: the decisions behind a tutor's flashcards, kept apart from Electron so
// `npm test` can run every one of them. Which deck a card belongs to, when a
// card comes back (Leitner boxes), how a new card is checked against the deck,
// what the model is asked, and how the cards it is still writing are read.
//
// main.js stores the decks and runs the model; the renderer shows them. Neither
// decides anything that is decided here.

import { TUTORS, isTutor } from "./tutors.js";

// ---------------------------------------------------------------- decks

// One deck per tutor, per profile - and for Languages one per language, so a
// student taking French and Spanish keeps two decks under one tutor.
const DEFAULT_LANGUAGE = "French";

function languageSlug(language) {
  const raw = String(language == null ? DEFAULT_LANGUAGE : language).trim().toLowerCase();
  if (!/^[a-z][a-z -]{1,23}$/.test(raw)) return null;
  const slug = raw.replace(/[ -]+/g, "-").replace(/^-+|-+$/g, "");
  return /^[a-z]+(-[a-z]+)*$/.test(slug) && slug.length >= 2 ? slug : null;
}

export function deckIdFor(tutorId, language) {
  if (!isTutor(tutorId)) return null;
  if (tutorId !== "languages") return tutorId;
  const slug = languageSlug(language);
  return slug ? `languages-${slug}` : null;
}

// exactly the ids deckIdFor can return - a deck id becomes a file name
export function isDeckId(id) {
  if (typeof id !== "string") return false;
  if (id !== "languages" && isTutor(id)) return true;
  const m = /^languages-([a-z]+(?:-[a-z]+)*)$/.exec(id);
  return Boolean(m) && m[1].length >= 2 && m[1].length <= 24;
}

// the tutor a deck belongs to
export function tutorOfDeck(id) {
  if (!isDeckId(id)) return null;
  return id.startsWith("languages-") ? "languages" : id;
}

// ---------------------------------------------------------------- cards

const FRONT_MAX = 300;
const BACK_MAX = 600;
const DECK_MAX = 2000;
const DAY = 86_400_000;

// Leitner boxes. Box 1 comes back today, 2 tomorrow, 3 in three days, 4 in a
// week, 5 in sixteen days: simple enough to explain to a student in a line.
export const BOX_DAYS = [0, 1, 3, 7, 16];

export function newCard({ front, back, source }, now, id) {
  return {
    id,
    front: String(front || "").trim().slice(0, FRONT_MAX),
    back: String(back || "").trim().slice(0, BACK_MAX),
    source: typeof source === "string" && source ? source : "topic",
    createdAt: now,
    box: 1,
    due: now,
    history: [],
  };
}

const RATINGS = new Set(["again", "good", "easy"]);

// Again goes back to box 1 and returns later in this same session; good moves
// up a box, easy two, to at most 5. A new card object; the old is untouched.
export function schedule(card, rating, now) {
  if (!RATINGS.has(rating)) throw new Error(`not a rating: ${rating}`);
  const from = Math.min(5, Math.max(1, card.box || 1));
  let box;
  let due;
  if (rating === "again") {
    box = 1;
    due = now + 60_000;
  } else {
    box = Math.min(5, from + (rating === "easy" ? 2 : 1));
    due = now + BOX_DAYS[box - 1] * DAY;
  }
  return { ...card, box, due, history: [...(card.history || []), { at: now, rating }] };
}

export function dueCards(deck, now) {
  return deck.cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}

// How two fronts are compared: no case, no punctuation, single spaces. Letters
// with accents are letters - "dónde" is not "donde" in Spanish.
export function normalizeFront(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Drafts the student kept, added to a deck: empty cards and repeats (of the
// deck or of each other) skipped, and never past 2,000 cards. A new deck object.
export function addCards(deck, drafts, now, makeId) {
  const seen = new Set(deck.cards.map((c) => normalizeFront(c.front)));
  const cards = [...deck.cards];
  let added = 0;
  let skipped = 0;
  for (const d of drafts || []) {
    const card = newCard(d || {}, now, null);
    const key = normalizeFront(card.front);
    if (!key || !card.back || seen.has(key) || cards.length >= DECK_MAX) { skipped++; continue; }
    seen.add(key);
    card.id = makeId();
    cards.push(card);
    added++;
  }
  return { deck: { version: 1, cards }, added, skipped };
}

// A deck as read from disk. Anything unreadable is an empty deck - the next
// save replaces it whole - and a card without an id, front or back is dropped.
export function parseDeck(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { version: 1, cards: [] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.cards)) {
    return { version: 1, cards: [] };
  }
  const cards = data.cards
    .filter((c) => c && typeof c.id === "string" && typeof c.front === "string" && c.front.trim() && typeof c.back === "string")
    .map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      source: typeof c.source === "string" ? c.source : "topic",
      createdAt: Number.isFinite(c.createdAt) ? c.createdAt : 0,
      box: Math.min(5, Math.max(1, Number.isFinite(c.box) ? Math.round(c.box) : 1)),
      due: Number.isFinite(c.due) ? c.due : 0,
      history: Array.isArray(c.history) ? c.history.filter((h) => h && RATINGS.has(h.rating)) : [],
    }));
  return { version: 1, cards };
}

// ---------------------------------------------------------------- the model

// What goes to the model has to fit beside the prompt and ten cards in a
// window that can be as short as 2,048 tokens: about 6,000 characters of notes
// at most, cut where a sentence or a paragraph ends.
export function cutNotes(text, maxChars = 6000) {
  const s = String(text || "");
  if (s.length <= maxChars) return { text: s, cut: false };
  const head = s.slice(0, maxChars);
  const ends = [head.lastIndexOf("\n\n"), head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("! "), head.lastIndexOf("? ")];
  const at = Math.max(...ends);
  const cutAt = at > maxChars / 2 ? at + 1 : maxChars;
  return { text: head.slice(0, cutAt).trimEnd(), cut: true };
}

export const CARD_SCHEMA = {
  type: "array",
  maxItems: 10,
  items: {
    type: "object",
    properties: {
      front: { type: "string" },
      back: { type: "string" },
    },
    required: ["front", "back"],
  },
};

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function cardsPrompt(tutorId, { topic, notes, language } = {}) {
  const t = TUTORS[tutorId];
  if (!t) throw new Error(`no tutor called ${tutorId}`);
  const hasNotes = typeof notes === "string" && notes.trim();
  const hasTopic = typeof topic === "string" && topic.trim();
  if (!hasNotes && !hasTopic) throw new Error("cards need a topic or notes");
  const lines = [
    `Make up to 10 flashcards for a student revising ${t.name.toLowerCase()}.`,
    "Each card has a short question or prompt on the front and a short, correct answer on the back - one or two sentences, in plain words a 14-year-old understands.",
    "Every card tests one idea. No two cards ask the same thing.",
  ];
  if (tutorId === "languages") {
    const lang = capital(String(language || DEFAULT_LANGUAGE).trim().toLowerCase());
    lines.push(`The language is ${lang}. Put the ${lang} word or phrase on the front and its English meaning on the back.`);
  }
  if (hasNotes) {
    lines.push("Make the cards only from these notes - do not add facts that are not in them:", "", notes.trim());
  } else {
    lines.push(`The topic: ${topic.trim()}. Make the cards a student studying this topic would need.`);
  }
  lines.push("", "Answer with the cards only, as JSON.");
  return lines.join("\n");
}

export function explainPrompt(card, { differently = false } = {}) {
  return [
    "Explain this flashcard to the student simply and step by step, with one everyday example, in a few short lines.",
    differently
      ? "They have already had one explanation and want it a different way: come at it from a different angle, with a different example."
      : "",
    "End with one question that checks they understood.",
    "",
    `Front: ${card.front}`,
    `Back: ${card.back}`,
  ].filter((l, i) => l !== "" || i > 1).join("\n");
}

export function answerPrompt(card, explanation, answer) {
  return [
    `You explained this flashcard - front: "${card.front}", back: "${card.back}" - like this:`,
    String(explanation || "").trim(),
    "",
    `and ended with a question to check understanding. The student answered: "${String(answer || "").trim()}"`,
    "In two or three sentences, tell them whether they are right, and if not, what they missed.",
  ].join("\n");
}

// The cards in a reply that is still being written: every complete {...}
// object inside the array, in order, read with a scanner that knows a brace in
// a string is not a brace. Stop keeps exactly these.
export function completeCards(partialJson) {
  const s = String(partialJson || "");
  const out = [];
  const start = s.indexOf("[");
  if (start < 0) return out;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const o = JSON.parse(s.slice(objStart, i + 1));
          if (o && typeof o.front === "string" && typeof o.back === "string") out.push({ front: o.front, back: o.back });
        } catch {
          // a malformed object is skipped, not the ones after it
        }
        objStart = -1;
      }
      if (depth < 0) break;
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }
  return out;
}
