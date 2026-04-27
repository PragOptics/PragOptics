// src/components/statusModal.js

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement("div");
  modalEl.id = "po-status-modal";
  modalEl.className = "po-status-modal hidden";

  modalEl.innerHTML = `
    <div class="po-status-backdrop"></div>
    <div class="po-status-card">
    <button class="po-status-close">✕</button>
      <div class="po-status-icon"></div>
      <div class="po-status-message"></div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.querySelector(".po-status-close").onclick = hideStatusModal;
  modalEl.querySelector(".po-status-backdrop").onclick = hideStatusModal;

  return modalEl;
}

export function showStatusModal({ mode = "info", message = "" }) {
  const el = ensureModal();

  el.classList.remove("hidden");
  el.dataset.mode = mode;

  const closeBtn = el.querySelector(".po-status-close");
  if (closeBtn) {
    closeBtn.style.display = (mode === "loading") ? "none" : "flex";
  }

  const icon = el.querySelector(".po-status-icon");
  const msg  = el.querySelector(".po-status-message");

  msg.textContent = message;

  icon.innerHTML = "";
  icon.className = "po-status-icon";

  if (mode === "loading") {
    icon.classList.add("loading");
  }
  if (mode === "success") {
    icon.textContent = "✓";
    icon.classList.add("success");
  }
  if (mode === "error") {
    icon.textContent = "✕";
    icon.classList.add("error");
  }
}

export function hideStatusModal() {
  if (!modalEl) return;
  modalEl.classList.add("hidden");
}