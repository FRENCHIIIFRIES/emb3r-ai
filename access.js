// The parts of emb3r's accessibility features that run in the main process
// and need neither Electron nor a window: the three keys that work from
// anywhere, getting the clipboard ready to explain, and whether a recorded key
// is one that can be registered. `npm test` runs all of it.

// Checked against the keys people already use before they were chosen. The
// first ones suggested - Ctrl+Shift+T, Ctrl+Shift+E, Ctrl+Shift+Space - reopen a
// browser tab, open VS Code's explorer and show its parameter hints, and a
// global shortcut takes its keys from every app. Ctrl+Alt+letter types € and
// friends on German, French and Spanish layouts, where Ctrl+Alt is AltGr.
export const DEFAULT_GLOBALS = {
  summon: "Control+Alt+Space",
  explain: "Control+Alt+Shift+E",
  talk: "Control+Alt+Shift+T",
};

export const CLIPBOARD_MAX = 4000;
const PREVIEW_MAX = 300;

// What the clipboard holds, ready to be explained: the text sent to the model,
// cut to fit the context window, and the opening of it to show in the
// transcript, so nothing is explained that the person cannot see was taken.
export function prepareClipboard(raw) {
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!text) return { ok: false, reason: "There's nothing on the clipboard to explain - copy some text first." };
  const cut = text.length > CLIPBOARD_MAX;
  const body = cut ? text.slice(0, CLIPBOARD_MAX) : text;
  const preview = body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX)}…` : body;
  return { ok: true, text: body, preview, cut };
}

const MODIFIERS = new Set(["Control", "Alt", "Shift", "Super", "Command", "CommandOrControl"]);

// A key and at least one modifier that is not Shift. Shift alone would take
// capital letters from every other app on the computer.
export function isUsableAccelerator(accelerator) {
  if (typeof accelerator !== "string" || !accelerator) return false;
  const parts = accelerator.split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key || mods.some((m) => !MODIFIERS.has(m))) return false;
  return mods.some((m) => m !== "Shift");
}
