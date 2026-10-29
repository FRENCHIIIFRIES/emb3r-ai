import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GLOBALS, prepareClipboard, isUsableAccelerator, CLIPBOARD_MAX } from "../access.js";

test("the three keys that work from anywhere clash with nothing checked", () => {
  assert.deepEqual(DEFAULT_GLOBALS, {
    summon: "Control+Alt+Space",
    explain: "Control+Alt+Shift+E",
    talk: "Control+Alt+Shift+T",
  });
  for (const acc of Object.values(DEFAULT_GLOBALS)) assert.ok(isUsableAccelerator(acc), acc);
});

test("an empty clipboard is said, not sent", () => {
  for (const nothing of ["", "   \n\t ", null, undefined]) {
    const r = prepareClipboard(nothing);
    assert.equal(r.ok, false);
    assert.match(r.reason, /nothing on the clipboard/);
  }
});

test("what was copied is sent, and shown, and cut when it is long", () => {
  const short = prepareClipboard("  photosynthesis\r\n");
  assert.deepEqual(short, { ok: true, text: "photosynthesis", preview: "photosynthesis", cut: false });

  const long = prepareClipboard("x".repeat(5000));
  assert.equal(long.ok, true);
  assert.equal(long.text.length, CLIPBOARD_MAX);
  assert.equal(long.cut, true);
  assert.equal(long.preview.length, 301, "300 characters and an ellipsis");
});

test("a shortcut needs a key and something more than Shift", () => {
  assert.equal(isUsableAccelerator("Control+Alt+Space"), true);
  assert.equal(isUsableAccelerator("Command+Shift+J"), true);
  assert.equal(isUsableAccelerator("Shift+E"), false);
  assert.equal(isUsableAccelerator("E"), false);
  assert.equal(isUsableAccelerator("Control+"), false);
  assert.equal(isUsableAccelerator("Hyper+E"), false);
  assert.equal(isUsableAccelerator(""), false);
});
