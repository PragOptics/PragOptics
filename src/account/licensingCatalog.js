// src/account/licensingCatalog.js
//
// The Licenses card (2026-09-22, Cameron): the distributor's whole catalog,
// never cut down, made usable on a phone. A search box, a chip per kind of
// license, a filter for who it is for, a sort, and a count; the list shows
// twenty at a time. Each license is a compact row that opens into a card:
// the distributor's own description, the SKU, and the list price read live
// for that license when it opens. Add opens the order box inside that card:
// the owner buys; a role with "Ask for purchases" asks the owner (Part 1,
// 2026-09-23). The mailbox included with every team seat is never offered
// here (MINE M11): the server leaves it out, and so does this list.
//
// Kinds are read from the product's own name, so the list stays agnostic: whatever the distributor adds lands in a
// kind, or Other. Who a license is sold to is the server's answer (licensing L3a, decisions 37(6) and 37(7),
// 2026-09-24): Government licenses are never listed; Education and Nonprofit ones show Microsoft's approval instead of
// Add until the operator records Microsoft's yes, and the owner asks for it here.
//
//   GET  v1/environment/licensing/products/{id}/pricing   the offers (billing term, commitment, list price, rules) on
//                                                         the plan's term (decision 38), and what it needs first
//   POST v1/environment/licensing/qualification           the owner asks for Education or Nonprofit approval

import { tierName } from '../components/tierCopy.js';
import { explainLink } from '../components/explainer.js';
import { LIC_URL, lc, st, cardHtml, countWord, cap, money, dayWord, loadOffers, billWord, commitWord, ruleWords, perMonth, perms, isKiosk, errHtml, noteHtml, setNote, reqLead, call, send } from './licensingShared.js';
import { addHtml, canAdd } from './licensingOrders.js';
import { planTermLine, notForPlanLine } from './licensingMoney.js';
import { leadBtn } from './cards.js';

const PAGE = 20;
const KINDS = [
  ['all', 'All'], ['mail', 'Mail'], ['m365', 'Microsoft 365'], ['o365', 'Office 365'], ['copilot', 'Copilot'],
  ['security', 'Security'], ['teams', 'Teams and calling'], ['apps', 'Apps'], ['other', 'Other']
];
// decision 37(6): no Government licenses are sold, so there is no filter for them
const AUDIENCES = [['business', 'Business'], ['education', 'Education'], ['nonprofit', 'Nonprofit'], ['everyone', 'Everyone']];
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
/** Who a license is sold to: the server's segment (the operator's correction included), else its name. */
function audienceOf(p) {
  const s = String(p?.segment || '');
  if (s) return s === 'commercial' ? 'business' : s;
  const n = String(p?.name || '');
  if (/education|student|faculty|\bA[135]\b/i.test(n)) return 'education';
  if (/non-?profit/i.test(n)) return 'nonprofit';
  return 'business';
}
/** The name without the distributor's program suffix, and the flags that suffix and the name carry. */
function shape(p) {
  const raw = String(p.name || '');
  return {
    ...p, raw,
    title: raw.replace(/\s*\[New Commerce Experience\]\s*/i, ' ').replace(/\s{2,}/g, ' ').trim(),
    kind: kindOf(raw), aud: audienceOf(p),
    addOn: /add[- ]on/i.test(raw), trial: /\btrial\b/i.test(raw)
  };
}

