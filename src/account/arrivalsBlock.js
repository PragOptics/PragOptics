// src/account/arrivalsBlock.js
//
// NOT YET ACKNOWLEDGED, on the admin Overview (2026-11-15, Cameron: "i want to, from the overview, be able to see any of the
// requests that i have not specifically acknowledged, whether im getting emailed or not, i need to know that i have acted."). Every
// arrival that still waits on him, across the desks: visitor messages and support requests (the Support desk), site reports
// (Anomalies), launch sign-ups (the Catalog desk). Read from GET v1/admin/arrivals (functions/adminArrivals.js), newest first.
// Acknowledge marks one (who, when) through POST v1/admin/arrivals/{kind}/{id}/ack and the row leaves the list; nobody is mailed.
// Acknowledge all marks every one listed, one after another. A message, request or report closed on its desk is acted on too and
// never shows here. The same row shape as the environment's Home card (his rule of the day: clean, one shape, nothing to scroll
// sideways), the newest five shown with the rest behind one press. On a lane without the route the block stays empty and silent.
import { PRAG_API_BASE } from '../runtime/config.js';

const URL = `${PRAG_API_BASE}/admin/arrivals`;
const FIRST = 5;
let D = null;
const e = (s) => D.escapeHtml(String(s ?? ''));

export const KIND_WORDS = Object.freeze({ contact: 'Visitor message', support: 'Support request', anomaly: 'Site report', interest: 'Launch sign-up' });

/** The words for a kind; pure. */
export function kindWords(kind) { return KIND_WORDS[kind] || 'Request'; }

/** The desk a kind lives on; pure. */
export function sectionOf(kind) { return kind === 'interest' ? 'catalog' : kind === 'anomaly' ? 'reports' : 'support'; }

/** The words for the count; pure. */
export function countWords(n) { return n === 0 ? 'Everything that arrived is acted on.' : n === 1 ? '1 request you have not acted on' : `${n} requests you have not acted on`; }

/** The rows to paint: the first few, or all of them once asked; pure. */
export function visibleOf(items, all) { return all ? items : items.slice(0, FIRST); }

/** The count for the Overview; null when the lane does not carry the route; throws on any other failure. */
export async function arrivalsCount(apiFetch) {
  try { const d = await apiFetch(URL); return Number(d.count ?? (d.items || []).length) || 0; }
  catch (ex) { if (ex && (ex.status === 404 || ex.status === 405)) return null; throw ex; }
}

function rowHtml(a) {
  const when = D.fmtDate ? D.fmtDate(a.at) : a.at;
  return `<div class="hm-row" data-arrival="${e(a.kind)}:${e(a.id)}">
      <div class="hm-row-main">
        <p class="hm-row-t">${e(kindWords(a.kind))} <span class="adm-muted">${e(a.who)}</span></p>
        <p class="hm-row-s">${e(when)}${a.summary ? ` · ${e(a.summary)}` : ''} <code class="adm-muted">${e(a.ref)}</code></p>
      </div>
      <div class="hm-row-act">
        <button class="btn btn-sm btn-primary" type="button" data-ack="${e(a.kind)}:${e(a.id)}" data-tip="Mark that you have acted on this. Nobody is mailed.">Acknowledge</button>
        <a class="btn btn-sm" href="#account?section=${e(sectionOf(a.kind))}">Open</a>
      </div>
    </div>`;
}

/** The Overview's block: the arrivals that wait, each with Acknowledge and Open; empty and silent where the lane lacks the route. */
export async function renderArrivalsBlock(host, deps) {
  if (!host) return;
  D = deps;
  let items, all = false, working = false;
  try { const d = await D.apiFetch(`${URL}`); items = d.items || []; }
  catch (ex) { if (ex && (ex.status === 404 || ex.status === 405)) { host.innerHTML = ''; return; } host.innerHTML = `<div class="adm-card" style="margin-top:12px;"><h3 class="adm-card-h">Not yet acknowledged</h3><p class="adm-error">${e(D.friendlyError(ex, 'Could not read the arrivals.'))}</p></div>`; return; }
  const paint = (note = '') => {
    const shown = visibleOf(items, all), rest = items.length - shown.length;
    host.innerHTML = `
      <div class="adm-card" style="margin-top:12px;">
        <h3 class="adm-card-h">Not yet acknowledged</h3>
        <p class="adm-note">Every message, request, report and launch sign-up you have not acted on, newest first. Acknowledge marks it as seen by you (nobody is mailed); closing one on its desk counts too.</p>
        ${items.length ? `
          <div class="acct-actions-row act-row">
            <span class="adm-note" id="admArrivalsCount">${e(note || countWords(items.length))}</span>
            <button class="btn btn-sm" type="button" data-ack-all data-tip="Mark every one listed as seen by you, one after another. Nobody is mailed."${working ? ' disabled' : ''}>Acknowledge all ${items.length}</button>
          </div>
          <div class="hm-list">${shown.map(rowHtml).join('')}</div>
          ${rest > 0 ? `<div class="acct-actions-row act-row"><button class="btn btn-sm" type="button" data-ack-show-all>Show the other ${rest}</button></div>` : ''}` : `<p class="adm-note">${e(countWords(0))}</p>`}
      </div>`;
  };
  paint();
  const ack = async (kind, id) => {
    await D.apiFetch(`${URL}/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/ack`, { method: 'POST', body: '{}' });
    items = items.filter(a => !(a.kind === kind && a.id === id));
  };
  host.onclick = async (ev) => {
    if (working) return;
    if (ev.target.closest('[data-ack-show-all]')) { all = true; paint(); return; }
    if (ev.target.closest('[data-ack-all]')) {
      working = true; const total = items.length; let done = 0; paint(`Marking ${done} of ${total}…`);
      try { for (const a of [...items]) { await ack(a.kind, a.id); done++; paint(`Marking ${done} of ${total}…`); } working = false; paint(); }
      catch (ex) { working = false; paint(D.friendlyError(ex, `Stopped after ${done} of ${total}.`)); }
      return;
    }
    const b = ev.target.closest('[data-ack]'); if (!b || b.disabled) return;
    const [kind, id] = String(b.dataset.ack).split(':');
    b.disabled = true; b.textContent = 'Marking…';
    try { await ack(kind, id); paint(); }
    catch (ex) { b.disabled = false; b.textContent = 'Acknowledge'; paint(D.friendlyError(ex, 'Could not mark it.')); }
  };
}
