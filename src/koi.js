/*
 * koi.js - two koi circling each other, drawn in text.
 *
 * Ember's avatar for the Talk view. Two koi swim round a circle half a turn
 * apart, each one's head following the other's tail, so that together they
 * make a yin-yang loop. Nothing here is played back: every frame is computed.
 *
 *   - Each fish is a spine bent along the circle. Its body has a round head,
 *     full shoulders and a late taper into the tail, and a travelling sine
 *     wave swings it from side to side - more at the tail than at the head,
 *     which is what makes it swim rather than slide.
 *   - The long tail fin carries the same wave further and flutters on top of
 *     it. The pectoral and pelvic fins are paddles hinged at the body that
 *     sweep back and forth. Behind each tail a faint wake runs on round the
 *     circle towards the other fish's head, which is what closes the loop.
 *   - Everything is sampled six times per character cell (two across, three
 *     down, because a cell is about twice as tall as it is wide) and each cell
 *     gets the character whose drawn shape is closest to what was sampled
 *     there. That keeps outlines smooth instead of staircased: an edge that
 *     only fills the bottom of a cell becomes "_" or ".", a diagonal becomes
 *     "/" or "\". The shapes are measured from the real font, once, on an
 *     offscreen canvas.
 *   - The fins are translucent: their membrane is drawn too faint to print and
 *     only the rays and edges come through, in a dimmer colour than the body.
 *
 * Colour goes on as spans, one per run of same-coloured cells, not one per
 * character; spaces never break a run. A frame is a single innerHTML write to
 * one <pre>, typically 150-300 spans.
 *
 * A classic script with no dependencies and no network access, because the
 * app's Content-Security-Policy allows local scripts and nothing else. It only
 * needs a canvas for the one-off glyph measurement, and falls back to a plain
 * density ramp if there is none.
 *
 * API
 *
 *   const koi = emb3rKoi.mount(preElement, { cols, rows, palette, ... });
 *   koi.setState("idle" | "listening" | "thinking" | "speaking");
 *   koi.setLevel(0..1);      // speech loudness, used while speaking
 *   koi.stop();
 *
 * Extras, not required by the Talk view: koi.setPalette(palette),
 * koi.remeasure() after changing the font, koi.getStats() for frame cost.
 * See NOTES.md beside this file for the integration details.
 */
