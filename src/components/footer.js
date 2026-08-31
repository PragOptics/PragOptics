// /src/components/footer.js
import { LANE } from '../runtime/config.js';

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

  // Environment chip: the ONE place the lane flag lives. Amber while this
  // browser routes API calls to the dev sandbox, teal on live.
  const env = document.getElementById("footerEnv");
  if (!env) return;

  if (LANE === "dev") {
    env.textContent = "DEV LANE";
    env.title = "This browser is routing API calls to the dev sandbox";
    env.classList.add("is-local");
    return;
  }

  const host = (location.hostname || "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  env.textContent = local ? "LOCAL · LIVE API" : "LIVE";
  env.classList.add("is-live");
}