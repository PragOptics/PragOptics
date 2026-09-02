export function initWizardForms() {
  // DELEGATED on purpose, not bound to the element.
  //
  // This runs once at boot, but every entry into the wizard rebuilds the
  // surface: applyPostLoginResolution clears #platformFlow and restores it
  // from an HTML string snapshot, so the form the user actually sees is a
  // NEW element. A listener attached to the original element died with it,
  // and the rebuilt form had nothing bound: no onsubmit, no action, no
  // method, and the only other document-level submit listener belongs to the
  // shop. Clicking "Create Billing Profile" therefore fell through to the
  // browser's native GET submit, reloading the page and never POSTing to
  // v1/billing/profile - every new subscription dead-ended there.
  //
  // Delegation survives every rebuild, so the handler cannot be lost again.
  document.addEventListener("submit", (e) => {
    const form = e.target?.closest?.("#billingProfileForm");
    if (!form) return;
    // Always block the native submit FIRST: if the handler is ever missing
    // or throws, the browser must not GET-submit billing fields into the
    // URL and reload the page mid-checkout.
    e.preventDefault();
    window.handleBillingProfile?.(e);
  });

  document.addEventListener(
    "blur",
    (e) => {
      if (e.target?.dataset?.format === "phone") {
        window.formatPhone?.(e.target);
      }
    },
    true
  );
}