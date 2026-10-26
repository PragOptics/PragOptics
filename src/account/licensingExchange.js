// src/account/licensingExchange.js
//
// SHARED MAILBOXES ON THE TEAM'S OWN DOMAIN (2026-10-26, backend auth/sharedMailboxes.js, functions/environmentLicensingExchange.js).
// One card on the Licensing tab, shown once the Microsoft tenant is connected: a shared mailbox such as notify@theirdomain,
// no license of its own, made by the platform through its Exchange runtime. Three things stand before the first one, each
// on this card in order: the tenant's administrator approves the runtime once (Approve: Microsoft's page, back here with
// the outcome in the address, as the tenant's approval does); the runtime's Exchange role in the tenant, given by the
// platform at once, or by hand with the path named when Microsoft refuses the platform the lookup; Check, one read
// through the runtime, which proves it is in and lists the shared mailboxes the tenant holds. Then the form: a name,
// the domain (one verified in the tenant), a display name, Create. The plan's count is on the card (Free 1, User 2,
// Partner 10, Super 50).
//
//   GET  v1/environment/licensing/exchange            POST .../exchange/connect -> { url }    GET v1/licensing/exchange/consent (back)
//   POST .../exchange/role    POST .../exchange/check    POST .../exchange/mailboxes { name, displayName, host }
//
// The runtime takes tens of seconds (Exchange plus a cold start): the buttons say so while they wait.
// licensing.js paints the card and routes its clicks here.

import { iconBtn, leadBtn, ico, copyButton } from './cards.js';
import { LIC_URL, lc, st, url, cardHtml, perms, call, send, reqLead, reqIcon, errHtml, noteHtml, setNote, kept, forget, sentence, showsLicensing, dayWord, countWord } from './licensingShared.js';
import { tenantConnected } from './licensingWizard.js';

const RETURN_KEY = 'pragoptics_exchange_return';
const RETURN_SAID = {
  approved: 'The mail runtime is approved in your Microsoft tenant.',
  declined: 'You did not approve the mail runtime at Microsoft, so nothing changed.',
  mismatch: 'That approval was for a different Microsoft organization than the one connected here, so nothing changed.',
  unproven: 'Microsoft did not finish the approval, so nothing changed. Start again.',
  expired: 'That link had already been used or had expired, so nothing changed. Start again.',
  missing: 'That environment no longer exists.',
  failed: 'Microsoft did not finish the approval, so nothing changed. Start again.'
};
const CODES = {
  LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.',
  TENANT_NOT_CONNECTED: 'Connect your Microsoft tenant first.',
  SCOPE_REQUIRED: (ex) => ex?.data?.error || 'Your role cannot do this. The owner can turn it on for your role on the Team tab.',
  PLAN_ENDED: 'Your plan ended, so nothing changes in your tenant.',
  EXCHANGE_NOT_CONFIGURED: 'Shared mailboxes are being set up on the platform. Look again soon.',
  EXCHANGE_NOT_APPROVED: 'Approve the mail runtime in your Microsoft tenant first, with the button on this card.',
  EXCHANGE_NOT_READY: (ex) => ex?.data?.error || 'Microsoft has not let the mail runtime into your tenant yet. Try again in a few minutes.',
  UNKNOWN_ORIGIN: 'Open this page at pragoptics.com and try again.'
};

/** Back from Microsoft's page (bootstrap.js keeps the answer): the card says once what came of it. The read is dropped with the visit. */
export function resetExchange() {
  lc.ex = null; lc.exErr = ''; lc.exLive = null;
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null'); sessionStorage.removeItem(RETURN_KEY); } catch { r = null; }
  if (r && r.outcome) {
    const good = r.outcome === 'approved';
    // a good approval whose role could not be given carries the by-hand sentence in `why`: said, and not as a failure
    setNote('exchange', good ? `${RETURN_SAID.approved}${r.why ? ` ${sentence(r.why)}` : ''}` : sentence(r.why || RETURN_SAID[r.outcome] || RETURN_SAID.failed), !good);
  }
}

/** The card's read, once per load, only when the tenant is connected. A lane without the route leaves the card out. */
export async function loadExchange() {
  if (!tenantConnected()) { lc.ex = null; return; }
  try { lc.ex = await st.D.apiFetch(url(`${LIC_URL}/exchange`)); lc.exErr = ''; }
  catch (ex) {
    lc.ex = null;
    lc.exErr = ex?.status === 404 && !ex?.data?.code ? '' : (ex?.data?.error || st.D.friendlyError(ex, 'Shared mailboxes could not be read right now.'));
  }
}
function ex() { return lc.ex?.exchange || null; }
function canManage() { const d = lc.ex; return d ? !!d.canManageDomainsMail : false; }
function canAssign() { const d = lc.ex; return d ? !!d.canAssign : false; }

