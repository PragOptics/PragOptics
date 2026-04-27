export function initWizardForms() {
  const form = document.getElementById("billingProfileForm");
  if (form) {
    form.addEventListener("submit", (e) => handleBillingProfile(e));
  }

  document.addEventListener("blur", (e) => {
    if (e.target?.dataset?.format === "phone") {
      formatPhone(e.target);
    }
  }, true);
}