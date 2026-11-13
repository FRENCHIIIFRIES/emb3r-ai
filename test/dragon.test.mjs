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

// ---- more of him: a charged fireball, combos, hats, /dragon, the trophies

test("a press shorter than the charge delay is a punch; a charge never is", () => {
  const s = D.createDragon();
  assert.equal(D.release(100, s, 5000), "punch");
  assert.equal(D.release(D.CHARGE_DELAY_MS - 1, s, 5000), "punch");
  // charging, let go too soon: it fizzles
  assert.equal(D.release(D.CHARGE_DELAY_MS, s, 5000), "fizzle");
  assert.equal(D.release(D.CHARGE_DELAY_MS + D.CHARGE_MS - 1, s, 5000), "fizzle");
  // full: a fireball, however long it was held after that
  assert.equal(D.release(D.CHARGE_DELAY_MS + D.CHARGE_MS, s, 5000), "fireball");
  assert.equal(D.release(60000, s, 5000), "fireball");
});

test("a dragon who is down cannot charge: a long press is only the punch he refuses", () => {
  let s = D.createDragon();
  let t = 1000;
  for (let i = 0; i < D.MAX_HP; i++) s = D.hit(s, (t += D.COOLDOWN_MS + 10)).state;
  assert.equal(D.canCharge(s, t + 10), false);
  assert.equal(D.release(5000, s, t + 10), "punch");
  assert.equal(D.canCharge(D.createDragon(), 0), true);
});

test("the charge meter fills from the delay to full, and no further", () => {
  assert.equal(D.chargeLevel(0), 0);
  assert.equal(D.chargeLevel(D.CHARGE_DELAY_MS), 0);
  assert.equal(D.chargeLevel(D.CHARGE_DELAY_MS + D.CHARGE_MS / 2), 0.5);
  assert.equal(D.chargeLevel(D.CHARGE_DELAY_MS + D.CHARGE_MS), 1);
  assert.equal(D.chargeLevel(99999), 1);
  assert.equal(D.chargeMeter(0.5, 8), "████░░░░");
  assert.equal(D.chargeMeter(1, 8), "████████");
  assert.equal(D.chargeMeter(0, 8), "░░░░░░░░");
});

test("a fireball flies toward the pointer until it leaves the window", () => {
  const bounds = { width: 900, height: 650 };
  // straight right from (100, 100): leaves at the right edge
  assert.deepEqual({ ...D.fireballPath({ x: 100, y: 100 }, { x: 300, y: 100 }, bounds) }, { x: 900, y: 100 });
  // down and to the right at 45 degrees: leaves at the bottom first
  assert.deepEqual({ ...D.fireballPath({ x: 100, y: 100 }, { x: 200, y: 200 }, bounds) }, { x: 650, y: 650 });
  // up and to the left: the top edge
  assert.deepEqual({ ...D.fireballPath({ x: 400, y: 200 }, { x: 300, y: 100 }, bounds) }, { x: 200, y: 0 });
  // let go on top of him: no direction to speak of, so it goes the way he faces
  assert.deepEqual({ ...D.fireballPath({ x: 100, y: 100 }, { x: 104, y: 98 }, bounds) }, { x: 900, y: 100 });
});

test("whether a fireball's path crosses the wordmark, and how far along", () => {
  const word = { left: 300, top: 80, right: 700, bottom: 140 };
  const through = D.crossesRect({ x: 100, y: 110 }, { x: 900, y: 110 }, word);
  assert.equal(through, 0.25, "enters a quarter of the way along");
  assert.equal(D.crossesRect({ x: 100, y: 300 }, { x: 900, y: 300 }, word), -1, "passes under it");
  assert.equal(D.crossesRect({ x: 100, y: 110 }, { x: 250, y: 110 }, word), -1, "stops short of it");
  assert.equal(D.crossesRect({ x: 400, y: 0 }, { x: 400, y: 650 }, word), 80 / 650, "straight down through it");
  assert.equal(D.crossesRect({ x: 500, y: 100 }, { x: 900, y: 100 }, word), 0, "starting inside it");
});

test("fast hits show a combo from the third, and a dodge does not break it", () => {
  const r3 = beat(D.createDragon(), 3, 300);
  const combo = r3.events.find((e) => e.type === "combo");
  assert.ok(combo, "the third quick hit is a combo");
  assert.equal(combo.n, 3);
  assert.ok(!beat(D.createDragon(), 2, 300).events.some((e) => e.type === "combo"), "two is not");
  assert.ok(!beat(D.createDragon(), 3, 2000).events.some((e) => e.type === "combo"), "slow hits are not");

  // a whole fight in one combo: seven hits, he breathes fire and dodges for a
  // while, the punches keep coming through it, and three more put him down
  let r = { state: D.createDragon(), events: [] };
  let t = 1000;
  let best = 0;
  let sawFire = false;
  while (!r.state.koUntil) {
    r = D.hit(r.state, (t += 450));
    for (const e of r.events) {
      if (e.type === "combo") best = Math.max(best, e.n);
      if (e.type === "fire") sawFire = true;
    }
    assert.ok(t < 20000, "the fight ends");
  }
  assert.ok(sawFire, "he still fought back");
  assert.ok(best >= 10, `a ten-hit combo can be landed (best ${best})`);

  // but a pause during his dodge breaks it
  let p = beat(D.createDragon(), 7, 300);
  assert.ok(p.state.cooldownUntil > 0);
  p = D.hit(p.state, 1000 + 6 * 300 + 2000);
  assert.deepEqual(types(p), ["dodge"]);
  assert.equal(p.state.combo, 0);
});

