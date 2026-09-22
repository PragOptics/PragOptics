// src/account/licensingCatalog.js
//
// The Licenses card (2026-09-22, Cameron): the distributor's whole catalog,
// never cut down, made usable on a phone. A search box, a chip per kind of
// license, a filter for who it is for, a sort, and a count; the list shows
// twenty at a time. Each license is a compact row that opens into a card:
// the distributor's own description, the SKU, and the list price read live
// for that license when it opens. Add opens the order box inside that card.
//
// Kinds and audiences are read from the product's own name, so the list
// stays agnostic: whatever the distributor adds lands in a kind, or Other.
//
//   GET v1/environment/licensing/products/{id}/pricing   the offers (billing term, commitment, list price, rules)
//                                                        and what it needs first, read when a card opens

import { tierName } from '../components/tierCopy.js';
import { explainLink } from '../components/explainer.js';
import { lc, st, cardHtml, countWord, money, loadOffers, billWord, commitWord, ruleWords, perMonth } from './licensingShared.js';
import { addHtml, canAdd } from './licensingOrders.js';

const PAGE = 20;
const KINDS = [
  ['all', 'All'], ['mail', 'Mail'], ['m365', 'Microsoft 365'], ['o365', 'Office 365'], ['copilot', 'Copilot'],
  ['security', 'Security'], ['teams', 'Teams and calling'], ['apps', 'Apps'], ['other', 'Other']
];
const AUDIENCES = [['business', 'Business'], ['education', 'Education'], ['government', 'Government'], ['nonprofit', 'Nonprofit'], ['everyone', 'Everyone']];
const SORTS = [['az', 'A to Z'], ['za', 'Z to A'], ['kind', 'By kind']];

/** The catalog's view state, kept across repaints. */
function cs() { return lc.cat || (lc.cat = { q: '', kind: 'all', aud: 'business', sort: 'az', shown: PAGE, open: '' }); }

/** What a license is, from its name. */
function kindOf(name) {
  const n = String(name || '');
  if (/exchange/i.test(n)) return 'mail';
  if (/copilot/i.test(n)) return 'copilot';
  if (/defender|entra|intune|purview|sentinel|security|compliance|information protection/i.test(n)) return 'security';
  if (/teams|phone|calling|audio conferenc/i.test(n)) return 'teams';
  if (/microsoft 365/i.test(n)) return 'm365';
  if (/office 365/i.test(n)) return 'o365';
  if (/visio|project|power bi|power apps|power automate|dynamics|windows|planner|viva|onedrive|sharepoint|clipchamp/i.test(n)) return 'apps';
  return 'other';
}
function audienceOf(name) {
  const n = String(name || '');
  if (/education|student|faculty|\bA[135]\b/i.test(n)) return 'education';
  if (/government|\bGCC\b/i.test(n)) return 'government';
  if (/non-?profit/i.test(n)) return 'nonprofit';
  return 'business';
}
/** The name without the distributor's program suffix, and the flags that suffix and the name carry. */
function shape(p) {
  const raw = String(p.name || '');
  return {
    ...p, raw,
    title: raw.replace(/\s*\[New Commerce Experience\]\s*/i, ' ').replace(/\s{2,}/g, ' ').trim(),
    kind: kindOf(raw), aud: audienceOf(raw),
    addOn: /add[- ]on/i.test(raw), trial: /\btrial\b/i.test(raw)
  };
}

function filtered() {
  const c = cs(), q = c.q.trim().toLowerCase();
  const all = (lc.view.catalog || []).map(shape);
  let list = all.filter(p => (c.kind === 'all' || p.kind === c.kind) && (c.aud === 'everyone' || p.aud === c.aud)
    && (!q || `${p.raw} ${p.sku || ''} ${p.description || ''}`.toLowerCase().includes(q)));
  const order = KINDS.map(k => k[0]);
  list.sort((a, b) => c.sort === 'za' ? b.title.localeCompare(a.title)
    : c.sort === 'kind' ? (order.indexOf(a.kind) - order.indexOf(b.kind)) || a.title.localeCompare(b.title)
    : a.title.localeCompare(b.title));
  return { all, list };
}

