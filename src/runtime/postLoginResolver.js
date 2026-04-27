// src/runtime/postLoginResolver.js

export function resolvePostLoginUI({ ping }) {
  // No ping or not authenticated
  if (!ping || !ping.billingProfile) {
    return {
      mode: "wizard",
      wizardStep: 1,
      banner: null,
      dna: null
    };
  }

  const status = String(ping.billingProfile.status || "").toUpperCase();

  switch (status) {
    case "PENDING_SUBSCRIPTION":
      return {
        mode: "wizard",
        wizardStep: 1,
        banner: null,
        dna: null
      };

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

    case "ACTIVE":
    case "PAST_DUE":
      return {
        mode: "billingLanding",
        urgent: status === "PAST_DUE"
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