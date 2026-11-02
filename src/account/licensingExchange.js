// src/account/licensingExchange.js
//
// THE MAILERS (2026-10-26 as shared mailboxes; the mailer 2026-11-02, Cameron: "the mailer is part of the environment which
// falls under the owner and or whom the deem in their team"; "i need to be able to control what each mailer is sending
// on behalf of, as in what table drives it"). One card on the Licensing tab, shown once the Microsoft tenant is connected.
// A mailer is a shared mailbox on the team's own domain, such as notify@theirdomain, no license of its own, made by the
// platform through its Exchange runtime (backend auth/sharedMailboxes.js, functions/environmentLicensingExchange.js); the
// forms and notices of the environment send from it (backend auth/environmentMailers.js, auth/publicDoors.js submit).
//
// WORDS FOR HUMANS (2026-11-02, Cameron: "im building this for humans"): the owner never reads "runtime" or "Exchange role".
// What the code calls the runtime's approval, role and proof reads as mail access: approved, its permission, checked. The
// routes, codes and state keys keep their names; only the words on the card change.
//
// The card, top to bottom (the hero shape of 2026-11-02, licensingShared.heroHtml):
//   the hero: the plan's ring with its count, the state as a tag, ONE sentence, New mailer;
//   the three steps when one is not done (Approve: Microsoft's page and back; the permission; Check);
//   Your mailers: each one a container with its address, Copy, Send a test, and the forms it sends for;
//   Your forms: each form that takes submissions (mailerUse.takesMail) with the mailer it sends from, picked here
//     (PUT v1/environment/modules/{id} { settings: { mailer } }; '' is the environment's mailer, the default);
//   New mailer: the form, under the hero for the first mailer and behind the button after;
//   the approval's dates and Check again, folded, once every step is green.
//
//   GET  v1/environment/licensing/exchange            POST .../exchange/connect -> { url }    GET v1/licensing/exchange/consent (back)
//   POST .../exchange/role    POST .../exchange/check    POST .../exchange/mailboxes { name, displayName, host }
//   GET  v1/environment/mailers (the default, the send proof)    POST v1/environment/mailers/test { address }
//   GET  v1/environment/modules (the forms)                      PUT  v1/environment/modules/{id} { settings: { mailer } }
//
// The runtime takes tens of seconds (Exchange plus a cold start): the buttons say so while they wait.
// licensing.js paints the card and routes its clicks and its selects here.

import { iconBtn, leadBtn, copyButton, ringHtml } from './cards.js';
import { explainLink } from '../components/explainer.js';
import { LIC_URL, lc, st, url, cardHtml, perms, call, send, reqLead, reqIcon, errHtml, noteHtml, setNote, kept, forget, sentence, showsLicensing, dayWord, countWord, cap, heroHtml, cardLink } from './licensingShared.js';
import { PRAG_API_BASE } from '../runtime/config.js';
import { tenantConnected } from './licensingWizard.js';
import { formsOf, formsFor, resolvedMailer } from './mailerUse.js';
import { listWords } from './domainFamilies.js';

const MAILERS_URL = `${PRAG_API_BASE}/environment/mailers`;
const MODULES_URL = `${PRAG_API_BASE}/environment/modules`;

const RETURN_KEY = 'pragoptics_exchange_return';
const RETURN_SAID = {
  approved: 'Mail access is approved in your Microsoft tenant.',
  declined: 'You did not approve mail access at Microsoft, so nothing changed.',
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
  EXCHANGE_NOT_CONFIGURED: 'Mailers are being set up on the platform. Look again soon.',
  EXCHANGE_NOT_APPROVED: 'Approve mail access in your Microsoft tenant first, with the button on this card.',
  EXCHANGE_NOT_READY: (ex) => ex?.data?.error || 'Microsoft has not let PragOptics into your tenant\'s mail yet. Try again in a few minutes.',
  UNKNOWN_ORIGIN: 'Open this page at pragoptics.com and try again.'
};

