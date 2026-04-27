export function initModalControls() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-modal-action]");
    if (!btn) return;

    switch (btn.dataset.modalAction) {
      case "agreement-open": openAgreementModal(); break;
      case "agreement-close": closeAgreementModal(); break;
      case "agreement-submit": submitAgreementAck(); break;
      case "login-close": closeLoginModal(); break;
    }
  });
}