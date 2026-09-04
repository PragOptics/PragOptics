// src/components/tierCards.js
//
// The subscription offer as a horizontal card gallery: every tier the live
// catalog carries (plus Free), what each includes, its real price, one clear
// action. Shown on the warranty success screens (register + redeem) to hand a
// happy customer the platform, and reusable anywhere else the offer belongs.
//
// Paid tiers are DERIVED FROM THE CATALOG on the signed-in ping - a tier the
// catalog prices is a tier the gallery shows, so Super appears the moment its
// prices exist and nothing here goes stale. Signed-out visitors see the cards
// with feature lists; the price line invites them in. Selecting a paid tier
// stashes the preference and routes into the account + wizard path.

// Display copy (Free baseline, each paid tier, canonical order) is the shared
// tierCopy.js, the same copy the plan selector renders. Prices always come
// from the catalog.
import { FREE_TIER, TIER_COPY, TIER_ORDER } from './tierCopy.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function centsToUSD(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return (n % 100 === 0) ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}

function cachedPing() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}

/** Paid tiers present in the catalog, in canonical order, with live monthly
 *  prices. The lookup key itself names the tier (po.<tier>.<plan>.monthly). */
function catalogTiers() {
  const rows = cachedPing()?.productCatalog || [];
  const byTier = {};
  for (const r of rows) {
    if (String(r.active) === 'false') continue;   // retired in Stripe: never advertised
    const m = String(r.lookupKey || '').match(/^po\.([a-z0-9]+)\.(?!.*addon)[a-z0-9]+\.monthly$/);
    if (!m || m[1] === 'addon') continue;
    byTier[m[1]] = centsToUSD(r.amount);
  }
  const ids = Object.keys(byTier).sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return ids.map(id => ({ id, price: byTier[id] }));
}

function cardHtml({ id, name, tag, features, featured, cta, price, cadence, currentTier }) {
  const isCurrent = currentTier === id;
  const ctaHtml = isCurrent
    ? `<button class="ph-btn ph-btn-ghost tc-cta" type="button" disabled>Your plan</button>`
    : id === 'free'
      ? `<button class="ph-btn ph-btn-ghost tc-cta" type="button" disabled>Included</button>`
      : `<button class="ph-btn ${featured ? '' : 'ph-btn-ghost'} tc-cta" type="button" data-tc-select="${esc(id)}">${esc(cta || `Start with ${name}`)}</button>`;
  return `
    <article class="tc-card ${featured ? 'is-featured' : ''}" data-tier="${esc(id)}">
      ${featured ? '<span class="tc-flag">Most popular</span>' : ''}
      <header class="tc-card-head">
        <span class="tc-name">${esc(name)}</span>
        <span class="tc-tag muted">${esc(tag)}</span>
      </header>
      <div class="tc-price">
        ${price
          ? `<span class="tc-amount">${esc(price)}</span><span class="tc-cadence muted">${esc(cadence)}</span>`
          : `<span class="tc-amount tc-amount-soft">Sign in for pricing</span>`}
      </div>
      <ul class="tc-features">
        ${features.map(f => `<li>${esc(f)}</li>`).join('')}
      </ul>
      ${ctaHtml}
    </article>
  `;
}

export function tierCardsHtml({ heading = 'Add the platform', sub = 'Optional, cancel anytime. Your warranty never depends on it.' } = {}) {
  const currentTier = String(cachedPing()?.user?.tier || '').toLowerCase() || null;
  const paid = catalogTiers();

  // Signed out (or catalog unavailable): the known trio still shows, priced
  // as an invitation to sign in rather than a number.
  const tiers = paid.length
    ? paid
    : TIER_ORDER.map(id => ({ id, price: null }));

  const cards = [
    cardHtml({ ...FREE_TIER, price: '$0', cadence: 'forever', currentTier }),
    ...tiers.map(({ id, price }) => {
      const copy = TIER_COPY[id] || { name: id.charAt(0).toUpperCase() + id.slice(1), tag: '', features: [] };
      return cardHtml({ id, ...copy, price, cadence: 'per month', currentTier });
    })
  ];

  return `
    <section class="tc-wrap" aria-label="Subscription tiers">
      <div class="tc-head">
        <h3 class="tc-h">${esc(heading)}</h3>
        <p class="tc-sub muted">${esc(sub)}</p>
      </div>
      <div class="tc-grid">${cards.join('')}</div>
    </section>
  `;
}

/** Wire a container holding one tierCardsHtml block. Selecting a paid tier
 *  stashes the preference for the wizard and routes into the account path. */
export function bindTierCards(root) {
  if (!root || root._tcBound) return;
  root._tcBound = true;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tc-select]');
    if (!btn || btn.disabled) return;
    const tier = btn.dataset.tcSelect;
    // An existing SUBSCRIBER changes plan in Billing (the proration-aware
    // path), never through signup. Everyone else goes through the agreement
    // and the wizard, which reads the stashed preference.
    const ping = cachedPing();
    const subscribed = !!ping?.user && String(ping?.user?.tier || 'free').toLowerCase() !== 'free';
    if (subscribed) {
      window.presetAccountSection?.('subscription');
      window.setAppMode?.('account');
      return;
    }
    try { localStorage.setItem('pragoptics_wizard_tier_pref', tier); } catch { /* fine */ }
    // Same path the warranty account flow uses: the agreement gates account
    // creation, and the wizard it opens into reads the stashed preference.
    window.setAppMode?.('landing');
    setTimeout(() => { window.openAgreementModal?.(); }, 250);
  });
}
