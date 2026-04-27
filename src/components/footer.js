// /src/components/footer.js
export function initFooter() {
  // Year (tiny + deterministic)
  const y = document.getElementById("footerYear");
  if (y) y.textContent = String(new Date().getFullYear());

  const docsLink = document.getElementById("docsLink");
  if (docsLink) {
    docsLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.open("/docs/", "_blank", "noopener,noreferrer");
    });
  }

  // Environment chip (non-invasive; helps dev sanity)
  const env = document.getElementById("footerEnv");
  if (!env) return;

  const host = (location.hostname || "").toLowerCase();

  // Keep this simple and deterministic — no external config dependency.
  if (host === "localhost" || host === "127.0.0.1") {
    env.textContent = "LOCAL";
    env.classList.add("is-local");
    return;
  }

  // If you use lanes/domains later, this won’t break anything.
  env.textContent = "LIVE";
  env.classList.add("is-live");
}