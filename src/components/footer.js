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
    // A sun on the dark theme (the offer), a moon on the light one. One color,
    // the primary (teal on dark, purple on light), no gradient: the same rule
    // as every other accent. The sun is a glowing disc (three concentric fills
    // falling off), the moon a full crescent. Inline SVG, no script.
    // Cameron's own marks (svgrepo "sun" and "ball"), one fill, currentColor.
    const SUN = `<svg class="footer-theme-ico" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M23.395 14.106c2.958-1.383 2.828-6.068 5.758-5.884-4.125-2.74-4.019 3.106-9.089 1.235 1.107-3.068-2.292-6.286-0.091-8.227-4.855 0.979-0.645 5.039-5.555 7.301-1.384-2.958-6.068-2.828-5.884-5.758-2.74 4.125 3.106 4.019 1.235 9.089-3.068-1.107-6.286 2.292-8.227 0.091 0.979 4.855 5.039 0.645 7.301 5.555-2.958 1.384-2.828 6.068-5.758 5.884 4.125 2.74 4.019-3.106 9.089-1.235-1.107 3.068 2.292 6.286 0.091 8.227 4.855-0.979 0.645-5.039 5.555-7.301 1.384 2.958 6.068 2.828 5.884 5.758 2.74-4.125-3.106-4.019-1.235-9.089 3.068 1.107 6.286-2.292 8.226-0.091-0.979-4.855-5.039-0.645-7.301-5.555z"/>
    </svg>`;
    const MOON = `<svg class="footer-theme-ico" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16.098 1.686c-7.827 0-14.172 6.345-14.172 14.173s6.345 14.172 14.172 14.172 14.172-6.345 14.172-14.172-6.345-14.173-14.172-14.173zM24.345 24.964c2.169-3.191 2.57-7.678 0.91-11.874-0.621 1.292-1.942 2.185-3.471 2.185-2.125 0-3.848-1.723-3.848-3.848 0-1.213 0.562-2.294 1.439-3-0.576-0.277-0.989-0.838-1.056-1.502-0.316 0.373-0.788 0.611-1.316 0.611-0.953 0-1.725-0.772-1.725-1.725 0-0.569 0.275-1.073 0.699-1.387-0.994-0.272-2.004-0.41-3.004-0.405 1.036-0.285 2.128-0.439 3.255-0.439 6.757 0 12.234 5.478 12.234 12.234 0 3.641-1.591 6.91-4.115 9.151z"/>
    </svg>`;
    const label = () => {
      const light = getTheme() === "light";
      themeBtn.innerHTML = light ? "Enter Darkness" + MOON : "Show me the Light" + SUN;
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