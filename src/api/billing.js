// src/api/billing.js

import { fetchJson } from "../api/client.js";

export async function handleBillingProfile({
  e,
  getStoredTokens,
  pragopticsToken,
  buildRequestedSubscription,
  BILLING_PROFILE_URL,
  startPaymentStep
}) {
  e.preventDefault();

  const stored = getStoredTokens();
  const accessToken = stored?.access_token || pragopticsToken;
  if (!accessToken) {
    alert("Please sign in first.");
    return;
  }

  const firstName = document.getElementById("bpFirstName")?.value?.trim();
  const lastName  = document.getElementById("bpLastName")?.value?.trim();
  if (!firstName || !lastName) {
    alert("Enter first and last name.");
    return;
  }

  const customerName = `${firstName} ${lastName}`;
  const cadence =
    document.querySelector('input[name="cadence"]:checked')?.value || "monthly";

  const addons = {
    domains: !!document.getElementById("aoDomains")?.checked,
    storage: !!document.getElementById("aoStorage")?.checked,
    flows:   !!document.getElementById("aoFlows")?.checked,
    api:     !!document.getElementById("aoApi")?.checked
  };

  const requestedSubscription = buildRequestedSubscription({
    subType: "user",
    cadence,
    addons
  });

  const payload = {
    customerName,
    primaryEmail: document.getElementById("bpEmail")?.value?.trim(),
    phone: document.getElementById("bpPhone")?.value?.trim() || "",
    addressLine1: document.getElementById("bpAddr1")?.value?.trim(),
    addressLine2: document.getElementById("bpAddr2")?.value?.trim() || "",
    city: document.getElementById("bpCity")?.value?.trim(),
    state: (document.getElementById("bpState")?.value || "").trim(),
    postalCode: document.getElementById("bpPostal")?.value?.trim(),
    country: document.getElementById("bpCountry")?.value?.trim(),
    organizationName:
      document.getElementById("bpOrg")?.value?.trim() || "",
    requestedSubscription
  };

  await fetchJson(BILLING_PROFILE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  await startPaymentStep(accessToken);
}


export async function startPaymentStep({
  accessToken,
  CHECKOUT_SESSION_URL,
  PING_URL,
  getStoredTokens,
  setDnaMode,
  gotoStep4,
  gotoStep5,
  pollUntilResolved
}) {
  let csResp;

  try {
    csResp = await fetchJson(CHECKOUT_SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({})
    });
  } catch (err) {
    if (err?.status === 409) {
      setDnaMode("fast", "Finalizing subscription…", "Creating subscription…");
      await pollUntilResolved();
      return;
    }
    throw err;
  }

  const clientSecret =
    csResp?.paymentIntentClientSecret || csResp?.clientSecret;
  if (!clientSecret) throw new Error("Missing Stripe client secret.");

  const key = window.STRIPE_PUBLISHABLE_KEY || "";
  if (!key) throw new Error("Stripe publishable key not configured.");

  const stripe = Stripe(key);
  const elements = stripe.elements({
    clientSecret,
    appearance: { theme: "night" }
  });

  document.getElementById("payment-element").innerHTML = "";
  const paymentEl = elements.create("payment");
  paymentEl.mount("#payment-element");

  document.getElementById("payNowBtn").disabled = false;
  document.getElementById("payNowBtn").onclick = async () => {
    const msg = document.getElementById("payMsg");
    msg.textContent = "Saving payment method…";

    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${location.origin}${location.pathname}?post=subscribe`
      },
      redirect: "if_required"
    });

    if (error) {
      msg.textContent = error.message || "Setup error.";
      return;
    }

    setDnaMode("fast", "Payment method saved…", "Creating subscription…");
    setTimeout(
      () =>
        gotoStep5(),
      250
    );

    await pollUntilResolved();
  };

  gotoStep4();
}


export async function pollUntilResolved({
  PING_URL,
  getStoredTokens,
  pragopticsToken,
  setDnaMode,
  onResolved
}) {
  const stored = getStoredTokens();
  const accessToken = stored?.access_token || pragopticsToken;
  if (!accessToken) return;

  const started = Date.now();
  const TIMEOUT = 60000;

  while (Date.now() - started < TIMEOUT) {
    await new Promise(r => setTimeout(r, 1500));

    const ping = await fetchJson(PING_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    sessionStorage.setItem("pragoptics_ping", JSON.stringify(ping));
    const status =
      (ping?.billingProfile?.status || "").toUpperCase();

    if (status === "ACTIVE") {
      setDnaMode("lock", "Activated ✅", "Launching console…");
      onResolved(ping);
      return;
    }

    if (status === "PAST_DUE" || status === "CANCELED") {
      setDnaMode(
        "idle",
        "Subscription issue",
        "Please review billing."
      );
      onResolved(ping);
      return;
    }
  }

  setDnaMode(
    "idle",
    "Still working…",
    "You can safely refresh."
  );
  
}
