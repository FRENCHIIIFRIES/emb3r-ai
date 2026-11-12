import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// src/dragon.js is a classic script, as the page loads it
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../src/dragon.js", import.meta.url), "utf8"), ctx);
const D = ctx.emb3rDragon;

const types = (r) => Array.from(r.events, (e) => e.type);

// hits a dragon n times, `gap` ms apart, from `start`; returns the last result
function beat(dragon, n, gap, start = 1000) {
  let r = { state: dragon, events: [] };
  for (let i = 0; i < n; i++) r = D.hit(r.state, start + i * gap);
  return r;
}

test("a hit costs him one hp and says so, in a different word each time", () => {
  let s = D.createDragon();
  assert.equal(s.hp, D.MAX_HP);
  const words = new Set();
  for (let i = 0; i < 4; i++) {
    const r = D.hit(s, 1000 + i * 2000);
    assert.equal(types(r)[0], "bonk");
    words.add(r.events[0].word);
    s = r.state;
  }
  assert.equal(words.size, 4, "four hits, four different words");
  assert.ok(s.hp < D.MAX_HP);
  assert.equal(s.bonks, 4);
});

test("five quick hits in a row and he sees stars, once", () => {
  const r = beat(D.createDragon(), 5, 300);
  assert.ok(types(r).includes("dizzy"));
  const again = D.hit(r.state, 1000 + 5 * 300);
  assert.ok(!types(again).includes("dizzy"), "already seeing stars");
});

test("slow hits are not a combo", () => {
  const r = beat(D.createDragon(), 6, 2000);
  assert.ok(!types(r).includes("dizzy"));
});

test("low on hp, he fights back - once - and dodges for a moment after", () => {
  let r = { state: D.createDragon(), events: [] };
  let fired = 0;
  let t = 1000;
  while (r.state.hp > D.ANGRY_AT) {
    r = D.hit(r.state, (t += 400));
    if (types(r).includes("fire")) fired++;
  }
  assert.equal(fired, 1, "breathes fire when hp falls to the angry line");
  const dodged = D.hit(r.state, t + 300);
  assert.deepEqual(types(dodged), ["dodge"]);
  assert.equal(dodged.state.hp, r.state.hp, "a dodged punch costs nothing");
  // after the cooldown he can be hit again, and does not breathe fire twice
  const later = D.hit(dodged.state, t + D.COOLDOWN_MS + 10);
  assert.equal(types(later)[0], "bonk");
  assert.ok(!types(later).includes("fire"));
});

test("at zero hp he is knocked out, stays down, then gets back up whole", () => {
  let s = D.createDragon();
  let t = 1000;
  let r;
  // past the cooldown each time, so no punch is dodged
  for (let i = 0; i < D.MAX_HP; i++) {
    r = D.hit(s, (t += D.COOLDOWN_MS + 10));
    s = r.state;
  }
  assert.ok(types(r).includes("ko"));
  assert.equal(s.hp, 0);
  assert.equal(s.kos, 1);
  assert.deepEqual(types(D.hit(s, t + 100)), ["down"], "no hitting a dragon when he is down");
  const still = D.tick(s, t + D.KO_MS - 1);
  assert.equal(still.state.hp, 0);
  const up = D.tick(s, t + D.KO_MS);
  assert.deepEqual(types(up), ["up"]);
  assert.equal(up.state.hp, D.MAX_HP);
  assert.equal(up.state.angered, false, "and over it");
});

test("left alone, hp comes back one at a time", () => {
  const r = beat(D.createDragon(), 2, 2000);
  assert.equal(r.state.hp, D.MAX_HP - 2);
  const lastHit = 1000 + 2000;
  assert.equal(D.tick(r.state, lastHit + D.REGEN_MS - 1).state.hp, D.MAX_HP - 2);
  assert.equal(D.tick(r.state, lastHit + D.REGEN_MS).state.hp, D.MAX_HP - 1);
  assert.equal(D.tick(r.state, lastHit + D.REGEN_MS * 9).state.hp, D.MAX_HP, "never past full");
});

