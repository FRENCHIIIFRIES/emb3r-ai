// emb3r's icons. Each is drawn on a 12 x 12 grid in the pixel idiom of the
// mark in the header and the tutors' salamanders: '#' is a lit square. They
// are filled with currentColor, so they follow the accent, the light theme and
// high contrast exactly as the text beside them does, and they glow with it.
//
// Shown at 24px, two pixels to a square, so the edges stay sharp; at 1.5x
// display scaling that is three device pixels to a square, still whole.
//
// A classic script, loaded before renderer.js, so the tests can run it in a
// context of their own exactly as the page does. Nothing here touches the page
// until fillIcons() or iconSvg() is called.
(function (root) {
  "use strict";

  const GRIDS = {
    // the menu: chats, settings, every shortcut
    menu: [
      "............",
      "............",
      "............",
      ".##########.",
      "............",
      "............",
      ".##########.",
      "............",
      "............",
      ".##########.",
      "............",
      "............",
    ],
    // the Talk view: a voice, not a microphone - the microphone is dictation
    talk: [
      "............",
      ".....#......",
      "...#.#......",
      "...#.#.#....",
      ".#.#.#.#....",
      ".#.#.#.#.#..",
      ".#.#.#.#.#..",
      ".#.#.#.#....",
      "...#.#.#....",
      "...#.#......",
      ".....#......",
      "............",
    ],
    // dictation into the message box
    mic: [
      ".....##.....",
      "....####....",
      "....####....",
      "....####....",
      "....####....",
      ".#..####..#.",
      ".#..####..#.",
      ".#...##...#.",
      "..#......#..",
      "...######...",
      ".....##.....",
      "...######...",
    ],
    attach: [
      "...######...",
      "..#......#..",
      "..#..##..#..",
      "..#.#..#.#..",
      "..#.#..#.#..",
      "..#.#..#.#..",
      "..#.#..#.#..",
      "..#.#..#.#..",
      "..#.#....#..",
      "..#.#....#..",
      ".....####...",
      "............",
    ],
    // send: the Enter key's own arrow, because Enter is what sends
    send: [
      "............",
      "............",
      "..........#.",
      "..........#.",
      "...#......#.",
      "..##......#.",
      ".##########.",
      "..##........",
      "...#........",
      "............",
      "............",
      "............",
    ],
    stop: [
      "............",
      "............",
      "..########..",
      "..########..",
      "..########..",
      "..########..",
      "..########..",
      "..########..",
      "..########..",
      "..########..",
      "............",
      "............",
    ],
    settings: [
      "............",
      "...##.......",
      ".##########.",
      "...##.......",
      "............",
      ".......##...",
      ".##########.",
      ".......##...",
      "............",
      ".....##.....",
      ".##########.",
      ".....##.....",
    ],
    // every shortcut: a keyboard
    keys: [
      "............",
      "############",
      "#..........#",
      "#.#.#.#.#..#",
      "#..........#",
      "#..#.#.#.#.#",
      "#..........#",
      "#..######..#",
      "#..........#",
      "############",
      "............",
      "............",
    ],
    plus: [
      "............",
      "............",
      ".....##.....",
      ".....##.....",
      ".....##.....",
      "..########..",
      "..########..",
      ".....##.....",
      ".....##.....",
      ".....##.....",
      "............",
      "............",
    ],
    copy: [
      "............",
      "....#######.",
      "....#.....#.",
      "....#.....#.",
      ".#######..#.",
      ".#.....#..#.",
      ".#.....#..#.",
      ".#.....####.",
      ".#.....#....",
      ".#.....#....",
      ".#######....",
      "............",
    ],
    check: [
      "............",
      "............",
      "..........#.",
      ".........##.",
      "........##..",
      ".#.....##...",
      ".##...##....",
      "..##.##.....",
      "...###......",
      "....#.......",
      "............",
      "............",
    ],
    close: [
      "............",
      "............",
      ".##......##.",
      "..##....##..",
      "...##..##...",
      "....####....",
      "....####....",
      "...##..##...",
      "..##....##..",
      ".##......##.",
      "............",
      "............",
    ],
    back: [
      "............",
      "............",
      "....#.......",
      "...##.......",
      "..##........",
      ".##########.",
      ".##########.",
      "..##........",
      "...##.......",
      "....#.......",
      "............",
      "............",
    ],
  };

  // One rectangle per run of lit squares in a row: a short path, and no seams
  // between neighbouring squares at any scale.
  function gridPath(rows) {
    let d = "";
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== "#") { x++; continue; }
        const start = x;
        while (x < row.length && row[x] === "#") x++;
        d += `M${start} ${y}h${x - start}v1h-${x - start}z`;
      }
    });
    return d;
  }

  const PATHS = {};
  for (const name of Object.keys(GRIDS)) PATHS[name] = gridPath(GRIDS[name]);

  const SVG_NS = "http://www.w3.org/2000/svg";

  // An <svg> for the named icon, sized by its container.
  function iconSvg(doc, name) {
    if (!PATHS[name]) throw new Error(`no icon called ${name}`);
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", PATHS[name]);
    svg.appendChild(path);
    return svg;
  }

  // Puts the drawing into every <span class="icon" data-icon="..."> under el
  // that does not have it yet, or swaps a filled one for another icon.
  function setIcon(span, name) {
    span.dataset.icon = name;
    span.replaceChildren(iconSvg(span.ownerDocument, name));
  }

  function fillIcons(el) {
    for (const span of el.querySelectorAll(".icon[data-icon]")) {
      if (!span.firstChild) setIcon(span, span.dataset.icon);
    }
  }

  root.emb3rIcons = { GRIDS, PATHS, gridPath, iconSvg, setIcon, fillIcons };
})(globalThis);
