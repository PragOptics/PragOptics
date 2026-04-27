// src/billing/billingLanding.js

export function renderBillingLanding({ containerId, billingProfile, catalog }) {
  const host = document.getElementById(containerId);
  if (!host) return;

  host.querySelector(".billing-landing")?.remove();

  const status = String(billingProfile.status || "").toUpperCase();

  const card = document.createElement("div");
  card.className = "billing-landing";

  card.innerHTML = `
    <section class="billing-current">
      <div class="billing-status-row">
        <span class="billing-status-text">Subscription Status:</span>
        <div class="billing-status ${status}">${status}</div>
      </div>
    </section>

    <section class="billing-current">
      <h3>Current Plan</h3>
      <div class="billing-plan-summary">
        ${renderPlanSummary(billingProfile, catalog)}
      </div>
    </section>

    <section class="billing-catalog">
      <h3>Available Plans & Add‑Ons</h3>
      <div class="billing-catalog-grid">
        ${renderCatalog(catalog, billingProfile)}
      </div>
    </section>

    <section class="billing-actions">
      ${renderActions(status)}
    </section>
  `;

  host.appendChild(card);
}


function renderPlanSummary(billingProfile, catalog) {
  if (!billingProfile.requestedSubscription) {
    return `<div class="muted">No subscription details available.</div>`;
  }

  let sub = billingProfile.requestedSubscription;

// Backward compatibility: allow string or object
if (typeof sub === "string") {
  try {
    sub = JSON.parse(sub);
  } catch {
    return `<div class="muted">Invalid subscription format.</div>`;
  }
}

if (!sub || typeof sub !== "object") {
  return `<div class="muted">No subscription details available.</div>`;
}

  const cadence = (sub.cadence || "monthly").toUpperCase();
  const type = (sub.subType || "user").toUpperCase();
  const addons = sub.addons || {};

  const addonList = Object.entries(addons)
    .filter(([, enabled]) => enabled)
    .map(([k]) => `<li>${k}</li>`)
    .join("") || "<li>No add-ons</li>";

  const addonPills = Object.entries(addons)
  .map(([name, enabled]) => {
    return `
      <span class="pill ${enabled ? "pill-enabled" : "pill-disabled"}">
        ${name}
      </span>
    `;
  })
  .join("");


return `
  <div class="plan-card">

    <div class="kv">
      <div class="k">Plan</div>
      <div class="v">${type}</div>
    </div>

    <div class="kv">
      <div class="k">Billing Cycle</div>
      <div class="v">${cadence}</div>
    </div>

    <div class="kv">
      <div class="k">Add-ons</div>
      <div class="v">
        ${addonPills || `<span class="muted">None</span>`}
      </div>
    </div>

  </div>
`;
}


function renderActions(status) {
  switch (status) {
    case "ACTIVE":
      return `
        <button class="btn-primary" data-action="upgrade">Upgrade / Downgrade</button>
        <button class="btn-secondary" data-action="payment">Update Payment Method</button>
        <button class="btn-danger" data-action="cancel">Cancel Subscription</button>
      `;

    case "PAST_DUE":
      return `
        <button class="btn-primary" data-action="retry">Retry Payment</button>
        <button class="btn-secondary" data-action="payment">Update Payment Method</button>
      `;

    case "CANCELED":
      return `
        <button class="btn-primary" data-action="restart">Restart Subscription</button>
      `;

    default:
      return "";
  }
}

function renderCatalog(catalog = [], billingProfile) {
  if (!Array.isArray(catalog) || !catalog.length) {
    return `<div class="muted">No additional plans available.</div>`;
  }

  // Group by Stripe product
  const groups = catalog.reduce((acc, item) => {
    acc[item.productId] ??= [];
    acc[item.productId].push(item);
    return acc;
  }, {});

  return Object.values(groups)
    .map(group => renderCatalogCard(group, billingProfile))
    .join("");
}

function renderCatalogCard(prices, billingProfile) {
  const base = prices[0];

  return `
    <div class="catalog-card glass">
      <div class="catalog-header">
        <strong>${humanizeLookup(base.lookupKey)}</strong>
        <span class="catalog-info" aria-hidden="true">✦</span>
      </div>

      <div class="catalog-prices">
        ${prices.map(p => `
          <div class="catalog-price">
            <span>${p.interval}</span>
            <strong>$${(Number(p.amount) / 100).toFixed(0)}</strong>
          </div>
        `).join("")}
      </div>

    </div>
  `;
}

function humanizeLookup(key = "") {
  return key
    .replace(/^po\./, "")
    .replace(/\./g, " ")
    .replace(/\b(monthly|annual)\b/i, "")
    .trim();
}
