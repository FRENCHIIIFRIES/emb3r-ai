import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The installed app contains only what package.json's build.files lists. A
// module main.js imports but the list leaves out works in development and
// crashes the installed app - the shape of the v1.36 speech fault, where a
// piece the recogniser needed was left out of the download.

/** A build.files pattern as a regular expression: ** crosses folders, * does not. */
function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * electron-builder's reading: patterns in order, a later "!" taking a file back
 * out. The app's own files start out, and are in only if a pattern names them;
 * a dependency's files start in, and are out only if a pattern removes them.
 */
export function isPackaged(file, patterns, byDefault = false) {
  let included = byDefault;
  for (const p of patterns) {
    const negated = p.startsWith("!");
    if (patternToRegExp(negated ? p.slice(1) : p).test(file)) included = !negated;
  }
  return included;
}

test("the pattern reading matches electron-builder's on the cases that matter", () => {
  const patterns = ["main.js", "src/**/*", "!**/node_modules/x/**"];
  assert.equal(isPackaged("main.js", patterns), true);
  assert.equal(isPackaged("src/document-text.js", patterns), true);
  assert.equal(isPackaged("src/fonts/a.woff2", patterns), true);
  assert.equal(isPackaged("music.js", patterns), false);
});

test("every file main.js imports is packaged", () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const files = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).build.files;
  const imports = [...main.matchAll(/from\s+["']\.\/([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(imports.length > 0, "found no relative imports at all - the pattern is wrong, not the app");
  for (const f of imports) assert.ok(isPackaged(f, files), `${f} is imported by main.js but not in build.files`);
});

// Found on 10 November 2026, in the installed v1.40.0: every sentence failed
// with "ENOENT ... kokoro-js\voices\bf_lily.bin not found in app.asar". The
// build drops Kokoro's fifty-odd voices and puts one back - and since the day
// Ember got a voice (v1.34.0) the one it put back was af_heart, while main.js
// spoke with bf_lily. From source every voice is there, so she spoke in every
// test and in no installed copy.
test("the voice Ember speaks with is in the installed app, and no other", () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const files = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).build.files;
  const voice = /^const EMBER_VOICE = "([a-z]+_[a-z]+)";/m.exec(main);
  assert.ok(voice, "found no EMBER_VOICE in main.js - the pattern is wrong, not the app");
  const at = (name) => `node_modules/kokoro-js/voices/${name}.bin`;
  assert.ok(isPackaged(at(voice[1]), files, true), `main.js speaks with ${voice[1]}, and build.files leaves ${at(voice[1])} out of the installer`);
  // half a megabyte each, and nobody will ever hear them
  for (const other of ["af_heart", "am_adam", "bf_emma", "bf_lily"].filter((v) => v !== voice[1])) {
    assert.equal(isPackaged(at(other), files, true), false, `${other} is packaged and never used`);
  }
  // the file is where the pattern says, when the dependencies are installed
  const onDisk = new URL(`../${at(voice[1])}`, import.meta.url);
  if (fs.existsSync(new URL("../node_modules/kokoro-js/", import.meta.url))) {
    assert.ok(fs.existsSync(onDisk), `kokoro-js has no voice called ${voice[1]}`);
  }
});
