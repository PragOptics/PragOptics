// src/runtime/appRouter.js

export function setAppMode(mode) {
  ["landingView", "wizardView", "consoleView"].forEach(id =>
    document.getElementById(id)?.classList.add("hidden")
  );

  document.getElementById(mode + "View")?.classList.remove("hidden");
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