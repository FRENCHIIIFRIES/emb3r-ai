# Accessibility and shortcuts — design

**Date:** 8 October 2026
**Status:** approved in conversation; the second of six features asked for on 7 October
**Branch:** `feat/access-shortcuts`, from `main` after #70 and #71 merged

## What was asked

"Make it disability friendly, has computer shortcuts for everything and all."
Asked whether some shortcuts should work from anywhere on the computer: yes, a
few. "Explain what I copied" was asked for the same day and belongs here,
because it is a shortcut first.

## What exists, measured by reading the code

| Area | Today |
|---|---|
| Keyboard | Enter sends; Escape leaves face mode and clears the settings search. Nothing else |
| Talking | `micButton` and `faceMic` listen to pointer events only — **a keyboard user cannot talk to Ember at all** |
| Screen readers | replies are not announced in the terminal (only Talk's `#faceSaid` is live); faces are ASCII, read out as punctuation; the four modals have no `role="dialog"`, no focus handling; the menu has no `aria-expanded`; several buttons are only symbols (`[o]`, `📎`, `[ ≡ ]`) |
| Text size | the Font Size slider sets `<html>`'s font size, but `body` declares its own `font-size:20px`, so nothing changes |
| Already right | `:focus-visible` outlines, `prefers-reduced-motion`, the Reactions switch, the coil's screen-reader label |

## The keys, and why these

The first keys suggested — Ctrl+Shift+T, Ctrl+Shift+E, Ctrl+Shift+Space —
were checked before building and **all clash**: a global shortcut takes its
keys from every other app, and those reopen a closed browser tab, open VS
Code's explorer, and show VS Code's parameter hints. Ctrl+Alt+letter is no
better: on German, French and Spanish layouts Ctrl+Alt is AltGr, and AltGr+E
types €.

### From anywhere (`globalShortcut`)

| Keys | Does | |
|---|---|---|
| Ctrl+Alt+Space | brings emb3r up, cursor in the message box | |
| Ctrl+Alt+Shift+E | explains what is on the clipboard | always answered **on this computer** (`forceLocal`): a clipboard can hold a password |
| Ctrl+Alt+Shift+T | talk: brings emb3r up and starts listening; again to send | |

Each can be **changed** — press the keys you want — or all of them switched
off, in Settings → Accessibility, which also says when another app already owns
one (`globalShortcut.register` returning false).

### Inside emb3r (Ctrl on Windows, Cmd on Mac — avoiding Cmd+H, Cmd+M, Cmd+Q, Cmd+W)

| Keys | Does |
|---|---|
| Ctrl+T | talk on/off: press, not hold |
| Ctrl+Shift+T | the Talk view, open or closed |
| Ctrl+N | new chat |
| Ctrl+K | the menu, with history |
| Ctrl+, | Settings |
| Ctrl+L | the message box |
| Ctrl+O | attach a file |
| Ctrl+Shift+C | copy her last reply |
| Ctrl+Shift+R | read her last reply aloud |
| Ctrl+= / Ctrl+− / Ctrl+0 | zoom everything in / out / back |
| Esc | stop what is happening, or close what is open — the innermost first |
| Ctrl+/ or F1 | the shortcut sheet |
| Ctrl+Alt+P / → / ← | Spotify (built in #71) |
| arrows | inside the menu and the Settings tabs |

Single source: one table in the renderer drives the handler, the sheet and the
Settings list, so the three cannot disagree.

### Talking without holding

Holding a key is hard for some people, so talking from the keyboard is a
toggle. The microphone principle in the code — "a button you hold is the
difference between a tool and a bug" — is kept by other means: emb3r always
comes to the front, the microphone indicator always shows, and listening **stops
by itself after 60 seconds**. Esc cancels without sending.

## Screen readers

- **Replies announced once, when finished** — a visually hidden polite live
  region gets "Ember: …" when the reply completes, not every streamed token.
  Errors and fixed replies go through it too. The transcript itself becomes
  `role="log"` with a name, not live.
- **Faces described**: `#face` is `role="img"` with a label per face —
  "Ember looks happy", "Ember is thinking", "Ember is asleep".
- **Dialogs**: the four modals and the new shortcut sheet get `role="dialog"`,
  `aria-modal`, a label; when one opens, focus moves into it and Tab stays
  inside; Esc closes those that can be closed; focus returns where it was. One
  watcher on each modal's `open` class does this, so no call site changes.
- **The menu**: `aria-expanded` on its button, `role="menu"` items, Up/Down to
  move, Esc to close and return focus.
- **Settings tabs**: `tablist`/`tab`/`tabpanel`, `aria-selected`, Left/Right
  and Home/End.
- **Every symbol-only button named**: `[o]` "Talk", `📎` "Attach a file",
  `[ ≡ ]` "Menu", copy buttons "Copy this reply".

## Seeing comfortably

- **Font Size works**: `html` keeps the 20px default, `body` follows it at
  `1rem`, so the slider moves the conversation and the message box. Fixed
  small print (13px notes) stays as it is; zoom is for everything.
- **Zoom**: Ctrl+= / Ctrl+− / Ctrl+0, 50%–300%, remembered — through
  `webFrame.setZoomFactor` in the preload, since Electron wires no zoom keys
  without a menu.
- **High contrast**: a third choice in Theme — black, white text, gold for your
  own lines, no glow, solid borders. Windows' own high-contrast mode
  (`forced-colors: active`) is respected: borders and focus stay visible.
- **Easy-read font**: Atkinson Hyperlegible Next, designed for low vision by
  the Braille Institute, SIL Open Font License, bundled with its licence so it
  works offline. A switch in Accessibility; the wordmark and the faces stay
  monospace, because they are drawings.

## Explain what I copied

- Main reads `clipboard.readText()`. Nothing there, or not text: she says so.
- Over 4,000 characters it is cut, and she says it was.
- The message is sent with `forceLocal`, so it never goes to Gemini or another
  provider whatever web access is set to. Your line in the transcript shows
  what was taken from the clipboard (first 300 characters), so nothing is
  explained that you cannot see.

## Settings → Accessibility (new tab)

The shortcut list; the global shortcuts with Change buttons and an off switch,
each saying whether it is working or taken; easy-read font; high contrast (also
in Theme); zoom with its keys; pointers to Font Size, Reactions and reading
aloud in Display. Searchable by "keyboard", "shortcut", "screen reader",
"dyslexia", "contrast", "zoom", "font".

## How it is checked

- `npm test`: the accelerator recorder (a key event becomes an accelerator,
  and one with no modifier is refused), the shortcut table has no duplicate
  keys and every entry has words, the clipboard preparation (empty, long,
  normal).
- `shoot-access.cjs` on the real renderer: every shortcut does its thing; Esc's
  order; the live region receives a finished reply once; faces have labels;
  dialogs take and return focus and trap Tab; the menu and tabs move with
  arrows; Font Size changes the computed size of a message; high contrast
  measured at 21:1; the easy-read font is the one rendered; every button has an
  accessible name (axe-style check over the DOM).

## Out of scope here

A full screen-reader pass with NVDA on a real machine — recorded as the next
check, not claimed. Rebinding the in-app keys (only the global three can be
changed; the in-app ones all use a modifier, so WCAG 2.1.4 does not require
it).