function priceHtml(id) {
  const e = st.D.escapeHtml, got = lc.prices[id];
  if (got === undefined) return '<span class="adm-muted">Reading the price…</span>';
  if (got === null) return '<span class="adm-muted">No list price given; priced at order.</span>';
  return got.map(o => {
    const rule = ruleWords(o);
    return `<div class="lic-offer ${o.available ? '' : 'is-off'}"><span class="lic-price"><strong>${e(money(o.list))}</strong> <span class="adm-muted">${e(billWord(o.billingTerm))}</span></span><span class="lic-offer-terms">${e(commitWord(o))}${rule ? `; ${e(rule)}` : ''}${o.available ? '' : '; not orderable yet'}</span></div>`;
  }).join('');
}
function fromPrice(id) {
  const got = lc.prices[id];
  if (!got || !got.length) return '';
  const low = Math.min(...got.filter(o => o.available !== false).map(perMonth));
  return Number.isFinite(low) ? `<span class="lic-from">from ${st.D.escapeHtml(money(low))} a month</span>` : '';
}
function requiresHtml(id) {
  const e = st.D.escapeHtml, r = lc.requires[id] || [];
  const names = r.flatMap(x => x.products.map(p => p.name)).slice(0, 4);
  return names.length ? `<div><span class="lic-k">Needs one of these first</span><span>${e(names.join(', '))}</span></div>` : '';
}

function rowHtml(p) {
  const e = st.D.escapeHtml, c = cs(), open = c.open === p.id;
  const kindWord = (KINDS.find(k => k[0] === p.kind) || [0, 'Other'])[1];
  const tags = [kindWord, p.aud !== 'business' ? (AUDIENCES.find(a => a[0] === p.aud) || [0, ''])[1] : '', p.addOn ? 'Add-on' : '', p.trial ? 'Trial' : ''].filter(Boolean);
  return `
    <div class="lic-item ${open ? 'is-open' : ''}">
      <button class="lic-item-head" type="button" data-lic-action="cat-open" data-product="${e(p.id)}" aria-expanded="${open}">
        <span class="lic-item-name">${e(p.title)}</span>
        <span class="lic-item-meta">${tags.map(t => `<span class="lic-tag">${e(t)}</span>`).join('')}${fromPrice(p.id)}</span>
      </button>
      ${open ? `
        <div class="lic-item-body">
          ${p.description ? `<p class="lic-item-desc">${e(p.description)}</p>` : ''}
          <div class="lic-item-facts">
            <div class="lic-span"><span class="lic-k">Price per seat</span><div class="lic-item-prices">${priceHtml(p.id)}</div></div>
            ${requiresHtml(p.id)}
            ${p.sku ? `<div><span class="lic-k">SKU</span><span class="ev-code">${e(p.sku)}</span></div>` : ''}
          </div>
          ${canAdd() ? (lc.add && lc.add.productId === p.id ? addHtml() : `<div class="acct-actions-row"><button class="btn" type="button" data-lic-action="add-open" data-product="${e(p.id)}" ${lc.saving ? 'disabled' : ''}>Add to my team</button></div>`) : ''}
        </div>` : ''}
    </div>`;
}

function listHtml() {
  const { all, list } = filtered(), c = cs(), e = st.D.escapeHtml;
  const shown = list.slice(0, c.shown);
  const more = list.length - shown.length;
  return `
    <p class="lic-hint lic-cat-count">${e(`${list.length} of ${all.length}`)}</p>
    ${shown.length ? `<div class="lic-list">${shown.map(rowHtml).join('')}</div>` : '<p class="acct-empty">Nothing matches. Clear the search or choose All.</p>'}
    ${more > 0 ? `<div class="acct-actions-row lic-more"><button class="btn btn-sm" type="button" data-lic-action="cat-more">Show ${Math.min(PAGE, more)} more</button></div>` : ''}`;
}