export function exchangeHtml() {
  if (!showsLicensing() || !tenantConnected()) return '';
  const e = st.D.escapeHtml, p = perms();
  if (lc.exErr) return cardHtml({ key: 'exchange', icon: 'mail', title: 'Shared mailboxes', summary: 'could not be read', body: `<p class="acct-card-note ev-note is-bad">${e(sentence(lc.exErr))}</p>` });
  const x = ex();
  if (!x) return lc.ex === null && lc.exErr === '' && lc.view ? '' : cardHtml({ key: 'exchange', icon: 'mail', title: 'Shared mailboxes', summary: 'reading', body: '<p class="acct-card-note">Reading…</p>' });
  const ro = x.writes === false ? '<p class="acct-card-note ev-note">This lane reads your tenant and shows what each step would do; nothing is written from here.</p>' : '';
  const intro = '<p class="acct-card-note">A shared mailbox on your own domain, such as notify@yourdomain, needs no license of its own: anyone you give access can read and send from it, and your site\'s notices can go out from it. PragOptics makes it in your tenant through its mail runtime.</p>';
  let summary, inner;
  if (!x.configured) {
    summary = 'being set up';
    inner = `${intro}<p class="acct-card-note">Shared mailboxes are being set up on the platform. Nothing to do on your side; this card opens on its own.</p>`;
  } else if (!x.approved) {
    summary = 'approve the mail runtime';
    inner = `${intro}${ro}
      <p class="acct-card-note">${canManage() ? 'First, approve PragOptics\' mail runtime in your Microsoft tenant: you sign in at Microsoft as its administrator, approve it once, and come back here. The link works once and for ten minutes.' : 'The owner, or a role with Connect your Microsoft tenant and set up its mail, approves the mail runtime in your tenant first.'}</p>
      ${canManage() && !p.readOnly ? `<div class="acct-actions-row">${reqLead('ex-connect', { lic: 'ex-connect' }, 'external', 'Approve the mail runtime', 'Opening Microsoft…', '', 'btn-primary')}</div>` : ''}`;
  } else {
    const count = `${x.count} of ${countWord(x.limit, 'shared mailbox', 'shared mailboxes')}`;
    summary = x.provenAt ? `${count} · ready` : 'approved, check it';
    inner = `${intro}${ro}${stateHtml(x, e)}${listHtml(x, e)}${formHtml(x, e)}`;
  }
  // folded only while the platform is setting the runtime up (nothing to do); open wherever the person has a step to take
  return cardHtml({ key: 'exchange', icon: 'mail', title: 'Shared mailboxes', summary: e(summary), open: !!x.configured, body: `${noteHtml('exchange')}${errHtml('exchange')}${inner}` });
}

/** Approved: the role and the proof, each with its button when it is not done. */
function stateHtml(x, e) {
  const roleRow = x.role?.assignedAt
    ? `<div class="lic-fact"><span class="lic-k">Exchange role</span><span class="lic-v"><span class="lic-state is-verified">${ico('check', 12)}Given ${e(dayWord(x.role.assignedAt))}</span></span></div>`
    : `<div class="lic-fact"><span class="lic-k">Exchange role</span><span class="lic-v"><span class="lic-state is-pending">Not given yet</span>${canManage() ? ` ${reqIcon('ex-role', { lic: 'ex-role' }, 'refresh', 'Give the runtime its Exchange role now', 'Asking Microsoft…')}` : ''}</span></div>`;
  const why = !x.role?.assignedAt && x.role?.why ? `<p class="lic-hint">${e(sentence(x.role.why))}</p>` : '';
  const proofRow = `<div class="lic-fact"><span class="lic-k">Runtime</span><span class="lic-v">${x.provenAt ? `<span class="lic-state is-verified">${ico('check', 12)}In your tenant, checked ${e(dayWord(x.provenAt))}</span>` : '<span class="lic-state is-pending">Not checked yet</span>'}</span></div>`;
  const check = canManage() ? `<div class="acct-actions-row">${reqLead('ex-check', { lic: 'ex-check' }, 'refresh', x.provenAt ? 'Check again' : 'Check the runtime', 'Asking Exchange… up to a minute', '', x.provenAt ? '' : 'btn-primary')}</div>` : '';
  return `
    <div class="lic-facts">
      <div class="lic-fact"><span class="lic-k">Approved</span><span class="lic-v">${e(dayWord(x.approvedAt))}</span></div>
      ${roleRow}${proofRow}
    </div>${why}
    <p class="lic-hint">Microsoft can take a few minutes to apply an approval and a role. Check reads your tenant through the runtime: green means it is in.</p>
    ${check}`;
}

