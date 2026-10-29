// Applies the saved theme before anything is painted.
//
// The theme used to be set from renderer.js, which is the last element in the
// body. By then the boot screen has already been parsed and can paint, so a
// light-theme user got a full-screen dark flash on every launch and then a
// white application. Nothing was wrong with the colours; they simply arrived
// a frame late.
//
// This is a separate file rather than an inline <script> because the content
// security policy is script-src 'self' file: with no 'unsafe-inline', and
// that restriction is doing real work elsewhere in this app. A one-line
// convenience is not worth punching a hole in it.
(function () {
  try {
    const theme = localStorage.getItem("emb3rTheme");
    if (theme === "light" || theme === "contrast") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    // the easy-read font too, for the same reason: chosen, it should be the
    // first thing painted, not swapped in a frame later
    if (localStorage.getItem("emb3rEasyRead") === "true") {
      document.documentElement.classList.add("easyRead");
    }
  } catch (e) {
    // localStorage can throw if storage is unavailable. Dark is the default
    // and is already correct, so there is nothing to recover from.
  }
})();
