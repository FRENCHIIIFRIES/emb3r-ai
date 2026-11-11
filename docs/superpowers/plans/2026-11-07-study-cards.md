# Study Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised 9 and 10 November, after this plan was built.** The JSON grammar named below (`createGrammarForJsonSchema`, `CARD_SCHEMA`, `grammar:` on the prompt) was built and then taken out, on the belief that it was crashing the app. It was not: the same crash turned up the next day with no grammar in the code. Cards come from a plain prompt that shows the shape, read by `completeCards()`, because that works and is simpler. The spec's *Constraints* has the story; the rest of this plan stands as written.

**Goal:** Each tutor gets a deck of flashcards, made by the local model from a topic or pasted notes, kept or edited from a draft list, reviewed with Leitner boxes, and explained on request.

**Architecture:** Two new pure modules hold every decision: `study.js` for scheduling, decks, prompts and partial-JSON reading, and `src/cards.js` for the review session. Both are unit-tested without Electron. `main.js` stores decks per profile and runs generation and explanation on the tutor's model. It borrows the one chat session the same way a reply does: it saves the history, prompts, and restores the history afterwards. `src/renderer.js` shows the deck in place of the transcript, opened from the tutor bar.

**Tech Stack:** Electron 43, node-llama-cpp 3.19 (`llama.createGrammarForJsonSchema`, `LlamaChatSession.prompt` with `grammar`, `signal`, `stopOnAbortSignal`, `onTextChunk`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-04-study-tutors-design.md` (revised 7 November), sections *Decks and cards*, *The Languages tutor*, *Where Study lives*, *Making cards*, *Review*, *Explain this card*.

## Global Constraints

- Study runs on the local model only, whatever web access is set to.
- Nothing generates unless the student asked for it. Long generation is visible and cancellable, and Stop keeps whatever was already made.
- Cards arrive as a draft the student keeps, edits or deletes. Nothing joins a deck unseen.
- Leitner intervals by box: 1 → today, 2 → 1 day, 3 → 3 days, 4 → 7 days, 5 → 16 days. *again* → box 1, back later in the same session. *good* → up one box. *easy* → up two boxes, to at most 5.
- A card is `{ id, front, back, source: "topic" | "notes" | "file:<name>" | "chat", createdAt, box: 1-5, due, history: [{ at, rating }] }`.
- Each tutor has one deck per profile, stored at `userData/study/<profileId>/<deckId>.json`. The Languages tutor has one deck per language.
- Up to 10 cards per generation, constrained to `[{ "front": "...", "back": "..." }]`. Duplicates are skipped by normalised front text.
- What goes to the model has to fit beside the prompt and ten cards in a window as short as 2,048 tokens. Notes are cut to fit.
- Review keys: **Space** flips; **1** again, **2** good, **3** easy; **E** explains; **Esc** ends the session. Every action has a key in `src/keys.js`.
- Renderer rules hold:
  - no network;
  - classic scripts under `script-src 'self' file:`;
  - screen-reader announcements;
  - high contrast;
  - `prefers-reduced-motion`.
- The look keeps the soul (vault, *Working notes*): glowing frames, VT323, bracketed text buttons, `//` labels.

## Review Focus

1. **The model answers badly:** fewer than 10 cards, an empty front or back, a card repeated, or text cut off by Stop. The draft gets only the complete, non-empty, non-duplicate cards. Nothing crashes, and an empty result says so. *(Task 1: `completeCards` and `addCards` tests.)*
2. **The student switches tutor, chat or profile while cards are being made.** The cards go to the deck they were asked for, never the deck now on screen. *(Task 2: the deck id is captured at the start. Task 5 harness.)*
3. **A deck file is missing, empty or damaged.** It reads as an empty deck, and the next save replaces it whole. *(Task 2: `readDeck` test through `parseDeck`.)*
4. **Pasted notes far longer than the window.** They are cut, with "(cut)" said in the draft header, and the prompt never overflows. *(Task 1: `cutNotes` test.)*
5. **Card generation while Ember is mid-reply, or a reply while cards are generating.** One refuses with words ("Ember is busy - wait for her to finish, or press Esc"); neither corrupts the conversation's history. *(Task 3: shared `activeGeneration`. Task 5 harness checks the chat history is unchanged.)*

---

## File Structure

| File | Responsibility |
|---|---|
| `study.js` (new) | Pure: deck ids, Leitner scheduling, due cards, card creation and dedupe, note cutting, the card schema, card/explanation prompts, reading complete cards out of partial JSON. |
| `test/study.test.mjs` (new) | Its tests. |
| `main.js` | Deck files per profile; IPC `emb3r:study-*`; generation and explanation on the tutor's model. |
| `preload.cjs` | `window.emb3r.study` bridge. |
| `src/keys.js` | One new shortcut, `cards`. |
| `src/cards.js` (new) | Pure: the review session state machine, so its logic is tested without a DOM. |
| `test/cards.test.mjs` (new) | Its tests. |
| `src/index.html` | `#cardsPanel` markup and styles, the tutor bar's cards button. |
| `src/renderer.js` | Opens and closes the panel; deck page, draft list, review, explanation. |
| `package.json` | `study.js` in `build.files`. |

---

### Task 1: `study.js`, the pure core

**Files:** Create `study.js`, `test/study.test.mjs`. Modify `package.json` (`build.files` gets `"study.js"`).

**Interfaces — Produces:**
- `BOX_DAYS = [0, 1, 3, 7, 16]` (index = box - 1)
- `deckIdFor(tutorId: string, language?: string): string | null`
  - `"maths"` → `"maths"`; `("languages", "French")` → `"languages-french"`;
  - `("languages")` → `"languages-french"` (default);
  - anything not a tutor, or a language not matching `/^[a-z][a-z -]{1,23}$/i` after trim → `null`.
- `isDeckId(id: string): boolean` — exactly what `deckIdFor` can return.
- `newCard({ front, back, source }, now: number, id: string): Card` — box 1, `due: now`, `history: []`; front and back trimmed and cut to 300 and 600 chars.
- `schedule(card: Card, rating: "again" | "good" | "easy", now: number): Card` — a new object.
  - `again`: box 1, `due = now + 60_000`.
  - `good`: `box = min(5, box + 1)`, `due = now + BOX_DAYS[box - 1] * 86_400_000`.
  - `easy`: `box = min(5, box + 2)`, same `due` formula.
  - `history` gains `{ at: now, rating }`.
- `dueCards(deck: Deck, now: number): Card[]` — `due <= now`, oldest due first.
- `normalizeFront(text: string): string` — lowercase, accents kept, punctuation and repeated spaces removed.
- `addCards(deck: Deck, drafts: {front, back, source}[], now: number, makeId: () => string): { deck: Deck, added: number, skipped: number }` — skips empty fronts or backs, duplicates against the deck, and duplicates within the drafts. Cap: the deck is never above 2,000 cards (the rest skipped).
- `parseDeck(text: string): Deck` — `{ version: 1, cards: [] }` for anything unreadable. Cards missing `id`, `front` or `back` are dropped.
- `cutNotes(text: string, maxChars = 6000): { text: string, cut: boolean }` — cuts at the last paragraph or sentence end before `maxChars`.
- `CARD_SCHEMA` — `{ type: "array", maxItems: 10, items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"] } }`
- `cardsPrompt(tutorId: string, { topic?: string, notes?: string, language?: string }): string` — asks for up to 10 cards in the tutor's style. Notes say "only from these notes"; a bare topic says "what a student studying this would need". For Languages it names the language and puts the target-language side on the front.
- `explainPrompt(card: Card, { differently?: boolean } = {}): string` — simple, step by step, one example, ends with one question that checks understanding; `differently` asks for a different angle and a different example.
- `answerPrompt(card: Card, explanation: string, answer: string): string` — the tutor replies once to the student's answer to the check question: right, or what was missed, in two or three sentences.
- `completeCards(partialJson: string): { front: string, back: string }[]` — every complete `{...}` object with string `front` and `back` in a possibly unfinished JSON array, in order. Brace-matching respects quoted strings and escapes.

- [ ] **Step 1: Write the failing tests** in `test/study.test.mjs`. Each test pins the values above:
  - `deckIdFor("maths") === "maths"`; `deckIdFor("languages", "Hindi") === "languages-hindi"`; `deckIdFor("astrology") === null`; `deckIdFor("languages", "../x") === null`.
  - `schedule` of a box-1 card: `good` → box 2, due exactly `now + 86_400_000`; `easy` from box 4 → box 5; `again` from box 5 → box 1, due `now + 60_000`; history length +1 with the rating.
  - `dueCards` returns only cards due at or before `now`, oldest first.
  - `addCards`:
    - skips `{ front: "  ", back: "x" }`;
    - skips "What is osmosis?" against an existing "what is osmosis";
    - skips a repeat within the drafts;
    - reports `added` and `skipped`;
    - never exceeds 2,000 cards.
  - `parseDeck("")`, `parseDeck("{nope")` and `parseDeck('{"cards":[{"front":"x"}]}')` → `{ version: 1, cards: [] }`.
  - `cutNotes` of 20,000 chars → `cut: true`, length ≤ 6,000, ending at a sentence end; a short text comes back unchanged, `cut: false`.
  - `completeCards('[{"front":"a","back":"b"},{"front":"c","ba')` → exactly `[{ front: "a", back: "b" }]`; a front containing `"}"` inside quotes is read whole; `completeCards("")` → `[]`.
  - `cardsPrompt("languages", { topic: "food", language: "French" })` mentions French; `cardsPrompt("biology", { notes: "x" })` says only from the notes.
- [ ] **Step 2: Run** `node --test test/study.test.mjs`. Expected: FAIL, "Cannot find module '../study.js'".
- [ ] **Step 3: Implement** `study.js` with the exports above. ESM, no imports except `./tutors.js` (`TUTORS`, `isTutor`).
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including `every file main.js imports is packaged` once Task 2 imports `study.js`.
- [ ] **Step 5: Commit** `study.js test/study.test.mjs package.json`. Message: "Study: the pure core - Leitner boxes, decks, prompts, partial cards".

### Task 2: Decks on disk and their IPC

**Files:** Modify `main.js` (new section "Study decks", after the conversation-history IPC) and `preload.cjs`.

**Interfaces:**
- Consumes: Task 1's `deckIdFor`, `isDeckId`, `parseDeck`, `addCards`, `schedule`, `dueCards`, `newCard`.
- Produces, as IPC handlers (each validates `deckId` with `isDeckId`, else returns `{ success: false, error }`):
  - `emb3r:study-deck (deckId)` → `{ success, deck, due: number }`
  - `emb3r:study-add (deckId, drafts)` → `{ success, added, skipped, total }`
  - `emb3r:study-rate (deckId, cardId, rating)` → `{ success, card }`
  - `emb3r:study-edit (deckId, cardId, { front, back })` → `{ success, card }`
  - `emb3r:study-delete (deckId, cardId)` → `{ success, total }`
- Preload `window.emb3r.study = { deck, add, rate, edit, remove, generate, explain, stop, onProgress, onExplain }`, the last four for Task 3.
- `readDeck(profileId, deckId)` and `writeDeck(profileId, deckId, deck)`. The write is atomic: write `<file>.tmp`, then rename.

- [ ] **Step 1:** Implement the five handlers and `readDeck`/`writeDeck`. Paths are `path.join(app.getPath("userData"), "study", profileId, deckId + ".json")`. The profile is `activeProfile().id` at the moment of the call.
- [ ] **Step 2:** Run `node --check main.js` and `npm test`. Expected: parses; all pass.
- [ ] **Step 3: Commit** with message "Study: decks on disk, one per tutor (and per language), per profile".

### Task 3: Making cards and explaining them, on the tutor's model

**Files:** Modify `main.js` (same section).

**Interfaces:**
- Consumes: Task 1's `cardsPrompt`, `explainPrompt`, `CARD_SCHEMA`, `completeCards`, `cutNotes`, `addCards`; the existing `ensureModelFor`, `activeGeneration`/`activeGenerationDone`/`settleGeneration`, `chatSession`, `conversationPrompt`.
- Produces:
  - `emb3r:study-generate (deckId, { topic?, notes?, language? })` → `{ success, drafts: {front, back, source}[], stopped: boolean, cut: boolean }`. It sends `emb3r:study-progress` `{ deckId, drafts }` each time the complete count grows. It does **not** add to the deck: the renderer's draft list does that through `study-add`.
  - `emb3r:study-explain (deckId, cardId, { mode: "explain" | "differently" | "answer", explanation?, answer? })` → `{ success, text, stopped }`. It streams `emb3r:study-explain-token` `{ text }`. `answer` mode uses `answerPrompt`; the exchange is not saved.
  - `emb3r:study-stop ()` → aborts whichever of the two is running.
- Store the llama instance when a model loads: `let loadedLlama = null`, set beside `loadedModel` in both load paths and cleared in `releaseLocalModel`.

- [ ] **Step 1:** Implement both handlers to this shape. If `activeGeneration` is set, refuse with "Ember is busy - wait for her to finish, or press Esc". Otherwise:
  1. `await ensureModelFor({ tutor: <deck's tutor id> })`;
  2. set `activeGeneration` and `activeGenerationDone` as `send-message` does;
  3. `const saved = chatSession.getChatHistory()`;
  4. `chatSession.setChatHistory([{ type: "system", text: conversationPrompt({ tutor }) }])`;
  5. prompt, with `grammar: await loadedLlama.createGrammarForJsonSchema(CARD_SCHEMA)` for generation only, `maxTokens: 900` for cards and `600` for explanations, `signal`, `stopOnAbortSignal: true`, and `onTextChunk` feeding `completeCards` or the explain stream;
  6. `finally`, restore the saved history and clear the generation state.

  The model is the tutor's: generation answers on the model the tutor's chat uses.
- [ ] **Step 2:** `node --check main.js` and `npm test`. Expected: parses; all pass.
- [ ] **Step 3: Commit** with message "Study: cards made and explained on the tutor's model, never the web".

### Task 4: The cards panel

**Files:** Create `src/cards.js` and `test/cards.test.mjs`. Modify `src/index.html` (markup and styles; `<script src="./cards.js">` before `renderer.js`), `src/renderer.js`, and `src/keys.js` (add `{ id: "cards", keys: { mod: true, shift: true, code: "KeyD" }, label: "A tutor's cards", group: "Studying" }`).

**Interfaces:**
- Consumes: `window.emb3r.study` (Task 2/3); the existing `showTutorBar`, `tutorById`, `TUTORS`, `announce`, `flashNote`, `iconSpan`, `escapeOne`.
- Produces: `src/cards.js`, a classic script exposing `globalThis.emb3rCards`:
  - `startSession(cards: Card[]): Session`
  - `current(s): Card | null`
  - `flip(s): Session`
  - `rate(s, rating): { session: Session, rated: { cardId, rating } }`
  - `isDone(s): boolean`
  - `left(s): number`

  An *again* card goes back into the session queue three cards later (or last, if fewer remain). The session ends when the queue is empty.
- Renderer: `openCards(tutorId)` and `closeCards()`. The class `cardsOpen` on `#app` hides `#chat`, `#row`, `#genStats` and `#attachBar`, and shows `#cardsPanel`. `escapeOne()` closes the explanation first, then the session, then the panel.

- [ ] **Step 1: Write the failing tests** in `test/cards.test.mjs`. Load `src/cards.js` in a `vm` context, as `test/icons.test.mjs` loads `icons.js`. Cases:
  - a session of 3 cards: rating each `good` ends it, with `left` going 3, 2, 1, 0;
  - rating the first card `again` puts it back after the next three (or last), so the session holds it until it is rated `good` or `easy`;
  - `flip` toggles the back;
  - `rate` before `flip` is still allowed.
- [ ] **Step 2: Run** `node --test test/cards.test.mjs`. Expected: FAIL (no `emb3rCards`).
- [ ] **Step 3: Implement** `src/cards.js`.
- [ ] **Step 4:** Build the panel in `src/index.html` and `src/renderer.js`:
  - **Deck page:** the tutor's avatar and name, "N due of M", `[ study now ]`, a one-box "make cards from a topic, or paste your notes", `[ make cards ]`, and for Languages a language field (French, Spanish, Hindi, German, or typed).
  - **Draft list:** each card editable in place, with keep (default on) and `[ x ]`; then `[ add N to the deck ]`, and `[ stop ]` while making.
  - **Review:** front, then Space shows the back; `[1] again · [2] good · [3] easy`, each showing when the card comes back; "card k of n".
  - **Explain:** E streams into the panel. Under it are a one-line answer box (the tutor replies once; the single-letter keys are off while the box has focus) and `[ explain it differently ]`. Esc closes it.
  - The tutor bar gets `[ cards ]`, with `data-tip-key="cards"`. Labels are `//` comments; frames glow at full strength.
- [ ] **Step 5:** Run `npm test` (`icons.test.mjs` checks the new key is real and every icon exists) and `node --check src/renderer.js`. Expected: all pass.
- [ ] **Step 6: Commit** with message "Study: the cards panel - deck, drafts, review, explain".

### Task 5: Proof

**Files:** Modify `C:\Users\dobar\Music\emb3r evidence\staging\study-ui\tools\shoot-refresh.cjs` (stub `study-*`). Create `C:\Users\dobar\Music\emb3r evidence\harnesses\cards-real-app.mjs`.

- [ ] **Step 1: Screens** (stubbed IPC, 900×650):
  - the deck page;
  - a draft list of 3;
  - review front, then back after Space;
  - after `2` the next card;
  - the explanation;
  - high contrast and light theme on the review.

  Checks:
  - nothing outside the window;
  - every key works;
  - no console errors.
- [ ] **Step 2: Real app, real model**, with the offline lock on. Open Biology:
  1. make cards from the topic "osmosis";
  2. expect at least 3 drafts, all with a non-empty front and back;
  3. add them;
  4. Stop during a second generation keeps its complete drafts;
  5. rate one `good` and check the deck file has box 2 with `due` one day ahead;
  6. explain one card and check the text is non-empty;
  7. back in the chat, the conversation history is exactly what it was. Send one message and check the reply's source is `local` and it still knows the earlier messages.
- [ ] **Step 3:** Push the branch, open a PR, and merge on green.