/** Back from Microsoft's page (bootstrap.js keeps the answer): the card says once what came of it. The reads are dropped with the visit. */
export function resetExchange() {
  lc.ex = null; lc.exErr = ''; lc.exLive = null; lc.exTest = null;
  lc.exNew = false; lc.exMailers = null; lc.exForms = null; lc.exFormsErr = '';
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null'); sessionStorage.removeItem(RETURN_KEY); } catch { r = null; }
  if (r && r.outcome) {
    const good = r.outcome === 'approved';
    // a good approval whose role could not be given carries the by-hand sentence in `why`: said, and not as a failure
    setNote('exchange', good ? `${RETURN_SAID.approved}${r.why ? ` ${sentence(r.why)}` : ''}` : sentence(r.why || RETURN_SAID[r.outcome] || RETURN_SAID.failed), !good);
  }
}

/**
 * The card's reads, once per load, only when the tenant is connected: the exchange record; then, once mail access is
 * approved, the mailers as the forms see them (the default, the send proof) and the forms themselves. A part that fails
 * to read is said on the card in its place; the card itself never waits on it. A lane without the route leaves the card out.
 */
export async function loadExchange() {
  if (!tenantConnected()) { lc.ex = null; lc.exMailers = null; lc.exForms = null; return; }
  try { lc.ex = await st.D.apiFetch(url(`${LIC_URL}/exchange`)); lc.exErr = ''; }
  catch (ex) {
    lc.ex = null;
    lc.exErr = ex?.status === 404 && !ex?.data?.code ? '' : (ex?.data?.error || st.D.friendlyError(ex, 'Your mailers could not be read right now.'));
  }
  const x = ex();
  if (!x || !x.approved) { lc.exMailers = null; lc.exForms = null; lc.exFormsErr = ''; return; }
  const [ms, fs] = await Promise.allSettled([st.D.apiFetch(url(MAILERS_URL)), st.D.apiFetch(url(MODULES_URL))]);
  lc.exMailers = ms.status === 'fulfilled' && ms.value && typeof ms.value === 'object' ? ms.value : null;
  lc.exForms = fs.status === 'fulfilled' ? formsOf(fs.value) : null;
  lc.exFormsErr = fs.status === 'rejected' ? (fs.reason?.data?.error || st.D.friendlyError(fs.reason, 'Your forms could not be read right now.')) : '';
}
function ex() { return lc.ex?.exchange || null; }
function canManage() { const d = lc.ex; return d ? !!d.canManageDomainsMail : false; }
function canAssign() { const d = lc.ex; return d ? !!d.canAssign : false; }
function madeList(x) { return Array.isArray(x?.mailboxes) ? x.mailboxes : []; }
/** The mailers the forms choose from: the mailers route's list, else the made ones; and the environment's default. */
function mailerList(x) { return Array.isArray(lc.exMailers?.mailers) && lc.exMailers.mailers.length ? lc.exMailers.mailers : madeList(x).map(m => ({ address: m.address, displayName: m.displayName })); }
function defaultOf(x) { return String(lc.exMailers?.default || madeList(x)[0]?.address || '').toLowerCase(); }
/** The owner's own domain for the example address, else the placeholder word. */
function exampleHost(x) { const d = Array.isArray(x?.domains) ? x.domains : []; return d[0]?.host || 'yourdomain'; }

const EXPLAIN = explainLink('licensing', 'What a mailer is');

