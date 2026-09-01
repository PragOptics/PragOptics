// src/components/tierCards.js
//
// The subscription offer, shown as modern tier cards: what each tier includes,
// its price when the catalog is available, and one obvious action. Used on the
// warranty success screens (register + redeem) to hand a happy customer the
// platform, and reusable anywhere else the offer belongs.
//
// Prices come from the signed-in ping's productCatalog when present
// (po.<role>.base.monthly rows). Signed-out visitors still see the cards with
// the feature lists; the price line simply invites them in. Selecting a paid
// tier stashes the preference and routes into the account + wizard path.

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    tag: 'For every owner',
    lookupKey: null,
    priceLabel: '$0',
    cadence: 'forever',
    features: [
      'Warranty registration and transfers',
      'All PragOptics software, free to run',
      'Product docs, print profiles, and schematics',
      'Community support'
    ],
    cta: 'You are here'
  },
  {
    id: 'user',
    name: 'User',
    tag: 'The platform',
    lookupKey: 'po.user.base.monthly',
    cadence: 'per month',
    featured: true,
    features: [
      'Everything in Free',
      'Cloud sync for field data and calibration records',
      'API access with your own keys',
      'Provisioned workspace and storage',
      'Email support'
    ],
    cta: 'Start with User'
  },
  {
    id: 'partner',
    name: 'Partner',
    tag: 'Build on PragOptics',
    lookupKey: 'po.partner.premium.monthly',
    cadence: 'per month',
    features: [
      'Everything in User',
      'Publish your own APIs under the platform',
      'Usage billed through your subscription',
      'Your commerce stays yours',
      'Priority support'
    ],
    cta: 'Start with Partner'
  }
];

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

/** Best-effort live price for a lookup key from the stored ping catalog. */
function catalogPrice(lookupKey) {
  if (!lookupKey) return null;
  try {
    const ping = JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null');
    const row = (ping?.productCatalog || []).find(r => r.lookupKey === lookupKey);
    return row ? centsToUSD(row.amount) : null;
  } catch { return null; }
}

export function tierCardsHtml({ heading = 'Add the platform', sub = 'Optional, cancel anytime. Your warranty never depends on it.' } = {}) {
  return `
    <section class="tc-wrap" aria-label="Subscription tiers">
      <div class="tc-head">
        <h3 class="tc-h">${esc(heading)}</h3>
        <p class="tc-sub muted">${esc(sub)}</p>
      </div>
      <div class="tc-grid">
        ${TIERS.map(t => {
          const price = t.priceLabel || catalogPrice(t.lookupKey);
          return `
            <article class="tc-card ${t.featured ? 'is-featured' : ''}" data-tier="${esc(t.id)}">
              ${t.featured ? '<span class="tc-flag">Most popular</span>' : ''}
              <header class="tc-card-head">
                <span class="tc-name">${esc(t.name)}</span>
                <span class="tc-tag muted">${esc(t.tag)}</span>
              </header>
              <div class="tc-price">
                ${price
                  ? `<span class="tc-amount">${esc(price)}</span><span class="tc-cadence muted">${esc(t.cadence)}</span>`
                  : `<span class="tc-amount tc-amount-soft">Sign in for pricing</span>`}
              </div>
              <ul class="tc-features">
                ${t.features.map(f => `<li>${esc(f)}</li>`).join('')}
              </ul>
              <button class="ph-btn ${t.featured ? '' : 'ph-btn-ghost'} tc-cta" type="button"
                      data-tc-select="${esc(t.id)}" ${t.id === 'free' ? 'disabled' : ''}>
                ${esc(t.cta)}
              </button>
            </article>
          `;
        }).join('')}
      </div>
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
    try { localStorage.setItem('pragoptics_wizard_tier_pref', tier); } catch { /* fine */ }
    // Same path the warranty account flow uses: the agreement gates account
    // creation, and the wizard it opens into reads the stashed preference.
    window.setAppMode?.('landing');
    setTimeout(() => { window.openAgreementModal?.(); }, 250);
  });
}
