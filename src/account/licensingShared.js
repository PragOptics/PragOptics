// src/account/licensingShared.js
//
// What the Licensing section's modules share (2026-09-22): the route, the
// tab's state, the team-aware url and body, the card wrapper and the words
// for terms and statuses. licensing.js owns the read and the paint and hands
// them over in `st` at render; licensingOrders.js calls them through it.

import { PRAG_API_BASE } from '../runtime/config.js';
import { cardHtml as sharedCard } from './cards.js';

export const LIC_URL = `${PRAG_API_BASE}/environment/licensing`;
const TEAM_KEY = 'pragoptics_team_id';

/** The tab's state: the view read, what is busy, the prices read per product, the add box, the note under the licenses. */
export const lc = { view: null, busy: false, note: '', prices: {}, requires: {}, pricing: '', add: null, saving: '', msEdit: false, lineNote: '', needPhone: false, msMode: '' };
/** The deps the panel hands in (apiFetch, escapeHtml, showError, friendlyError, fmtDate) and the section's paint and load. */
export const st = { D: null, paint: () => {}, load: async () => {} };

export const TERM_NAMES = { Monthly: 'a month', Annual: 'a year', '2-Year': 'two years', '3-Year': 'three years' };
export const RENEW_WORDS = { Monthly: 'each month', Annual: 'each year', '2-Year': 'every two years', '3-Year': 'every three years' };
export const STATUS_WORDS = { CHARGING: 'charging', PAID: 'paid, ordering', ORDERED: 'ordered, provisioning', ACTIVE: 'active', ENDING: 'ending', CANCELED: 'ended', FAILED: 'refused, refunded' };

export function cardHtml(o) { return sharedCard({ ...o, key: `licensing:${o.key}` }); }
export function countWord(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
export function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
export function money(n) { return `$${Number(n || 0).toFixed(2)}`; }
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
export function url(path, extra = {}) {
  const u = new URL(path);
  const t = teamId(); if (t) u.searchParams.set('tenant', t);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
export function body(obj) { const t = teamId(); return JSON.stringify({ ...(t ? { tenant: t } : {}), ...obj }); }

/* ---------- a license's offers (2026-09-22): one per billing term and commitment, from the pricing route ---------- */

const BILL_MONTHS = { Monthly: 1, Annual: 12, '2-Year': 24, '3-Year': 36 };
/** The offers from the route's answer; an older backend answers terms only, so they are derived the same way. */
export function offersFrom(d) {
  if (Array.isArray(d?.options)) return d.options;
  const priced = (d?.terms || []).filter(t => (t.rates || []).length);
  const committed = new Set(priced.filter(t => t.commitmentMonths > 0).map(t => t.billingTerm));
  const seen = new Set();
  return priced.filter(t => t.commitmentMonths > 0 || !committed.has(t.billingTerm))
    .map(t => ({ key: `${t.billingTerm}:${t.commitmentMonths || 0}`, billingTerm: t.billingTerm, commitmentMonths: t.commitmentMonths || 0, list: t.rates[0].list, canDecrease: true, canCancelEarly: true, cancelFee: false, available: true }))
    .filter(o => !seen.has(o.key) && seen.add(o.key))
    .sort((a, b) => (a.commitmentMonths - b.commitmentMonths) || ((BILL_MONTHS[a.billingTerm] || 99) - (BILL_MONTHS[b.billingTerm] || 99)));
}
/** Read a license's offers once; null when it has none to order on. */
export async function loadOffers(id) {
  if (!id || lc.prices[id] !== undefined) return lc.prices[id];
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/products/${encodeURIComponent(id)}/pricing`));
    const offers = offersFrom(d);
    lc.prices[id] = offers.length ? offers : null;
    lc.requires[id] = Array.isArray(d?.requires) ? d.requires : [];
  } catch (ex) { lc.prices[id] = null; throw ex; }
  return lc.prices[id];
}
/** "a month", "a year", "every two years". */
export function billWord(term) { return { Monthly: 'a month', Annual: 'a year', '2-Year': 'every two years', '3-Year': 'every three years' }[term] || String(term || '').toLowerCase(); }
/** The commitment in words: month to month, a 1-year commitment. */
export function commitWord(o) {
  const m = Number(o?.commitmentMonths || 0);
  if (m <= 1) return 'month to month';
  if (m % 12 === 0) return `${m / 12}-year commitment`;
  return `${m}-month commitment`;
}
/** What the commitment means for the customer, in a few words; empty when nothing is held back. */
export function ruleWords(o) {
  const out = [];
  const longer = Number(o?.commitmentMonths || 0) > (BILL_MONTHS[o?.billingTerm] || 1);
  if (!o?.canDecrease && longer) out.push('seats go down only when it ends');
  if (!o?.canCancelEarly && Number(o?.commitmentMonths || 0) > 1) out.push('it cannot end before the commitment does');
  if (o?.cancelFee) out.push('ending early has a fee');
  return out.join('; ');
}
/** The price per month, to compare offers. */
export function perMonth(o) { return Number(o?.list || 0) / (BILL_MONTHS[o?.billingTerm] || 1); }
