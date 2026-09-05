// src/components/pricingCards.js
//
// The plan selector: modern tier cards driven entirely by the live catalog
// (ping.productCatalog rows synced from Stripe). One component serves the
// wizard's plan step and the account panel's change-plan surface, so the
// offer can never drift between them.
//
// mountPricingSelect(host, { catalog, initial, onChange }) renders a cadence
// toggle, one card per base plan, the add-on toggles (user plan only, the
// same gate the backend enforces at activation), and a running total.
// Returns { get, set } where get() -> { subType, cadence, addons, totalCents,
// lookupKeys }.

import { normalizeCatalog } from '../wizard/catalog.normalize.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function usd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  const d = n / 100;
  return (n % 100 === 0) ? `$${d.toLocaleString('en-US')}` : `$${d.toFixed(2)}`;
}

// Display copy (names, taglines, what each plan includes) is the shared
// tierCopy.js, the same copy the warranty tier gallery renders. Prices always
// come from the catalog rows.
import { TIER_COPY, ADDON_COPY, TIER_ORDER } from './tierCopy.js';

// The state key the backend understands per normalized add-on key.
const ADDON_STATE_KEY = { domains: 'domains', storage5gb: 'storage', flows10k: 'flows', api50k: 'api' };

// The add-ons actually sold. Domains and flows stay in the catalog, in
// ADDON_COPY, and in the state shape so accounts that already hold them
// still render in the account panel; they are just not offered here.
const OFFERED_ADDONS = new Set(['storage5gb', 'api50k']);

