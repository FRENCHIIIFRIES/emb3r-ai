import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// icons.js and keys.js are classic scripts that hang their tables off the
// global object; each runs here in a context of its own, as the page runs it
function load(file) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), "utf8"), ctx);
  return ctx;
}

const { GRIDS, PATHS, gridPath } = load("../src/icons.js").emb3rIcons;
const { SHORTCUTS } = load("../src/keys.js").emb3rKeys;
const html = fs.readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const renderer = fs.readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8");

test("every icon is a 12 x 12 drawing of lit and unlit squares", () => {
  for (const [name, rows] of Object.entries(GRIDS)) {
    assert.equal(rows.length, 12, name);
    for (const row of rows) assert.match(row, /^[#.]{12}$/, `${name}: ${row}`);
    assert.ok(rows.join("").includes("#"), `${name} is empty`);
    assert.ok(PATHS[name].length > 0, name);
  }
});

test("a row of lit squares becomes one rectangle", () => {
  assert.equal(gridPath([".##.", "#..#"]), "M1 0h2v1h-2zM0 1h1v1h-1zM3 1h1v1h-1z");
});

test("every icon the page or the renderer asks for is drawn", () => {
  const asked = new Set();
  for (const [, name] of html.matchAll(/data-icon="([\w-]+)"/g)) asked.add(name);
  for (const [, name] of renderer.matchAll(/(?:iconSpan|setIcon)\([^)]*?"([\w-]+)"\)/g)) asked.add(name);
  assert.ok(asked.size >= 10, `only ${asked.size} found - is the pattern still right?`);
  for (const name of asked) assert.ok(GRIDS[name], `no icon called ${name}`);
});

test("every key a hover label or a menu row names is a real shortcut", () => {
  const ids = new Set(SHORTCUTS.map((s) => s.id));
  const named = [...html.matchAll(/data-tip-key="([\w-]+)"/g), ...html.matchAll(/class="menuShortcut" data-key="([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(named.length >= 8, `only ${named.length} found`);
  for (const id of named) assert.ok(ids.has(id), `no shortcut called ${id}`);
});

test("every tutor is drawn, each colour with a shade the stylesheet knows", () => {
  const { ART } = load("../src/tutor-art.js").emb3rTutorArt;
  const ids = ["maths", "biology", "chemistry", "physics", "history", "geography", "english", "languages"];
  assert.deepEqual(Object.keys(ART).sort(), [...ids].sort());
  for (const id of ids) {
    assert.ok(ART[id].length >= 5, `${id} has too few colours`);
    for (const [shade, colour, d] of ART[id]) {
      assert.ok(html.includes(`.tutorArt .${shade}{`), `no rule for shade ${shade}`);
      assert.match(colour, /^#[0-9a-f]{6}$/, id);
      assert.ok(d.startsWith("M"), id);
    }
  }
});

test("no control is left with an emoji for a face", () => {
  // the paperclip was the one glyph on screen drawn by somebody else's font
  const controls = html.slice(html.indexOf('<div id="row">'), html.indexOf('<div id="genStats"'));
  assert.doesNotMatch(controls, /\p{Extended_Pictographic}/u);
});
