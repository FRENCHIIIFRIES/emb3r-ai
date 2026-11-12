// The dragon on the logo, and the few secrets around it. The user asked for it
// on 12 November: "make it so that the emb3r logo has some cool features like
// u can beat up the dragon logo and make it have some funny eastereggs".
//
// Punch him and he flinches and says so. Punch him fast and he sees stars.
// Get him low and he breathes fire back, once, and dodges for a moment after.
// Knock him out and he lies there, then gets up whole. Stroke him instead and
// he purrs, which also heals him - and revives him if he is down. Around him:
// the konami code, the three in the wordmark, and a few achievements.
//
// Only the decisions live here: pure, and a classic script loaded before
// renderer.js, so the tests run it in a context of their own exactly as the
// page does (test/dragon.test.mjs). Every function returns a new dragon and
// changes nothing it was given. renderer.js draws what these decide.
(function (root) {
  "use strict";

  const MAX_HP = 10;
  // at or below this he has had enough, and breathes fire - once per fight
  const ANGRY_AT = 3;
  // punches closer together than this are a combo
  const COMBO_MS = 900;
  // a combo this long and he sees stars
  const DIZZY_AT = 5;
  const DIZZY_MS = 2600;
  // left alone, one hp comes back per this long. Longer than the cooldown on
  // purpose: a steady beating should be able to finish what it started.
  const REGEN_MS = 3200;
  // how long he stays down
  const KO_MS = 2600;
  // after breathing fire he dodges everything for this long
  const COOLDOWN_MS = 3000;

  const WORDS = ["*bonk*", "*thwack*", "ow", "*bop*", "hey!", "*pow*", "-1 hp", "rude", "*smack*", "ouch"];

  function createDragon() {
    return {
      hp: MAX_HP, combo: 0, lastHit: 0, regenFrom: 0,
      koUntil: 0, cooldownUntil: 0, dizzyUntil: 0, angered: false,
      bonks: 0, kos: 0, pets: 0,
    };
  }

  // hp coming back while nobody is hitting him; never while he is down
  function regen(s, now) {
    if (s.koUntil || s.hp >= MAX_HP) return s;
    if (now - s.regenFrom < REGEN_MS) return s;
    const steps = Math.floor((now - s.regenFrom) / REGEN_MS);
    const hp = Math.min(MAX_HP, s.hp + steps);
    // back to full is over it
    return { ...s, hp, regenFrom: s.regenFrom + steps * REGEN_MS, angered: hp >= MAX_HP ? false : s.angered };
  }

  // Time passing: getting back up after a knock-out, and hp returning.
  function tick(s, now) {
    let state = s;
    const events = [];
    if (state.koUntil && now >= state.koUntil) {
      state = { ...state, hp: MAX_HP, koUntil: 0, angered: false, combo: 0, regenFrom: now };
      events.push({ type: "up" });
    }
    return { state: regen(state, now), events };
  }

  function hit(s0, now) {
    const t = tick(s0, now);
    const s = t.state;
    if (s.koUntil && now < s.koUntil) return { state: s, events: [...t.events, { type: "down" }] };
    if (s.cooldownUntil && now < s.cooldownUntil) return { state: s, events: [...t.events, { type: "dodge" }] };

    const combo = s.lastHit && now - s.lastHit <= COMBO_MS ? s.combo + 1 : 1;
    const bonks = s.bonks + 1;
    const hp = s.hp - 1;
    const events = [...t.events, { type: "bonk", word: WORDS[(bonks - 1) % WORDS.length], hp: Math.max(0, hp) }];
    const next = { ...s, hp, combo, bonks, lastHit: now, regenFrom: now };

    if (combo >= DIZZY_AT && !(s.dizzyUntil > now)) {
      next.dizzyUntil = now + DIZZY_MS;
      events.push({ type: "dizzy" });
    }
    if (hp <= 0) {
      next.hp = 0;
      next.koUntil = now + KO_MS;
      next.kos = s.kos + 1;
      events.push({ type: "ko" });
    } else if (hp <= ANGRY_AT && !s.angered) {
      next.angered = true;
      next.cooldownUntil = now + COOLDOWN_MS;
      events.push({ type: "fire" });
    }
    return { state: next, events };
  }

  // Stroking him: whole again, over it, and up off the floor if he was down.
  function pet(s, now) {
    const wasDown = Boolean(s.koUntil && now < s.koUntil);
    return {
      state: { ...s, hp: MAX_HP, koUntil: 0, angered: false, cooldownUntil: 0, combo: 0, regenFrom: now, pets: s.pets + 1 },
      events: [{ type: wasDown ? "revive" : "purr" }],
    };
  }

  // Petting is the pointer going back and forth across him: `turns` changes of
  // direction inside `windowMs`, each after a stroke of at least `minStroke`
  // pixels. A single sweep, a jiggle, or strokes seconds apart are not petting.
  function createPetting({ turns = 4, windowMs = 1600, minStroke = 6 } = {}) {
    let prevX = null;
    let turnX = null;
    let dir = 0;
    let times = [];
    const reset = () => { prevX = null; turnX = null; dir = 0; times = []; };
    return {
      move(x, now) {
        if (prevX === null) { prevX = x; turnX = x; return false; }
        const d = Math.sign(x - prevX);
        if (d === 0) return false;
        if (dir !== 0 && d !== dir) {
          if (Math.abs(prevX - turnX) >= minStroke) times.push(now);
          turnX = prevX;
        }
        dir = d;
        prevX = x;
        times = times.filter((t) => now - t <= windowMs);
        if (times.length >= turns) { reset(); return true; }
        return false;
      },
      reset,
    };
  }

  const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

  // The last ten keys against the code, so a stray key or an extra up in front
  // of it never spoils it.
  function createKonami() {
    let keys = [];
    return {
      push(key) {
        keys.push(String(key).toLowerCase());
        if (keys.length > KONAMI.length) keys.shift();
        if (keys.length === KONAMI.length && keys.every((k, i) => k === KONAMI[i])) {
          keys = [];
          return true;
        }
        return false;
      },
    };
  }

  // The wordmark from its letters, each a list of rows: EMB3R as drawn, or
  // EMBER with the E standing in for the three.
  function wordmarkRows(blocks) {
    return blocks[0].map((_, r) => blocks.map((b) => b[r]).join(""));
  }

  function emberSpelling(blocks) {
    return [blocks[0], blocks[1], blocks[2], blocks[0], blocks[4]];
  }

  // In the order they are worth reading in. `when` is asked of the lifetime
  // totals the renderer keeps on this computer.
  const ACHIEVEMENTS = {
    "first-bonk": { title: "first contact", when: (s) => s.bonks >= 1 },
    "bully": { title: "bully", when: (s) => s.bonks >= 25 },
    "slayer": { title: "dragon slayer (temporary)", when: (s) => s.kos >= 1 },
    "good-dragon": { title: "good dragon", when: (s) => s.pets >= 1 },
    "complicated": { title: "it's complicated", when: (s) => s.kos >= 1 && s.pets >= 1 },
    "cheater": { title: "cheater", when: (s) => s.konami >= 1 },
    "three": { title: "it has always been a three", when: (s) => s.threes >= 1 },
    "remembers": { title: "he remembers", when: (s) => s.bonks >= 100 },
  };

  function newAchievements(stats, unlocked) {
    const have = new Set(unlocked || []);
    return Object.keys(ACHIEVEMENTS).filter((id) => !have.has(id) && ACHIEVEMENTS[id].when(stats || {}));
  }

  // past midnight, a student should be asleep, and he says so
  function isLateNight(hour) {
    return hour >= 0 && hour < 5;
  }

  root.emb3rDragon = {
    MAX_HP, ANGRY_AT, COMBO_MS, DIZZY_AT, DIZZY_MS, REGEN_MS, KO_MS, COOLDOWN_MS, WORDS, ACHIEVEMENTS,
    createDragon, hit, tick, pet, createPetting, createKonami, wordmarkRows, emberSpelling, newAchievements, isLateNight,
  };
})(globalThis);
