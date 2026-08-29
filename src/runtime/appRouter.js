// src/runtime/appRouter.js

export function setAppMode(mode) {
  ["landingView", "wizardView", "consoleView", "shopView", "softwareView", "checkoutView", "warrantyView", "buildsView", "adminView"].forEach(id =>
    document.getElementById(id)?.classList.add("hidden")
  );

  const view = document.getElementById(mode + "View");
  view?.classList.remove("hidden");

  // The landing container holds several sibling sections (hero + OmniSource CTA
  // + OmniBus highlight). Show it ONLY in landing mode; every other surface
  // (wizard, console, shop, software, checkout) hides the whole container so
  // those sections never leak on top of the active view.
  const landingHost = document.getElementById("view-landing");
  if (landingHost) landingHost.classList.toggle("hidden", mode !== "landing");

  // ✅ re-sync auth indicator when console becomes active
  if (mode === "console" && typeof window.setConsoleAuthenticated === "function") {
    window.setConsoleAuthenticated();
  }

  // Notify view-owner hooks (e.g., checkout re-renders from live cart state).
  if (typeof window.onEnterMode === "function") {
    try { window.onEnterMode(mode); } catch { /* isolate */ }
  }
}

// appRouter.js
export function ensureWizardVisibleAndBranded(
  ping,
  { title, hint, hasTokens = false } = {}
) {
  setAppMode("wizard");

  const indicator = document.getElementById("authIndicator");
  const signedIn =
    typeof window.isAccessTokenValid === "function"
      ? window.isAccessTokenValid()
      : (!!ping?.user || hasTokens);

  if (indicator) {
    indicator.classList.toggle("signed-in", signedIn);
  }

  const h2 = document.getElementById("wizardTitle");
  const sub = document.getElementById("wizardHint");
  if (h2 && title) h2.textContent = title;
  if (sub && hint) sub.textContent = hint;
}