// src/account/envArrivalsBlock.js
//
// WAITING ON YOU, one card on the environment's Home (2026-11-15). Cameron: "it needs the same kind of shit that pragoptics just
// got as far as users who install contact forms ... this is for the people", and the same hour: "i want the front end to be
// clean and understandable and not a fucking hodge podge of shit". So one card holds everything that waits on the team:
//   1. the decisions: what waits on Approvals (a review to publish or reject), the one line with the way there, exactly as before;
//   2. the acknowledgements: every submission a form on the website filed into this environment's tables that nobody has acted
//      on, newest first, from GET v1/environment/arrivals (functions/environmentArrivals.js); Acknowledge marks it (who, when)
//      through POST v1/environment/arrivals/{table}/{key}/ack and the row leaves the list, nobody is mailed; Open goes to the
//      row in the Data card (the note the Approvals desk leaves).
// Nothing at all when nothing waits. On a lane that does not carry the arrivals route the card shows the decisions alone.
// The platform operator's twin is arrivalsBlock.js on the admin Overview.

const OPEN_TABLE_KEY = 'pragoptics_open_table';   // the note the Data card reads (approvals.js, environment.js)
let D = null;
const e = (s) => D.escapeHtml(String(s ?? ''));

/** The words for the count; pure. */
export function countWords(n) { return n === 0 ? 'Every submission is acted on.' : n === 1 ? '1 submission nobody has acted on' : `${n} submissions nobody has acted on`; }

/** A short reference for a row key (sub-6b2847b282e948c9 reads as sub-6b2847b2); pure. */
export function shortKey(key) { const k = String(key || ''); return k.length > 14 ? k.slice(0, 12) + '…' : k; }

/** The note that opens a row in the Data card, then the way there; pure apart from the storage write. */
export function openRowNote(table, key) {
  try { sessionStorage.setItem(OPEN_TABLE_KEY, JSON.stringify({ table: String(table || ''), row: String(key || '') })); } catch { /* the card still opens */ }
  return '#account?section=environment&card=data';
}

function rowHtml(a) {
  return `<tr data-arrival="${e(a.table)}:${e(a.key)}">
      <td>${e(D.fmtDate ? D.fmtDate(a.at) : a.at)}</td>
      <td>${e(a.form)}</td>
      <td><code title="${e(a.key)}">${e(shortKey(a.key))}</code></td>
      <td>${e(a.who)}</td>
      <td>${e(a.summary)}</td>
      <td class="adm-actions-cell">
        <button class="btn btn-sm btn-lead btn-primary" type="button" data-env-ack="${e(a.table)}:${e(a.key)}" data-tip="Mark that your team has acted on this. Nobody is mailed.">Acknowledge</button>
        <button class="btn btn-sm btn-lead" type="button" data-env-open="${e(a.table)}:${e(a.key)}" data-tip="Open the row in the Data card">Open</button>
      </td>
    </tr>`;
}

/**
 * The card. `url(path)` builds the lane's address with the team in it (home.js tq); `decisionsHtml` is the Approvals line
 * when something waits there, '' otherwise. The host stays empty when nothing waits at all.
 */
export async function renderWaitingCard(host, deps, { url, decisionsHtml = '' }) {
  if (!host) return;
  D = deps;
  let items = [], readFailed = '';
  try { const d = await D.apiFetch(url('/environment/arrivals')); items = d.items || []; }
  catch (ex) { if (!(ex && (ex.status === 404 || ex.status === 405 || ex.status === 403))) readFailed = D.friendlyError(ex, 'The submissions could not be read.'); }
  const paint = () => {
    if (!decisionsHtml && !items.length && !readFailed) { host.innerHTML = ''; return; }
    host.innerHTML = `
      <section class="acct-card hm-waiting">
        <h3 class="acct-card-h">Waiting on you</h3>
        ${decisionsHtml}
        ${readFailed ? `<p class="acct-error">${e(readFailed)}</p>` : ''}
        ${items.length ? `
          <p class="acct-card-note"><span id="hmArrivalsCount">${e(countWords(items.length))}</span>. Acknowledge marks one as seen by you; nobody is mailed.</p>
          <div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>When</th><th>Form</th><th>Row</th><th>From</th><th>Words</th><th></th></tr></thead><tbody>${items.map(rowHtml).join('')}</tbody></table></div>` : ''}
      </section>`;
  };
  paint();
  host.onclick = async (ev) => {
    const open = ev.target.closest('[data-env-open]');
    if (open) { const [table, key] = String(open.dataset.envOpen).split(':'); location.hash = openRowNote(table, key); return; }
    const b = ev.target.closest('[data-env-ack]'); if (!b || b.disabled) return;
    const [table, key] = String(b.dataset.envAck).split(':');
    b.disabled = true; b.textContent = 'Marking…';
    try {
      await D.apiFetch(url(`/environment/arrivals/${encodeURIComponent(table)}/${encodeURIComponent(key)}/ack`), { method: 'POST', body: '{}' });
      items = items.filter(a => !(a.table === table && a.key === key));
      paint();
    } catch (ex) { b.disabled = false; b.textContent = 'Acknowledge'; const c = host.querySelector('#hmArrivalsCount'); if (c) c.textContent = D.friendlyError(ex, 'Could not mark it.'); }
  };
}
