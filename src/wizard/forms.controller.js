export function initWizardForms() {
  const form = document.getElementById("billingProfileForm");

  if (form) {
    form.addEventListener("submit", (e) =>
      window.handleBillingProfile?.(e)
    );
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