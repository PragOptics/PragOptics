export function initFooter() {
  const yearEl = document.getElementById('footerYear');
  if (!yearEl) return;

  yearEl.textContent = new Date().getFullYear();
}