test("the best combo is kept, and never goes down", () => {
  assert.equal(D.recordCombo({}, 4).bestCombo, 4);
  assert.equal(D.recordCombo({ bestCombo: 7 }, 4).bestCombo, 7);
  assert.equal(D.recordCombo({ bestCombo: 7 }, 9).bestCombo, 9);
  const stats = { bestCombo: 3, bonks: 5 };
  const next = D.recordCombo(stats, 6);
  assert.equal(stats.bestCombo, 3, "the stats passed in are not changed");
  assert.equal(next.bonks, 5);
});

test("a hat on special days only, by the local date", () => {
  const on = (y, m, d) => D.hatFor(new Date(y, m - 1, d, 12));
  assert.equal(on(2026, 10, 31), "pumpkin");
  assert.equal(on(2026, 10, 30), null);
  assert.equal(on(2026, 11, 1), null);
  assert.equal(on(2026, 12, 19), null);
  for (let d = 20; d <= 26; d++) assert.equal(on(2026, 12, d), "santa", `December ${d}`);
  assert.equal(on(2026, 12, 27), null);
  // emb3r's birthday: v1.0.0 was published on 20 July 2026
  assert.deepEqual({ ...D.BIRTHDAY }, { month: 7, day: 20 });
  assert.equal(on(2027, 7, 20), "party");
  assert.equal(on(2027, 7, 21), null);
  assert.equal(on(2027, 1, 1), "sparkles");
  assert.equal(on(2027, 1, 2), null);
  assert.equal(on(2026, 11, 13), null);
  // the edges of the day are the local day's
  assert.equal(D.hatFor(new Date(2026, 9, 31, 0, 0, 0)), "pumpkin");
  assert.equal(D.hatFor(new Date(2026, 9, 31, 23, 59, 59)), "pumpkin");
  assert.equal(D.hatFor(new Date(2026, 10, 1, 0, 0, 0)), null);
});

test("/dragon is the command, exactly; anything else is a message", () => {
  assert.equal(D.isDragonCommand("/dragon"), true);
  assert.equal(D.isDragonCommand("  /dragon  "), true, "the box is trimmed as a message is");
  for (const text of ["/dragons", "/Dragon", "dragon", "/dragon please", "tell me about /dragon", "", null]) {
    assert.equal(D.isDragonCommand(text), false, JSON.stringify(text));
  }
});

test("his file: the lifetime numbers, and achievements as x of y", () => {
  const rows = D.statsCard({ bonks: 42, kos: 3, pets: 7, fireballs: 2, bestCombo: 6, unlocked: ["first-bonk", "bully", "slayer"] });
  const map = Object.fromEntries(Array.from(rows, (r) => [r.label, r.value]));
  assert.deepEqual(map, {
    "bonks": "42", "k.o.s": "3", "pets": "7", "fireballs": "2", "best combo": "x6",
    "achievements": `3 of ${Object.keys(D.ACHIEVEMENTS).length}`,
  });
  const empty = Object.fromEntries(Array.from(D.statsCard({}), (r) => [r.label, r.value]));
  assert.equal(empty.bonks, "0");
  assert.equal(empty["best combo"], "-");
  assert.equal(empty.achievements, `0 of ${Object.keys(D.ACHIEVEMENTS).length}`);
  // an id from some other version counts for nothing
  const odd = Object.fromEntries(Array.from(D.statsCard({ unlocked: ["first-bonk", "gone"] }), (r) => [r.label, r.value]));
  assert.equal(odd.achievements, `1 of ${Object.keys(D.ACHIEVEMENTS).length}`);
});

test("the trophy shelf: every achievement in order, the locked ones unnamed", () => {
  const shelf = Array.from(D.trophies(["slayer", "first-bonk"]), (t) => ({ ...t }));
  assert.equal(shelf.length, Object.keys(D.ACHIEVEMENTS).length);
  assert.deepEqual(shelf.map((t) => t.id), Object.keys(D.ACHIEVEMENTS));
  assert.deepEqual(shelf[0], { id: "first-bonk", title: "first contact", unlocked: true });
  const bully = shelf.find((t) => t.id === "bully");
  assert.deepEqual(bully, { id: "bully", title: "???", unlocked: false });
});

test("the new feats are achievements, each once", () => {
  const ids = Object.keys(D.ACHIEVEMENTS);
  for (const id of ["fireball", "scorched", "combo-10", "hat", "dragon-file"]) assert.ok(ids.includes(id), id);
  assert.deepEqual(Array.from(D.newAchievements({ fireballs: 1 }, [])), ["fireball"]);
  assert.deepEqual(Array.from(D.newAchievements({ fireballs: 1, scorches: 1 }, ["fireball"])), ["scorched"]);
  assert.deepEqual(Array.from(D.newAchievements({ bestCombo: 9 }, [])), []);
  assert.deepEqual(Array.from(D.newAchievements({ bestCombo: 10 }, [])), ["combo-10"]);
  assert.deepEqual(Array.from(D.newAchievements({ hats: 1 }, [])), ["hat"]);
  assert.deepEqual(Array.from(D.newAchievements({ dragonFile: 1 }, [])), ["dragon-file"]);
});
