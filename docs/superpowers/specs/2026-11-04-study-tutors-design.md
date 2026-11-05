# Study: subject tutors, flashcards, and a voice that swims — design

4 November 2026 · for v1.40 onwards

## Why

The user is a school student (MYP). They revise with two tools together: **NotebookLM**, which turns class material into notes and flashcards, and **YouTube**, which explains whatever doesn't click. They want emb3r to be "the best friend to a student": both of those in one place, with Ember.

They also pointed at ChatGPT's new **dots**, launched 29 September 2026: agents that hold a goal, keep working on it, and check in with you. They asked for **specialised tutors** in that spirit. On top of that they want:
- custom **avatars** for the tutors in emb3r's style, each in its subject's colour;
- an **ASCII-art voice avatar** like a clip they shared, showing two koi circling;
- a better UI overall.

## Goals

- **Flashcards from the student's own material**: notes, a file, a topic, or the current chat. Reviewed one card at a time, and cards they get wrong come back sooner.
- **"Explain this card"**: the card's tutor explains it simply, step by step, with an example, like a good YouTube explainer.
- **Eight subject tutors.** Each has its own colour, avatar, teaching style, flashcard deck and goal (e.g. "Biology test, Friday"), and **checks in** when cards are due ("12 biology cards due — 10 minutes?").
- **Talking to a tutor** directly, in that tutor's style.
- **The koi** as the avatar of the voice-chat (Talk) view: original ASCII art that reacts to listening, thinking and speaking.
- **UI improvements** chosen from a review of the current app.

## Non-goals (for now)

- Syncing or sharing decks online.
- Importing from Anki or Quizlet.
- Operating-system notifications: check-ins happen inside emb3r.
- Any model work in the background while the student is using the computer.

## Anti-goals (would make this a failure even if it works)

- **Slowing the computer down.** The laptop it's built on has 8 GB and a browser usually open (see the decisions on memory in the vault). Nothing generates unless the student asked for it, and long generation is visible and cancellable.
- **Sending a student's notes anywhere.** Study runs on the local model only, whatever web-access setting is chosen.
- **Presenting generated cards as true.** A 3B model can be wrong. Cards arrive as a draft the student keeps, edits or deletes; nothing joins a deck unseen.
- **Becoming a homework-answering machine.** Tutors give a hint before an answer and check understanding with a question. Safe mode applies to them as it does to Ember.

## Constraints

- **The model.** The model is Llama 3.2 3B by default. On the target laptop it writes about 5 words a second on the graphics, so 10 cards take roughly 1½–2 minutes. Cards appear as they are made, and generation can be stopped.
- **Structured output.** node-llama-cpp 3.19's `llama.createGrammarForJsonSchema()` keeps card generation to valid JSON, with no parsing of free text.
- **Reading files.** `extractDocumentText()` (`src/document-text.js`) already turns PDFs, Word files, slides and spreadsheets into text.
- **The renderer's rules hold:**
  - no network;
  - classic scripts under `script-src 'self' file:`;
  - every action has a key in the `src/keys.js` table;
  - screen-reader announcements;
  - high contrast;
  - `prefers-reduced-motion`.
- **Data stays per profile, on this machine, alongside the conversations.**

## The parts

### Tutors

Eight tutors, each fixed to its subject's colour. A tutor's colour is its identity, so the user's accent does not change it.

| Tutor | Colour | Avatar prop | How it teaches |
|---|---|---|---|
| Maths | `#4C8DFF` | glasses, π | a worked example step by step, then one for the student to try |
| Biology | `#3DDC84` | sprout | structure → function, with everyday analogies |
| Chemistry | `#FF8A3D` | flask | particles first, then the equation, balanced step by step |
| Physics | `#9B6BFF` | atom | the idea, then the formula, then units and a real-world estimate |
| History | `#E8B04A` | scroll | as a story: causes, events, consequences, with dates anchored |
| Geography | `#2EC4B6` | globe | place, process, impact, with a case study |
| English | `#FF5A6E` | open book | quote, technique, effect; helps build a paragraph |
| Languages | `#FF6FD8` | speech bubble | short phrases and patterns, with practice in the language |

A tutor is a system prompt built on Ember's own (her origin, safe mode and personality rules), plus the subject, the teaching style and the study rules: hint before answer, one check-question, short replies. It also has an avatar and a colour.

**Avatars.** Pixel salamanders from Ember's family, drawn as 32×32 grids by a generator script. Each holds its subject's prop in its subject's colour. Bundled as SVG and PNG under `src/tutors/`. (A first set is being drawn now; see Status.)

### Decks and cards

Each tutor has one deck per profile, stored at `userData/study/<profileId>/<tutorId>.json`. A card:

```
{ id, front, back, source: "topic" | "notes" | "file:<name>" | "chat", createdAt, box: 1-5, due: <date>, history: [{ at, rating }] }
```

Scheduling uses **Leitner boxes**, because they are simple enough to explain to a student in one sentence:
- intervals by box: 1 → today, 2 → 1 day, 3 → 3 days, 4 → 7 days, 5 → 16 days;
- *again* → box 1, back later in the same session;
- *good* → up one box;
- *easy* → up two boxes, to at most 5.

### The Languages tutor

