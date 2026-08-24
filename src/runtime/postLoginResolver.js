// src/runtime/postLoginResolver.js
export function resolvePostLoginUI({ ping }) {
  if (!ping) {
    return {
      mode: "none"
    };
  }

  const billingStatus = String(ping?.billingProfile?.status || "").toUpperCase();
  const needsBillingSetup = ping?.needsBillingSetup === true;

  if (!ping.billingProfile || needsBillingSetup) {
    return {
      mode: "wizard",
      wizardStep: 1,
      banner: null,
      dna: null
    };
  }

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
      return {
        mode: "wizard",
        wizardStep: 1,
        banner: null,
        dna: null
      };

    case "ACTIVE":
    case "PAST_DUE":
      // Subscription is the front end's final step. Environment provisioning
      // and account management live in the PragOptics software, so an active
      // subscriber always resolves to the console regardless of provisioning
      // state (ping.needsProvisioning is intentionally ignored here).
      return {
        mode: "console"
      };

    default:
      return {
        mode: "wizard",
        wizardStep: 1,
        banner: null,
        dna: null
      };
  }
}
