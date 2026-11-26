// /src/components/footer.js
import { LANE } from '../runtime/config.js';
import { switchLane } from '../runtime/lane.js';
import { accessToken } from '../runtime/session.js';
import { getTheme, toggleTheme } from '../runtime/theme.js';
import { sunSvg, moonSvg, LIGHT_LABEL, DARK_LABEL } from './themeMarks.js';

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

  // Report a site (2026-09-24, the community standards): the report form, signed in or not, loaded when first asked for.
  const reportLink = document.querySelector("[data-report-site]");
  if (reportLink) {
    reportLink.addEventListener("click", (e) => {
      e.preventDefault();
      openReportSite();
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
    // Cameron's own marks and phrases live in components/themeMarks.js, shared
    // with the Profile section's Appearance card.
    const SUN = sunSvg("footer-theme-ico");
    const MOON = moonSvg("footer-theme-ico");
    const label = () => {
      const light = getTheme() === "light";
      themeBtn.innerHTML = light ? DARK_LABEL + MOON : LIGHT_LABEL + SUN;
      themeBtn.setAttribute("aria-pressed", light ? "true" : "false");
    };
    label();
    themeBtn.addEventListener("click", () => { toggleTheme(); label(); });
  }

  // Any tab already on dev needs a visible return, including a dev account
  // without a developer/admin flag. This never grants live -> dev access.
  const env = document.getElementById("footerEnv");
  if (!env) return;

  const showLaneBadge = LANE === "dev";
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
  env.setAttribute("aria-label", "Platform lane: dev. Return to live");
  env.title = "This tab uses the dev platform. Click to return to live.";

  env.addEventListener("click", openReturnToLive);
  env.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openReturnToLive(); }
  });
}

/**
 * The Report a site form (src/account/report.js openConductReport), opened from the footer and from the address
 * /#report. A signed-in visitor's session rides along so the report records who sent it; nobody needs one.
 */
/** CONTACT, FOR ANYONE (2026-11-15): every [data-open-contact] opens the Contact form (components/contactForm.js); its data-about prefixes the message. */
export function wireContactLinks(root = document) {
  root.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-open-contact]");
    if (!a) return;
    e.preventDefault();
    try { const m = await import("./contactForm.js"); await m.openContact({ about: a.dataset.about || "" }); }
    catch { if (a.getAttribute("href")) window.location.href = a.getAttribute("href"); }   // the module did not load: the plain way still works
  });
}
export async function openReportSite() {
  try {
    const m = await import("../account/report.js");
    await m.openConductReport({ token: accessToken() });
  } catch {
    // the module did not load (offline, a stale page): the plain way to report still works
    window.location.href = "mailto:support@bridgesindust.com?subject=Report%20a%20site";
  }
}

// Use the shared, verified lane handoff; only this tab's session is replaced.
function returnToLive() {
  return switchLane('live');
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
        <p>This tab uses the <strong>dev platform</strong>
           (<code>dev.api.pragoptics.com</code>) with test keys. Other tabs keep their own accounts and lanes.</p>
        <p class="lane-return-note">Returning opens your linked live account, or asks you to sign in there.
           Your cart is kept. Your live environment's sandbox is separate from the dev platform.</p>
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