export function catalogHtml() {
  const e = st.D.escapeHtml, v = lc.view, items = v.catalog, c = cs();
  const summary = items == null ? e(v.catalogCode === 'TIER' ? `from the ${tierName(v.minimumTier)} plan` : 'not open yet') : `${countWord(items.length, 'license', 'licenses')} available`;
  const opt = (list, val) => list.map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${e(l)}</option>`).join('');
  const bodyHtml = items == null ? `<p class="acct-empty">${e(v.catalogNote || 'Nothing to show yet.')}</p>`
    : !items.length ? '<p class="acct-empty">The distributor listed no Microsoft licenses. Try again in a moment.</p>'
    : `
      <div class="lic-cat-tools">
        <input class="acct-input lic-cat-q" id="licCatQ" type="search" placeholder="Search licenses" value="${e(c.q)}" autocomplete="off" aria-label="Search licenses">
        <div class="ev-tabs lic-cat-kinds" role="tablist" aria-label="Kind of license">${KINDS.map(([k, l]) => `<button class="ev-tab ${c.kind === k ? 'is-on' : ''}" type="button" role="tab" aria-selected="${c.kind === k}" data-lic-action="cat-kind" data-kind="${k}">${e(l)}</button>`).join('')}</div>
        <div class="lic-cat-selects">
          <label><span class="lic-k">For</span><select class="acct-input" id="licCatAud">${opt(AUDIENCES, c.aud)}</select></label>
          <label><span class="lic-k">Sort</span><select class="acct-input" id="licCatSort">${opt(SORTS, c.sort)}</select></label>
        </div>
      </div>
      <div id="licCatList">${listHtml()}</div>
      <p class="acct-card-note ev-note">The mailbox that comes with each seat is included in the plan. Anything else here is an add-on at Microsoft's list price per seat, before tax, charged to your card first.${canAdd() ? '' : ' Save the Microsoft details above and Add appears in each license.'}</p>`;
  return cardHtml({
    key: 'catalog', icon: 'layers', title: 'Licenses', summary,
    explain: explainLink('licensing', 'Which license does what'),
    body: `<p class="acct-error" id="licCatalogError" hidden></p>${bodyHtml}`
  });
}

/** Repaint the list alone, so the search box keeps its focus. */
function relist() { const host = document.getElementById('licCatList'); if (host) host.innerHTML = listHtml(); }

async function readPrice(id) {
  if (!id || lc.prices[id] !== undefined) return;
  try { await loadOffers(id); }
  catch (ex) { st.D.showError('licCatalogError', ex?.data?.error || st.D.friendlyError(ex, 'The price could not be read.')); }
  relist();
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function catalogAction(a, btn) {
  const c = cs();
  if (a === 'cat-kind') { c.kind = btn.dataset.kind || 'all'; c.shown = PAGE; for (const b of document.querySelectorAll('[data-lic-action="cat-kind"]')) { const on = b.dataset.kind === c.kind; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); } relist(); return true; }
  if (a === 'cat-more') { c.shown += PAGE; relist(); return true; }
  if (a === 'cat-open') {
    const id = btn.dataset.product || '';
    c.open = c.open === id ? '' : id;
    if (lc.add && lc.add.productId !== c.open) lc.add = null;
    relist();
    if (c.open) { readPrice(c.open); document.querySelector(`.lic-item.is-open`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    return true;
  }
  return false;
}

let qTimer = 0;
/** The search box, the audience and the sort. */
export function catalogInput(e) {
  const t = e.target, c = cs();
  if (!t) return;
  if (t.id === 'licCatQ') { c.q = String(t.value || ''); c.shown = PAGE; clearTimeout(qTimer); qTimer = setTimeout(relist, 120); return; }
  if (t.id === 'licCatAud') { c.aud = t.value; c.shown = PAGE; relist(); return; }
  if (t.id === 'licCatSort') { c.sort = t.value; relist(); return; }
}
