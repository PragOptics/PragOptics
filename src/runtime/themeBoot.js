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
    // The starfield switched off stays off from the first frame (theme.js).
    if (localStorage.getItem("pragoptics_starfield") === "off") {
      document.documentElement.setAttribute("data-starfield", "off");
    }
  } catch (e) { /* storage blocked: dark */ }
})();