test("petting heals him, and revives him if he is down", () => {
  const hurt = beat(D.createDragon(), 3, 2000).state;
  const p = D.pet(hurt, 9000);
  assert.deepEqual(types(p), ["purr"]);
  assert.equal(p.state.hp, D.MAX_HP);
  assert.equal(p.state.pets, 1);

  let s = D.createDragon();
  let t = 1000;
  for (let i = 0; i < D.MAX_HP; i++) s = D.hit(s, (t += D.COOLDOWN_MS + 10)).state;
  const revived = D.pet(s, t + 100);
  assert.deepEqual(types(revived), ["revive"]);
  assert.equal(revived.state.hp, D.MAX_HP);
  assert.equal(revived.state.koUntil, 0);
});

test("the dragon passed in is never changed", () => {
  const s = D.createDragon();
  D.hit(s, 1000);
  D.pet(s, 1000);
  D.tick(s, 99999);
  assert.equal(s.hp, D.MAX_HP);
  assert.equal(s.bonks, 0);
});

test("stroking back and forth over him is petting; one sweep is not", () => {
  const p = D.createPetting();
  let t = 0;
  // one long sweep across
  for (let x = 0; x <= 60; x += 4) assert.equal(p.move(x, (t += 20)), false);
  // back and forth: four turns of 30px strokes
  let petted = false;
  for (const stroke of [[60, 30], [30, 60], [60, 30], [30, 60], [60, 30]]) {
    const [from, to] = stroke;
    const step = to > from ? 3 : -3;
    for (let x = from; x !== to; x += step) petted = p.move(x, (t += 20)) || petted;
  }
  assert.equal(petted, true);
});

test("tiny jiggles and slow strokes do not count as petting", () => {
  const p = D.createPetting();
  let t = 0;
  let petted = false;
  for (let i = 0; i < 40; i++) petted = p.move(i % 2 ? 2 : 0, (t += 20)) || petted;
  assert.equal(petted, false, "a 2px jiggle is not a stroke");
  const slow = D.createPetting();
  t = 0;
  for (const [from, to] of [[0, 30], [30, 0], [0, 30], [30, 0], [0, 30]]) {
    const step = to > from ? 3 : -3;
    for (let x = from; x !== to; x += step) petted = slow.move(x, (t += 400)) || petted;
  }
  assert.equal(petted, false, "strokes spread over many seconds are not petting");
});

test("the konami code, and only the konami code", () => {
  const k = D.createKonami();
  const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  const results = code.map((key) => k.push(key));
  assert.deepEqual(results, [false, false, false, false, false, false, false, false, false, true]);
  // a stray key first does not stop it; capitals count; three ups still work
  const k2 = D.createKonami();
  let hit = false;
  for (const key of ["x", "ArrowUp", ...code.slice(0, 9), "A"]) hit = k2.push(key) || hit;
  assert.equal(hit, true);
  const k3 = D.createKonami();
  assert.equal(code.slice(0, 9).concat("x").some((key) => k3.push(key)), false);
});

test("the wordmark spelled with an E where the three is", () => {
  const blocks = [["E1", "E2"], ["M1", "M2"], ["B1", "B2"], ["31", "32"], ["R1", "R2"]];
  assert.deepEqual(Array.from(D.wordmarkRows(blocks)), ["E1M1B131R1", "E2M2B232R2"]);
  assert.deepEqual(Array.from(D.wordmarkRows(D.emberSpelling(blocks))), ["E1M1B1E1R1", "E2M2B2E2R2"]);
});

test("achievements unlock once each, in order", () => {
  assert.deepEqual(Array.from(D.newAchievements({ bonks: 1 }, [])), ["first-bonk"]);
  assert.deepEqual(Array.from(D.newAchievements({ bonks: 1 }, ["first-bonk"])), []);
  const all = D.newAchievements({ bonks: 100, kos: 1, pets: 1, konami: 1, threes: 1 }, []);
  assert.deepEqual(Array.from(all), ["first-bonk", "bully", "slayer", "good-dragon", "complicated", "cheater", "three", "remembers"]);
  for (const id of all) assert.ok(D.ACHIEVEMENTS[id], id);
});

test("late at night is midnight to five", () => {
  assert.equal(D.isLateNight(0), true);
  assert.equal(D.isLateNight(4), true);
  assert.equal(D.isLateNight(5), false);
  assert.equal(D.isLateNight(23), false);
});