export function exchangeHtml() {
  if (!showsLicensing() || !tenantConnected()) return '';
  const e = st.D.escapeHtml, p = perms();
  if (lc.exErr) return cardHtml({ key: 'exchange', icon: 'send', title: 'Mailers', summary: 'could not be read', explain: EXPLAIN, body: `<p class="acct-card-note ev-note is-bad">${e(sentence(lc.exErr))}</p>` });
  const x = ex();
  if (!x) return lc.ex === null && lc.exErr === '' && lc.view ? '' : cardHtml({ key: 'exchange', icon: 'send', title: 'Mailers', summary: 'reading', explain: EXPLAIN, body: '<p class="acct-card-note">Reading…</p>' });
  const ro = x.writes === false ? '<p class="acct-card-note ev-note">This lane reads your tenant and shows what each step would do; nothing is written from here.</p>' : '';
  let summary, inner;
  if (!x.configured) {
    summary = 'being set up';
    inner = heroHtml({ title: 'Being set up', line: 'Mailers are being set up on the platform. Nothing to do on your side; this card opens on its own.' });
  } else if (!x.approved) {
    summary = 'approve mail access';
    inner = `${heroHtml({
      title: 'Approve mail access', tags: '<span class="acct-tag is-pending">first step</span>',
      line: canManage() ? `Sign in at Microsoft as your tenant's administrator and approve PragOptics once; then it can make mailers such as notify@${exampleHost(x)} and send from them. The link works once and for ten minutes.` : 'The owner, or a role with Connect your Microsoft tenant and set up its mail, approves mail access in your tenant first.',
      actions: canManage() && !p.readOnly ? reqLead('ex-connect', { lic: 'ex-connect' }, 'external', 'Approve mail access', 'Opening Microsoft…', '', 'btn-primary') : ''
    })}${ro}`;
  } else {
    const made = madeList(x);
    const count = Number(x.count || made.length || 0), limit = Number(x.limit || 0);
    const green = !!(x.role?.assignedAt && x.provenAt);
    // "0 of 2 mailers · ready" read as a readiness count (2026-11-02, Cameron): the count is the plan's allowance, said so,
    // with the ring; the state is its own tag
    summary = `${count} of ${limit} on your plan${green ? '' : ' · not checked yet'}`;
    inner = `${heroMailers(x, made, count, limit, green, e)}${ro}${green ? '' : stateHtml(x, e)}${listHtml(x, made, e)}${formsHtml(x, made, e)}${newHtml(x, made, count, limit, e)}${green ? approvedHtml(x, e) : ''}`;
  }
  // folded only while the platform is setting things up (nothing to do); open wherever the person has a step to take
  return cardHtml({ key: 'exchange', icon: 'send', title: 'Mailers', summary: e(summary), explain: EXPLAIN, open: !!x.configured, body: `${noteHtml('exchange')}${errHtml('exchange')}${inner}` });
}

/** The hero: the plan's ring with its count, how many mailers, the state as a tag, ONE sentence, New mailer. */
function heroMailers(x, made, count, limit, green, e) {
  const sendAt = lc.exMailers?.sendProvenAt || null;
  const tags = `${green ? `<span class="acct-tag is-verified" data-tip="Approved and checked ${e(dayWord(x.provenAt))}">ready</span>` : x.role?.assignedAt ? '<span class="acct-tag is-pending">not checked yet</span>' : '<span class="acct-tag is-pending">permission not given yet</span>'}${sendAt ? '<span class="acct-tag is-verified">sending proven</span>' : ''}`;
  // the count is in the ring and on the card's line; the sentence says what a mailer is, with the owner's own domain
  const line = !count
    ? `A mailer is a shared mailbox on your own domain, such as notify@${exampleHost(x)}, that your forms and notices send from${green ? '.' : '; give PragOptics its permission and check it below first.'}`
    : green
      ? `Your forms and notices send from ${count === 1 ? 'it' : 'them'}${sendAt ? `; a test went out ${dayWord(sendAt)}` : ''}.`
      : 'Nothing sends until PragOptics has its permission and is checked below.';
  const full = limit > 0 && count >= limit;
  const canNew = canAssign() && !!x.provenAt && !full && x.writes !== false;
  const newBtn = canNew && made.length && !lc.exNew ? leadBtn({ lic: 'ex-new' }, 'plus', 'New mailer', '', 'btn-primary') : '';
  return heroHtml({ lead: ringHtml(count, limit, full, { label: `${count}/${limit}` }), title: count ? e(countWord(count, 'mailer', 'mailers')) : 'No mailer yet', tags, line: e(line), actions: newBtn });
}

/** The three steps while one is not done: approved (date), the permission with its button, the check with its button. */
function stateHtml(x, e) {
  const roleRow = x.role?.assignedAt
    ? `<div class="lic-fact"><span class="lic-k">Permission</span><span class="lic-v"><span class="lic-state is-verified">Given ${e(dayWord(x.role.assignedAt))}</span></span></div>`
    : `<div class="lic-fact"><span class="lic-k">Permission</span><span class="lic-v"><span class="lic-state is-pending">Not given yet</span>${canManage() ? ` ${reqIcon('ex-role', { lic: 'ex-role' }, 'refresh', 'Give PragOptics its mail permission now', 'Asking Microsoft…')}` : ''}</span></div>`;
  const why = !x.role?.assignedAt && x.role?.why ? `<p class="lic-hint">${e(sentence(x.role.why))}</p>` : '';
  const proofRow = `<div class="lic-fact"><span class="lic-k">Checked</span><span class="lic-v">${x.provenAt ? `<span class="lic-state is-verified">${e(dayWord(x.provenAt))}</span>` : '<span class="lic-state is-pending">Not yet</span>'}</span></div>`;
  const check = canManage() && !x.provenAt ? `<div class="acct-actions-row">${reqLead('ex-check', { lic: 'ex-check' }, 'checkCircle', 'Check it', 'Checking… up to a minute', '', 'btn-primary')}</div>` : '';
  return `
    <div class="lic-facts">
      <div class="lic-fact"><span class="lic-k">Approved</span><span class="lic-v">${e(dayWord(x.approvedAt))}</span></div>
      ${roleRow}${proofRow}
    </div>${why}
    <p class="lic-hint">Microsoft can take a few minutes to apply an approval and a permission.</p>
    ${check}`;
}

/** Every step green: the approval's dates and Check again, folded under the card. */
function approvedHtml(x, e) {
  const a = dayWord(x.approvedAt), r = dayWord(x.role.assignedAt), c = dayWord(x.provenAt);
  const when = a === r && r === c ? `Approved at Microsoft ${a}` : `Approved ${a}, permission ${r}, checked ${c}`;
  const check = canManage() ? `<div class="acct-actions-row">${reqLead('ex-check', { lic: 'ex-check' }, 'checkCircle', 'Check again', 'Checking… up to a minute')}</div>` : '';
  return `<details class="lic-past lic-runtime"><summary>${e(when)}</summary><p class="lic-hint">PragOptics makes your mailers in your Microsoft tenant with the permission you approved there. Check again reads your tenant; it takes up to a minute.</p>${check}</details>`;
}

/** The mailers the platform made, each with the forms it sends for; then what Check found in the tenant beside them. */
function listHtml(x, made, e) {
  const live = Array.isArray(lc.exLive) ? lc.exLive : null;
  const mailers = mailerList(x), dflt = defaultOf(x), forms = lc.exForms;
  const testNote = (m) => lc.exTest && lc.exTest.address === m.address ? `<p class="lic-hint ${lc.exTest.bad ? 'is-bad' : ''}" role="status">${e(lc.exTest.text)}</p>` : '';
  const sendsFor = (a) => {
    if (!forms) return lc.exFormsErr ? `<p class="lic-hint is-bad">${e(lc.exFormsErr)}</p>` : '';
    const use = formsFor(a, forms, mailers, dflt);
    const names = [...use.explicit.map(f => f.name), ...use.byDefault.map(f => use.explicit.length || mailers.length > 1 ? `${f.name} (as the environment's mailer)` : f.name)];
    return names.length ? `<p class="lic-mailer-for">Sends for ${e(listWords(names))}.</p>` : `<p class="lic-mailer-for adm-muted">Sends for no form yet${forms.length ? ': pick it under Your forms below' : ''}.</p>`;
  };
  const rows = made.map(m => {
    const a = String(m.address || '').toLowerCase();
    return `<li class="lic-mailer"><div class="lic-dom-row"><span class="ev-code lic-dom-host" id="licEx-${e(m.address)}">${e(m.address)}</span>${a === dflt ? '<span class="acct-tag is-verified">default</span>' : ''}<span class="lic-state is-quiet">${e(m.displayName || m.name || '')}</span><span class="lic-dom-act">${iconBtn({ lic: 'ex-copy' }, 'copy', `Copy ${m.address}`, `data-address="${e(m.address)}"`)}${canManage() ? reqLead(`ex-test:${m.address}`, { lic: 'ex-test' }, 'send', 'Send a test', 'Sending…', `data-address="${e(m.address)}" data-tip="Send one test message from this mailer to you"`) : ''}</span></div>${sendsFor(a)}<p class="lic-hint">Made ${e(dayWord(m.createdAt))}. Your team reads it in Outlook once given access in the Exchange admin center.</p>${testNote(m)}</li>`;
  }).join('');
  const others = live ? live.filter(m => !made.some(x2 => x2.address === m.address)) : [];
  const liveRows = others.map(m => `<li class="lic-mailer"><div class="lic-dom-row"><span class="ev-code lic-dom-host">${e(m.address)}</span><span class="lic-state is-quiet">${e(m.displayName || m.name || '')}</span></div><p class="lic-hint">In your tenant already, not made here${m.fullAccess?.length ? `; ${countWord(m.fullAccess.length, 'person has', 'people have')} access` : ''}.</p></li>`).join('');
  if (!rows && !liveRows) return live ? '<p class="lic-hint">Your tenant holds no shared mailbox, so you have no mailer yet.</p>' : '';
  return `<h4 class="lic-sub lic-sub--gap">Your mailers</h4><ul class="lic-dom-list">${rows}${liveRows}</ul>${errHtml('exchange-test')}`;
}