export function mountPricingSelect(host, { catalog = [], initial = {}, onChange } = {}) {
  const model = normalizeCatalog(catalog);
  const roles = Object.keys(model.plans).filter(r => model.plans[r]?.base);
  roles.sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  const addonsModel = { ...model.globalAddons, ...(model.plans.user?.addons || {}) };
  const addonKeys = Object.keys(addonsModel).filter(k => OFFERED_ADDONS.has(k));

  const state = {
    subType: roles.includes(initial.subType) ? initial.subType : null,
    cadence: initial.cadence === 'annual' ? 'annual' : 'monthly',
    addons: {
      domains: !!initial.addons?.domains,
      storage: !!initial.addons?.storage,
      flows: !!initial.addons?.flows,
      api: !!initial.addons?.api
    }
  };

  function priceFor(role, cadence) {
    return model.plans[role]?.base?.[cadence]?.amount ?? null;
  }
  function addonPrice(key, cadence) {
    return addonsModel[key]?.[cadence]?.amount ?? null;
  }

  // Annual savings, measured from the catalog itself: the largest whole-percent
  // discount across tiers that have both cadences. Shown only when real.
  function annualSavingsPct() {
    let best = 0;
    for (const r of roles) {
      const m = priceFor(r, 'monthly'), a = priceFor(r, 'annual');
      if (m != null && a != null && m > 0) {
        best = Math.max(best, Math.round((1 - a / (m * 12)) * 100));
      }
    }
    return best > 0 ? best : null;
  }

  function selection() {
    const cadence = state.cadence;
    const base = state.subType ? priceFor(state.subType, cadence) : null;
    let total = base ?? 0;
    const lookupKeys = [];
    if (state.subType) {
      const baseLk = model.plans[state.subType]?.base?.[cadence]?.lookupKey;
      if (baseLk) lookupKeys.push(baseLk);
    }
    // Only add-ons the User plan can actually buy in this cadence are
    // reported: a toggle left on from another cadence, or on a plan that
    // takes no add-ons, must not send a boolean the backend has no price for.
    const addonsOut = { domains: false, storage: false, flows: false, api: false };
    if (state.subType === 'user') {
      for (const key of addonKeys) {
        const sk = ADDON_STATE_KEY[key] || key;
        if (!state.addons[sk]) continue;
        const amt = addonPrice(key, cadence);
        if (amt == null) continue;
        addonsOut[sk] = true;
        total += Number(amt);
        const lk = addonsModel[key]?.[cadence]?.lookupKey;
        if (lk) lookupKeys.push(lk);
      }
    }
    return {
      subType: state.subType,
      cadence,
      addons: addonsOut,
      totalCents: state.subType != null && base != null ? total : null,
      lookupKeys
    };
  }

  function cardHtml(role) {
    const copy = TIER_COPY[role] || { name: role.charAt(0).toUpperCase() + role.slice(1), tag: '', features: [] };
    const cadence = state.cadence;
    const amt = priceFor(role, cadence);
    const monthly = priceFor(role, 'monthly');
    const selected = state.subType === role;
    const per = cadence === 'annual' ? '/yr' : '/mo';
    const equiv = (cadence === 'annual' && amt != null)
      ? `${usd(Math.round(amt / 12))}/mo, billed yearly`
      : (monthly != null ? '' : '');
    // This tier's OWN annual saving, not the best across tiers.
    const save = (cadence === 'annual' && amt != null && monthly != null && monthly > 0)
      ? Math.round((1 - amt / (monthly * 12)) * 100) : 0;
    return `
      <article class="pc-card ${copy.featured ? 'is-featured' : ''} ${selected ? 'is-selected' : ''}" data-pc-tier="${esc(role)}">
        ${copy.featured ? '<span class="pc-flag">Popular</span>' : ''}
        <!-- div, not <header>: the global header{position:fixed} rule grabs
             every header ELEMENT and would pin the card titles over the nav -->
        <div class="pc-card-head">
          <span class="pc-name">${esc(copy.name)}</span>
          ${copy.tag ? `<span class="pc-tag muted">${esc(copy.tag)}</span>` : ''}
        </div>
        <div class="pc-price">
          ${amt != null
            ? `<span class="pc-amount">${esc(usd(amt))}</span><span class="pc-per muted">${per}</span>${save > 0 ? ` <span class="pc-save">Save ${save}%</span>` : ''}`
            : `<span class="pc-amount pc-amount-soft">Not offered ${cadence === 'annual' ? 'yearly' : 'monthly'}</span>`}
        </div>
        ${equiv ? `<span class="pc-equiv muted">${esc(equiv)}</span>` : ''}
        <ul class="pc-features">
          ${copy.features.map(f => `<li>${esc(f)}</li>`).join('')}
        </ul>
        <button class="${selected ? 'cta' : 'btn'} pc-choose" type="button" data-pc-choose="${esc(role)}" ${amt == null ? 'disabled' : ''}>
          ${selected ? 'Selected' : `Choose ${esc(copy.name)}`}
        </button>
      </article>
    `;
  }

  function addonCardHtml(key) {
    const copy = ADDON_COPY[key] || { name: key, blurb: '' };
    const sk = ADDON_STATE_KEY[key] || key;
    const on = !!state.addons[sk];
    const amt = addonPrice(key, state.cadence);
    const per = state.cadence === 'annual' ? '/yr' : '/mo';
    // An add-on with no price in this cadence cannot be chosen: it would add
    // nothing to the total and send a boolean the backend has no price for.
    const offered = amt != null;
    return `
      <button class="pc-addon ${on && offered ? 'is-on' : ''}" type="button" data-pc-addon="${esc(sk)}" aria-pressed="${on && offered}" ${offered ? '' : 'disabled'}>
        <span class="pc-addon-top">
          <span class="pc-addon-name">${esc(copy.name)}</span>
          <span class="pc-addon-price">${offered ? `+${esc(usd(amt))}${per}` : `Not offered ${state.cadence === 'annual' ? 'yearly' : 'monthly'}`}</span>
        </span>
        ${copy.blurb ? `<span class="pc-addon-blurb muted">${esc(copy.blurb)}</span>` : ''}
        <span class="pc-addon-check" aria-hidden="true">${on && offered ? '✓ Added' : 'Add'}</span>
      </button>
    `;
  }

  function totalHtml() {
    const sel = selection();
    if (!sel.subType) return `<span class="muted">Pick a plan to see your total.</span>`;
    const copy = TIER_COPY[sel.subType] || { name: sel.subType };
    const addonCount = sel.subType === 'user'
      ? Object.values(sel.addons).filter(Boolean).length : 0;
    const per = sel.cadence === 'annual' ? '/yr' : '/mo';
    const label = `${copy.name} plan${addonCount ? ` + ${addonCount} add-on${addonCount === 1 ? '' : 's'}` : ''}`;
    return `
      <span class="pc-total-label">${esc(label)}</span>
      <span class="pc-total-amount">${sel.totalCents != null ? esc(usd(sel.totalCents)) + per : ''}</span>
    `;
  }

  function render() {
    const pct = annualSavingsPct();
    host.innerHTML = `
      <div class="pc-wrap">
        <div class="pc-toggle" role="group" aria-label="Billing cadence">
          <button type="button" class="pc-toggle-btn ${state.cadence === 'monthly' ? 'is-active' : ''}" data-pc-cadence="monthly">Monthly</button>
          <button type="button" class="pc-toggle-btn ${state.cadence === 'annual' ? 'is-active' : ''}" data-pc-cadence="annual">
            Annual${pct ? ` <span class="pc-save">up to ${pct}% off</span>` : ''}
          </button>
        </div>
        <div class="pc-grid">
          ${roles.map(cardHtml).join('')}
        </div>
        ${addonKeys.length ? `
          <div class="pc-addons ${state.subType === 'user' ? '' : 'hidden'}" id="pcAddons">
            <span class="pc-addons-h">Add-ons for the User plan</span>
            <span class="pc-addons-note muted">Add-ons scale the User plan. Partner and Super include higher limits, so upgrading removes any add-ons.</span>
            <div class="pc-addon-grid">
              ${addonKeys.map(addonCardHtml).join('')}
            </div>
          </div>
        ` : ''}
        <div class="pc-total">${totalHtml()}</div>
      </div>
    `;
  }

  function emit() {
    render();
    onChange?.(selection());
  }

  if (!host._pcBound) {
    host._pcBound = true;
    host.addEventListener('click', (e) => {
      const cad = e.target.closest('[data-pc-cadence]');
      if (cad) {
        state.cadence = cad.dataset.pcCadence === 'annual' ? 'annual' : 'monthly';
        // A tier with no price in the new cadence cannot stay selected: the
        // selection would carry no base lookup key and the backend would 409
        // on a price that does not exist.
        if (state.subType && priceFor(state.subType, state.cadence) == null) state.subType = null;
        emit();
        return;
      }
      const choose = e.target.closest('[data-pc-choose]');
      if (choose && !choose.disabled) { state.subType = choose.dataset.pcChoose; emit(); return; }
      const addon = e.target.closest('[data-pc-addon]');
      if (addon && !addon.disabled) {
        const k = addon.dataset.pcAddon;
        state.addons[k] = !state.addons[k];
        emit();
      }
    });
  }

  render();

  return {
    get: selection,
    set(next = {}) {
      if (next.subType !== undefined) state.subType = roles.includes(next.subType) ? next.subType : null;
      if (next.cadence) state.cadence = next.cadence === 'annual' ? 'annual' : 'monthly';
      if (next.addons) {
        for (const k of ['domains', 'storage', 'flows', 'api']) {
          if (next.addons[k] !== undefined) state.addons[k] = !!next.addons[k];
        }
      }
      emit();
    }
  };
}
