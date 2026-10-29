// Every key emb3r answers to, in one table. The handler in renderer.js, the
// shortcut sheet and the list in Settings all read this, so the three cannot
// disagree about what a key does.
//
// A classic script, loaded before renderer.js, so it can be run by the tests
// in a context of its own exactly as the page runs it. Nothing in here touches
// the page.
(function (root) {
  "use strict";

  // `mod` is Ctrl on Windows and Linux and Cmd on a Mac. Chosen to keep clear
  // of the Mac's own Cmd+H (hide), Cmd+M (minimise), Cmd+W and Cmd+Q.
  const SHORTCUTS = [
    { id: "talk", keys: { mod: true, code: "KeyT" }, label: "Talk on or off - press, not hold", group: "Talking" },
    { id: "talkView", keys: { mod: true, shift: true, code: "KeyT" }, label: "Open or close the Talk view", group: "Talking" },
    { id: "readLast", keys: { mod: true, shift: true, code: "KeyR" }, label: "Read her last reply aloud", group: "Talking" },
    { id: "newChat", keys: { mod: true, code: "KeyN" }, label: "New chat", group: "Moving around" },
    { id: "menu", keys: { mod: true, code: "KeyK" }, label: "The menu, with history", group: "Moving around" },
    { id: "settings", keys: { mod: true, code: "Comma" }, label: "Settings", group: "Moving around" },
    { id: "focusInput", keys: { mod: true, code: "KeyL" }, label: "Jump to the message box", group: "Moving around" },
    { id: "escape", keys: { code: "Escape" }, label: "Stop what is happening, or close what is open", group: "Moving around" },
    { id: "attach", keys: { mod: true, code: "KeyO" }, label: "Attach a file", group: "Messages" },
    { id: "copyLast", keys: { mod: true, shift: true, code: "KeyC" }, label: "Copy her last reply", group: "Messages" },
    { id: "zoomIn", keys: { mod: true, anyShift: true, code: ["Equal", "NumpadAdd"] }, label: "Zoom in", group: "Seeing" },
    { id: "zoomOut", keys: { mod: true, anyShift: true, code: ["Minus", "NumpadSubtract"] }, label: "Zoom out", group: "Seeing" },
    { id: "zoomReset", keys: { mod: true, code: ["Digit0", "Numpad0"] }, label: "Zoom back to normal", group: "Seeing" },
    { id: "musicToggle", keys: { mod: true, alt: true, code: "KeyP" }, label: "Spotify: play or pause", group: "Music" },
    { id: "musicNext", keys: { mod: true, alt: true, code: "ArrowRight" }, label: "Spotify: next song", group: "Music" },
    { id: "musicPrev", keys: { mod: true, alt: true, code: "ArrowLeft" }, label: "Spotify: previous song", group: "Music" },
    { id: "sheet", keys: { mod: true, code: "Slash" }, label: "This list of shortcuts", group: "Help" },
    { id: "sheetF1", keys: { code: "F1" }, label: "This list of shortcuts", group: "Help" },
  ];

  // Which shortcut a key press is, or null. A press with AltGraph held is a
  // character being typed - on many Windows layouts Ctrl+Alt is AltGr, and
  // AltGr+P types ö - so it is never a shortcut.
  function matchShortcut(e, isMac) {
    if (e.getModifierState && e.getModifierState("AltGraph")) return null;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    // the other platform's modifier means the press is meant for something else
    if (isMac ? e.ctrlKey : e.metaKey) return null;
    for (const s of SHORTCUTS) {
      const k = s.keys;
      if (![].concat(k.code).includes(e.code)) continue;
      if (Boolean(k.mod) !== Boolean(mod)) continue;
      if (Boolean(k.alt) !== Boolean(e.altKey)) continue;
      if (!k.anyShift && Boolean(k.shift) !== Boolean(e.shiftKey)) continue;
      // the F1 entry is the one without the sheet's other key; Shift+F1 is not it
      if (s.id === "sheetF1") return "sheet";
      return s.id;
    }
    return null;
  }

  // ---- recording a key for the global shortcuts ----------------------------

  const NAMED = {
    Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete",
    Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";",
    Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`",
  };

  function keyName(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    return NAMED[code] || null;
  }

  // A key press as an Electron accelerator ("Control+Alt+Shift+E"), or null
  // while it is not a usable shortcut yet: a modifier on its own, or a key with
  // nothing but Shift - which would take capital letters from every other app.
  function keyEventToAccelerator(e, isMac) {
    const key = keyName(e.code);
    if (!key) return null;
    const parts = [];
    if (e.ctrlKey) parts.push("Control");
    if (e.metaKey) parts.push(isMac ? "Command" : "Super");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (!parts.some((p) => p !== "Shift")) return null;
    return [...parts, key].join("+");
  }

  // ---- writing keys the way the keyboard says them -------------------------

  function acceleratorLabel(accelerator, isMac) {
    const words = {
      Control: "Ctrl", Command: "Cmd", CommandOrControl: isMac ? "Cmd" : "Ctrl",
      Super: isMac ? "Cmd" : "Win", Alt: isMac ? "Option" : "Alt", Shift: "Shift",
      Up: "↑", Down: "↓", Left: "←", Right: "→",
    };
    return String(accelerator || "").split("+").map((p) => words[p] || p).join("+");
  }

  const KEY_WORDS = {
    ArrowRight: "→", ArrowLeft: "←", ArrowUp: "↑", ArrowDown: "↓", Equal: "=", Minus: "−",
    Comma: ",", Slash: "/", Escape: "Esc", NumpadAdd: "+", NumpadSubtract: "−",
  };

  function shortcutLabel(s, isMac) {
    const code = [].concat(s.keys.code)[0];
    const key = KEY_WORDS[code] || keyName(code) || code;
    const parts = [];
    if (s.keys.mod) parts.push(isMac ? "Cmd" : "Ctrl");
    if (s.keys.alt) parts.push(isMac ? "Option" : "Alt");
    if (s.keys.shift) parts.push("Shift");
    return [...parts, key].join("+");
  }

  // ---- her faces, in words -------------------------------------------------

  // An ASCII face read out character by character is noise - "left paren caret
  // underscore caret". Each one is described instead, by what it means.
  const FACE_WORDS = {
    idle: "Ember is relaxed",
    think1: "Ember is thinking",
    think2: "Ember is thinking",
    happy: "Ember looks happy",
    sad: "Ember looks sad",
    sleeping: "Ember is asleep",
    error: "Ember is upset - something went wrong",
    music1: "Ember is enjoying the music",
    music2: "Ember is enjoying the music",
    wink: "Ember winks",
    surprised: "Ember looks surprised",
    search1: "Ember is reading",
    search2: "Ember is reading",
    delighted: "Ember looks delighted",
    dizzy: "Ember is dizzy - the model did not load",
    listening: "Ember is listening",
    hearing: "Ember is working out what you said",
    puzzled: "Ember looks puzzled",
    talking: "Ember is talking",
    deaf: "Ember can't hear - the microphone is missing or refused",
    offline: "Ember is calm - the offline lock is on",
  };

  root.emb3rKeys = { SHORTCUTS, matchShortcut, keyEventToAccelerator, acceleratorLabel, shortcutLabel, FACE_WORDS };
})(globalThis);
