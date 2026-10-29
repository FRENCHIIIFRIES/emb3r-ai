import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// src/keys.js is a classic script for the renderer, so it is run here the way
// the page runs it - in a context of its own - and read off globalThis.
const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL("../src/keys.js", import.meta.url), "utf8"), sandbox);
const { SHORTCUTS, matchShortcut, keyEventToAccelerator, acceleratorLabel, shortcutLabel, FACE_WORDS } = sandbox.emb3rKeys;

/** A key event as the renderer sees one. */
function key(code, mods = {}) {
  return {
    code,
    ctrlKey: Boolean(mods.ctrl), metaKey: Boolean(mods.meta),
    altKey: Boolean(mods.alt), shiftKey: Boolean(mods.shift),
    getModifierState: (m) => m === "AltGraph" && Boolean(mods.altGraph),
  };
}

test("no two shortcuts share keys, and every one is described", () => {
  const seen = new Map();
  for (const s of SHORTCUTS) {
    assert.ok(s.label && s.group, `${s.id} has no words`);
    for (const code of [].concat(s.keys.code)) {
      const sig = `${Boolean(s.keys.mod)}|${Boolean(s.keys.alt)}|${s.keys.anyShift ? "*" : Boolean(s.keys.shift)}|${code}`;
      assert.ok(!seen.has(sig), `${s.id} and ${seen.get(sig)} share ${sig}`);
      seen.set(sig, s.id);
    }
  }
});

test("Ctrl on Windows is Cmd on a Mac, and not the other way round", () => {
  assert.equal(matchShortcut(key("KeyN", { ctrl: true }), false), "newChat");
  assert.equal(matchShortcut(key("KeyN", { meta: true }), true), "newChat");
  assert.equal(matchShortcut(key("KeyN", { ctrl: true }), true), null);
  assert.equal(matchShortcut(key("KeyT", { ctrl: true, shift: true }), false), "talkView");
  assert.equal(matchShortcut(key("KeyT", { ctrl: true }), false), "talk");
});

test("AltGr is a character being typed, never a shortcut", () => {
  assert.equal(matchShortcut(key("KeyP", { ctrl: true, alt: true }), false), "musicToggle");
  assert.equal(matchShortcut(key("KeyP", { ctrl: true, alt: true, altGraph: true }), false), null);
});

test("plain typing is never taken, but F1 and Esc are", () => {
  assert.equal(matchShortcut(key("KeyN"), false), null);
  assert.equal(matchShortcut(key("F1"), false), "sheet");
  assert.equal(matchShortcut(key("Escape"), false), "escape");
});

test("zoom answers to = and +, with or without Shift, and on the number pad", () => {
  assert.equal(matchShortcut(key("Equal", { ctrl: true }), false), "zoomIn");
  assert.equal(matchShortcut(key("Equal", { ctrl: true, shift: true }), false), "zoomIn");
  assert.equal(matchShortcut(key("NumpadAdd", { ctrl: true }), false), "zoomIn");
  assert.equal(matchShortcut(key("Minus", { ctrl: true }), false), "zoomOut");
});

test("a recorded key press becomes an Electron accelerator", () => {
  assert.equal(keyEventToAccelerator(key("KeyE", { ctrl: true, alt: true, shift: true }), false), "Control+Alt+Shift+E");
  assert.equal(keyEventToAccelerator(key("Space", { ctrl: true, alt: true }), false), "Control+Alt+Space");
  assert.equal(keyEventToAccelerator(key("KeyJ", { meta: true, shift: true }), true), "Command+Shift+J");
  // Shift alone would take capital letters from every app on the computer
  assert.equal(keyEventToAccelerator(key("KeyE", { shift: true }), false), null);
  assert.equal(keyEventToAccelerator(key("KeyE"), false), null);
  // a modifier on its own is not finished yet
  assert.equal(keyEventToAccelerator(key("ControlLeft", { ctrl: true }), false), null);
});

test("keys are written the way the keyboard says them", () => {
  assert.equal(acceleratorLabel("Control+Alt+Shift+E", false), "Ctrl+Alt+Shift+E");
  assert.equal(acceleratorLabel("Control+Alt+Space", true), "Ctrl+Option+Space");
  assert.equal(acceleratorLabel("Command+Shift+J", true), "Cmd+Shift+J");
  const next = SHORTCUTS.find((s) => s.id === "musicNext");
  assert.equal(shortcutLabel(next, false), "Ctrl+Alt+→");
  assert.equal(shortcutLabel(SHORTCUTS.find((s) => s.id === "settings"), true), "Cmd+,");
});

test("every face has words for a screen reader", () => {
  for (const face of ["idle", "think1", "think2", "happy", "sad", "sleeping", "error", "listening", "hearing", "puzzled", "talking", "deaf", "offline", "music1", "music2"]) {
    assert.ok(FACE_WORDS[face] && FACE_WORDS[face].startsWith("Ember"), face);
  }
});
