// /src/components/brochureViewer.js
//
// Opens the OmniBus product brochure in an isolated iframe modal on the main page,
// the same overlay pattern as the legal viewer, but rich (iframe) instead of inline,
// so the brochure's embedded styles/SVG render faithfully and the page never
// navigates away to /docs/.
//
// Markup lives in /views/legal.view.html (#brochureMask / #brochurePanel / #brochureFrame).
// Triggered by any element with [data-brochure-open]; closed by [data-brochure-action="close"],
// clicking the mask, or Escape.

export function initBrochureViewer(options = {}) {
  const src = options.src || "/docs/brochure-view.html";

  const $mask = document.getElementById("brochureMask");
  const $panel = document.getElementById("brochurePanel");
  const $frame = document.getElementById("brochureFrame");
  if (!$mask || !$panel || !$frame) return;

  function open() {
    // lazy-load the iframe on first open so it does not cost anything on page load
    if (!$frame.getAttribute("src")) $frame.setAttribute("src", src);
    $mask.classList.add("is-open");
    $panel.classList.add("is-open");
    $mask.setAttribute("aria-hidden", "false");
    $panel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function close() {
    $mask.classList.remove("is-open");
    $panel.classList.remove("is-open");
    $mask.setAttribute("aria-hidden", "true");
    $panel.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-brochure-open]")) { e.preventDefault(); open(); return; }
    const c = e.target.closest("[data-brochure-action]");
    if (c) { e.preventDefault(); if (c.dataset.brochureAction === "close") close(); return; }
    if (e.target === $mask) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $panel.classList.contains("is-open")) close();
  });
}
