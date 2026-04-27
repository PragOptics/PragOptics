// src/components/dnaController.js

export function setDnaMode(mode, msg, sub) {
  const box = document.querySelector(".dna-container");
  if (!box) return;

  box.dataset.dna = mode;

  if (msg) {
    document.getElementById("finalizeMsg").textContent = msg;
  }
  if (sub) {
    document.getElementById("finalizeSub").textContent = sub;
  }
}

export function markDnaComplete() {
  const box = document.querySelector(".dna-container");
  if (!box) return;

  box.classList.add("is-complete");
  setTimeout(() => box.classList.add("hidden"), 500);
}

export function showProcessingState(
  gotoStep5,
  message = "Finalizing subscription…"
) {
  gotoStep5();

  const box = document.querySelector(".dna-container");
  const current = box?.dataset?.dna || "idle";
  const modeToUse =
    (current === "fast" || current === "lock") ? current : "idle";

  setDnaMode(
    modeToUse,
    message,
    modeToUse === "fast"
      ? "Creating subscription…"
      : "Confirming with Stripe…"
  );

  const btn = document.getElementById("payNowBtn");
  if (btn) btn.disabled = true;
}