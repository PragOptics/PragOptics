// src/account/interestDesk.js
//
// LAUNCH INTEREST, slotted where the platform already keeps its commerce (2026-11-15, Cameron: "I HAVE ORDERS, CUSTOMERS,
// WARRANTY... YOU ARE SUPPOSED TO BE SLOTTING THE SHIT IN"): every "Notify me at launch" sign-up from pragoptics.com, read
// from GET v1/admin/shop/interest (functions/shopInterest.js), shown as a card on the Catalog desk under the products it is
// about, and counted on the Overview. Each sign-up also reached the operators by mail through the notifier's Launch
// interest event when it was filed. No desk of its own.
import { PRAG_API_BASE } from '../runtime/config.js';

const URL = `${PRAG_API_BASE}/admin/shop/interest`;
let D = null;
const e = (s) => D.escapeHtml(String(s ?? ''));

/** The rows grouped by product, each group newest first; pure. */
export function groupByProduct(items) {
  const groups = new Map();
  for (const it of items || []) {
    const key = it.product || it.productId || '(no product)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.entries()].map(([product, rows]) => ({ product, rows })).sort((a, b) => b.rows.length - a.rows.length || a.product.localeCompare(b.product));
}

/** The words for a count. */
export function countWords(n) { return n === 1 ? '1 sign-up' : `${n} sign-ups`; }

/** How many are waiting, for the Overview's card; throws when the read fails. */
export async function interestCount(apiFetch) {
  const d = await apiFetch(`${URL}?limit=1000`);
  return (d.items || []).length;
}

function tableHtml(rows) {
  return `<div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>When</th><th>Email</th><th>Name</th><th>Page</th><th>Reference</th></tr></thead><tbody>${rows.map(r => `<tr>
      <td>${e(D.fmtDate ? D.fmtDate(r.createdAt) : r.createdAt)}</td>
      <td><a href="mailto:${e(r.email)}">${e(r.email)}</a></td>
      <td>${e(r.name || '')}</td>
      <td>${e(r.page || '')}</td>
      <td><code>${e(r.ref)}</code>${r.notifiedOps ? '' : ' <span class="adm-note">(not mailed)</span>'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

/** The Catalog desk's card body: the sign-ups by product, newest first; an empty list and a refusal each in words. */
export async function renderInterestBlock(host, deps) {
  if (!host) return;
  D = deps;
  host.innerHTML = '<p class="adm-note">Loading…</p>';
  try {
    const d = await D.apiFetch(`${URL}?limit=500`);
    const items = d.items || [];
    if (!items.length) { host.innerHTML = `<p class="adm-empty">No sign-ups yet.</p>`; return; }
    host.innerHTML = groupByProduct(items).map(g => `<section class="adm-group"><h4 class="adm-card-h">${e(g.product)} <span class="adm-note">${e(countWords(g.rows.length))}</span></h4>${tableHtml(g.rows)}</section>`).join('');
  } catch (ex) { host.innerHTML = `<p class="adm-error">${e(D.friendlyError(ex, 'Could not read the sign-ups.'))}</p>`; }
}