/**
 * The forms that take submissions, each with the mailer it sends from (2026-11-02, Cameron: "what each mailer is sending
 * on behalf of, as in what table drives it"). The pick is the install's `mailer` setting; empty is the environment's
 * mailer. The server checks the role again on every save (member and above, on a lane that writes).
 */
function formsHtml(x, made, e) {
  const forms = lc.exForms;
  if (!made.length || !forms) return '';
  const head = '<h4 class="lic-sub lic-sub--gap">Your forms</h4>';
  if (!forms.length) return `${head}<p class="lic-hint">No form on your site takes submissions yet. A form published from the studio appears here with the mailer it sends from.</p>`;
  const mailers = mailerList(x), dflt = defaultOf(x);
  const can = canAssign() && x.writes !== false;
  const rows = forms.map(f => {
    const now = resolvedMailer(f, mailers, dflt);
    const own = String(f.mailer || '').toLowerCase();
    const picked = own && mailers.some(m => String(m.address || '').toLowerCase() === own) ? own : '';
    const opts = [`<option value="" ${picked ? '' : 'selected'}>${e(`The environment's mailer${dflt ? ` (${dflt})` : ''}`)}</option>`]
      .concat(mailers.map(m => `<option value="${e(m.address)}" ${String(m.address || '').toLowerCase() === picked ? 'selected' : ''}>${e(m.address)}</option>`)).join('');
    const saving = lc.busy === `ex-from:${f.installId}`;
    const control = can
      ? `<label class="lic-from-wrap"><span class="lic-k">Send from</span><select class="acct-input lic-from" data-lic-from="${e(f.installId)}" aria-label="Send ${e(f.name)} from" ${lc.busy ? 'disabled' : ''}>${opts}</select></label>${saving ? '<span class="lic-hint" role="status">Saving…</span>' : ''}`
      : `<span class="lic-state is-quiet">${e(now ? `sends from ${now}` : 'no mailer')}</span>`;
    return `<li class="lic-form-row"><div class="lic-dom-row"><span class="lic-form-name">${e(f.name)}${f.enabled ? '' : ' <span class="acct-tag">off</span>'}</span><span class="lic-state is-quiet">table ${cardLink('environment', 'data', f.table)}</span><span class="lic-dom-act">${control}</span></div></li>`;
  }).join('');
  return `${head}<p class="lic-hint">The mailer each form sends from: the team's copy and the submitter's confirmation both go from it. Each row of the form's table says what was sent.</p>${errHtml('exchange-forms')}${noteHtml('exchange-forms')}<ul class="lic-dom-list">${rows}</ul>`;
}

/** New mailer: under the hero for the first one, behind the button after; disabled with the reason when it cannot run. */
function newHtml(x, made, count, limit, e) {
  if (!canAssign()) return made.length ? '' : '<p class="acct-card-note">The owner, or a role with Give out mailboxes and licenses, makes mailers here.</p>';
  if (made.length && !lc.exNew) return '';
  const domains = Array.isArray(x.domains) ? x.domains : [];
  const full = limit > 0 && count >= limit;
  const gate = !domains.length ? 'Add a verified domain to your tenant first, on the tenant card above.'
    : full ? `Your plan carries ${countWord(limit, 'mailer', 'mailers')}; this team has ${count}.`
    : !x.provenAt ? 'Check it first, above.' : '';
  // the remembered pick only while it is still offered (a domain that left the tenant's verified list falls back to the first)
  const remembered = kept('licExHost', '');
  const chosen = domains.some(d => d.host === remembered) ? remembered : (domains[0]?.host || '');
  // one domain: it is the address's suffix, plain; several: a pick (the cleanup, 2026-11-02: no dropdown with one choice,
  // and the domain's mail state is the tenant card's sentence, never a parenthesis clipped inside a select)
  const domainCtl = domains.length === 1
    ? `<span class="lic-suffix-at">@${e(domains[0].host)}</span><input type="hidden" id="licExHost" value="${e(domains[0].host)}">`
    : `<span>@</span><select class="acct-input" id="licExHost" data-keep aria-label="Domain">${domains.map(d => `<option value="${e(d.host)}" ${d.host === chosen ? 'selected' : ''}>${e(d.host)}</option>`).join('')}</select>`;
  const nameErr = lc.err['exchange-name'] ? `<p class="lic-field-err" id="licExNameErr" role="alert">${e(lc.err['exchange-name'])}</p>` : '';
  // the heading only once the form stands behind the New mailer button; for the first mailer the hero is the heading
  return `
    ${made.length ? '<h4 class="lic-sub lic-sub--gap">New mailer</h4>' : ''}
    <div class="lic-new-mailer">
      <div class="lic-new-field lic-new-addr">
        <label class="acct-label" for="licExName">Address</label>
        <div class="lic-suffix ${nameErr ? 'is-bad' : ''}"><input class="acct-input" id="licExName" type="text" data-keep value="${e(kept('licExName', ''))}" maxlength="60" placeholder="notify" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="licExNameHint${nameErr ? ' licExNameErr' : ''}">${domainCtl}</div>
        ${nameErr}
      </div>
      <div class="lic-new-field">
        <label class="acct-label" for="licExDisplay">Sender name</label>
        <input class="acct-input" id="licExDisplay" type="text" data-keep value="${e(kept('licExDisplay', ''))}" maxlength="64" placeholder="Notifications (optional)" autocomplete="off">
      </div>
      <div class="lic-new-act">${reqLead('ex-create', { lic: 'ex-create' }, 'plus', 'Create the mailer', 'Creating… up to a minute', gate ? `disabled data-tip="${e(gate)}"` : '', 'btn-primary')}${made.length ? iconBtn({ lic: 'ex-new-close' }, 'x', 'Close') : ''}</div>
    </div>
    <p class="lic-hint" id="licExNameHint">${e(gate || 'Letters, digits, dots, dashes or underscores. The sender name is what people see in their inbox.')}</p>`;
}

/* ---------- actions ---------- */

/** To Microsoft's approval page for mail access (the runtime app); the answer comes back to this card. */
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
    setNote('exchange', r.assigned ? (r.already ? 'PragOptics already holds its mail permission in your tenant.' : 'PragOptics holds its mail permission now. Microsoft can take a few minutes to apply it; then press Check.') : r.planned ? sentence(r.planned) : sentence(r.why || 'The permission could not be given.'), !r.assigned && !r.planned);
    await loadExchange(); st.paint();
  }, { errKey: 'exchange', fallback: 'The permission could not be given right now.', codes: CODES });
}

