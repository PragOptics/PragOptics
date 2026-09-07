// /src/components/footer.js
import { LANE } from '../runtime/config.js';
import { isPlatformOperator } from '../runtime/lane.js';
import { getTheme, toggleTheme } from '../runtime/theme.js';

export function initFooter() {
  // Year (tiny + deterministic)
  const y = document.getElementById("footerYear");
  if (y) y.textContent = String(new Date().getFullYear());

  const docsLink = document.getElementById("docsLink");
  if (docsLink) {
    docsLink.addEventListener("click", (e) => {
      e.preventDefault();
      // Same-tab in-app navigation (symmetric with the header "Documentation"
      // entry) so doc entrants always have a visible way back.
      window.location.href = "/docs/";
    });
  }

  const warrantyLink = document.getElementById("warrantyLink");
  if (warrantyLink) {
    warrantyLink.addEventListener("click", (e) => {
      e.preventDefault();
      // In-app route to the warranty registration view (same URL as the
      // printed warranty cards: /#warranty).
      window.setAppMode?.("warranty");
    });
  }

  // Theme toggle. The stored choice was applied before first paint by
  // src/runtime/themeBoot.js; this only flips it and relabels itself.
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    // A sun on the dark theme (the offer), a moon on the light one. Both
    // brand-gradient marks: a disc with a broken corona and a faint halo; a
    // crescent with two sparks. Inline SVG, no script, so the CSP is content.
    const SUN = `<svg class="footer-theme-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs><linearGradient id="fvSunG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--brand-600)"/><stop offset="1" style="stop-color:var(--brand-purp-solid)"/></linearGradient></defs>
      <circle cx="12" cy="12" r="4.6" fill="url(#fvSunG)"/>
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="url(#fvSunG)" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="7.5 5.4" transform="rotate(-22 12 12)"/>
      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-opacity=".32" stroke-width=".8" stroke-linecap="round" stroke-dasharray="1.6 5.3"/>
    </svg>`;
    const MOON = `<svg class="footer-theme-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs><linearGradient id="fvMoonG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--brand-600)"/><stop offset="1" style="stop-color:var(--brand-purp-solid)"/></linearGradient></defs>
      <path d="M14.6 2.6a9.4 9.4 0 1 0 6.8 15.9 7.6 7.6 0 0 1-6.8-15.9z" fill="url(#fvMoonG)"/>
      <path d="M5.2 4.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="currentColor" opacity=".85"/>
      <path d="M9.6 1.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor" opacity=".6"/>
    </svg>`;
    const label = () => {
      const light = getTheme() === "light";
      themeBtn.innerHTML = light ? "Join the Darkside" + MOON : "Show me the Light" + SUN;
      themeBtn.setAttribute("aria-pressed", light ? "true" : "false");
    };
    label();
    themeBtn.addEventListener("click", () => { toggleTheme(); label(); });
  }

  // Lane badge — an operator ESCAPE HATCH, not a public element.
  //
  // It renders only when this browser is actually routed to the dev sandbox
  // AND the viewer is a platform operator (or this very browser performed the
  // operator lane switch, which stamps the override key). A random visitor
  // never sees it: on the production domain the ONLY way to be on the dev lane
  // is to have deliberately switched, and that switch lives behind the operator
  // gate in the account panel (src/account/account.js). On the live lane the
  // chip renders nothing at all — there is nothing to escape.
  //
  // Its one job is to get back to live: clicking it opens a galactic confirm
  // that clears the override and reloads on live. It never offers live -> dev;
  // that direction stays in the account panel.
  const env = document.getElementById("footerEnv");
  if (!env) return;

  let overrideDev = false;
  try { overrideDev = localStorage.getItem("pragoptics_lane_override") === "dev"; } catch { /* blocked */ }

  const showLaneBadge = LANE === "dev" && (overrideDev || isPlatformOperator());
  if (!showLaneBadge) {
    // Take the separator that precedes the chip with it, so the public footer
    // never ends in a dangling "|".
    const sep = env.previousElementSibling;
    if (sep && sep.classList.contains("footer-sep")) sep.remove();
    env.remove();
    return;
  }

  env.textContent = "DEV LANE";
  env.classList.add("is-local", "footer-lane-btn");
  env.setAttribute("role", "button");
  env.setAttribute("tabindex", "0");
  env.setAttribute("aria-haspopup", "dialog");
  env.title = "Routing API calls to the dev sandbox. Click to return to live.";

  env.addEventListener("click", openReturnToLive);
  env.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openReturnToLive(); }
  });
}

// Drop this browser back to the live lane: remove the dev override (so the
// production safety net in config.js resolves to live) and clear the dev
// session so nothing runs stale. The cart lives under its own key and is kept.
function returnToLive() {
  try {
    localStorage.removeItem("pragoptics_lane_override");
    sessionStorage.removeItem("pragoptics_tokens");
    sessionStorage.removeItem("pragoptics_ping");
  } catch { /* storage blocked — the reload still drops any in-memory override */ }
  location.reload();
}

// Galactic confirm popup, built from the shared modal language (modals.css).
function openReturnToLive() {
  if (document.getElementById("laneReturnMask")) return; // already open

  const mask = document.createElement("div");
  mask.id = "laneReturnMask";
  mask.className = "modal-overlay is-open";

  const modal = document.createElement("div");
  modal.className = "modal is-open lane-return";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "laneReturnTitle");
  modal.innerHTML = `
    <div class="modal-card lane-return-card" tabindex="-1">
      <div class="modal-head">
        <h3 id="laneReturnTitle" class="modal-title">You're on the DEV lane</h3>
        <button class="modal-close" type="button" aria-label="Close" data-lane-close>&#10005;</button>
      </div>
      <div class="modal-body lane-return-body">
        <p>This browser is routing API calls to the <strong>dev sandbox</strong>
           (<code>dev.api.pragoptics.com</code>) with test keys. It is a per-browser
           setting, so the live site is unaffected for everyone else.</p>
        <p class="lane-return-note">Returning clears the local dev override and reloads
           on the live site. Your cart is kept. You will sign in again on live.</p>
      </div>
      <div class="modal-foot lane-return-foot">
        <div class="actions">
          <button type="button" class="btn subtle" data-lane-close>Stay on dev</button>
          <button type="button" class="cta primary" data-lane-live>Return to live</button>
        </div>
      </div>
    </div>`;

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    mask.remove();
    modal.remove();
    document.removeEventListener("keydown", onKey);
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-lane-live]")) { returnToLive(); return; }
    if (e.target.closest("[data-lane-close]")) { close(); return; }
    if (e.target === modal) close(); // click outside the card
  });
  mask.addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(mask);
  document.body.appendChild(modal);
  modal.querySelector(".modal-card")?.focus();
}