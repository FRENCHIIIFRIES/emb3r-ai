# Accessibility and shortcuts — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every action in emb3r has a key, three work from anywhere, a keyboard user can talk to her, a screen reader hears her, and the text can be made bigger, plainer and higher in contrast.

**Architecture:** One shortcut table in a new classic script, `src/keys.js`, drives the in-app handler, the shortcut sheet and the Settings list; its pure functions are tested by running the real file in a Node `vm`. The main process owns the three global shortcuts (`globalShortcut`) and the clipboard, with its pure parts in a new ES module, `access.js`. Accessibility semantics are added to the existing markup, with one watcher per dialog rather than edits at every call site.

**Tech Stack:** Electron 43 (`globalShortcut`, `clipboard`, `webFrame`), Node `node:test` and `node:vm`, WAI-ARIA dialog/menu/tabs patterns, Atkinson Hyperlegible Next (OFL).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-08-access-shortcuts-design.md`. Keys exactly as listed there.
- Global defaults: `Control+Alt+Space` (summon), `Control+Alt+Shift+E` (explain clipboard), `Control+Alt+Shift+T` (talk). Changeable, all can be switched off.
- In-app modifier is Ctrl on Windows/Linux and Cmd on macOS. A key press with AltGraph held is never a shortcut.
- Clipboard explains are always `forceLocal`, capped at 4,000 characters, and the first 300 are shown in the user's line.
- Talking by keyboard is a toggle; the window comes to the front, the microphone indicator shows, and listening stops by itself after 60 s. Esc cancels without sending.
- Replies are announced once, when finished, through one polite live region.
- Every module `main.js` imports is in `build.files` (the packaged-files test enforces it). `src/**/*` already covers renderer files and fonts.

## Files

| File | |
|---|---|
| `src/keys.js` | **new** classic script: `SHORTCUTS`, `matchShortcut(e, isMac)`, `keyEventToAccelerator(e)`, `acceleratorLabel(acc, isMac)`, `FACE_WORDS` — on `globalThis.emb3rKeys` |
| `access.js` | **new** ES module: `DEFAULT_GLOBALS`, `prepareClipboard(text)`, `isUsableAccelerator(acc)` |
| `test/keys.test.mjs`, `test/access.test.mjs` | **new** |
| `main.js` | `config.globalShortcuts`, register/re-register with status, IPC, clipboard explain, summon |
| `preload.cjs` | shortcut APIs, `onShortcut`, zoom through `webFrame` |
| `src/index.html` | live region, roles and names, shortcut sheet dialog, Accessibility tab, contrast theme, `forced-colors`, `@font-face`, font-size fix, `keys.js` script tag |
| `src/renderer.js` | dispatcher, talk toggle, sheet, announce, dialog/menu/tab behaviour, Accessibility settings |
| `src/fonts/atkinson-hyperlegible-next-*.woff2`, `AtkinsonHyperlegibleNext-LICENSE.txt` | **new**, downloaded and checked (woff2 signature) |

### Task 1: The table and the pure logic, tested first

**Produces:** `emb3rKeys.SHORTCUTS: Array<{ id, keys: { ctrl?, shift?, alt?, code }, label, group }>`, `matchShortcut(e, isMac) → id | null`, `keyEventToAccelerator(e) → string | null` (null for no modifier or only modifiers), `acceleratorLabel("Control+Alt+Shift+E", false) → "Ctrl+Alt+Shift+E"`; `access.js`: `prepareClipboard(text) → { ok, text?, preview?, cut?, reason? }`, `isUsableAccelerator(acc) → boolean`.

- [ ] Tests first (`test/keys.test.mjs` loads `src/keys.js` into a `vm` context): no two shortcuts share keys; every one has a label and a group; Ctrl+N matches `newChat` on Windows and Cmd+N on Mac, Ctrl+N does not on Mac; AltGraph never matches; a Ctrl+Alt+Shift+E key event records as `Control+Alt+Shift+E`; Shift+E alone records as null; F1 matches the sheet without a modifier.
- [ ] `test/access.test.mjs`: empty and whitespace clipboards are refused with a reason; 5,000 characters are cut to 4,000 with `cut: true`; the preview is 300 characters; accelerators need a modifier and a key.
- [ ] Run, see them fail; write `src/keys.js` and `access.js`; run, see them pass. Commit.

### Task 2: Global shortcuts and the clipboard, in main

- [ ] `defaultConfig()`: `globalShortcuts: { enabled: true, summon, explain, talk }` from `DEFAULT_GLOBALS`.
- [ ] `registerGlobalShortcuts()`: unregister ours, register each enabled one, record `{ id: "ok" | "taken" | "invalid" }`; on `ready`, on change, and unregistered on `will-quit`.
- [ ] Actions: summon → show, restore, focus, tell the renderer `focus-input`; talk → summon, tell the renderer `talk`; explain → `prepareClipboard(clipboard.readText())`, summon, tell the renderer `explain` with the prepared text or the reason.
- [ ] IPC: `global-shortcuts` (config + status), `set-global-shortcut(id, accelerator)`, `set-global-shortcuts-enabled(on)`, `suspend-global-shortcuts(on)` (while a new one is being recorded). Commit.

### Task 3: The preload

- [ ] `globalShortcuts`, `setGlobalShortcut`, `setGlobalShortcutsEnabled`, `suspendGlobalShortcuts`, `onShortcut(cb)`, and `zoom.get/set` through `webFrame.setZoomFactor` (0.5–3). Commit with Task 2.

### Task 4: Keys inside emb3r

- [ ] `<script src="./keys.js">` before `renderer.js`.
- [ ] One `keydown` handler: `matchShortcut` → action map (new chat, menu, settings, input, attach, copy last, read last, zoom, sheet, talk, Talk view). Esc in order: recording a shortcut → sheet/dialog → menu → listening (cancel) → reply (stop) → Settings → Talk view. The existing face-mode Esc handler folds into it.
- [ ] Talk toggle: `toggleTalk()` starts or stops `startListening`/`stopListening`, arms a 60 s auto-stop, and Esc cancels by discarding the recording.
- [ ] The shortcut sheet: a dialog built from `SHORTCUTS` plus the three globals with their current keys.
- [ ] `onShortcut`: `focus-input`, `talk`, `explain` — the explain sends `Explain this:` with the text, `forceLocal`, and a user line showing the preview. Commit.

### Task 5: Screen readers

- [ ] `#srAnnounce` (polite, visually hidden) and `announce(text)`; a finished reply, an error, a fixed reply and a shortcut result are announced; `#chat` gets `role="log"` and a name.
- [ ] `#face`: `role="img"`, `aria-label` from `FACE_WORDS`, updated in `paintFace`.
- [ ] Dialogs: `role="dialog"`, `aria-modal`, `aria-labelledby`; a `MutationObserver` on each one's `open` class moves focus in, traps Tab, returns focus.
- [ ] The menu: `aria-expanded`, `role="menu"`/`menuitem`, Up/Down/Home/End, Esc returns focus to the button.
- [ ] Settings tabs: `tablist`/`tab`/`tabpanel`, `aria-selected`, Left/Right/Home/End.
- [ ] Names on `[o]`, `📎`, `[ ≡ ]`, the copy buttons. Commit.

### Task 6: Seeing comfortably, and the Accessibility tab

- [ ] Font size: `html { font-size: 20px }`, `body { font-size: 1rem }`.
- [ ] Zoom from `localStorage.emb3rZoom`, applied at boot.
- [ ] Theme gains `High contrast`: `[data-theme="contrast"]` — `#000`, `#fff`, gold user lines, no glow; `@media (forced-colors: active)` keeps borders and focus.
- [ ] `@font-face` for Atkinson Hyperlegible Next (both subsets, variable 400–700); `html.easyRead` uses it for text, the wordmark and faces stay monospace.
- [ ] Accessibility tab: shortcut list, global shortcut rows with Change and status, off switch, easy-read switch, contrast, zoom; search keywords. Commit.

### Task 7: Proof

- [ ] `shoot-access.cjs` on the real renderer: each in-app shortcut; Esc order; one announcement per finished reply; face labels; dialog focus in, trapped, returned; menu and tab arrows; Font Size changes a message's computed size; high contrast at 21:1; the easy-read font is the rendered one; every button has an accessible name. Screenshots of the sheet and the Accessibility tab. Push and open the PR.
