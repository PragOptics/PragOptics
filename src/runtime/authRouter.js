// src/runtime/postLoginResolver.js

export function resolvePostLoginUI({ ping }) {
  // No ping yet — do not force UI transitions
  if (!ping) {
    return {
      mode: "none"
    };
  }

  const userStatus = String(ping?.user?.status || "").toUpperCase();
  const billingStatus = String(ping?.billingProfile?.status || "").toUpperCase();

  const needsBillingSetup = ping?.needsBillingSetup === true;
  const needsProvisioning = ping?.needsProvisioning === true;


  if (needsBillingSetup || userStatus !== "ACTIVE") {
    switch (billingStatus) {
      case "PAYMENT_PENDING":
        return {
          mode: "wizard",
          wizardStep: 5,
          banner: null,
          dna: {
            speed: "fast",
            title: "Finalizing subscription…",
            subtitle: "Confirming with Stripe…"
          }
        };

      case "CANCELED":
        return {
          mode: "wizard",
          wizardStep: 1,
          banner: "canceled",
          dna: null
        };

      case "PENDING_PROFILE":
      case "PENDING_SUBSCRIPTION":
      default:
        return {
          mode: "wizard",
          wizardStep: 1,
          banner: null,
          dna: null
        };
    }
  }

  if (needsProvisioning) {
    return {
      mode: "provisioningWizard"
    };
  }

  return {
    mode: "console"
  };
}
