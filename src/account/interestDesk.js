// src/account/interestDesk.js
//
// LAUNCH INTEREST, the operator's desk (2026-11-15): every "Notify me at launch" sign-up from pragoptics.com, newest first,
// read from GET v1/admin/shop/interest (functions/shopInterest.js). Each one also reached the operators by mail through the
// notifier's Launch interest event when it was filed; this is the list to work from when a product ships.
import { PRAG_API_BASE } from '../runtime/config.js';
import { iconBtn, busy } from './cards.js';

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

/** The desk's words for a count. */
export function countWords(n) { return n === 1 ? '1 sign-up' : `${n} sign-ups`; }

function tableHtml(rows) {
  return `<table class="adm-table"><thead><tr><th>When</th><th>Email</th><th>Name</th><th>Page</th><th>Reference</th></tr></thead><tbody>${rows.map(r => `<tr>
      <td>${e(D.fmtDate ? D.fmtDate(r.createdAt) : r.createdAt)}</td>
      <td><a href="mailto:${e(r.email)}">${e(r.email)}</a></td>
      <td>${e(r.name || '')}</td>
      <td>${e(r.page || '')}</td>
      <td><code>${e(r.ref)}</code>${r.notifiedOps ? '' : ' <span class="adm-note">(not mailed)</span>'}</td>
    </tr>`).join('')}</tbody></table>`;
}

export async function renderInterestDesk(main, deps) {
  D = deps;
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Launch interest</h2><div class="ev-actions">${iconBtn({ interest: 'refresh' }, 'refresh', 'Refresh', 'id="liRefresh"')}</div></header>
    <p class="adm-note">Everyone who pressed Notify me at launch on pragoptics.com, by product, newest first. Each sign-up also reached you by mail when it was filed (Launch interest in your notifications).</p>
    <p class="adm-error" id="liError" hidden></p>
    <div id="liBody"><p class="adm-note">Loading…</p></div>`;
  const host = document.getElementById('liBody');
  const load = async () => {
    try {
      const d = await D.apiFetch(`${URL}?limit=500`);
      const items = d.items || [];
      if (!items.length) { host.innerHTML = `<p class="adm-empty">No sign-ups yet.</p>`; return; }
      host.innerHTML = groupByProduct(items).map(g => `<section class="adm-group"><h3 class="adm-sub">${e(g.product)} <span class="adm-note">${e(countWords(g.rows.length))}</span></h3>${tableHtml(g.rows)}</section>`).join('');
    } catch (ex) { host.innerHTML = ''; D.showError('liError', D.friendlyError(ex, 'Could not read the sign-ups.')); }
  };
  document.getElementById('liRefresh')?.addEventListener('click', (ev) => { const btn = ev.currentTarget; if (btn.disabled) return; const done = busy(btn, 'Loading…'); load().finally(done); });
  await load();
}
