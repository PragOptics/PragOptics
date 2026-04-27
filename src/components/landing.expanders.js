// src/components/landing.expanders.js

export function initLandingExpanders() {
  // Fast Path expanders
  document.querySelectorAll(".fast-path-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = btn.nextElementSibling;
      if (!body) return;
      body.classList.toggle("open");
    });
  });

  // Capability expanders
  document.querySelectorAll(".cap-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = btn.nextElementSibling;
      if (!body) return;
      body.classList.toggle("open");
    });
  });
}