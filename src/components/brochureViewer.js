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
  const $title = document.getElementById("brochureTitle");
  const $foot = document.getElementById("brochureOpenTab");
  if (!$mask || !$panel || !$frame) return;

  function open(useSrc, title) {
    const finalSrc = useSrc || src;
    // (re)load the iframe for the requested brochure so switching products works
    if ($frame.getAttribute("src") !== finalSrc) $frame.setAttribute("src", finalSrc);
    if ($title && title) $title.textContent = title;
    if ($foot) $foot.setAttribute("href", finalSrc);
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
    const opener = e.target.closest("[data-brochure-open]");
    if (opener) { e.preventDefault(); open(opener.dataset.brochureSrc, opener.dataset.brochureTitle); return; }
    const c = e.target.closest("[data-brochure-action]");
    if (c) { e.preventDefault(); if (c.dataset.brochureAction === "close") close(); return; }
    if (e.target === $mask) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $panel.classList.contains("is-open")) close();
  });
}
