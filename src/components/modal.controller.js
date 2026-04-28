export function initModalControls() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-modal-action]");
    if (!btn) return;

    switch (btn.dataset.modalAction) {
      case "agreement-open":
        window.openAgreementModal?.();
        break;

      case "agreement-close":
        window.closeAgreementModal?.();
        break;

      case "agreement-submit":
        window.submitAgreementAck?.();
        break;

      case "login-close":
        window.closeLoginModal?.();
        break;
    }
  });
}