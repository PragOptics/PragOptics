// src/account/arrivalsBlock.js
//
// NOT ACKNOWLEDGED, on the Overview (2026-11-15, Cameron: "i want to, from the overview, be able to see any of the requests
// that i have not specifically acknowledged, whether im getting emailed or not, i need to know that i have acted."). Every
// arrival that still waits on him, across the desks: visitor messages and support requests (the Support desk), site reports
// (Anomalies), launch sign-ups (the Catalog desk). Read from GET v1/admin/arrivals (functions/adminArrivals.js), newest first.
// Acknowledge marks it (who, when) through POST v1/admin/arrivals/{kind}/{id}/ack and the row leaves the list; nobody is mailed.
// A message, request or report closed on its desk is acted on too and never shows here. On a lane that does not carry the
// route yet the block stays empty and silent.
import { PRAG_API_BASE } from '../runtime/config.js';

const URL = `${PRAG_API_BASE}/admin/arrivals`;
let D = null;
const e = (s) => D.escapeHtml(String(s ?? ''));

export const KIND_WORDS = Object.freeze({ contact: 'Visitor message', support: 'Support request', anomaly: 'Site report', interest: 'Launch sign-up' });

/** The words for a kind; pure. */
export function kindWords(kind) { return KIND_WORDS[kind] || 'Request'; }

/** The desk a kind lives on; pure. */
export function sectionOf(kind) { return kind === 'interest' ? 'catalog' : kind === 'anomaly' ? 'reports' : 'support'; }

/** The words for the count; pure. */
export function countWords(n) { return n === 0 ? 'Everything that arrived is acted on.' : n === 1 ? '1 request you have not acted on' : `${n} requests you have not acted on`; }

/** The count for the Overview's tile; null when the lane does not carry the route; throws on any other failure. */
export async function arrivalsCount(apiFetch) {
  try { const d = await apiFetch(URL); return Number(d.count ?? (d.items || []).length) || 0; }
  catch (ex) { if (ex && (ex.status === 404 || ex.status === 405)) return null; throw ex; }
}

function rowHtml(a) {
  return `<tr data-arrival="${e(a.kind)}:${e(a.id)}">
      <td>${e(D.fmtDate ? D.fmtDate(a.at) : a.at)}</td>
      <td>${e(kindWords(a.kind))}</td>
      <td><code>${e(a.ref)}</code></td>
      <td>${e(a.who)}</td>
      <td>${e(a.summary)}</td>
      <td class="adm-actions-cell">
        <button class="btn btn-sm btn-lead btn-primary" type="button" data-ack="${e(a.kind)}:${e(a.id)}" data-tip="Mark that you have acted on this. Nobody is mailed.">Acknowledge</button>
        <a class="btn btn-sm btn-lead" href="#account?section=${e(sectionOf(a.kind))}">Open</a>
      </td>
    </tr>`;
}

/** The Overview's block: the arrivals that wait, each with Acknowledge and Open; empty and silent where the lane lacks the route. */
export async function renderArrivalsBlock(host, deps) {
  if (!host) return;
  D = deps;
  let items;
  try { const d = await D.apiFetch(`${URL}`); items = d.items || []; }
  catch (ex) { if (ex && (ex.status === 404 || ex.status === 405)) { host.innerHTML = ''; return; } host.innerHTML = `<div class="adm-card" style="margin-top:12px;"><h3 class="adm-card-h">Not yet acknowledged</h3><p class="adm-error">${e(D.friendlyError(ex, 'Could not read the arrivals.'))}</p></div>`; return; }
  const paint = () => {
    host.innerHTML = `
      <div class="adm-card" style="margin-top:12px;">
        <h3 class="adm-card-h">Not yet acknowledged <span class="adm-note" id="admArrivalsCount">${e(countWords(items.length))}</span></h3>
        <p class="adm-note">Every message, request, report and launch sign-up you have not acted on, newest first. Acknowledge marks it as seen by you (nobody is mailed); closing one on its desk counts too.</p>
        ${items.length ? `<div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>When</th><th>What</th><th>Reference</th><th>From</th><th>Words</th><th></th></tr></thead><tbody>${items.map(rowHtml).join('')}</tbody></table></div>` : ''}
      </div>`;
  };
  paint();
  host.onclick = async (ev) => {
    const b = ev.target.closest('[data-ack]'); if (!b || b.disabled) return;
    const [kind, id] = String(b.dataset.ack).split(':');
    b.disabled = true; b.textContent = 'Marking…';
    try {
      await D.apiFetch(`${URL}/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/ack`, { method: 'POST', body: '{}' });
      items = items.filter(a => !(a.kind === kind && a.id === id));
      paint();
    } catch (ex) { b.disabled = false; b.textContent = 'Acknowledge'; const c = host.querySelector('#admArrivalsCount'); if (c) c.textContent = D.friendlyError(ex, 'Could not mark it.'); }
  };
}
