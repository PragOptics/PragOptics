// src/account/envArrivalsBlock.js
//
// WAITING ON YOU, one card on the environment's Home (2026-11-15). Cameron: "it needs the same kind of shit that pragoptics just
// got as far as users who install contact forms ... this is for the people"; "i want the front end to be clean and understandable
// and not a fucking hodge podge of shit"; and on the first live list of 22: "THE WINDOW OR LIST IS TOO LONG AND NOT USER FRIENDLY
// TO SCROLL". So one card holds everything that waits on the team, in the Home's own row shape (no wide table, nothing to scroll
// sideways), the newest five shown with the rest behind one press, and one press that acknowledges them all:
//   1. the decisions: what waits on Approvals (a review to publish or reject), the one line with the way there, exactly as before;
//   2. the acknowledgements: every submission a form on the website filed into this environment's tables that nobody has acted
//      on, newest first, from GET v1/environment/arrivals (functions/environmentArrivals.js); Acknowledge marks one (who, when)
//      through POST v1/environment/arrivals/{table}/{key}/ack and the row leaves the list, nobody is mailed; Acknowledge all
//      marks every one listed, one after another, through the same route; Open goes to the row in the Data card.
// Nothing at all when nothing waits. On a lane that does not carry the arrivals route the card shows the decisions alone.
// The platform operator's twin is arrivalsBlock.js on the admin Overview.

const OPEN_TABLE_KEY = 'pragoptics_open_table';   // the note the Data card reads (approvals.js, environment.js)
const FIRST = 5;                                   // how many rows show before "Show the other N"
let D = null;
const e = (s) => D.escapeHtml(String(s ?? ''));

/** The words for the count; pure. */
export function countWords(n) { return n === 0 ? 'Every submission is acted on.' : n === 1 ? '1 submission nobody has acted on' : `${n} submissions nobody has acted on`; }

/** A short reference for a row key (sub-6b2847b282e948c9 reads as sub-6b2847b2); pure. */
export function shortKey(key) { const k = String(key || ''); return k.length > 14 ? k.slice(0, 12) + '…' : k; }

/** The rows to paint: the first few, or all of them once asked; pure. */
export function visibleOf(items, all) { return all ? items : items.slice(0, FIRST); }

/** The note that opens a row in the Data card, then the way there; pure apart from the storage write. */
export function openRowNote(table, key) {
  try { sessionStorage.setItem(OPEN_TABLE_KEY, JSON.stringify({ table: String(table || ''), row: String(key || '') })); } catch { /* the card still opens */ }
  try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section: 'environment', card: 'data', row: '' })); } catch { /* fine */ }   // the Environment page opens the Data card on this note (account.js); without it Open landed on the page and nothing opened (2026-11-15)
  return '#account?section=environment&card=data';
}

function rowHtml(a) {
  const when = D.fmtDate ? D.fmtDate(a.at) : a.at;
  return `<div class="hm-row" data-arrival="${e(a.table)}:${e(a.key)}">
      <div class="hm-row-main">
        <p class="hm-row-t">${e(a.form)}</p>
        <p class="hm-row-s">${e(a.who)}</p>
        <p class="hm-row-s">${e(when)}${a.summary ? ` · ${e(a.summary)}` : ''} <code class="adm-muted" title="${e(a.key)}">${e(shortKey(a.key))}</code></p>
      </div>
      <div class="hm-row-act">
        <button class="btn btn-sm btn-primary" type="button" data-env-ack="${e(a.table)}:${e(a.key)}" data-tip="Mark that your team has acted on this. Nobody is mailed.">Acknowledge</button>
        <button class="btn btn-sm" type="button" data-env-open="${e(a.table)}:${e(a.key)}" data-tip="Open the row in the Data card">Open</button>
      </div>
    </div>`;
}

/**
 * The card. `url(path)` builds the lane's address with the team in it (home.js tq); `decisionsHtml` is the Approvals line
 * when something waits there, '' otherwise. The host stays empty when nothing waits at all.
 */
export async function renderWaitingCard(host, deps, { url, decisionsHtml = '' }) {
  if (!host) return;
  D = deps;
  let items = [], readFailed = '', all = false, working = false;
  try { const d = await D.apiFetch(url('/environment/arrivals')); items = d.items || []; }
  catch (ex) { if (!(ex && (ex.status === 404 || ex.status === 405 || ex.status === 403))) readFailed = D.friendlyError(ex, 'The submissions could not be read.'); }
  const paint = (note = '') => {
    if (!decisionsHtml && !items.length && !readFailed) { host.innerHTML = ''; return; }
    const shown = visibleOf(items, all), rest = items.length - shown.length;
    host.innerHTML = `
      <section class="acct-card hm-waiting">
        <h3 class="acct-card-h">Waiting on you</h3>
        ${decisionsHtml}
        ${readFailed ? `<p class="acct-error">${e(readFailed)}</p>` : ''}
        ${items.length ? `
          <div class="acct-actions-row act-row">
            <span class="acct-card-note" id="hmArrivalsCount">${e(note || countWords(items.length))}</span>
            <button class="btn btn-sm" type="button" data-env-ack-all data-tip="Mark every one listed as seen by you, one after another. Nobody is mailed."${working ? ' disabled' : ''}>Acknowledge all ${items.length}</button>
          </div>
          <div class="hm-list">${shown.map(rowHtml).join('')}</div>
          ${rest > 0 ? `<div class="acct-actions-row act-row"><button class="btn btn-sm" type="button" data-env-show-all>Show the other ${rest}</button></div>` : ''}` : ''}
      </section>`;
  };
  paint();
  const ack = async (table, key) => {
    await D.apiFetch(url(`/environment/arrivals/${encodeURIComponent(table)}/${encodeURIComponent(key)}/ack`), { method: 'POST', body: '{}' });
    items = items.filter(a => !(a.table === table && a.key === key));
  };
  host.onclick = async (ev) => {
    if (working) return;
    const open = ev.target.closest('[data-env-open]');
    if (open) { const [table, key] = String(open.dataset.envOpen).split(':'); location.hash = openRowNote(table, key); return; }
    if (ev.target.closest('[data-env-show-all]')) { all = true; paint(); return; }
    const allBtn = ev.target.closest('[data-env-ack-all]');
    if (allBtn) {
      working = true; const total = items.length; let done = 0; paint(`Marking ${done} of ${total}…`);
      try { for (const a of [...items]) { await ack(a.table, a.key); done++; paint(`Marking ${done} of ${total}…`); } working = false; paint(); }
      catch (ex) { working = false; paint(D.friendlyError(ex, `Stopped after ${done} of ${total}.`)); }
      return;
    }
    const b = ev.target.closest('[data-env-ack]'); if (!b || b.disabled) return;
    const [table, key] = String(b.dataset.envAck).split(':');
    b.disabled = true; b.textContent = 'Marking…';
    try { await ack(table, key); paint(); }
    catch (ex) { b.disabled = false; b.textContent = 'Acknowledge'; paint(D.friendlyError(ex, 'Could not mark it.')); }
  };
}