function filtered() {
  const c = cs(), q = c.q.trim().toLowerCase();
  const all = (lc.view.catalog || []).filter(p => !isKiosk(p) && p.segment !== 'government').map(shape);
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
  // decision 38: nothing on the plan's term is said as that, never as "no price"
  if (got === null) return `<span class="adm-muted">${e(notForPlanLine(id) || 'No list price to order on right now.')}</span>`;
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
/**
 * The distributor's product links, grouped by what they mean. Pax8 names each group (on dev: UpgradesTo for the
 * licenses this one upgrades into); a name it has not used before is shown in its own words, never guessed.
 */
function requiresHtml(id) {
  const e = st.D.escapeHtml, groups = new Map(), held = new Set();
  for (const g of lc.requires[id] || []) {
    const label = /^upgradesto$/i.test(g.name) ? 'Upgrades to' : /requir|prereq|addonto|isaddon/i.test(g.name) ? 'Needs one of these first' : String(g.name).replace(/([a-z])([A-Z])/g, '$1 $2');
    const list = groups.get(label) || [];
    for (const p of g.products) list.push(String(p.name).replace(/\s*\[New Commerce Experience\]\s*/i, ' ').trim());
    groups.set(label, list);
    // licensing L3b: the server marks a base-license group this team already holds one of
    if (g.required === true && g.held === true) held.add(label);
  }
  return [...groups.entries()].map(([label, names]) => `<div class="lic-span"><span class="lic-k">${e(label)}</span><span class="lic-links">${e(names.slice(0, 4).join(', '))}${names.length > 4 ? `, and ${names.length - 4} more` : ''}${held.has(label) ? ' (you have one)' : ''}</span></div>`).join('');
}

/**
 * Licensing L3a (decision 37(7)): Education and Nonprofit licenses need Microsoft's approval of the business first. The
 * name only tells the tab to ask; nothing is ever ordered by a name. Where the approval stands, in words, and the owner's
 * Ask for approval; '' for a license anyone may buy, or once Microsoft approved (Add shows as usual).
 */
const SEG = {
  education: { noun: 'education licenses', who: 'schools and colleges it has approved', tail: 'Approval usually takes up to three business days.' },
  nonprofit: { noun: 'nonprofit licenses', who: 'organizations approved in its nonprofit program', tail: 'Register in Microsoft\'s nonprofit program first, then ask for approval here.' }
};
function approvalHtml(p) {
  const w = SEG[p.aud];
  if (!w) return '';
  const e = st.D.escapeHtml, q = lc.view?.qualifications?.[p.aud] || {}, owner = perms().isOwner;
  if (q.status === 'approved') return `<p class="lic-hint">${e(`Microsoft approved your business for ${w.noun}${dayWord(q.decidedAt) ? ` on ${dayWord(q.decidedAt)}` : ''}.`)}</p>`;
  if (q.status === 'asked') return `<p class="acct-card-note">${e(`Approval asked for on ${dayWord(q.askedAt) || 'an earlier day'}. We are handling it with Microsoft; the owner is emailed the answer.`)}</p>`;
  if (q.status === 'denied') return `<p class="acct-card-note ev-note is-bad">${e(`Microsoft did not approve your business for ${w.noun}. Ask support if you think this is wrong.`)}</p>`;
  const ask = owner && !lc.view?.readOnly && lc.view?.account
    ? `<div class="acct-actions-row">${reqLead(`qual:${p.aud}`, { lic: 'qual-ask' }, 'send', 'Ask for approval', 'Asking…', `data-segment="${e(p.aud)}"`, 'btn-primary')}</div>`
    : `<p class="lic-hint">${e(owner ? 'Open the licensing account above first, then ask for approval here.' : 'The owner asks for approval here.')}</p>`;
  return `<p class="acct-card-note">${e(`Microsoft sells ${w.noun} only to ${w.who}. ${w.tail}`)}</p>${ask}`;
}
/** Whether this license waits on Microsoft's approval before it can be bought or asked for. */
function awaitsApproval(p) { return !!SEG[p.aud] && lc.view?.qualifications?.[p.aud]?.status !== 'approved'; }

function rowHtml(p) {
  const e = st.D.escapeHtml, c = cs(), open = c.open === p.id;
  const kindWord = (KINDS.find(k => k[0] === p.kind) || [0, 'Other'])[1];
  const tags = [kindWord, p.aud !== 'business' ? (AUDIENCES.find(a => a[0] === p.aud) || [0, ''])[1] : '', p.addOn ? 'Needs a base license' : '', p.trial ? 'Trial' : ''].filter(Boolean);
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
            <div class="lic-span"><span class="lic-k">Price per license seat</span><div class="lic-item-prices">${priceHtml(p.id)}</div></div>
            ${requiresHtml(p.id)}
            ${p.sku ? `<div><span class="lic-k">SKU</span><span class="ev-code">${e(p.sku)}</span></div>` : ''}
          </div>
          ${approvalHtml(p)}
          ${canAdd() && !awaitsApproval(p) ? (lc.add && lc.add.productId === p.id ? addHtml() : `<div class="acct-actions-row">${perms().canBuy
            ? reqLead(`add-open:${p.id}`, { lic: 'add-open' }, 'plus', 'Add to my team', 'Reading the price…', `data-product="${e(p.id)}"`, 'btn-primary')
            : reqLead(`add-open:${p.id}`, { lic: 'add-open' }, 'send', 'Ask the owner to buy it', 'Reading the price…', `data-product="${e(p.id)}"`, 'btn-primary')}</div>`) : ''}
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
    ${more > 0 ? `<div class="acct-actions-row lic-more">${leadBtn({ lic: 'cat-more' }, 'chevron', `Show ${Math.min(PAGE, more)} more`)}</div>` : ''}`;
}

/** The line under the list: what is sold here and how, and what the person looking can do with it. */
function catalogNote(v) {
  const p = perms(), m = v.microsoft || {};
  // money plan item 7 and decision 38: plus sales tax, and on the plan's term
  const term = planTermLine();
  const base = `The mailbox that comes with each team seat is included in your plan and is not sold here. Everything here is a Microsoft license at Microsoft's list price per license seat${v.salesTax === false ? '' : ', plus sales tax'}, charged to the owner's card before it is ordered.${term ? ` ${term}` : ''}`;
  if (!v.account) return base;
  if (p.canBuy || p.canRequest) {
    if (!m.ready) {
      // only what is missing, said to whoever can do it: only the owner names the tenant; the agreement is accepted by
      // someone whose role has Accept agreements (decision 5)
      const named = !!(m.tenantId || m.domainPrefix);
      const agreed = !!m.mca && (!m.agreement || m.agreement.stands !== false);
      if (p.canBuy) {
        const todo = [!named ? 'name the Microsoft tenant' : '', !agreed ? 'accept the agreement' : ''].filter(Boolean);
        return todo.length ? `${base} ${cap(todo.join(' and '))} above, and Add appears in each license.` : base;
      }
      const waits = [!named ? 'the owner names the Microsoft tenant' : '', !agreed ? (p.canAccept ? 'you accept the agreement above' : 'someone who can accept agreements accepts the agreement') : ''].filter(Boolean);
      return waits.length ? `${base} Ask appears in each license once ${waits.join(' and ')}.` : `${base} You ask; nothing is bought until the owner approves it.`;
    }
    return p.canBuy ? base : `${base} You ask; nothing is bought until the owner approves it.`;
  }
  if (v.readOnly) return base;
  return `${base} The owner adds licenses, and can let your role ask for them on the Team tab.`;
}

export function catalogHtml() {
  const e = st.D.escapeHtml, v = lc.view, items = v.catalog, c = cs();
  if (!v.eligible) return '';
  const summary = items == null ? e(v.catalogCode === 'TIER' ? `from the ${tierName(v.minimumTier)} plan` : 'not open yet') : `${countWord(items.filter(p => !isKiosk(p)).length, 'license', 'licenses')} available`;
  const opt = (list, val) => list.map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${e(l)}</option>`).join('');
  const bodyHtml = items == null ? `<p class="acct-empty">${e(v.catalogNote || 'Nothing to show yet.')}</p>`
    : !items.length ? '<p class="acct-empty">No Microsoft licenses are listed right now. Try again in a moment.</p>'
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
      <p class="acct-card-note ev-note">${e(catalogNote(v))}</p>`;
  return cardHtml({
    key: 'catalog', icon: 'layers', title: 'Licenses', summary,
    explain: explainLink('licensing', 'Which license does what'),
    body: `${noteHtml('catalog')}${errHtml('catalog')}${bodyHtml}`
  });
}

/** Repaint the list alone, so the search box keeps its focus. */
function relist() { const host = document.getElementById('licCatList'); if (host) host.innerHTML = listHtml(); }

const reading = new Set();
/** A license's price, read once when its card opens; a card opened again while it is read waits for the same answer. */
async function readPrice(id) {
  if (!id || lc.prices[id] !== undefined || reading.has(id)) return;
  reading.add(id);
  try { await loadOffers(id); lc.err.catalog = ''; }
  catch (ex) { lc.err.catalog = ex?.data?.error || st.D.friendlyError(ex, 'The price could not be read.'); st.paint(); return; }
  finally { reading.delete(id); }
  relist();
}

/** The owner asks for Microsoft's approval to buy Education or Nonprofit licenses (licensing L3a, decision 37(7)). */
async function askApproval(btn) {
  const seg = btn.dataset.segment || '';
  if (!SEG[seg] || lc.busy) return;
  await send(`qual:${seg}`, 'Asking…', async () => {
    await call(`${LIC_URL}/qualification`, 'POST', { segment: seg });
    setNote('catalog', `Approval asked for ${SEG[seg].noun}. We are handling it with Microsoft; you are emailed the answer.`);
    await st.load();
  }, { errKey: 'catalog', fallback: 'The approval could not be asked for.', codes: { LICENSING_ACCOUNT_REQUIRED: 'Open the licensing account first.', OWNER_ONLY: 'The owner asks for approval.' } });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function catalogAction(a, btn) {
  const c = cs();
  if (a === 'qual-ask') { askApproval(btn); return true; }
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
