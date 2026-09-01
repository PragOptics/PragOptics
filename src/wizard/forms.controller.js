export function initWizardForms() {
  const form = document.getElementById("billingProfileForm");

  if (form) {
    form.addEventListener("submit", (e) => {
      // Always block the native submit FIRST: if the handler is ever missing
      // or throws, the browser must not GET-submit billing fields into the
      // URL and reload the page mid-checkout.
      e.preventDefault();
      window.handleBillingProfile?.(e);
    });
  }

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