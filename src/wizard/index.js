// src/wizard/index.js
import { normalizeCatalog } from "./catalog.normalize.js";

let wizardCatalog = null;
let selectedType = null;

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
export function gotoStep2(){ setStep("step2"); }
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
  syncWizardAuthIndicator(getStoredTokens);

  document.getElementById("platformFlow").style.display = "block";

  wizardCatalog = normalizeCatalog(ping?.productCatalog || []);

  renderSubTypeOptions(wizardCatalog, ping);
  renderAddonOptions();

  document
    .querySelectorAll('input[name="cadence"]')
    .forEach(r =>
      r.addEventListener("change", () => {
        updateAddonLabels();
        updatePriceSummary();
      })
    );

  applySubTypeUI();
  updatePriceSummary();
  prefillBillingProfileFromPing(ping);
}

export function applySubTypeUI() {
  renderAddonOptions();
  updatePriceSummary();
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
  set("bpOrg",    bp.organizationName || "");
  set("bpAddr1",  bp.addressLine1);
  set("bpAddr2",  bp.addressLine2);
  set("bpCity",   bp.city);
  set("bpState",  bp.state);
  set("bpPostal", bp.postalCode);
  set("bpCountry", bp.country || "US");
}

export function updatePriceSummary() {
  const summary = document.getElementById("priceSummary");
  if (!summary) return;

  const cadence =
    document.querySelector('input[name="cadence"]:checked')?.value || "monthly";
  const cadenceKey = cadence === "annual" ? "annual" : "monthly";

  if (!selectedType) {
    summary.textContent = "Select options to view an estimate.";
    return;
  }

  const baseAmt = wizardCatalog?.plans?.[selectedType]?.base?.[cadenceKey]?.amount;
  const baseText = baseAmt != null ? centsToUSD(baseAmt) : "—";

  //  role-driven add-ons (no partner hardcode)

  const addonsModel = getEffectiveAddonsForRole(selectedType);
  const hasAddons = Object.keys(addonsModel).length > 0;


  // Collect checked add-ons (only if add-ons exist for this role)
  let addonTotal = 0;
  const picked = [];

  if (hasAddons) {
    document
      .querySelectorAll('#addonOptions input[type="checkbox"][data-addon-key]')
      .forEach(box => {
        if (!box.checked) return;

        const key = box.dataset.addonKey;

        const amt = addonsModel?.[key]?.[cadenceKey]?.amount;
        if (amt != null) addonTotal += Number(amt);

        // show something derived from backend lookupKey (your preference)
        picked.push(addonLabelForKey(key));
      });
  }

  const totalCents =
    (baseAmt != null ? Number(baseAmt) : 0) + addonTotal;
  const totalText = (baseAmt != null || addonTotal > 0) ? centsToUSD(totalCents) : "—";

  // ✅ render pricing summary as kv rows in all cases
  summary.innerHTML = `
    <div class="kv">
      <div class="k">Plan</div>
      <div class="v">${String(selectedType).toUpperCase()}</div>
    </div>

    <div class="kv">
      <div class="k">Billing</div>
      <div class="v">${cadence.toUpperCase()}</div>
    </div>

    <div class="kv">
      <div class="k">Base</div>
      <div class="v">${baseText}</div>
    </div>

    ${
      hasAddons
        ? `
          <div class="kv">
            <div class="k">Add‑ons</div>
            <div class="v">${picked.length ? picked.join(", ") : "None"}</div>
          </div>
        `
        : ""
    }

    <div class="kv">
      <div class="k">Estimated Total</div>
      <div class="v"><strong>${totalText}</strong></div>
    </div>
  `;
}