It teaches **any language** the student picks on its page — French, Spanish, Hindi and German are offered first (the user's choice, 5 November) — and keeps **one deck per language**, so a student taking two languages has two decks under one tutor. Llama 3.2 3B officially covers English, German, French, Italian, Portuguese, Hindi, Spanish and Thai; for any other language the tutor says plainly that its answers may be weaker. Ember's voice and hearing are English-only, so **R** reads only the English side of a language card, and spoken practice in the language is out of scope.

### Where Study lives

**Study** is an entry in the corner menu for everyone, beside Talk, with a key of its own. It opens the tutor picker; a tutor opens its page; review, the draft list and explanations happen inside the Study screen, not in the chat.

### Making cards

1. **The source.** From the tutor's page: *from a topic or notes* (one box: a topic name, or notes pasted in), *from a file* (the attach picker; long files are cut to a section the student picks, or the first part), or *from this chat*. Pasted notes are cut the same way as files: what goes to the model has to fit beside the prompt and ten cards in a window that can be as short as 2,048 tokens. A card made from a bare topic name comes from the model's own knowledge, the weakest source, which is what the draft list is for.
2. **Generation.** The local model writes up to 10 cards in the tutor's style, constrained to `[{ "front": "...", "back": "..." }]`.
3. **The draft list.** The cards arrive in a draft list. The student keeps, edits or deletes each one, then adds them to the deck. Duplicates are skipped by normalised front text.
4. **Progress and stopping.** Progress is shown, with a Stop that keeps whatever was already made.

### Review

One card at a time. **Space** flips the card, then **1** again / **2** good / **3** easy. **E** explains the card, **R** reads it aloud with the voice that already exists, and **Esc** ends the session. A session ends when nothing is due. It shows cards left, and finishes with a one-line summary from the tutor.

### Explain this card

Explanations are streamed from the local model in the tutor's style: simple, step by step, with an example, ending with one question to check understanding. Under it is a one-line answer box: the student answers, and the tutor replies once (right, or what was missed). That exchange is not saved, and the single-letter review keys are off while the box has focus. *Explain it differently* asks again with a different angle.

### Talking to a tutor

*Ask Maths* (and so on) opens a chat with that tutor's system prompt. **Tutor chats always answer on the local model**, whatever the web-access setting says — the user's decision (5 November), so a student's notes and weakest cards never leave the machine. The header carries the tutor's avatar and colour, and the conversation is saved like any other, tagged with the tutor. The tutor knows the student's weakest cards in its deck (the most-*again* fronts, up to 5) and can use them.

### Check-ins and goals (dot-style)

- **Goals.** A tutor can hold one goal: text plus a date. It shows on the tutor's page.
- **A goal shapes the schedule.** While one is set, no card's next due date falls after the goal date, and on the day before it every card in the deck comes due once. So the night before "Biology test, Friday" the tutor has something to say.
- **Check-ins.** When a tutor has cards due, it checks in with one line above the message box: *"12 biology cards due — 10 minutes?"*, with **Start** and **Later**.
  - It appears when the model is ready after launch and when a new chat opens, whether or not the reopened conversation already has messages.
  - Never while a reply is being written, or within two minutes of the student sending one.
  - It is not part of the conversation and is not saved with it.
  - At most once per tutor per day.
  - It mentions days left when a goal is set.
- **No model work happens for a check-in.** It is counting, not thinking.

### The voice avatar: two koi

The Talk view shows two koi circling each other in ASCII. They are drawn procedurally: original work, not taken from the reference clip, which is watermarked stock footage. They react to Ember's states: idle, listening, thinking, and speaking with loudness. The animation:
- runs at about 15 fps on one `<pre>`;
- pauses when the window is hidden;
- shows a still frame under reduced motion.

Ember's big face stays available as a setting for Talk; the koi is the default. (A first version is being built now; see Status.)

### UI improvements

These come from a review of the current interface (screens, Talk, Settings) that is under way now. The top five go to the user to choose from; the chosen ones become their own stage.

## Order

Each stage is its own pull request, measured and released.

1. **Study: tutors, decks, review, explain**, with the avatars and the Study screen. Cards made from a topic.
2. **Cards from files and from the chat**, and the draft list.
3. **Talking to a tutor, goals, check-ins.**
4. **The koi in Talk.** Independent; can move earlier.
5. **The UI improvements the user picks.**

## Left to the builder

- Exact prompt wording.
- The JSON schema's details.
- The layout within the approved mockup.
- How the decks' files are split.
- The keys beyond those named here, added to `src/keys.js`.

## Calls made without the user (check these)

- The eight subjects and their colours.
- Tutor colours fixed rather than following the accent.
- Leitner boxes and their intervals.
- Study is local-only, even when a web provider is configured.
- No background model work: check-ins only count.
- The koi as Talk's default, with Ember's face kept as an option.
- Study in everyone's menu, not only in Student mode.
- One box for a topic or pasted notes; notes cut to fit like files.
- A one-reply answer box under explanations, not saved.
- A goal date pulls every card due by the day before it.
- Check-ins above the message box at launch and on a new chat, never mid-reply.
- Planning starts only after the avatars, the koi and the Study mockup have been approved.

## Status

Three pieces are being made in parallel as drafts for review, in `emb3r evidence\staging\`:
- the koi animation (`koi\`);
- the tutor avatars (`tutors\`);
- a mockup of the Study screens, with a review of the current UI (`study-ui\`).

None of them is in the app until this document is approved.