(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  // Samples per character cell: SX across, SY down. The order inside a cell is
  // row by row - top-left, top-right, middle-left, ... - and the glyph
  // measurement below uses the same order, so the two can be compared directly.
  const SX = 2;
  const SY = 3;
  const SPC = SX * SY;

  // Width of the soft edge every shape is drawn with, in world units (one unit
  // is one character width). Half a sample, roughly: enough that an edge
  // passing through a cell registers as partial coverage rather than a step.
  const AA = 0.55;
  const INV_AA = 1 / AA;

  // The body wave: just under one wavelength per body, so the head and the tail
  // swing opposite ways the way a swimming fish's do.
  const WAVE_K = TAU * 0.85;
  // The extra ripple that runs down the tail fin, faster than the body's.
  const TAIL_K = TAU * 1.25;

  // Proportions, as fractions of the scene. Tuned by looking at screenshots,
  // not derived; change them and look again.
  const SCENE = {
    radius: 0.55,   // the circle, as a fraction of half the grid's shorter side
    length: 1.70,   // one body, in circle radii - each body spans about 100 deg
    tail: 0.42,     // the tail fin, in body lengths
    wake: 0.34,     // the stirred water behind it, in body lengths
    width: 0.165,   // half the body's width at its widest, in body lengths
    amp: 0.06,      // how far the tail base swings, in body lengths
    pecAt: 0.24,    // where the pectoral fins join, along the body
    pecLen: 0.32,
    pecWidth: 0.075,
    pecSweep: 52,   // degrees back from straight out
    pelAt: 0.58,    // the pelvic fins, smaller and further back
    pelLen: 0.13,
    pelWidth: 0.032,
    pelSweep: 66,
    eyeAt: 0.12,
    eyeOut: 0.58,   // eyes sit this far from the spine, as a fraction of the head's half-width
  };

  // ---------------------------------------------------------------------------
  // Moods
  // ---------------------------------------------------------------------------
  //
  //   speed   - how fast the pair goes round, radians per second
  //   beat    - tail beats per second
  //   radius  - size of the circle against the resting one
  //   flare   - how far the fins open: 0 resting, 1 spread wide, below 0 folded
  //   ripple  - strength of the rings that close in while she listens
  //   sparkle - brightness of the drifting particles
  //   drift   - speed of the particles
  //
  // Changing mood never jumps: every value eases towards its new target, and
  // the phases are integrated, so a change of speed changes the rate of motion
  // rather than teleporting the fish.
  const MOODS = {
    idle:      { speed: 0.19, beat: 0.55, radius: 1.00, flare: 0.00,  ripple: 0, sparkle: 0.36, drift: 1.0 },
    listening: { speed: 0.30, beat: 0.80, radius: 1.00, flare: 0.12,  ripple: 1, sparkle: 0.46, drift: 1.3 },
    thinking:  { speed: 0.09, beat: 0.38, radius: 0.86, flare: -0.30, ripple: 0, sparkle: 0.26, drift: 0.5 },
    speaking:  { speed: 0.40, beat: 1.00, radius: 1.00, flare: 0.35,  ripple: 0, sparkle: 0.50, drift: 1.5 },
  };

  // The renderer already calls the speaking face "talking"; accepting the
  // app's own words saves a translation table at the call site.
  const ALIASES = { talking: "speaking", talk: "speaking", speak: "speaking", listen: "listening", think: "thinking", rest: "idle", resting: "idle" };

  // ---------------------------------------------------------------------------
  // Glyphs
  // ---------------------------------------------------------------------------
  //
  // The characters every cell is matched against. Letters are left out on
  // purpose: scattered through a picture they read as words. So are ~ and ^,
  // which VT323 draws as a small N and a caret, and the angle and square
  // brackets, which made every rounded edge look like an arrow or a box.
  // Everything here is plain ASCII, which both of the app's faces have, so no
  // cell ever falls back to a system font with a different width.
  const MATCHABLE = " .,'`\"-_:;=+*|/\\()o0O8%#@";
  // Used only for particles, never matched: U+00B7, the middle dot, which is
  // in the Latin-1 range both bundled fonts cover. Written as a char code so
  // this file stays plain ASCII whatever encoding it is served with.
  const MIDDOT = String.fromCharCode(0xb7);
  const GLYPHS = MATCHABLE + MIDDOT;
  const N_MATCH = MATCHABLE.length;
  const GI = {};
  for (let i = 0; i < GLYPHS.length; i++) GI[GLYPHS[i]] = i;
  const GLYPH_HTML = Array.from(GLYPHS, (ch) => (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch));

  const G_SPACE = 0;
  const G_DOT = GI["."];
  const G_MIDDOT = GI[MIDDOT];
  const G_STAR = GI["*"];
  const G_COLON = GI[":"];
  // Fallback when there is no canvas to measure glyphs with: a plain ramp.
  const RAMP = Array.from(" .:-=+*%#@", (ch) => GI[ch]);

  // Quantisation of each sample for the glyph lookup table: 5 levels, 6 samples,
  // 5^6 = 15625 possible cells. Entries are filled in the first time they are
  // needed, so the table costs nothing until a pattern actually occurs.
  const Q = 5;
  const LUT_SIZE = Math.pow(Q, SPC);

  // ---------------------------------------------------------------------------
  // Colour classes
  // ---------------------------------------------------------------------------
  //
  // One letter each, because the class name is repeated in every span of every
  // frame. The order matters: body classes are contiguous, and so are fins.
  const C_NONE = 0;
  const C_WHITE = 1;        // a
  const C_WHITE_SHADE = 2;  // b
  const C_ORANGE = 3;       // c
  const C_ORANGE_SHADE = 4; // d
  const C_PATCH = 5;        // e - the darker markings
  const C_FIN = 6;          // f
  const C_FIN_MID = 7;      // g
  const C_FIN_FAINT = 8;    // h
  const C_EYE = 9;          // i - drawn as a gap, the class only reserves the cell
  const C_SPARK_DIM = 10;   // j
  const C_SPARK = 11;       // k
  const C_WATER = 12;       // l - the wake and the listening ripples
  const LETTERS = " abcdefghijkl";
  const OPEN = Array.from(LETTERS, (l) => '<span class="' + l + '">');

  const isBody = (m) => m >= C_WHITE && m <= C_PATCH;

  // ---------------------------------------------------------------------------
  // Palette
  // ---------------------------------------------------------------------------
  //
  // Colours are CSS custom properties on the <pre>, so the app can set them from
  // its own stylesheet as well as through the palette option. Only the base fin
  // colour is needed; the dimmer fin tiers are mixed from it in CSS, which is
  // what lets a single subject colour restyle every fin.
  const PALETTE_VARS = {
    white: "--koi-white",
    whiteShade: "--koi-white-shade",
    orange: "--koi-orange",
    orangeShade: "--koi-orange-shade",
    patch: "--koi-patch",
    fin: "--koi-fin",
    particle: "--koi-particle",
  };

  const PALETTES = Object.freeze({
    // for the app's dark theme (#0b0f0b)
    dark: Object.freeze({
      white: "#f7f2ea",
      whiteShade: "#b9b1a6",
      orange: "#ff8a2e",
      orangeShade: "#d9621f",
      patch: "#b2381a",
      fin: "#5ad6c9",
      particle: "#8fb6c4",
    }),
    // for the light theme (#f4fbf6): "white" scales cannot be white on white,
    // so they become a warm grey, and everything else darkens to keep contrast
    light: Object.freeze({
      white: "#6e655c",
      whiteShade: "#958b80",
      orange: "#d0530c",
      orangeShade: "#a4410a",
      patch: "#7a2410",
      fin: "#0b8075",
      particle: "#7f9ca6",
    }),
  });

  const STYLE_ID = "emb3r-koi-style";
  // Low specificity throughout, so the app's own CSS wins wherever it cares to.
  // Ligatures are switched off because JetBrains Mono would otherwise join
  // sequences like "--" and "==" into single glyphs and break the grid.
  const STYLE_TEXT = [
    ".emb3r-koi{",
    "--koi-white:" + PALETTES.dark.white + ";",
    "--koi-white-shade:" + PALETTES.dark.whiteShade + ";",
    "--koi-orange:" + PALETTES.dark.orange + ";",
    "--koi-orange-shade:" + PALETTES.dark.orangeShade + ";",
    "--koi-patch:" + PALETTES.dark.patch + ";",
    "--koi-fin:" + PALETTES.dark.fin + ";",
    "--koi-particle:" + PALETTES.dark.particle + ";",
    "white-space:pre;",
    "font-variant-ligatures:none;",
    "font-feature-settings:'liga' 0,'calt' 0;",
    "user-select:none;",
    // Each run glows in its own colour. The app's glow setting drives the size
    // through --glow-small and --glow-big, scaled down a little because a dense
    // block of glowing characters blooms far more than a line of text does.
    "text-shadow:0 0 calc(var(--glow-small,2px)*0.9) currentColor,0 0 calc(var(--glow-big,6px)*0.8) currentColor;",
    "}",
    ".emb3r-koi.emb3r-koi--flat{text-shadow:none}",
    ".emb3r-koi .a{color:var(--koi-white)}",
    ".emb3r-koi .b{color:var(--koi-white-shade)}",
    ".emb3r-koi .c{color:var(--koi-orange)}",
    ".emb3r-koi .d{color:var(--koi-orange-shade)}",
    ".emb3r-koi .e{color:var(--koi-patch)}",
    ".emb3r-koi .f{color:var(--koi-fin)}",
    ".emb3r-koi .g{color:color-mix(in srgb,var(--koi-fin) 72%,transparent)}",
    ".emb3r-koi .h{color:color-mix(in srgb,var(--koi-fin) 46%,transparent)}",
    // the faint layers skip the glow: it is the most expensive part of a frame
    // to paint and would only blur them into the background
    ".emb3r-koi .j{color:color-mix(in srgb,var(--koi-particle) 50%,transparent);text-shadow:none}",
    ".emb3r-koi .k{color:var(--koi-particle)}",
    ".emb3r-koi .l{color:color-mix(in srgb,var(--koi-fin) 40%,transparent);text-shadow:none}",
  ].join("");

  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function applyPalette(el, palette) {
    if (!palette) return;
    const p = typeof palette === "string" ? PALETTES[palette] : palette;
    if (!p) return;
    for (const key in PALETTE_VARS) {
      if (typeof p[key] === "string" && p[key]) el.style.setProperty(PALETTE_VARS[key], p[key]);
    }
  }

  // ---------------------------------------------------------------------------
  // Shapes
  // ---------------------------------------------------------------------------

  // Half-width of the body along its length, as a fraction of the widest point.
  // The head is a quarter-ellipse - a koi seen from above has a broad, round
  // snout, not a point - reaching full width a little over a third of the way
  // back. From there it stays full through the shoulders and narrows late into
  // the tail, which stays a fifth open so the tail fin has something to join.
  // An earlier profile tapered from the shoulders on and the back half read as
  // a stalk, not a fish.
  const PROFILE_STEPS = 256;
  const PROFILE = new Float32Array(PROFILE_STEPS + 1);
  (function buildProfile() {
    const head = 0.36;
    const end = 0.2;
    for (let i = 0; i <= PROFILE_STEPS; i++) {
      const u = i / PROFILE_STEPS;
      let f;
      if (u < head) {
        const x = 1 - u / head;
        f = Math.sqrt(1 - x * x);
      } else {
        const x = (u - head) / (1 - head);
        f = end + (1 - end) * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * x), 0.6);
      }
      PROFILE[i] = f;
    }
  })();

  function profile(u) {
    if (u <= 0) return 0;
    if (u >= 1) return PROFILE[PROFILE_STEPS];
    const x = u * PROFILE_STEPS;
    const i = x | 0;
    return PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * (x - i);
  }

  // A paddle fin's half-width from root (0) to tip (1): narrow where it joins,
  // broadest past the middle, then a rounded tip.
  const FIN_STEPS = 64;
  const FIN_PROFILE = new Float32Array(FIN_STEPS + 1);
  (function buildFinProfile() {
    for (let i = 0; i <= FIN_STEPS; i++) {
      const u = i / FIN_STEPS;
      FIN_PROFILE[i] = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.75);
    }
  })();

  function finProfile(u) {
    const x = (u <= 0 ? 0 : u >= 1 ? 1 : u) * FIN_STEPS;
    const i = x | 0;
    return i >= FIN_STEPS ? FIN_PROFILE[FIN_STEPS] : FIN_PROFILE[i] + (FIN_PROFILE[i + 1] - FIN_PROFILE[i]) * (x - i);
  }

  // ---------------------------------------------------------------------------
  // Markings
  // ---------------------------------------------------------------------------
  //
  // Each fish's colouring is painted once into a small texture in body
  // coordinates - u along the body, v across it - so the markings travel with
  // the fish and bend with it. Blobs plus a little wobble give the irregular
  // edges real koi markings have.
  //
  //   0 = base colour, 1 = the other colour, 2 = darker patch
  //
  // Fish 0 is white with orange markings, fish 1 orange with white ones; both
  // carry a few darker patches.
  const PATTERN_U = 48;
  const PATTERN_V = 16;
  const MARKINGS = [
    {
      base: "white",
      blobs: [
        [0.10, 0.05, 0.10, 1.30],
        [0.37, -0.20, 0.11, 0.85],
        [0.62, 0.30, 0.09, 0.80],
        [0.86, -0.05, 0.06, 0.90],
      ],
      dark: [
        [0.39, -0.35, 0.045, 0.35],
        [0.60, 0.40, 0.035, 0.30],
      ],
    },
    {
      base: "orange",
      blobs: [
        [0.05, 0.00, 0.05, 1.40],
        [0.31, 0.50, 0.08, 0.60],
        [0.53, -0.45, 0.10, 0.70],
        [0.80, 0.20, 0.07, 0.80],
      ],
      dark: [
        [0.22, -0.25, 0.05, 0.40],
        [0.44, 0.15, 0.045, 0.35],
        [0.68, -0.15, 0.04, 0.40],
      ],
    },
  ];

  function blobField(blobs, u, v) {
    let best = 0;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const du = (u - b[0]) / b[2];
      const dv = (v - b[1]) / b[3];
      const val = Math.exp(-(du * du + dv * dv));
      if (val > best) best = val;
    }
    return best;
  }

  function paintMarkings(spec) {
    const out = new Uint8Array(PATTERN_U * PATTERN_V);
    for (let iv = 0; iv < PATTERN_V; iv++) {
      const v = ((iv + 0.5) / PATTERN_V) * 2 - 1;
      for (let iu = 0; iu < PATTERN_U; iu++) {
        const u = (iu + 0.5) / PATTERN_U;
        const wobble = 0.13 * Math.sin(u * 31 + v * 7) * Math.sin(v * 9 - u * 13);
        let m = blobField(spec.blobs, u, v) + wobble > 0.5 ? 1 : 0;
        if (blobField(spec.dark, u, v) + wobble * 0.5 > 0.5) m = 2;
        out[iv * PATTERN_U + iu] = m;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function intOpt(value, fallback, lo, hi) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }

  function numOpt(value, fallback, lo, hi) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }

  // Seeded, so two mounts with the same seed scatter their particles the same
  // way - which makes screenshots comparable from run to run.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const mounted = new WeakMap();
  let warnedState = false;

  // ---------------------------------------------------------------------------
  // mount
  // ---------------------------------------------------------------------------

  function mount(el, options) {
    if (!el || el.nodeType !== 1) {
      throw new TypeError("emb3rKoi.mount(element, options): element must be a DOM element, ideally a <pre>");
    }
    // Mounting twice on one element would run two loops into the same <pre>.
    const previous = mounted.get(el);
    if (previous) previous.stop();

    const o = options || {};
    const cols = intOpt(o.cols, 70, 24, 200);
    const rows = intOpt(o.rows, 28, 10, 100);
    const fps = numOpt(o.fps, 15, 1, 30);
    const frameMs = 1000 / fps;
    const fixedAspect = o.aspect != null ? numOpt(o.aspect, 0, 0.8, 4) : 0;
    const doc = el.ownerDocument;
    const win = doc.defaultView || root;
    const now = () => (win.performance || root.performance).now();
    const random = mulberry32(intOpt(o.seed, 7, 0, 2147483647));

    injectStyle(doc);
    el.classList.add("emb3r-koi");
    if (o.glow === false) el.classList.add("emb3r-koi--flat");
    // Decoration only. In the Talk view, #faceSaid already carries what Ember
    // says; a screen reader reading 2000 characters of fish would be worse
    // than useless.
    if (!el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", "true");
    applyPalette(el, o.palette);

    // -- buffers ---------------------------------------------------------------
    // All allocated once. A frame allocates nothing but its HTML string.
    const nCells = cols * rows;
    const nSamp = nCells * SPC;
    const DX = new Float32Array(nSamp);   // sample position, from the centre
    const DY = new Float32Array(nSamp);
    const RHO = new Float32Array(nSamp);  // ...and the same in polar form,
    const PHI = new Float32Array(nSamp);  // so a frame needs no atan2 or sqrt
    const INK = new Float32Array(nSamp);  // how much is drawn at each sample, 0..1
    const MAT = new Uint8Array(nSamp);    // and what it is (a colour class)
    const GL = new Uint8Array(nCells);    // the glyph chosen for each cell
    const CL = new Uint8Array(nCells);    // and its colour class
    const lut = new Int16Array(LUT_SIZE).fill(-1);
    const frameTimes = new Float32Array(240);

    // -- geometry ------------------------------------------------------------
    let aspect = fixedAspect || 2;
    let worldW = cols;
    let worldH = rows * aspect;
    let cx = 0;
    let cy = 0;
    let S = 1;
    let R0 = 1;
    let L0 = 1;
    let shapes = null; // Float32Array(N_MATCH * SPC), or null for the ramp

    // -- motion state ----------------------------------------------------------
    let mood = "idle";
    const cur = Object.assign({}, MOODS.idle);
    let levelTarget = 0;
    let level = 0;
    let t = 0;
    let orbit = -2.0;
    let beatPhase = 0;
    let finPhase = 0;
    let ripplePhase = 0;
    let orbitR = 1;

    // -- lifecycle state -------------------------------------------------------
    let stopped = false;
    let onScreen = true;
    let needsMeasure = false;
    let timer = 0;
    let raf = 0;
    let lastTick = 0;
    let nextDue = 0;
    let frames = 0;
    let frameTotal = 0;
    let frameMax = 0;
    let frameLast = 0;
    let statsSince = now();

    const reducedQuery = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let reduced = !!(reducedQuery && reducedQuery.matches);

    const fish = [makeFish(0), makeFish(1)];
    let particles = [];

    function makeFish(index) {
      const fins = [];
      for (let i = 0; i < 4; i++) {
        fins.push({ x: 0, y: 0, ax: 1, ay: 0, px: 0, py: 1, len: 1, invLen: 1, hw: 1, bend: 0, flut: 0, r2: 1, rays: 2 });
      }
      return {
        index,
        white: MARKINGS[index].base === "white",
        pattern: paintMarkings(MARKINGS[index]),
        theta: 0, R: 1, L: 1, invL: 1, W: 1, T: 1, invT: 1, tailEnd: 1, wake: 1, span: 1, amp: 0, phase: 0, finLo: 0, finHi: 0,
        fins,
      };
    }

    // -- measuring -------------------------------------------------------------

    // The cell size of the <pre>'s actual font. Wipes the content, which the
    // next frame replaces anyway.
    function measureCell() {
      el.textContent = "M";
      const one = el.getBoundingClientRect().height;
      el.textContent = "M\nM\nM\nM\nM";
      const five = el.getBoundingClientRect().height;
      const probe = doc.createElement("span");
      probe.textContent = "M".repeat(32);
      el.textContent = "";
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width / 32;
      el.textContent = "";
      const h = (five - one) / 4;
      if (!(w > 0) || !(h > 0)) return null;
      return { w, h };
    }

    // How much of each sixth of a cell every glyph covers, measured by drawing
    // the glyphs in the <pre>'s own font. Normalised per sixth against the
    // densest glyph, so that "fully inked" means the darkest a cell can get.
    function measureGlyphs(cell) {
      try {
        const cs = win.getComputedStyle(el);
        const px = parseFloat(cs.fontSize) || 16;
        const k = Math.max(1, Math.round(48 / px));
        const w = Math.max(6, Math.round(cell.w * k));
        const h = Math.max(12, Math.round(cell.h * k));
        const canvas = doc.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + px * k + "px " + cs.fontFamily;
        const m = ctx.measureText("M");
        const asc = m.fontBoundingBoxAscent || px * k * 0.8;
        const desc = m.fontBoundingBoxDescent || px * k * 0.2;
        // where the browser puts the baseline inside a line box of this height
        const baseline = (h - (asc + desc)) / 2 + asc;
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "alphabetic";

        const region = new Uint8Array(w * h);
        const count = new Float32Array(SPC);
        for (let y = 0; y < h; y++) {
          const ry = Math.min(SY - 1, ((y * SY) / h) | 0);
          for (let x = 0; x < w; x++) {
            const r = ry * SX + Math.min(SX - 1, ((x * SX) / w) | 0);
            region[y * w + x] = r;
            count[r]++;
          }
        }

        const raw = new Float32Array(N_MATCH * SPC);
        for (let g = 1; g < N_MATCH; g++) {
          ctx.clearRect(0, 0, w, h);
          ctx.fillText(MATCHABLE[g], 0, baseline);
          const data = ctx.getImageData(0, 0, w, h).data;
          for (let p = 0, n = w * h; p < n; p++) {
            const a = data[p * 4 + 3];
            if (a) raw[g * SPC + region[p]] += a / 255;
          }
          for (let r = 0; r < SPC; r++) raw[g * SPC + r] /= count[r];
        }

        const out = new Float32Array(N_MATCH * SPC);
        let any = false;
        for (let r = 0; r < SPC; r++) {
          let max = 0;
          for (let g = 0; g < N_MATCH; g++) max = Math.max(max, raw[g * SPC + r]);
          if (max <= 0) continue;
          any = true;
          for (let g = 0; g < N_MATCH; g++) out[g * SPC + r] = raw[g * SPC + r] / max;
        }
        return any ? out : null;
      } catch (e) {
        return null;
      }
    }

    function remeasure() {
      if (stopped) return;
      const cell = measureCell();
      if (!cell) {
        // not laid out yet (display:none) - try again once it is on screen
        needsMeasure = true;
        if (!R0) layout(aspect);
        return;
      }
      needsMeasure = false;
      const asp = fixedAspect || cell.h / cell.w;
      if (!R0 || Math.abs(asp - aspect) > 0.01) layout(asp);
      shapes = measureGlyphs(cell);
      lut.fill(-1);
      // measuring wiped the <pre>; a running loop repaints it within a frame,
      // anything else has to be repainted now
      if (reduced) drawStill();
      else if (!running()) draw();
    }

    // Precomputes where every sample sits, so a frame never calls atan2 or
    // sqrt for the grid itself.
    function layout(asp) {
      aspect = asp;
      worldW = cols;
      worldH = rows * asp;
      cx = worldW / 2;
      cy = worldH / 2;
      let k = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for (let j = 0; j < SY; j++) {
            const y = (r + (j + 0.5) / SY) * asp - cy;
            for (let i = 0; i < SX; i++) {
              const x = c + (i + 0.5) / SX - cx;
              DX[k] = x;
              DY[k] = y;
              RHO[k] = Math.sqrt(x * x + y * y);
              PHI[k] = Math.atan2(y, x);
              k++;
            }
          }
        }
      }
      S = Math.min(worldW, worldH) / 2;
      R0 = S * SCENE.radius;
      L0 = R0 * SCENE.length;
      orbitR = R0 * cur.radius;
      seedParticles();
    }

    // -- particles -------------------------------------------------------------

    function seedParticles() {
      const n = Math.max(8, Math.round(nCells * 0.013));
      particles = [];
      for (let i = 0; i < n; i++) {
        particles.push({
          x: (random() - 0.5) * worldW,
          y: (random() - 0.5) * worldH,
          ph: random() * TAU,
          tw: 0.5 + random() * 1.8,
          sp: 0.4 + random() * 0.9,
          z: random(),
        });
      }
    }

    // The water turns with the fish and slowly rises; the particles ride it.
    function moveParticles(dt) {
      const hw = worldW / 2;
      const hh = worldH / 2;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const r = Math.sqrt(p.x * p.x + p.y * p.y) + 1e-3;
        const swirl = cur.drift * p.sp * 0.8 * (0.35 + 0.65 * Math.min(1, r / R0));
        p.x += ((-p.y / r) * swirl) * dt;
        p.y += ((p.x / r) * swirl - 0.18 * cur.drift * p.sp) * dt;
        if (p.x < -hw) p.x += worldW;
        else if (p.x >= hw) p.x -= worldW;
        if (p.y < -hh) p.y += worldH;
        else if (p.y >= hh) p.y -= worldH;
      }
    }

    // -- one frame -------------------------------------------------------------

    function ease(dt) {
      t += dt;
      // the level behaves like a meter: quick to rise, slower to fall back
      level += (levelTarget - level) * (1 - Math.exp(-dt / (levelTarget > level ? 0.05 : 0.22)));
      const m = MOODS[mood];
      const lv = mood === "speaking" ? level : 0;
      const slow = 1 - Math.exp(-dt / 0.8);
      const slower = 1 - Math.exp(-dt / 1.6);
      const quick = 1 - Math.exp(-dt / 0.3);
      cur.speed += (m.speed + 0.12 * lv - cur.speed) * slow;
      cur.beat += (m.beat + 0.45 * lv - cur.beat) * slow;
      cur.radius += (m.radius - cur.radius) * slower;
      cur.flare += (m.flare + 0.65 * lv - cur.flare) * (mood === "speaking" ? quick : slow);
      cur.ripple += (m.ripple - cur.ripple) * slow;
      cur.sparkle += (m.sparkle + 0.5 * lv - cur.sparkle) * quick;
      cur.drift += (m.drift - cur.drift) * slow;

      orbit += cur.speed * dt;
      if (orbit > TAU) orbit -= TAU;
      // Phases wrap at ten turns, not one: they are also used at 1.3x, 1.6x
      // and 1.7x, and ten turns is a whole number of turns for all of those.
      beatPhase += TAU * cur.beat * dt;
      if (beatPhase > TAU * 10) beatPhase -= TAU * 10;
      finPhase += TAU * cur.beat * 0.75 * dt;
      if (finPhase > TAU * 10) finPhase -= TAU * 10;
      if (cur.ripple > 0.01) ripplePhase = (ripplePhase + dt * 0.3) % 1;
      orbitR = R0 * cur.radius;
      moveParticles(dt);
    }

    // How far the spine swings at u (0 head, 1 tail base, beyond that the tail
    // fin). The growth is capped past the tail base, or the end of a long tail
    // fin would whip rather than trail.
    function swing(f, u) {
      const g = u < 1.2 ? u : 1.2;
      return f.amp * (0.08 + 0.92 * g * g) * Math.sin(WAVE_K * u - f.phase);
    }

    function placeFin(fin, f, at, side, len, hw, sweep, bend, rays) {
      const s = at * f.L;
      const ang = f.theta - s / f.R;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const r = f.R + swing(f, at) + side * f.W * profile(at) * 0.8;
      fin.x = c * r;
      fin.y = sn * r;
      // out from the body on this side, then swept back towards the tail
      const lx = side * c;
      const ly = side * sn;
      const bx = sn; // backwards along the circle
      const by = -c;
      const ca = Math.cos(sweep);
      const sa = Math.sin(sweep);
      fin.ax = ca * lx + sa * bx;
      fin.ay = ca * ly + sa * by;
      let px = -fin.ay;
      let py = fin.ax;
      if (px * bx + py * by < 0) { px = -px; py = -py; }
      fin.px = px; // across the fin, pointing tailwards
      fin.py = py;
      fin.len = len;
      fin.invLen = 1 / len;
      fin.hw = hw;
      fin.bend = bend;
      fin.flut = 0.07 * len;
      fin.rays = rays;
      const reach = len + hw + Math.abs(bend) + 1;
      fin.r2 = reach * reach;
    }

    function placeFish(f) {
      const i = f.index;
      // Each fish wanders a little off the shared circle - in, out, ahead,
      // behind - so the pair weave round each other instead of sitting on a
      // turntable.
      f.R = orbitR * (1 + 0.035 * Math.sin(0.29 * t + i * Math.PI));
      let theta = orbit + i * Math.PI + 0.05 * Math.sin(0.37 * t + i * 2.1);
      theta -= TAU * Math.floor(theta / TAU);
      f.theta = theta;
      // when the circle tightens the fish shorten a little, or they would
      // overlap each other's tails
      f.L = L0 * Math.sqrt(orbitR / R0);
      f.invL = 1 / f.L;
      f.W = SCENE.width * f.L;
      const flare = cur.flare;
      const open = flare > 0 ? flare : 0;
      f.T = SCENE.tail * f.L * (1 + 0.15 * open);
      f.invT = 1 / f.T;
      f.tailEnd = f.L + f.T;
      f.wake = SCENE.wake * f.L;
      f.span = f.tailEnd + f.wake;
      f.amp = SCENE.amp * f.L * (0.85 + 0.25 * Math.min(1, cur.beat));
      f.phase = beatPhase + i * 1.9;

      const L = f.L;
      const pecLen = SCENE.pecLen * L * (1 + 0.3 * flare);
      const pelLen = SCENE.pelLen * L * (1 + 0.2 * flare);
      let n = 0;
      for (let side = 1; side >= -1; side -= 2) {
        placeFin(
          f.fins[n++], f, SCENE.pecAt, side,
          pecLen,
          SCENE.pecWidth * L * (1 + 0.25 * open),
          (SCENE.pecSweep - 22 * flare) * DEG + 13 * DEG * Math.sin(finPhase + side * 0.9 + i * 1.3),
          0.08 * L,
          2,
        );
        placeFin(
          f.fins[n++], f, SCENE.pelAt, side,
          pelLen,
          SCENE.pelWidth * L,
          (SCENE.pelSweep - 10 * flare) * DEG + 9 * DEG * Math.sin(finPhase * 0.8 + side * 1.4 + 1 + i),
          0.03 * L,
          2,
        );
      }
      // The stretch of the body, in s, that any fin can reach. Generous on the
      // tail side: a point on the inner fin, nearer the centre, has a larger
      // s than its true distance back from the root.
      f.finLo = SCENE.pecAt * L - 3;
      f.finHi = Math.max(SCENE.pecAt * L + pecLen * 1.7, SCENE.pelAt * L + pelLen * 1.7) + 3;
    }

    function finClass(ink) {
      return ink >= 0.38 ? C_FIN : ink >= 0.22 ? C_FIN_MID : C_FIN_FAINT;
    }

    function bodyClass(f, u, v, z) {
      let iu = (u * PATTERN_U) | 0;
      if (iu < 0) iu = 0; else if (iu >= PATTERN_U) iu = PATTERN_U - 1;
      let iv = ((v + 1) * 0.5 * PATTERN_V) | 0;
      if (iv < 0) iv = 0; else if (iv >= PATTERN_V) iv = PATTERN_V - 1;
      const m = f.pattern[iv * PATTERN_U + iu];
      if (m === 2) return C_PATCH;
      const white = f.white ? m === 0 : m === 1;
      const lit = z > 0.5;
      return white ? (lit ? C_WHITE : C_WHITE_SHADE) : (lit ? C_ORANGE : C_ORANGE_SHADE);
    }

    // Fins are translucent: a membrane too faint to print, a few faint rays,
    // and a bright rim about a sample thick. Thin rays alone came out as
    // scattered punctuation; it is the continuous rim that makes a fin read as
    // a fin. RIM is the rim's width in world units.
    const RIM = 0.9;
    const RIM_INK = 0.5;

    // Ray lines across a fin: cos^2 of a stretched v, about a sample wide.
    // `count` even puts rays on the centre line and on the edges.
    function rayAt(v, count) {
      const c = Math.cos(Math.PI * count * v);
      return c > 0 ? c * c : 0;
    }

    // Draws one fish into sample k. Fins first, so the body drawn after them
    // covers their roots.
    function drawFishAt(f, k, x, y, rho, phi, open) {
      // body and tail, in bent coordinates: s is the distance back from the
      // head along the circle, d the distance out from the swinging spine
      let dth = f.theta - phi;
      dth -= TAU * Math.floor((dth + Math.PI) / TAU);
      const s = dth * f.R;

      // the fins only exist alongside the front two-thirds of the body, so
      // most samples skip them on this one comparison
      const fins = f.fins;
      if (s > f.finLo && s < f.finHi) for (let n = 0; n < 4; n++) {
        const fin = fins[n];
        const ex = x - fin.x;
        const ey = y - fin.y;
        if (ex * ex + ey * ey > fin.r2) continue;
        const a = ex * fin.ax + ey * fin.ay;
        if (a < -AA || a > fin.len + AA) continue;
        let ua = a * fin.invLen;
        if (ua < 0) ua = 0; else if (ua > 1) ua = 1;
        const ua2 = ua * ua;
        const b = ex * fin.px + ey * fin.py;
        const bc = fin.bend * ua2 + fin.flut * ua2 * Math.sin(6 * ua - finPhase * 1.6);
        const hw = fin.hw * finProfile(ua);
        const db = b - bc;
        const adb = db < 0 ? -db : db;
        let cov = (hw - adb) * INV_AA + 0.5;
        if (cov <= 0) continue;
        if (cov > 1) cov = 1;
        const ends = (a < fin.len - a ? a : fin.len - a) * INV_AA + 0.5;
        if (ends <= 0) continue;
        if (ends < 1) cov *= ends;
        const v = hw > 1e-3 ? db / hw : 0;
        // distance in from the nearest edge - a side, or the rounded tip
        let edge = hw - adb;
        if (fin.len - a < edge) edge = fin.len - a;
        const rim = edge < RIM ? 1 - edge / RIM : 0;
        const inner = 0.18 + 0.14 * rayAt(v, fin.rays);
        const ink = cov * (RIM_INK * rim > inner ? RIM_INK * rim : inner) * (1 + 0.25 * open);
        if (ink <= INK[k] || isBody(MAT[k])) continue;
        INK[k] = ink;
        MAT[k] = finClass(ink);
      }

      if (s < -2 * AA || s > f.span) return;

      if (s >= f.tailEnd) {
        // the wake: water still stirring where the tail has just been, running
        // on round the circle towards the other fish's head
        const wu = (s - f.tailEnd) / f.wake;
        const d = rho - f.R;
        const ww = 0.4 + 1.6 * wu;
        const ad = d < 0 ? -d : d;
        if (ad >= ww) return;
        const dash = 0.5 + 0.5 * Math.cos(s * 1.4 - t * 2.2);
        const ink = 0.34 * (1 - wu) * (1 - ad / ww) * dash;
        if (ink > INK[k] && !isBody(MAT[k])) {
          INK[k] = ink;
          MAT[k] = C_WATER;
        }
        return;
      }

      const u = s * f.invL;
      const d = rho - f.R - swing(f, u);

      if (u < 1) {
        const w = f.W * profile(u);
        const ad = d < 0 ? -d : d;
        let cov = (w - ad) * INV_AA + 0.5;
        if (cov <= 0) return;
        if (cov > 1) cov = 1;
        const nz = ad / (w + 1e-3);
        const z = nz < 1 ? Math.sqrt(1 - nz * nz) : 0;
        // lit from above: the back is brightest, the flanks fall away
        const ink = cov * (0.45 + 0.55 * z);
        const m = MAT[k];
        if (isBody(m) && INK[k] >= ink) return;
        if (m >= C_FIN && cov < 0.3 && INK[k] > ink) return;
        INK[k] = ink;
        MAT[k] = bodyClass(f, u, d / (w + 1e-3), z);
        return;
      }

      // the tail fin: the body's wave carried on, with a faster ripple on top
      const ut = (s - f.L) * f.invT;
      const dd = d - f.amp * 0.6 * ut * ut * Math.sin(TAIL_K * ut - f.phase * 1.3 - 0.7);
      const g = ut < 0.5 ? ut / 0.5 : 1;
      const ht = f.W * (0.22 + 0.72 * g * g * (3 - 2 * g)) * (1 + 0.15 * open);
      const v = dd / ht;
      const av = v < 0 ? -v : v;
      if (av > 1 + AA / ht) return;
      // long lobes either side, a shallow notch between them
      const lobe = av < 1 ? av : 1;
      const reach = 1 - 0.3 * (1 - lobe * Math.sqrt(lobe)) + 0.04 * Math.sin(f.phase * 1.7 + v * 5);
      const add = dd < 0 ? -dd : dd;
      let cov = (ht - add) * INV_AA + 0.5;
      if (cov <= 0) return;
      if (cov > 1) cov = 1;
      const left = (reach - ut) * f.T; // distance in from the trailing edge
      const tip = left * INV_AA + 0.5;
      if (tip <= 0) return;
      if (tip < 1) cov *= tip;
      // a bright rim all the way round, so the fan reads as a shape, and three
      // faint rays fanning out from the root inside it
      let edge = ht - add;
      if (left < edge) edge = left;
      const rim = edge < RIM ? 1 - edge / RIM : 0;
      const inner = 0.18 + 0.15 * rayAt(v, 4);
      const ink = cov * (RIM_INK * rim > inner ? RIM_INK * rim : inner) * (1 - 0.2 * ut) * (1 + 0.2 * open);
      if (isBody(MAT[k]) || ink <= INK[k]) return;
      INK[k] = ink;
      MAT[k] = finClass(ink);
    }

    function rasterise() {
      INK.fill(0);
      MAT.fill(0);
      const f0 = fish[0];
      const f1 = fish[1];
      const open = cur.flare > 0 ? cur.flare : 0;
      // Only an annulus around the circle can hold any fish. Everything inside
      // or outside it is skipped without being looked at.
      const reach = Math.max(f0.W, f1.W) + Math.max(f0.fins[0].len, f0.T * 0.5) + 2;
      const rMin = Math.max(0, Math.min(f0.R, f1.R) - reach);
      const rMax = Math.max(f0.R, f1.R) + reach;
      for (let k = 0; k < nSamp; k++) {
        const rho = RHO[k];
        if (rho < rMin || rho > rMax) continue;
        const x = DX[k];
        const y = DY[k];
        const phi = PHI[k];
        drawFishAt(f0, k, x, y, rho, phi, open);
        drawFishAt(f1, k, x, y, rho, phi, open);
      }
    }

    // Listening: rings that close in on the pair, like sound arriving. Drawn
    // into the samples like everything else, so a ring comes out as a smooth
    // curve of shaped characters rather than a staircase of dots. Only where
    // nothing else is drawn - the rings pass behind the fish.
    function rasteriseRipples() {
      if (cur.ripple < 0.03) return;
      for (let n = 0; n < 2; n++) {
        const fr = (ripplePhase + n * 0.5) % 1;
        const rr = S * 0.97 * (1 - fr);
        const strength = 0.42 * cur.ripple * Math.sin(Math.PI * fr);
        if (strength < 0.12) continue;
        const lo = rr - 0.8;
        const hi = rr + 0.8;
        for (let k = 0; k < nSamp; k++) {
          const rho = RHO[k];
          if (rho < lo || rho > hi || INK[k] > 0.05) continue;
          const dr = rho - rr;
          const ink = strength * (1 - (dr < 0 ? -dr : dr) / 0.8);
          if (ink > INK[k]) {
            INK[k] = ink;
            MAT[k] = C_WATER;
          }
        }
      }
    }

    function bestGlyph(key) {
      const v = new Float32Array(SPC);
      for (let j = 0, kk = key; j < SPC; j++, kk = (kk / Q) | 0) v[j] = (kk % Q) / (Q - 1);
      let best = 0;
      let bestD = Infinity;
      for (let g = 0; g < N_MATCH; g++) {
        let dist = 0;
        for (let j = 0; j < SPC; j++) {
          const e = v[j] - shapes[g * SPC + j];
          dist += e * e;
        }
        if (dist < bestD) { bestD = dist; best = g; }
      }
      return best;
    }

    // The glyph for a cell: the character whose shape is nearest the six
    // samples. The samples are pushed apart first (v*v/peak), which sharpens
    // edges: a cell half-covered by the body picks a character that is clearly
    // half-filled rather than a uniformly middling one.
    function matchGlyph(k0, peak) {
      if (!shapes) {
        let sum = 0;
        for (let j = 0; j < SPC; j++) sum += INK[k0 + j];
        return RAMP[Math.min(RAMP.length - 1, Math.round((sum / SPC) * (RAMP.length - 1)))];
      }
      let key = 0;
      let mul = 1;
      const inv = 1 / peak;
      for (let j = 0; j < SPC; j++) {
        const v = INK[k0 + j];
        const q = ((v * v * inv) * (Q - 1) + 0.5) | 0;
        key += (q < Q ? q : Q - 1) * mul;
        mul *= Q;
      }
      let g = lut[key];
      if (g < 0) g = lut[key] = bestGlyph(key);
      return g;
    }

    function compose() {
      for (let ci = 0, k0 = 0; ci < nCells; ci++, k0 += SPC) {
        let peak = 0;
        let pk = k0;
        for (let j = 0; j < SPC; j++) {
          const v = INK[k0 + j];
          if (v > peak) { peak = v; pk = k0 + j; }
        }
        const m = MAT[pk];
        // Only the soft edge of a body reaching into this cell: printing it
        // drew a dotted fringe along every outline, so it stays blank and the
        // silhouette stays crisp.
        if (peak < 0.1 || (peak < 0.2 && isBody(m))) { GL[ci] = G_SPACE; CL[ci] = C_NONE; continue; }
        if (m >= C_FIN && m <= C_FIN_FAINT) {
          // Inside a fin, away from its edge, the cell gets a quiet texture
          // instead of a matched glyph: dots, with colons where a ray runs
          // through. Drawn as outlines alone the fins came out as rows of
          // separate dashes (VT323's hyphen does not join up); a dotted veil
          // with a shaped edge reads as a translucent fin.
          let lo = peak;
          let sum = 0;
          for (let j = 0; j < SPC; j++) {
            const v = INK[k0 + j];
            sum += v;
            if (v < lo) lo = v;
          }
          if (lo > peak * 0.6) {
            const avg = sum / SPC;
            GL[ci] = avg > 0.27 ? G_COLON : G_DOT;
            CL[ci] = finClass(avg);
            continue;
          }
        }
        const g = matchGlyph(k0, peak);
        GL[ci] = g;
        CL[ci] = g === G_SPACE ? C_NONE : m;
      }
    }

    // The eyes are gaps: a dark cell in a bright head reads as an eye, and
    // costs no colour of its own.
    function drawEyes() {
      for (let n = 0; n < 2; n++) {
        const f = fish[n];
        const u = SCENE.eyeAt;
        const ang = f.theta - (u * f.L) / f.R;
        const w = f.W * profile(u);
        const base = f.R + swing(f, u);
        for (let side = 1; side >= -1; side -= 2) {
          const r = base + side * SCENE.eyeOut * w;
          const col = Math.floor(cx + Math.cos(ang) * r);
          const row = Math.floor((cy + Math.sin(ang) * r) / aspect);
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
          const ci = row * cols + col;
          if (isBody(CL[ci])) { GL[ci] = G_SPACE; CL[ci] = C_EYE; }
        }
      }
    }

    // Drifting motes: mostly faint dots, an occasional star at the top of a
    // twinkle. While she speaks they brighten with her voice.
    function drawParticles() {
      const pulse = mood === "speaking" ? level : 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const col = Math.floor(p.x + cx);
        const row = Math.floor((p.y + cy) / aspect);
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        const ci = row * cols + col;
        if (GL[ci] !== G_SPACE || CL[ci] !== C_NONE) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * p.tw * 2 + p.ph);
        let b = cur.sparkle * tw * (0.6 + 0.8 * p.z);
        b += pulse * 0.55 * (0.5 + 0.5 * Math.sin(t * 7 + p.ph));
        if (b < 0.1) continue;
        GL[ci] = b > 0.82 && tw > 0.9 ? G_STAR : b > 0.3 ? G_MIDDOT : G_DOT;
        CL[ci] = b > 0.45 ? C_SPARK : C_SPARK_DIM;
      }
    }

    // One span per run of a colour. A space never opens or closes a run.
    function emit() {
      let html = "";
      for (let r = 0, ci = 0; r < rows; r++) {
        let open = C_NONE;
        for (let c = 0; c < cols; c++, ci++) {
          const g = GL[ci];
          if (g === G_SPACE) { html += " "; continue; }
          const k = CL[ci];
          if (k !== open) {
            if (open) html += "</span>";
            html += OPEN[k];
            open = k;
          }
          html += GLYPH_HTML[g];
        }
        if (open) html += "</span>";
        if (r < rows - 1) html += "\n";
      }
      el.innerHTML = html;
    }

    function draw() {
      placeFish(fish[0]);
      placeFish(fish[1]);
      rasterise();
      rasteriseRipples();
      compose();
      drawEyes();
      drawParticles();
      emit();
    }

    // One fixed, pleasing frame for anyone who has asked for less motion: the
    // mood's own shape (a tighter circle while thinking, spread fins while
    // speaking), without the movement.
    function drawStill() {
      if (stopped) return;
      Object.assign(cur, MOODS[mood]);
      orbitR = R0 * cur.radius;
      t = 0;
      orbit = -2.0;
      beatPhase = 1.1;
      finPhase = 0.6;
      ripplePhase = 0.35;
      draw();
    }

    // -- the loop --------------------------------------------------------------
    //
    // A timeout per frame rather than a free-running requestAnimationFrame:
    // the screen refreshes at 60 Hz and the fish only need 15, and a weak
    // laptop should not be woken four times for every frame it draws. The
    // timeout hands over to requestAnimationFrame so the write still lands
    // just before a paint.

    function running() {
      return !stopped && !reduced && onScreen && !doc.hidden;
    }

    function tick(stamp) {
      raf = 0;
      if (!running()) return;
      const dt = lastTick ? Math.min(0.1, (stamp - lastTick) / 1000) : 1 / fps;
      lastTick = stamp;
      nextDue = stamp + frameMs;
      const started = now();
      ease(dt);
      draw();
      const spent = now() - started;
      frameLast = spent;
      frameTotal += spent;
      if (spent > frameMax) frameMax = spent;
      frameTimes[frames % frameTimes.length] = spent;
      frames++;
      schedule();
    }

    function schedule() {
      if (timer || raf || !running()) return;
      // aim the timeout a little early; the animation frame that follows
      // lands on the paint
      const wait = Math.max(0, nextDue - now() - 12);
      timer = win.setTimeout(() => {
        timer = 0;
        if (running()) raf = win.requestAnimationFrame(tick);
      }, wait);
    }

    function halt() {
      if (timer) win.clearTimeout(timer);
      if (raf) win.cancelAnimationFrame(raf);
      timer = 0;
      raf = 0;
      lastTick = 0; // a long pause must not become one giant step
    }

    function sync() {
      if (running()) schedule();
      else halt();
    }

    const onVisibility = () => sync();
    const onReducedChange = () => {
      reduced = !!(reducedQuery && reducedQuery.matches);
      if (reduced) { halt(); drawStill(); }
      else sync();
    };
    const onFonts = () => remeasure();

    doc.addEventListener("visibilitychange", onVisibility);
    if (reducedQuery) {
      if (reducedQuery.addEventListener) reducedQuery.addEventListener("change", onReducedChange);
      else if (reducedQuery.addListener) reducedQuery.addListener(onReducedChange);
    }
    // Nothing to draw for while the view is hidden: the Talk view is
    // display:none when it is closed, and an IntersectionObserver notices that
    // without anyone having to tell us.
    let observer = null;
    if (typeof win.IntersectionObserver === "function") {
      observer = new win.IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        onScreen = !!(e && e.isIntersecting);
        if (onScreen && needsMeasure) remeasure();
        sync();
      });
      observer.observe(el);
    }
    // The font may still be on its way when we mount (font-display: swap), in
    // which case the first measurement was of a fallback face.
    if (doc.fonts) {
      if (doc.fonts.addEventListener) doc.fonts.addEventListener("loadingdone", onFonts);
      if (doc.fonts.ready) doc.fonts.ready.then(onFonts, () => {});
    }

    // -- start -------------------------------------------------------------------
    R0 = 0;
    remeasure();
    if (!R0) layout(aspect);
    if (reduced) drawStill();
    else {
      draw();
      sync();
    }

    const controller = {
      setState(state) {
        const name = ALIASES[state] || state;
        if (!MOODS[name]) {
          if (!warnedState) {
            warnedState = true;
            console.warn("[emb3rKoi] unknown state:", state, "- expected idle, listening, thinking or speaking");
          }
          return;
        }
        if (name === mood) return;
        mood = name;
        if (reduced) drawStill();
      },
      setLevel(value) {
        const n = Number(value);
        levelTarget = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
      },
      stop() {
        if (stopped) return;
        stopped = true;
        halt();
        doc.removeEventListener("visibilitychange", onVisibility);
        if (reducedQuery) {
          if (reducedQuery.removeEventListener) reducedQuery.removeEventListener("change", onReducedChange);
          else if (reducedQuery.removeListener) reducedQuery.removeListener(onReducedChange);
        }
        if (doc.fonts && doc.fonts.removeEventListener) doc.fonts.removeEventListener("loadingdone", onFonts);
        if (observer) observer.disconnect();
        if (mounted.get(el) === controller) mounted.delete(el);
      },
      setPalette(palette) {
        applyPalette(el, palette);
      },
      remeasure() {
        remeasure();
      },
      get state() {
        return mood;
      },
      // Frame cost of this module's own work: the simulation, the drawing and
      // the innerHTML write. The browser's style, layout and paint come after
      // and are not included - see NOTES.md for those.
      getStats() {
        const n = Math.min(frames, frameTimes.length);
        const recent = Array.from(frameTimes.subarray(0, n)).sort((a, b) => a - b);
        const secs = (now() - statsSince) / 1000;
        return {
          frames,
          fps: secs > 0 ? frames / secs : 0,
          avgMs: frames ? frameTotal / frames : 0,
          p95Ms: n ? recent[Math.min(n - 1, Math.floor(n * 0.95))] : 0,
          maxMs: frameMax,
          lastMs: frameLast,
          cols,
          rows,
          aspect,
          glyphShapes: !!shapes,
          running: running(),
          reducedMotion: reduced,
        };
      },
      resetStats() {
        frames = 0;
        frameTotal = 0;
        frameMax = 0;
        statsSince = now();
      },
    };
    mounted.set(el, controller);
    return controller;
  }

  root.emb3rKoi = Object.freeze({
    mount,
    palettes: PALETTES,
    states: Object.freeze(Object.keys(MOODS)),
    version: VERSION,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