/** The mailboxes the platform made, and what Check found in the tenant. */
function listHtml(x, e) {
  const made = Array.isArray(x.mailboxes) ? x.mailboxes : [];
  const live = Array.isArray(lc.exLive) ? lc.exLive : null;
  const rows = made.map(m => `<li class="lic-dom"><div class="lic-dom-row"><span class="ev-code lic-dom-host" id="licEx-${e(m.address)}">${e(m.address)}</span><span class="lic-state is-quiet">${e(m.displayName || m.name)}</span><span class="lic-dom-act">${iconBtn({ lic: 'ex-copy' }, 'copy', `Copy ${m.address}`, `data-address="${e(m.address)}"`)}</span></div><p class="lic-hint">Made ${e(dayWord(m.createdAt))}. Give people access and send-as in the Exchange admin center for now.</p></li>`).join('');
  const others = live ? live.filter(m => !made.some(x2 => x2.address === m.address)) : [];
  const liveRows = others.map(m => `<li class="lic-dom"><div class="lic-dom-row"><span class="ev-code lic-dom-host">${e(m.address)}</span><span class="lic-state is-quiet">${e(m.displayName || m.name)}</span></div><p class="lic-hint">In your tenant already${m.fullAccess?.length ? `; ${countWord(m.fullAccess.length, 'person has', 'people have')} access` : ''}.</p></li>`).join('');
  if (!rows && !liveRows) return live ? '<p class="lic-hint">Your tenant holds no shared mailbox yet.</p>' : '';
  return `<h4 class="lic-sub lic-sub--gap">Your shared mailboxes</h4><ul class="lic-dom-list">${rows}${liveRows}</ul>`;
}

/** The form: a name, a domain verified in the tenant, a display name; disabled with the reason when it cannot run. */
function formHtml(x, e) {
  if (!canAssign()) return '<p class="acct-card-note">The owner, or a role with Give out mailboxes and licenses, makes shared mailboxes here.</p>';
  const domains = Array.isArray(x.domains) ? x.domains : [];
  const full = x.count >= x.limit;
  const gate = !domains.length ? 'Add a verified domain to your tenant first, on the tenant card above.'
    : full ? `Your plan carries ${countWord(x.limit, 'shared mailbox', 'shared mailboxes')}; this team has ${x.count}.`
    : !x.provenAt ? 'Check the runtime first, above.' : '';
  // the remembered pick only while it is still offered (a domain that left the tenant's verified list falls back to the first)
  const remembered = kept('licExHost', '');
  const chosen = domains.some(d => d.host === remembered) ? remembered : (domains[0]?.host || '');
  const opts = domains.map(d => `<option value="${e(d.host)}" ${d.host === chosen ? 'selected' : ''}>${e(d.host)}${d.mailAt ? '' : ' (mail not switched yet)'}</option>`).join('');
  const nameErr = lc.err['exchange-name'] ? `<p class="lic-field-err" id="licExNameErr" role="alert">${e(lc.err['exchange-name'])}</p>` : '';
  return `
    <h4 class="lic-sub lic-sub--gap">New shared mailbox</h4>
    <div class="ev-reg-form">
      <div class="lic-span">
        <label class="acct-label" for="licExName">Address</label>
        <div class="lic-suffix ${nameErr ? 'is-bad' : ''}"><input class="acct-input" id="licExName" type="text" data-keep value="${e(kept('licExName', ''))}" maxlength="60" placeholder="notify" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="licExNameHint${nameErr ? ' licExNameErr' : ''}"><span>@</span><select class="acct-input" id="licExHost" data-keep aria-label="Domain">${opts}</select></div>
        ${nameErr}
        <p class="lic-hint" id="licExNameHint">Letters, digits, dots, dashes or underscores. A domain whose mail is not switched to Microsoft yet gets the mailbox, but nothing reaches it until the switch on the tenant card.</p>
      </div>
      <div class="lic-span">
        <label class="acct-label" for="licExDisplay">Shown as</label>
        <input class="acct-input" id="licExDisplay" type="text" data-keep value="${e(kept('licExDisplay', ''))}" maxlength="64" placeholder="Notifications" autocomplete="off">
      </div>
    </div>
    <div class="acct-actions-row">${reqLead('ex-create', { lic: 'ex-create' }, 'plus', 'Create the mailbox', 'Creating… up to a minute', gate ? `disabled data-tip="${e(gate)}"` : '', 'btn-primary')}</div>
    ${gate ? `<p class="lic-hint">${e(gate)}</p>` : ''}`;
}

/* ---------- actions ---------- */