function centsToUSD(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  return `$${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

// Map catalog addon keys to stable IDs, already used in code/intents.
// normalizeCatalog keys will be: api50k, domains, flows10k, storage5gb. 
function addonIdForKey(key) {
  if (key === "domains") return "aoDomains";
  if (key.startsWith("storage")) return "aoStorage";
  if (key.startsWith("flows")) return "aoFlows";
  if (key.startsWith("api")) return "aoApi";
  return `ao_${key}`; // fallback for future add-ons
}

function addonLabelForKey(key) {
  const role = selectedType;
  const model = getEffectiveAddonsForRole(role)?.[key] || {};
  const lk = model.monthly?.lookupKey || model.annual?.lookupKey || "";

  // use backend lookupKey, but strip cadence suffix and prefix for readability
  return lk
    ? lk.replace(/^po\./, "").replace(/\.(monthly|annual)$/, "")
    : key;
}

function renderAddonOptions() {
  const section = document.getElementById("addonSection");
  const host    = document.getElementById("addonOptions");
  if (!host || !section) return;

  const role = selectedType;
  if (!role) {
    section.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  
  const addons = getEffectiveAddonsForRole(role);
  const keys = Object.keys(addons);


  // ✅ Hide entire section if no add‑ons for this role
  if (!keys.length) {
    section.classList.add("hidden");
    host.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");

  host.innerHTML = keys.map(key => {
    const id = addonIdForKey(key);
    return `
      <div class="option-card login-panel" style="text-align:left;">
        <label>
          <input type="checkbox" id="${id}" data-addon-key="${key}">
          <span class="addon-label" data-addon-key="${key}">
            ${addonLabelForKey(key)}
          </span>
          <span class="muted addon-price" data-addon-key="${key}"></span>
        </label>
      </div>
    `;
  }).join("");

  updateAddonLabels();
  wireAddonEvents();
}

function updateAddonLabels() {
  const cadence =
    document.querySelector('input[name="cadence"]:checked')?.value || "monthly";

  const cadenceKey = cadence === "annual" ? "annual" : "monthly";
  const role = selectedType;
  const addons = getEffectiveAddonsForRole(role);

  Object.keys(addons).forEach(key => {
    const price = addons[key]?.[cadenceKey]?.amount;
    const priceText =
      price != null
        ? ` (${centsToUSD(price)}/${cadence === "annual" ? "yr" : "mo"})`
        : "";

    const priceEl =
      document.querySelector(`.addon-price[data-addon-key="${key}"]`);
    if (priceEl) priceEl.textContent = priceText;
  });
}

function wireAddonEvents() {
  const host = document.getElementById("addonOptions");
  if (!host) return;

  if (host.__addonEventsBound) return;
  host.__addonEventsBound = true;

  host.addEventListener("change", (e) => {
    const box = e.target?.closest?.('input[type="checkbox"][data-addon-key]');
    if (!box) return;
    updatePriceSummary();
  });
}

function renderSubTypeOptions(wizardCatalog, ping) {
  const host = document.getElementById("subTypeOptions");
  if (!host) return;

  const plans = wizardCatalog?.plans || {};
  const roles = Object.keys(plans).filter(r => plans[r]?.base);

  // If no catalog-derived roles, leave existing DOM alone
  if (!roles.length) return;

  const preferred =
    ping?.billingProfile?.requestedSubscription?.subType ||
    ping?.user?.tier ||
    null;

  host.innerHTML = roles.map(role => {
    const base = plans[role].base || {};
    const monthly = base.monthly?.amount;
    const annual  = base.annual?.amount;

    const monthlyText = monthly != null ? `${centsToUSD(monthly)}/${role}/mo` : "—";
    const annualText  = annual  != null ? `${centsToUSD(annual)}/${role}/yr` : "—";

    const checked = (preferred && String(preferred).toLowerCase() === role) ? "checked" : "";

    // Keep name="subType" contract intact for existing logic
    return `
      <label class="login-panel field" style="cursor:pointer;">
        <input type="radio" name="subType" value="${role}" style="margin-right:10px;" ${checked}>
        <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong>
        <div class="hint">
          Base:
          <strong>${monthlyText}</strong>
          <span class="muted">✦</span>
          <span class="muted">Annual:</span>
          <strong>${annualText}</strong>
        </div>
      </label>
    `;
  }).join("");

  // Re-bind Step 1 selection listeners (since we replaced the inputs)
  wireSubTypeEvents();
}

function wireSubTypeEvents() {
  selectedType =
    document.querySelector('input[name="subType"]:checked')?.value || null;

  const nextBtn = document.getElementById("toStep2");
  if (nextBtn) nextBtn.disabled = !selectedType;

  document.querySelectorAll('input[name="subType"]').forEach(r => {
    r.addEventListener("change", () => {
      selectedType = r.value;
      if (nextBtn) nextBtn.disabled = !selectedType;
      applySubTypeUI();
      updatePriceSummary();
    });
  });
}


function getEffectiveAddonsForRole(role) {
  const roleAddons = wizardCatalog?.plans?.[role]?.addons || {};
  const globalAddons = wizardCatalog?.globalAddons || {};

  const merged = { ...globalAddons };

  for (const [key, roleAddon] of Object.entries(roleAddons)) {
    if (!merged[key]) {
      merged[key] = roleAddon;
      continue;
    }

    // ✅ merge per cadence (monthly/annual)
    merged[key] = {
      ...merged[key],
      ...roleAddon
    };
  }

  return merged;
}
