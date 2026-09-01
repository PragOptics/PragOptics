// src/wizard/index.js
//
// Wizard glue. Step 1 is the shared plan selector (pricingCards.js): tier
// cards, cadence toggle, and add-ons in one surface, priced from the live
// catalog on the ping. The selection is read back by api/billing.js when the
// billing profile is created.

import { mountPricingSelect } from "../components/pricingCards.js";

let pricing = null; // the mounted selector; null until initPostLoginWizard

export function formatPhone(input) {
  let digits = (input.value || "").replace(/\D/g, '').substring(0, 10);
  if (digits.length === 10) {
    const area = digits.substring(0,3),
          mid  = digits.substring(3,6),
          last = digits.substring(6);
    input.value = `+1 (${area}) ${mid}-${last}`;
    input.dataset.raw = digits;
  } else {
    input.value = digits;
    input.dataset.raw = digits;
  }
}

export function gotoStep1(){ setStep("step1"); }
// The old cadence/add-on step merged into step 1; anything still navigating
// to "2" lands on the plan surface instead of a blank screen.
export function gotoStep2(){ setStep("step1"); }
export function gotoStep3(){ setStep("step3"); }
export function gotoStep4(){ setStep("step4"); }
export function gotoStep5(){ setStep("step5"); }

export function setStep(id){
  document.querySelectorAll(".wizard .step")
    .forEach(s => s.classList.remove("is-active"));
  document.getElementById(id)?.classList.add("is-active");
}

export function buildRequestedSubscription({ subType, cadence, addons }) {
  return {
    subType,
    cadence,
    addons: { ...(addons || {}) }
  };
}

/** The current plan selection, for the billing-profile submit. */
export function getPricingSelection() {
  return pricing?.get() || null;
}

export function syncWizardAuthIndicator(getStoredTokens) {
  const indicator = document.getElementById("authIndicator");
  if (!indicator) return;

  const ok =
    typeof window.isAccessTokenValid === "function"
      ? window.isAccessTokenValid()
      : !!getStoredTokens?.()?.access_token;

  indicator.classList.toggle("signed-in", ok);
}

export function initPostLoginWizard(accessToken, ping) {
  if (window.__wizardInit) return;
  window.__wizardInit = true;

  // Initial auth indicator sync (TTL-aware)
  syncWizardAuthIndicator();

  document.getElementById("platformFlow").style.display = "block";

  const host = document.getElementById("pricingSelect");
  if (host) {
    // A tier chosen elsewhere (tier cards, the account panel) preselects
    // here. One-shot: consumed on read so a stale pick never haunts a later
    // run. Falls back to the plan already on the billing profile.
    let tierPref = null;
    try {
      tierPref = localStorage.getItem("pragoptics_wizard_tier_pref");
      if (tierPref) localStorage.removeItem("pragoptics_wizard_tier_pref");
    } catch { /* storage blocked */ }

    const requested = ping?.billingProfile?.requestedSubscription || null;
    const initial = {
      subType: tierPref || requested?.subType || null,
      cadence: requested?.cadence || "monthly",
      addons: requested?.addons || {}
    };

    const nextBtn = document.getElementById("toStep2");
    pricing = mountPricingSelect(host, {
      catalog: ping?.productCatalog || [],
      initial,
      onChange: (sel) => { if (nextBtn) nextBtn.disabled = !sel.subType; }
    });
    if (nextBtn) nextBtn.disabled = !pricing.get().subType;
  }

  prefillBillingProfileFromPing(ping);
}

export function prefillNameFields(fullName) {
  if (!fullName) return;

  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return;

  const first = parts.shift() || "";
  const last  = parts.join(" ");

  const f = document.getElementById("bpFirstName");
  const l = document.getElementById("bpLastName");

  if (f && !f.value) f.value = first;
  if (l && !l.value) l.value = last;
}

export function prefillBillingProfileFromPing(ping) {
  const bp = ping?.billingProfile;
  if (!bp) return;

  prefillNameFields(bp.customerName);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null && val !== "" && !el.value) {
      el.value = String(val);
    }
  };

  set("bpEmail",  bp.primaryEmail);
  set("bpPhone",  bp.phone);
  set("bpAddr1",  bp.addressLine1);
  set("bpAddr2",  bp.addressLine2);
  set("bpCity",   bp.city);
  set("bpState",  bp.state);
  set("bpPostal", bp.postalCode);
  set("bpCountry", bp.country || "US");
}