async function checkRuntime() {
  lc.err.exchange = ''; setNote('exchange', '');
  await send('ex-check', 'Checking… up to a minute', async () => {
    const d = await call(`${LIC_URL}/exchange/check`, 'POST');
    lc.exLive = Array.isArray(d?.mailboxes) ? d.mailboxes : [];
    setNote('exchange', `PragOptics is in your tenant's mail. ${lc.exLive.length ? `It holds ${countWord(lc.exLive.length, 'shared mailbox', 'shared mailboxes')}.` : 'It holds no shared mailbox yet.'}`);
    await loadExchange(); st.paint();
  }, { errKey: 'exchange', fallback: 'The check could not run right now.', codes: CODES });
}

async function createMailbox() {
  const name = String(kept('licExName', document.getElementById('licExName')?.value || '')).trim();
  // the control on screen is the truth; the remembered pick only when the element is gone
  const sel = document.getElementById('licExHost');
  const host = String(sel ? sel.value : kept('licExHost', '')).trim().toLowerCase();
  // the sender name left empty: the address's own name, capitalised (notify -> Notify), so the field is optional for a human
  const displayName = String(kept('licExDisplay', document.getElementById('licExDisplay')?.value || '')).trim() || cap(name);
  lc.err.exchange = ''; lc.err['exchange-name'] = ''; setNote('exchange', '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(name)) { lc.err['exchange-name'] = 'Use letters, digits, dots, dashes or underscores, starting with a letter or digit.'; st.paint(); document.getElementById('licExName')?.focus(); return; }
  if (!host) { lc.err.exchange = 'Pick the domain.'; st.paint(); return; }
  await send('ex-create', 'Creating… up to a minute', async () => {
    const d = await call(`${LIC_URL}/exchange/mailboxes`, 'POST', { name, host, displayName });
    forget('licExName', 'licExDisplay');
    lc.exNew = false;
    setNote('exchange', d?.planned ? sentence(d.planned) : sentence(d?.note || `${name}@${host} is made. Send a test from it to prove it sends; your forms send from it as the environment's mailer unless you pick another.`), false);
    await loadExchange(); st.paint();
  }, {
    errKey: 'exchange', fallback: 'The mailbox could not be made right now.',
    codes: { ...CODES, NAME_INVALID: (ex) => { lc.err['exchange-name'] = ex.data.error; return ''; }, DOMAIN_NOT_VERIFIED_IN_TENANT: 'Pick a domain that is in your tenant and verified there.', NO_EXCHANGE: (ex) => ex?.data?.error || 'Your tenant holds no Microsoft license yet, so there is no Exchange to hold a mailbox.', SHARED_MAILBOX_LIMIT: (ex) => ex?.data?.error || 'Your plan\'s mailers are all made.', MAILBOX_EXISTS: (ex) => ex?.data?.error || 'That address is taken in your tenant.' }
  });
  if (lc.err['exchange-name']) { st.paint(); document.getElementById('licExName')?.focus(); }
}

/** Send a test from a mailer to the person pressing: the answer, good or bad, sits under that mailer's row. */
async function sendTest(address) {
  const a = String(address || '').trim().toLowerCase();
  if (!a) return;
  lc.err['exchange-test'] = ''; lc.exTest = null;
  await send(`ex-test:${a}`, 'Sending…', async () => {
    const d = await call(`${MAILERS_URL}/test`, 'POST', { address: a });
    lc.exTest = { address: a, text: `A test went to ${d?.sentTo || 'you'}.`, bad: false };
    // the proof is recorded on the environment: the hero says so on the next read
    try { lc.exMailers = await st.D.apiFetch(url(MAILERS_URL)); } catch { /* the hero says it on the next load */ }
  }, {
    errKey: 'exchange-test', fallback: 'The test could not be sent right now.',
    codes: {
      ...CODES,
      NO_MAILER: 'That address is not one of your mailers.',
      MS_NOT_CONSENTED: 'Sending needs a permission added since your tenant approved PragOptics. Press Approve again on the tenant card, then try the test.',
      MAIL_SEND_NOT_ALLOWED: 'Your tenant has not let PragOptics send as this mailbox yet: press Approve again on the tenant card (Microsoft shows the Mail.Send permission), then try the test. Microsoft can take up to an hour to apply it.',
      MS_UNAVAILABLE: 'Microsoft could not be reached right now. Try again in a moment.'
    }
  });
  // a refusal belongs under the row it was pressed on, not loose on the card
  if (lc.err['exchange-test']) { lc.exTest = { address: a, text: lc.err['exchange-test'], bad: true }; lc.err['exchange-test'] = ''; st.paint(); }
}

/** A form's Send from pick saved on its install: '' is the environment's mailer. The server checks the role again. */
async function setFrom(installId, address) {
  const f = (lc.exForms || []).find(x2 => x2.installId === installId);
  if (!f || lc.busy) { st.paint(); return; }
  const mailer = String(address || '').trim().toLowerCase();
  lc.err['exchange-forms'] = ''; setNote('exchange-forms', '');
  await send(`ex-from:${installId}`, 'Saving…', async () => {
    const d = await call(`${MODULES_URL}/${encodeURIComponent(installId)}`, 'PUT', { settings: { mailer } });
    const got = String(d?.module?.settings?.mailer || '').toLowerCase();
    f.mailer = got;
    setNote('exchange-forms', got ? `${f.name} sends from ${got} now.` : `${f.name} sends from the environment's mailer now.`);
  }, {
    errKey: 'exchange-forms', fallback: 'That could not be saved right now.',
    codes: { ...CODES, OWNER_ONLY: (ex2) => ex2?.data?.error || 'Only the owner or a team member can be named there.', MODULE_NOT_FOUND: 'That form is no longer installed. Reload the tab.' }
  });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function exchangeAction(a, btn) {
  if (a === 'ex-test') { sendTest(btn.dataset.address || ''); return true; }
  if (a === 'ex-connect') { approveRuntime(); return true; }
  if (a === 'ex-role') { giveRole(); return true; }
  if (a === 'ex-check') { checkRuntime(); return true; }
  if (a === 'ex-create') { createMailbox(); return true; }
  if (a === 'ex-new') { lc.exNew = true; st.paint(); document.getElementById('licExName')?.focus(); return true; }
  if (a === 'ex-new-close') { lc.exNew = false; st.paint(); return true; }
  if (a === 'ex-copy') { const address = String(btn.dataset.address || ''); copyButton(btn, address, { select: () => document.getElementById(`licEx-${address}`) }); return true; }
  return false;
}

/** A change on the tab's selects this module owns (a form's Send from); false when it is not one of them. */
export function exchangeChange(e) {
  const sel = e?.target?.closest?.('select[data-lic-from]');
  if (!sel) return false;
  setFrom(String(sel.dataset.licFrom || ''), sel.value);
  return true;
}
