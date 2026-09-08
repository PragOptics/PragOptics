// src/components/tierCards.js
//
// The subscription offer as a horizontal card gallery: Free plus every tier
// the live catalog carries, what each includes, its real price, one clear
// action. Shown on the landing (the plans section), on the redemption success
// screen, and reusable anywhere else the offer belongs.
//
// Paid tiers are DERIVED FROM THE CATALOG: the signed-in ping carries it, and
// a visitor who is not signed in gets the same rows from the public prices
// route (GET v1/catalog/prices, active plan prices only). A tier the catalog
// prices is a tier the gallery shows, so Super appears the moment its prices
// exist and nothing here goes stale. Selecting a tier routes into the account
// path: a visitor through the agreement and signup, a signed-in owner into
// the billing wizard, a subscriber into Billing.

// Display copy (Free baseline, each paid tier, canonical order) is the shared
// tierCopy.js, the same copy the plan selector renders. Prices always come
// from the catalog.
import { FREE_TIER, TIER_COPY, TIER_ORDER } from './tierCopy.js';
import { PRAG_API_BASE } from '../runtime/config.js';

const PRICES_KEY = 'pragoptics_prices_v1';
const PRICES_TTL_MS = 10 * 60 * 1000;
let pricesInFlight = null;

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

/** Signed in means a valid access token, never a leftover ping payload. */
function signedInNow() {
  try {
    if (typeof window.isAccessTokenValid === 'function') return !!window.isAccessTokenValid();
    return !!JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token;
  } catch { return false; }
}

/** The ping payload, only while a session is live; a visitor gets null. */
function cachedPing() {
  if (!signedInNow()) return null;
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}

function cachedPublicRows() {
  try {
    const c = JSON.parse(sessionStorage.getItem(PRICES_KEY) || 'null');
    if (c && Array.isArray(c.rows) && Date.now() - Number(c.at || 0) < PRICES_TTL_MS) return c.rows;
  } catch { /* storage blocked: fetch again */ }
  return null;
}

/** Public plan prices for a visitor who is not signed in. One request per ten
 *  minutes per tab; a lane without the route caches an empty list so the cards
 *  fall back to their invitation instead of retrying. Never rejects. */
export function loadPublicPrices() {
  const hit = cachedPublicRows();
  if (hit) return Promise.resolve(hit);
  if (pricesInFlight) return pricesInFlight;
  pricesInFlight = fetch(`${PRAG_API_BASE}/catalog/prices`, { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : { productCatalog: [] }))
    .then(d => (Array.isArray(d?.productCatalog) ? d.productCatalog : []))
    .catch(() => [])
    .then(rows => {
      try { sessionStorage.setItem(PRICES_KEY, JSON.stringify({ at: Date.now(), rows })); } catch { /* fine */ }
      pricesInFlight = null;
      return rows;
    });
  return pricesInFlight;
}

/** The catalog rows to price from: the signed-in ping first, else the public cache. */
function catalogRows() {
  const fromPing = cachedPing()?.productCatalog;
  if (Array.isArray(fromPing) && fromPing.length) return fromPing;
  return cachedPublicRows() || [];
}

/** Paid tiers present in the catalog, in canonical order, with live monthly
 *  prices. The lookup key itself names the tier (po.<tier>.<plan>.monthly). */
function catalogTiers() {
  const byTier = {};
  for (const r of catalogRows()) {
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

function cardHtml({ id, name, tag, features, featured, cta, price, cadence, currentTier, signedIn }) {
  const isCurrent = currentTier === id;
  let ctaHtml;
  if (isCurrent) {
    ctaHtml = `<button class="ph-btn ph-btn-ghost tc-cta" type="button" disabled>Your plan</button>`;
  } else if (id === 'free') {
    // A visitor starts free through the same agreement and signup path as
    // every other tier; a signed-in owner already has it.
    ctaHtml = signedIn
      ? `<button class="ph-btn ph-btn-ghost tc-cta" type="button" disabled>Included</button>`
      : `<button class="ph-btn ph-btn-ghost tc-cta" type="button" data-tc-select="free">Start free</button>`;
  } else {
    ctaHtml = `<button class="ph-btn ${featured ? '' : 'ph-btn-ghost'} tc-cta" type="button" data-tc-select="${esc(id)}">${esc(cta || `Start with ${name}`)}</button>`;
  }
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

/** The gallery markup. An empty heading leaves the head out (the host section
 *  carries its own, as on the landing). */
export function tierCardsHtml({ heading = 'Add the platform', sub = 'Optional, cancel anytime. Your warranty never depends on it.' } = {}) {
  const ping = cachedPing();
  const signedIn = !!ping?.user;
  const currentTier = signedIn ? (String(ping.user.tier || 'free').toLowerCase() || 'free') : null;
  const paid = catalogTiers();

  // Catalog unavailable (no session and no public prices yet): the known trio
  // still shows, priced as an invitation to sign in rather than a number.
  const tiers = paid.length
    ? paid
    : TIER_ORDER.map(id => ({ id, price: null }));

  const cards = [
    cardHtml({ ...FREE_TIER, price: '$0', cadence: 'forever', currentTier, signedIn }),
    ...tiers.map(({ id, price }) => {
      const copy = TIER_COPY[id] || { name: id.charAt(0).toUpperCase() + id.slice(1), tag: '', features: [] };
      return cardHtml({ id, ...copy, price, cadence: 'per month', currentTier, signedIn });
    })
  ];

  const head = heading
    ? `<div class="tc-head">
        <h3 class="tc-h">${esc(heading)}</h3>
        ${sub ? `<p class="tc-sub muted">${esc(sub)}</p>` : ''}
      </div>`
    : '';

  return `
    <section class="tc-wrap" aria-label="Subscription tiers">
      ${head}
      <div class="tc-grid">${cards.join('')}</div>
    </section>
  `;
}

/** Wire a container holding one tierCardsHtml block. Selecting a tier routes
 *  into the right path for who is looking. */
export function bindTierCards(root) {
  if (!root || root._tcBound) return;
  root._tcBound = true;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tc-select]');
    if (!btn || btn.disabled) return;
    const tier = btn.dataset.tcSelect;
    const ping = cachedPing();
    const signedIn = !!ping?.user;
    const subscribed = signedIn && String(ping.user.tier || 'free').toLowerCase() !== 'free';
    // An existing SUBSCRIBER changes plan in Billing (the proration-aware
    // path), never through signup.
    if (subscribed) {
      window.presetAccountSection?.('subscription');
      window.setAppMode?.('account');
      return;
    }
    try {
      if (tier === 'free') localStorage.removeItem('pragoptics_wizard_tier_pref');
      else localStorage.setItem('pragoptics_wizard_tier_pref', tier);
    } catch { /* fine */ }
    // A signed-in Free owner goes straight to the billing wizard, which reads
    // the stashed preference.
    if (signedIn) {
      (window.openWizardFromMenu?.() || window.setAppMode?.('wizard'));
      return;
    }
    // Everyone else: the agreement gates account creation, and the wizard it
    // opens into reads the stashed preference.
    window.setAppMode?.('landing');
    setTimeout(() => { window.openAgreementModal?.(); }, 250);
  });
}

/** Render the gallery into a host and bind it. A visitor's cards repaint once
 *  the public prices land, so the numbers are real without a sign-in. */
export function mountTierCards(host, opts = {}) {
  const el = typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  const paint = () => { el.innerHTML = tierCardsHtml(opts); };
  paint();
  bindTierCards(el);
  if (!catalogTiers().length) {
    loadPublicPrices().then(rows => { if (rows.length && el.isConnected) paint(); });
  }
}