/** To Microsoft's approval page for the runtime app; the answer comes back to this card. */
async function approveRuntime() {
  lc.err.exchange = ''; setNote('exchange', '');
  await send('ex-connect', 'Opening Microsoft…', async () => {
    const d = await call(`${LIC_URL}/exchange/connect`, 'POST');
    if (!d || typeof d.url !== 'string' || !/^https:\/\/login\.microsoftonline\.com\//.test(d.url)) throw new Error('Microsoft\'s approval page could not be opened.');
    window.location.assign(d.url);
    await new Promise((_, reject) => setTimeout(() => reject(new Error('Microsoft\'s page did not open. Try again.')), 15000));
  }, { errKey: 'exchange', fallback: 'Microsoft\'s approval page could not be opened.', codes: CODES });
}

async function giveRole() {
  lc.err.exchange = ''; setNote('exchange', '');
  await send('ex-role', 'Asking Microsoft…', async () => {
    const d = await call(`${LIC_URL}/exchange/role`, 'POST');
    const r = d?.role || {};
    setNote('exchange', r.assigned ? (r.already ? 'The runtime already holds its Exchange role.' : 'The runtime holds its Exchange role now. Microsoft can take a few minutes to apply it; then press Check.') : r.planned ? sentence(r.planned) : sentence(r.why || 'The role could not be given.'), !r.assigned && !r.planned);
    await loadExchange(); st.paint();
  }, { errKey: 'exchange', fallback: 'The role could not be given right now.', codes: CODES });
}

async function checkRuntime() {
  lc.err.exchange = ''; setNote('exchange', '');
  await send('ex-check', 'Asking Exchange… up to a minute', async () => {
    const d = await call(`${LIC_URL}/exchange/check`, 'POST');
    lc.exLive = Array.isArray(d?.mailboxes) ? d.mailboxes : [];
    setNote('exchange', `The runtime is in your tenant. ${lc.exLive.length ? `It holds ${countWord(lc.exLive.length, 'shared mailbox', 'shared mailboxes')}.` : 'It holds no shared mailbox yet.'}`);
    await loadExchange(); st.paint();
  }, { errKey: 'exchange', fallback: 'The runtime could not be checked right now.', codes: CODES });
}

async function createMailbox() {
  const name = String(kept('licExName', document.getElementById('licExName')?.value || '')).trim();
  // the select on screen is the truth; the remembered pick only when the element is gone
  const sel = document.getElementById('licExHost');
  const host = String(sel ? sel.value : kept('licExHost', '')).trim().toLowerCase();
  const displayName = String(kept('licExDisplay', document.getElementById('licExDisplay')?.value || '')).trim();
  lc.err.exchange = ''; lc.err['exchange-name'] = ''; setNote('exchange', '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(name)) { lc.err['exchange-name'] = 'Use letters, digits, dots, dashes or underscores, starting with a letter or digit.'; st.paint(); document.getElementById('licExName')?.focus(); return; }
  if (!host) { lc.err.exchange = 'Pick the domain.'; st.paint(); return; }
  await send('ex-create', 'Creating… up to a minute', async () => {
    const d = await call(`${LIC_URL}/exchange/mailboxes`, 'POST', { name, host, displayName });
    forget('licExName', 'licExDisplay');
    setNote('exchange', d?.planned ? sentence(d.planned) : sentence(d?.note || `${name}@${host} is made.`), false);
    await loadExchange(); st.paint();
  }, {
    errKey: 'exchange', fallback: 'The mailbox could not be made right now.',
    codes: { ...CODES, NAME_INVALID: (ex) => { lc.err['exchange-name'] = ex.data.error; return ''; }, DOMAIN_NOT_VERIFIED_IN_TENANT: 'Pick a domain that is in your tenant and verified there.', NO_EXCHANGE: (ex) => ex?.data?.error || 'Your tenant holds no Microsoft license yet, so there is no Exchange to hold a mailbox.', SHARED_MAILBOX_LIMIT: (ex) => ex?.data?.error || 'Your plan\'s shared mailboxes are all made.', MAILBOX_EXISTS: (ex) => ex?.data?.error || 'That address is taken in your tenant.' }
  });
  if (lc.err['exchange-name']) { st.paint(); document.getElementById('licExName')?.focus(); }
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function exchangeAction(a, btn) {
  if (a === 'ex-connect') { approveRuntime(); return true; }
  if (a === 'ex-role') { giveRole(); return true; }
  if (a === 'ex-check') { checkRuntime(); return true; }
  if (a === 'ex-create') { createMailbox(); return true; }
  if (a === 'ex-copy') { const address = String(btn.dataset.address || ''); copyButton(btn, address, { select: () => document.getElementById(`licEx-${address}`) }); return true; }
  return false;
}
