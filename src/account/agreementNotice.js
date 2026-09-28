// src/account/agreementNotice.js
//
// TELL EVERY OWNER ABOUT THE NEW AGREEMENT (2026-09-24, Cameron's decision 37(4); agreement 14.2). A card on the
// operator's Notifications desk: a material change to the Platform Agreement is emailed to the owner of every
// environment, whatever their news setting, once per version (functions/adminAgreementNotice.js,
// auth/agreementNotice.js).
//
//   The version box starts with the version the published agreement names (/docs/PragOptics-Subscriber-Agreement.md,
//   the site's own file, read the way the sign-up modal reads it); the operator can type another.
//   Count the owners (GET) says how many owners there are, how many were told this version, how many are still to tell,
//   and how many could not be reached (those are on the Needs attention desk).
//   Email N owners asks once more ("Confirm: email N owners"), then sends batch after batch (POST, one batch each) until
//   none are left, the button disabled and counting while it works, everything else on the card held. A batch that
//   moves nothing, an error, or leaving the page stops it; pressing again carries on and never emails anyone twice.
//   What changed (optional) is kept with the version at its first send; every owner of that version reads the same
//   words, so once sending has started the box shows the kept words and cannot be changed.

import { PRAG_API_BASE } from '../runtime/config.js';
import { leadBtn, armed, busy, btnLabel } from './cards.js';
import { countWord, dayWord } from '../ui/words.js';
import { agreementVersionOf } from '../components/agreementVersion.js';

const URL_BASE = `${PRAG_API_BASE}/admin/agreement-notice`;
const AGREEMENT_MD = '/docs/PragOptics-Subscriber-Agreement.md';
const VERSION_RE = /^\d{4}-\d{2}(\.\d{1,3})?$/;

let D = null;   // deps: apiFetch, escapeHtml, friendlyError
const ag = { version: '', count: null, summary: '', working: false, line: '', error: '' };
const e = (s) => D.escapeHtml(String(s ?? ''));

/** The version the published agreement names, or '' (the operator types it). */
async function publishedVersion() {
  try {
    const r = await fetch(AGREEMENT_MD, { cache: 'no-store' });
    if (!r.ok) return '';
    // the same reader as the sign-up's agreement modal (the version its acceptances record); a version this card could
    // not send (not in the 2026-09.11 form) leaves the box for the operator to type
    const v = agreementVersionOf(await r.text());
    return VERSION_RE.test(v) ? v : '';
  } catch { return ''; }
}

function countHtml(c) {
  if (!c) return '';
  const started = c.startedAt ? ` Sending started ${e(dayWord(c.startedAt))}${c.startedBy ? ` by ${e(c.startedBy)}` : ''}.` : '';
  const stuck = c.stuck ? ` <b>${e(countWord(c.stuck, 'owner', 'owners'))}</b> could not be reached: they are on the Needs attention desk.` : '';
  const sending = c.sending ? ` ${e(countWord(c.sending, 'email is', 'emails are'))} being sent by another press.` : '';
  return `<p class="adm-note" role="status">Agreement <b>${e(c.version)}</b>: ${e(countWord(c.owners, 'owner', 'owners'))}. ${e(String(c.told))} told already, <b>${e(String(c.toTell))}</b> still to tell.${stuck}${sending}${started}</p>`;
}

function cardHtml() {
  const c = ag.count && ag.count.version === ag.version ? ag.count : null;
  const locked = !!(c && c.startedAt);
  const words = locked ? c.summary : ag.summary;
  return `
    <div class="adm-card" id="agCard">
      <h3 class="adm-card-h">Tell every owner about the new agreement</h3>
      <p class="adm-note">For a material change to the Platform Agreement (section 14.2): one email to the owner of every environment, whatever their news setting, once per version. Name the version, count the owners, then send. Nobody is emailed twice for the same version.</p>
      <label class="nt-ag-field"><span class="na-k">Version</span>
        <input class="adm-input" id="agVersion" type="text" maxlength="20" value="${e(ag.version)}" placeholder="2026-09.11" autocomplete="off" spellcheck="false"></label>
      <label class="nt-ag-field"><span class="na-k">What changed (optional)</span>
        <textarea class="adm-input nt-message" id="agSummary" rows="4" maxlength="2000" placeholder="In plain words: which sections changed and what they now say. Kept with the version at the first send." ${locked ? 'readonly' : ''}>${e(words || '')}</textarea></label>
      ${locked ? '<p class="adm-muted nt-result">These words were kept at the first send of this version; every owner reads the same email.</p>' : ''}
      <div class="adm-actions-row">
        ${leadBtn({ ag: 'count' }, 'search', 'Count the owners')}
        ${c && c.toTell > 0 ? leadBtn({ ag: 'send' }, 'send', `Email ${countWord(c.toTell, 'owner', 'owners')}`, '', 'btn-primary') : ''}
      </div>
      ${countHtml(c)}
      ${ag.line ? `<p class="adm-note" role="status">${e(ag.line)}</p>` : ''}
      ${ag.error ? `<p class="adm-error" role="alert">${e(ag.error)}</p>` : ''}
    </div>`;
}

