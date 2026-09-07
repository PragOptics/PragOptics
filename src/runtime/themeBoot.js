// src/runtime/themeBoot.js
//
// Applies the viewer's saved theme BEFORE first paint, so a light-theme viewer
// never sees a dark flash. A classic script, not a module, so it runs
// synchronously where it is placed in <head>; an external file because the
// site's Content Security Policy allows no inline script. Dark is the default
// and needs no attribute; anything but a stored "light" resolves to dark.
(function () {
  try {
    if (localStorage.getItem("pragoptics_theme") === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) { /* storage blocked: dark */ }
})();
