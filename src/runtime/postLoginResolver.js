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
      // Subscription is the front end's final step. Environment provisioning
      // and account management live in the PragOptics software, so an active
      // subscriber always resolves to the console regardless of provisioning
      // state (ping.needsProvisioning is intentionally ignored here).
      return {
        mode: "console"
      };

    case "PAST_DUE":
      // A past-due account keeps its console access (the card problem is fixable
      // from Billing), but it lands with a banner pointing at the fix instead of
      // silently working until the next failed renewal.
      return {
        mode: "console",
        banner: "past-due"
      };

    default:
      // An unrecognized status on an account that ALREADY has a billing
      // profile must not be forced back through setup: the wizard's
      // checkout-session call would refuse the state that sent it there, a
      // closed loop with no exit. A profile in an unknown state resolves to
      // the console; only an account with no profile at all sets up.
      return ping.billingProfile
        ? { mode: "console" }
        : { mode: "wizard", wizardStep: 1, banner: null, dna: null };
  }
}
