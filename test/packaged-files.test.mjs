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

/** electron-builder's reading: patterns in order, a later "!" taking a file back out. */
export function isPackaged(file, patterns) {
  let included = false;
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
