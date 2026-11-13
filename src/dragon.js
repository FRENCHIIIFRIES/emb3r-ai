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
// Asked for more on 13 November ("add more features for the dragon"): hold the
// press and he charges a fireball; fast punches count out a combo; on a few
// days of the year he wears a hat; /dragon in the message box shows his file;
// and Settings keeps a shelf of the trophies.
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
  // from this many in a row the combo is counted out loud: "x3 combo"
  const COMBO_SHOWN_AT = 3;
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
    // A dodge lands nothing, but punches kept coming through it keep the combo
    // alive - otherwise his three seconds of dodging would cap every combo at
    // seven, and a ten-hit one could never be landed at all.
    if (s.cooldownUntil && now < s.cooldownUntil) {
      const kept = s.lastHit && now - s.lastHit <= COMBO_MS;
      return { state: { ...s, combo: kept ? s.combo : 0, lastHit: now }, events: [...t.events, { type: "dodge" }] };
    }

    const combo = s.lastHit && now - s.lastHit <= COMBO_MS ? s.combo + 1 : 1;
    const bonks = s.bonks + 1;
    const hp = s.hp - 1;
    const events = [...t.events, { type: "bonk", word: WORDS[(bonks - 1) % WORDS.length], hp: Math.max(0, hp) }];
    if (combo >= COMBO_SHOWN_AT) events.push({ type: "combo", n: combo });
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
    "combo-10": { title: "c-c-c-combo", when: (s) => s.bestCombo >= 10 },
    "slayer": { title: "dragon slayer (temporary)", when: (s) => s.kos >= 1 },
    "good-dragon": { title: "good dragon", when: (s) => s.pets >= 1 },
    "complicated": { title: "it's complicated", when: (s) => s.kos >= 1 && s.pets >= 1 },
    "fireball": { title: "fire in the hole", when: (s) => s.fireballs >= 1 },
    "scorched": { title: "scorched earth", when: (s) => s.scorches >= 1 },
    "cheater": { title: "cheater", when: (s) => s.konami >= 1 },
    "three": { title: "it has always been a three", when: (s) => s.threes >= 1 },
    "hat": { title: "dressed for the occasion", when: (s) => s.hats >= 1 },
    "dragon-file": { title: "know your enemy", when: (s) => s.dragonFile >= 1 },
    "remembers": { title: "he remembers", when: (s) => s.bonks >= 100 },
  };

  function newAchievements(stats, unlocked) {
    const have = new Set(unlocked || []);
    return Object.keys(ACHIEVEMENTS).filter((id) => !have.has(id) && ACHIEVEMENTS[id].when(stats || {}));
  }

  // ---- the charged fireball ------------------------------------------------
  // Press and hold on him. Let go before CHARGE_DELAY_MS and it was a punch;
  // after it he is charging, and the meter fills over CHARGE_MS. Let go when
  // it is full and he shoots; before, and it fizzles. Either way a charge is
  // never also a punch.
  const CHARGE_DELAY_MS = 600;
  const CHARGE_MS = 1200;
  // a pointer let go nearer his mouth than this gives no direction to aim in
  const MIN_AIM = 24;

  function chargeLevel(heldMs) {
    return Math.max(0, Math.min(1, (heldMs - CHARGE_DELAY_MS) / CHARGE_MS));
  }

  // the meter in the download bar's glyphs, like his hit points
  function chargeMeter(level, width = 10) {
    const full = Math.round(Math.max(0, Math.min(1, level)) * width);
    return "█".repeat(full) + "░".repeat(width - full);
  }

  // a dragon who is down cannot charge anything
  function canCharge(s, now) {
    return !(s && s.koUntil && now < s.koUntil);
  }

  // what letting go did: "punch", "fizzle" or "fireball"
  function release(heldMs, s, now) {
    if (!canCharge(s, now) || heldMs < CHARGE_DELAY_MS) return "punch";
    return chargeLevel(heldMs) >= 1 ? "fireball" : "fizzle";
  }

  // From his mouth through the pointer to the edge of the window. Let go on
  // top of him and it goes the way he faces, which is to the right - through
  // his own name.
  function fireballPath(from, toward, bounds) {
    let dx = toward.x - from.x;
    let dy = toward.y - from.y;
    if (Math.hypot(dx, dy) < MIN_AIM) { dx = 1; dy = 0; }
    const ts = [];
    if (dx > 0) ts.push((bounds.width - from.x) / dx);
    if (dx < 0) ts.push((0 - from.x) / dx);
    if (dy > 0) ts.push((bounds.height - from.y) / dy);
    if (dy < 0) ts.push((0 - from.y) / dy);
    const t = Math.max(0, Math.min(...ts));
    return { x: from.x + dx * t, y: from.y + dy * t };
  }

  // How far along the segment a to b it first enters rect (0..1), or -1 if it
  // never does. Liang-Barsky: clip the segment against each edge in turn.
  function crossesRect(a, b, rect) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t0 = 0;
    let t1 = 1;
    const edges = [[-dx, a.x - rect.left], [dx, rect.right - a.x], [-dy, a.y - rect.top], [dy, rect.bottom - a.y]];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return -1;
        continue;
      }
      const t = q / p;
      if (p < 0) { if (t > t1) return -1; if (t > t0) t0 = t; }
      else { if (t < t0) return -1; if (t < t1) t1 = t; }
    }
    return t0;
  }

  // ---- lifetime numbers ---------------------------------------------------

  function recordCombo(stats, n) {
    const s = stats || {};
    return { ...s, bestCombo: Math.max(s.bestCombo || 0, n) };
  }

  const known = (unlocked) => (unlocked || []).filter((id) => Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, id));

  // what /dragon shows: his file, as label and value
  function statsCard(stats) {
    const s = stats || {};
    const n = (k) => String(s[k] || 0);
    return [
      { label: "bonks", value: n("bonks") },
      { label: "k.o.s", value: n("kos") },
      { label: "pets", value: n("pets") },
      { label: "fireballs", value: n("fireballs") },
      { label: "best combo", value: s.bestCombo ? `x${s.bestCombo}` : "-" },
      { label: "achievements", value: `${new Set(known(s.unlocked)).size} of ${Object.keys(ACHIEVEMENTS).length}` },
    ];
  }

  // the shelf in Settings: every achievement in order, a locked one unnamed
  function trophies(unlocked) {
    const have = new Set(known(unlocked));
    return Object.keys(ACHIEVEMENTS).map((id) => ({ id, title: have.has(id) ? ACHIEVEMENTS[id].title : "???", unlocked: have.has(id) }));
  }

  // typed into the message box, exactly, it shows his file instead of sending
  function isDragonCommand(text) {
    return typeof text === "string" && text.trim() === "/dragon";
  }

  // ---- hats ---------------------------------------------------------------
  // emb3r's birthday: v1.0.0, the first published release, is dated 20 July
  // 2026 (git log -1 --format=%ad v1.0.0).
  const BIRTHDAY = { month: 7, day: 20 };

  // Which hat, if any, he wears on this local date.
  function hatFor(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 10 && d === 31) return "pumpkin";
    if (m === 12 && d >= 20 && d <= 26) return "santa";
    if (m === BIRTHDAY.month && d === BIRTHDAY.day) return "party";
    if (m === 1 && d === 1) return "sparkles";
    return null;
  }

  // past midnight, a student should be asleep, and he says so
  function isLateNight(hour) {
    return hour >= 0 && hour < 5;
  }

  root.emb3rDragon = {
    MAX_HP, ANGRY_AT, COMBO_MS, COMBO_SHOWN_AT, DIZZY_AT, DIZZY_MS, REGEN_MS, KO_MS, COOLDOWN_MS, WORDS, ACHIEVEMENTS,
    CHARGE_DELAY_MS, CHARGE_MS, BIRTHDAY,
    createDragon, hit, tick, pet, createPetting, createKonami, wordmarkRows, emberSpelling, newAchievements, isLateNight,
    chargeLevel, chargeMeter, canCharge, release, fireballPath, crossesRect,
    recordCombo, statsCard, trophies, isDragonCommand, hatFor,
  };
})(globalThis);