let host = null;
function paint() {
  if (!host || !host.isConnected) return;
  const typed = document.getElementById('agSummary');
  if (typed && !typed.readOnly) ag.summary = typed.value;
  host.innerHTML = cardHtml();
}

async function count(btn) {
  const v = String(document.getElementById('agVersion')?.value || '').trim();
  ag.version = v; ag.error = ''; ag.line = '';
  if (!VERSION_RE.test(v)) { ag.error = 'Name the version as the agreement writes it, for example 2026-09.11.'; paint(); return; }
  const done = busy(btn, 'Counting…', { hold: [...host.querySelectorAll('button, input, textarea')].filter((x) => x !== btn) });
  try {
    ag.count = await D.apiFetch(`${URL_BASE}?version=${encodeURIComponent(v)}`);
  } catch (ex) {
    ag.count = null;
    if (!ex?.sessionInvalidated) ag.error = ex?.status === 404 && !ex?.data?.code ? 'The agreement notice is not on this lane yet. Deploy the backend that carries it, then reload.' : (ex?.data?.error || D.friendlyError(ex, 'Could not count the owners.'));
  } finally { done(); }
  paint();
}

async function send(btn) {
  const c = ag.count;
  if (!c || c.version !== ag.version || !(c.toTell > 0) || ag.working) return;
  if (!armed(btn, `Confirm: email ${countWord(c.toTell, 'owner', 'owners')}`)) return;
  const summary = String(document.getElementById('agSummary')?.value || '');
  ag.working = true; ag.error = ''; ag.line = '';
  const total = c.toTell;
  let sent = 0, failed = 0, last = null;
  const done = busy(btn, `Sending: 0 of ${total}…`, { hold: [...host.querySelectorAll('button, input, textarea')].filter((x) => x !== btn), why: 'Wait: the emails are being sent' });
  try {
    // batch after batch until none are left; a batch that moves nothing stops it (nothing retries forever)
    for (let i = 0; i < 1000; i++) {
      if (!host.isConnected) break;   // the operator left the desk: the rest waits for the next press
      last = await D.apiFetch(URL_BASE, { method: 'POST', body: JSON.stringify({ version: c.version, summary, confirm: true }) });
      sent += Number(last?.sent || 0); failed += Number(last?.failed || 0);
      btnLabel(btn, `Sending: ${Math.min(sent, total)} of ${total}…`);
      if (last?.done || (!last?.sent && !last?.failed)) break;
    }
    ag.line = `Emailed ${countWord(sent, 'owner', 'owners')} this time.${failed ? ` ${countWord(failed, 'send', 'sends')} failed and ${failed === 1 ? 'is' : 'are'} tried again, three times in all, then put on the Needs attention desk.` : ''}${last && !last.done ? ` ${countWord(Number(last.remaining || 0), 'owner is', 'owners are')} still to tell: press Email again to carry on.` : ''}`;
  } catch (ex) {
    if (!ex?.sessionInvalidated) ag.error = `${sent ? `Emailed ${countWord(sent, 'owner', 'owners')}, then it stopped: ` : ''}${ex?.data?.error || D.friendlyError(ex, 'The notice could not be sent.')} Pressing again carries on; nobody is emailed twice.`;
  } finally {
    ag.working = false;
    done();
  }
  // the counts as they stand now
  try { ag.count = await D.apiFetch(`${URL_BASE}?version=${encodeURIComponent(c.version)}`); } catch { /* the line above says what happened */ }
  paint();
}

/** Paints the card into `el` (the Notifications desk) and reads the published agreement's version. */
export async function renderAgreementNotice(el, deps) {
  D = deps; host = el;
  if (!host) return;
  ag.count = null; ag.line = ''; ag.error = ''; ag.working = false;
  if (!ag.version) ag.version = await publishedVersion();
  paint();
  if (!host.dataset.agBound) {
    host.dataset.agBound = '1';
    host.addEventListener('click', (ev) => {
      const b = ev.target.closest?.('[data-ag-action]');
      if (!b || b.disabled) return;
      ev.preventDefault();
      if (b.dataset.agAction === 'count') count(b);
      else if (b.dataset.agAction === 'send') send(b);
    });
    host.addEventListener('input', (ev) => {
      // a new version typed: the old count and its Email button no longer apply (removed in place, so the box keeps
      // its focus); Count the owners reads the new one
      if (ev.target?.id !== 'agVersion' || !ag.count || String(ev.target.value).trim() === ag.count.version) return;
      ag.version = String(ev.target.value).trim(); ag.count = null; ag.line = '';
      for (const x of host.querySelectorAll('[data-ag-action="send"], #agCard p[role="status"]')) x.remove();
    });
  }
}
