// src/account/licensingTenant.js
//
// The team's Microsoft tenant on the Licensing tab (Part 1, 2026-09-23; Part 2, 2026-09-27; Cameron's decisions 1, 2,
// 7, 15, 16 and 17). One card: the tenant's name, where it stands, and (Part 2) the connection into it and what runs
// through it: each seat's person, the team's domains, the mail switch. A second card, My mailbox, is each person's own.
//
//   PART 2, THE CONNECTION (decision 15; GET v1/environment/licensing/tenant, read once per load into lc.tn): the owner,
//   or a role with "Connect your Microsoft tenant and set up its mail", presses Connect your tenant; the page goes to Microsoft's sign-in for the
//   named tenant, then Microsoft's approval page for that same tenant, and comes back here with the outcome in the
//   address (bootstrap.js keeps it; resetTenant reads it once). A tenant PragOptics made is connected by PragOptics
//   (decision 16): the card says so and offers nothing. Connected, the card shows the organization, its licenses in use,
//   Bring every seat up to date ("Give out mailboxes and licenses"), and each verified domain: Add to tenant, its TXT
//   with Copy when the DNS is managed elsewhere, Check again, then Switch mail to Microsoft, which first shows exactly what
//   is written (an existing SPF merged, never doubled; mail going elsewhere named) and asks twice. A read-only lane says
//   so and shows what each step would do.
//     POST .../tenant/connect -> { url }     POST .../tenant/seats/sync     POST .../tenant/domains { host }
//     POST .../tenant/domains/{host}/verify   GET/POST .../tenant/domains/{host}/mail { confirm }   POST .../mail/confirm
//   MY MAILBOX (decision 17): the signed-in person's own address and state; their first password waits for them alone,
//   shown once (the server deletes its copy before it answers; this page holds it in memory only, never in storage) with
//   Copy and I have kept it; Reset my password sets a new one in Microsoft and it waits here once more. Admins never see
//   or set anyone's password.
//     GET .../tenant/mailbox   POST .../tenant/mailbox/password -> { password, address }   POST .../tenant/mailbox/reset
//
//   The owner names the tenant: a new one PragOptics has Microsoft make (name.onmicrosoft.com), or the ID of one the
//   business already has. The name box takes 3 to 27 letters and digits, says so under the box, and never changes
//   what was typed; the server asks Microsoft whether the name is free and refuses a taken one ("That name is already
//   taken at Microsoft. Choose another."), shown under the box.
//   Once mail or a license is ordered the name is fixed (decision 1): the card shows it locked and says why.
//   A tenant PragOptics is having made reads "Your Microsoft tenant is being set up by PragOptics." until the hourly
//   check finds it at Microsoft; then its name and ID show (decision 7). 24 hours without it: "Microsoft has not
//   created your tenant yet. We are looking into it." (decision 2). The sentences are the server's (describe()).
//
//   POST v1/environment/licensing/microsoft { domainPrefix } | { tenantId }   the owner; 409 TENANT_NAME_TAKEN,
//        400 TENANT_NAME_INVALID, 400 TENANT_ID_INVALID, 409 TENANT_LOCKED, 503 TENANT_LOOKUP_FAILED
//
//   YOUR ADMINISTRATOR ACCOUNT (2026-09-24, decision 29): under the facts of a tenant PragOptics made, once Microsoft
//   has it and before the handover at leaving, the owner can ask for an administrator account of their own. The
//   sign-in name box carries the tenant's suffix and is checked as typed, never rewritten; asked, the card says so and
//   offers Withdraw; made, it names the account; not made, it gives the reason and the box again. PragOptics makes it
//   by hand; nothing is written in Microsoft from here. Anyone but the owner sees nothing of it.
//     POST   v1/environment/licensing/tenant/admin-account { signInName }   DELETE the same address withdraws
//   THE FIRST PASSWORD (decision 37(3)): made, the card offers Show the first password once. The answer is the only copy
//   (the server deletes its own before it answers): it is held in this page's memory alone, never in browser storage,
//   shown in a read-only box with Copy, and gone when the owner presses I have kept it, leaves the tab or reloads.
//   Microsoft asks for a new password at the first sign-in, and the card says so.
//     POST   v1/environment/licensing/tenant/admin-account/password   -> { password, signIn }   once
//
// licensing.js paints the card and routes its clicks here.

import { iconBtn, leadBtn, ico, copyButton, armed } from './cards.js';
import { LIC_URL, lc, st, url, cardHtml, perms, call, send, reqLead, reqIcon, errHtml, noteHtml, setNote, kept, forget, sentence, showsLicensing, dayWord, countWord, stepWord, stepNo, STEPS, stepGate, tenantNamed } from './licensingShared.js';

const SIGNIN_RULE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SIGNIN_WORDS = 'Use 1 to 64 letters, digits, dots, dashes or underscores, starting with a letter or digit.';
/** first.last from the owner's own name, only when that already fits the rule. */
function signInSuggestion(m) {
  const a = m.accepter || {};
  const s = `${String(a.firstName || '').trim()}.${String(a.lastName || '').trim()}`.toLowerCase();
  return a.hasName && SIGNIN_RULE.test(s) && !s.endsWith('.') ? s : '';
}

const RETURN_KEY = 'pragoptics_tenant_return';
// the administrator account's first password once it was shown (decision 37(3)): this page's memory only
let shown = null;
// the person's own first mailbox password once shown (decision 17): this page's memory only, never storage
let mbShown = null;
const NAME_RULE = /^[A-Za-z0-9]{3,27}$/;
const ID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_HINT = '3 to 27 letters and digits: no spaces, dots or dashes. Microsoft makes your tenant as this name followed by .onmicrosoft.com. The name is fixed once mail or a license is ordered.';
// The tenant name is suggested from the business name (letters and digits, up to 27), and a live preview under the field
// shows the full .onmicrosoft.com address as the owner types, so the technical name is never a guess (2026-09-30, Cameron).
function slugName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 27); }
if (typeof document !== 'undefined') {
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t || t.id !== 'licTnName') return;
    const prev = document.getElementById('licTnNamePreview');
    if (!prev) return;
    const slug = slugName(t.value);
    prev.textContent = slug ? `${slug}.onmicrosoft.com` : '…';
  });
}
// Back from Microsoft (decision 15): what the callback put in the address, in the card's words. The server's own `why`
// is a plain sentence and wins when it is there.
const RETURN_SAID = {
  connected: 'Your Microsoft tenant is connected. PragOptics can now make each seat\'s mailbox and add your domains.',
  declined: 'You did not approve PragOptics at Microsoft, so nothing was connected.',
  mismatch: 'That sign-in or approval was for a different Microsoft organization than the one named here, so nothing was connected.',
  taken: 'That Microsoft organization is already connected elsewhere, so nothing was connected. PragOptics has been told.',
  unproven: 'Microsoft did not finish the approval, so nothing was connected. Start again.',
  expired: 'That link had already been used or had expired, so nothing was connected. Start again.',
  missing: 'That environment no longer exists.',
  failed: 'Microsoft did not finish the approval, so nothing was connected. Start again.',
  later: 'Nothing was changed in your Microsoft tenant.'
};

/**
 * Someone came back from Microsoft (bootstrap.js keeps the answer in sessionStorage): the card says once what came of
 * it. The tenant read (lc.tn) and any mail plan open are dropped with the visit; the first passwords too.
 */
export function resetTenant() {
  lc.tnEdit = false; lc.tnMode = '';
  shown = null; mbShown = null;   // a first password shown on an earlier visit to the tab is gone with it
  lc.tn = null; lc.tnPlan = {}; lc.tnErr = '';
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null'); sessionStorage.removeItem(RETURN_KEY); } catch { r = null; }
  if (r && r.outcome) {
    const good = r.outcome === 'connected';
    setNote('tenant', good ? RETURN_SAID.connected : sentence(r.why || RETURN_SAID[r.outcome] || RETURN_SAID.failed), !good);
    // back from Microsoft with the tenant connected: the first paint lands on step 3 (2026-10-05, Cameron)
    lc.landed = r.outcome;
  }
}

/**
 * The tenant read live (the connection, its licenses, its domains) and the caller's own mailbox, once per load of the
 * tab, only when the tenant is named. A lane without the route, or one where the read fails, leaves the Part 1 facts
 * standing and says so in the card; nothing else waits on it.
 */
export async function loadTenantStatus(v) {
  const m = v?.microsoft || {};
  if (!v?.account || !(m.tenantId || m.domainPrefix)) { lc.tn = null; return; }
  try { lc.tn = await st.D.apiFetch(url(`${LIC_URL}/tenant`)); lc.tnErr = ''; }
  catch (ex) {
    lc.tn = null;
    lc.tnErr = ex?.status === 404 && !ex?.data?.code ? '' : (ex?.data?.error || st.D.friendlyError(ex, 'Your Microsoft tenant could not be read right now.'));
  }
}
function tn() { return lc.tn?.tenant || null; }
/** May this person connect the tenant, add domains and switch mail (decision 4: the owner, or a role given "Connect your Microsoft tenant and set up its mail")? */
function canDomains() { const p = perms(); return p.canManageDomainsMail !== undefined ? !!p.canManageDomainsMail : (!!p.isOwner && !p.readOnly); }

function modeOf(m) { return lc.tnMode || (m.tenantId && !m.domainPrefix ? 'existing' : 'new'); }
/** The first label of a verified domain as a suggestion for the box, only when it already fits the rule as it is. */
function suggestion(v) { const d = String((v.mailDomains || [])[0] || '').split('.')[0]; return NAME_RULE.test(d) ? d.toLowerCase() : ''; }

export function tenantHtml() {
  const v = lc.view;
  if (!showsLicensing()) return '';
  const e = st.D.escapeHtml, m = v.microsoft || {}, p = perms();
  const named = tenantNamed(m);
  // step 2 of the owner's six: before the account the card stands folded, its Save waiting on step 1
  const gate = stepGate(v, 1);
  const summary = gate ? 'after the licensing account' : !named ? 'not named yet' : m.domainPrefix ? `${m.domainPrefix}.onmicrosoft.com` : 'your own tenant';
  const editing = !gate && p.canNameTenant && (!named || lc.tnEdit);
  let inner;
  if (gate) inner = p.isOwner && !v.readOnly ? formHtml(v, m, gate)
    : '<p class="acct-card-note">The owner names your Microsoft tenant here once the licensing account is created: a new one Microsoft makes for your business, or one your business already has.</p>';
  else if (editing) inner = formHtml(v, m, '');
  else if (!named) inner = p.isOwner
    ? `<p class="acct-card-note">${e(v.readOnlyWhy || 'The tenant cannot be named right now.')}</p>`
    : '<p class="acct-card-note">The owner names your Microsoft tenant here: a new one Microsoft makes for your business, or one your business already has.</p>';
  else inner = factsHtml(m, p);
  return cardHtml({
    key: 'tenant', icon: 'building', title: 'Your Microsoft tenant', summary: stepWord('tenant', e(summary)), open: !gate,
    body: `${noteHtml('tenant')}${errHtml('tenant')}${inner}`
  });
}

/** The tenant as it stands: its name (locked once ordered), its ID once Microsoft has it, and the server's words. */
function factsHtml(m, p) {
  const e = st.D.escapeHtml;
  const lock = m.locked ? `<span class="lic-state is-quiet">${ico('lock', 12)}fixed</span>` : '';
  const rows = [];
  if (m.domainPrefix) rows.push(`<div class="lic-fact"><span class="lic-k">Tenant name</span><span class="lic-v"><span class="ev-code">${e(m.domainPrefix)}.onmicrosoft.com</span> ${lock}</span></div>`);
  if (m.tenantId) rows.push(`<div class="lic-fact"><span class="lic-k">Tenant ID</span><span class="lic-v"><span class="ev-code">${e(m.tenantId)}</span>${!m.domainPrefix ? ` ${lock}` : ''}</span></div>`);
  if (!m.domainPrefix && m.tenantId) rows.push('<div class="lic-fact"><span class="lic-k">Made by</span><span class="lic-v">your business, before PragOptics</span></div>');
  // the server's sentence for where the tenant stands: being set up, not made yet, or made when mail is turned on
  const state = m.tenantFound ? '' : m.tenantDelayed
    ? `<p class="acct-card-note ev-note is-bad">${e(sentence(m.tenantText))}</p>`
    : m.domainPrefix && m.tenantText ? `<p class="acct-card-note ev-note">${e(sentence(m.tenantText))}</p>` : '';
  const why = m.locked && m.lockedText ? `<p class="lic-hint">${e(sentence(m.lockedText))}</p>` : m.domainPrefix && !m.locked ? '<p class="lic-hint">The name can change until mail or a license is ordered.</p>' : '';
  const edit = p.canNameTenant && !m.locked ? `<div class="acct-actions-row">${iconBtn({ lic: 'tn-edit' }, 'edit', 'Change the tenant')}</div>` : '';
  // step 6 is its own card now (connectHtml, below): it was rendering here, inside the card titled "Step 2 of 6",
  // exactly as step 5 was (Cameron, 2026-10-02: "why is that step 2").
  return `<div class="lic-facts">${rows.join('')}</div>${state}${why}${edit}${adminAskHtml(m, p)}`;
}

/* ---------- Part 2: the connection into the tenant, and what runs through it ---------- */

/** The connection section: nothing until the tenant is named; then where the connection stands and what it carries. */
/** Mail or a license has been ordered, so Microsoft is making (or has made) the tenant PragOptics named. */
const ORDERED_MAIL = new Set(['ordering', 'delayed', 'on', 'ending']);
const ORDERED_LICENSE = new Set(['ORDERED', 'ACTIVE']);
function ordered(v, m) {
  return !!m?.locked || ORDERED_MAIL.has(String(v?.mail?.state || '')) || (v?.licenses || []).some(l => ORDERED_LICENSE.has(String(l?.status || '')));
}

function connectionHtml(m, p) {
  const e = st.D.escapeHtml;
  const head = '';   // the card's own title says it now (connectHtml)
  const t = tn();
  // decision 16: a tenant PragOptics has Microsoft make (a new name, no ID yet) is connected by PragOptics, never by the
  // customer: nothing to do before the first order, and nothing to do while it is being connected after it. The server
  // says platformConnecting for the same case (2026-09-28); either counts.
  // A tenant Microsoft has MADE (its id recorded) is also the customer's to connect, with the administrator login the
  // distributor mailed them when it made it (2026-09-28); the server says canConnect for that case and falls through below.
  if (!t?.connected && !t?.canConnect && (t?.platformConnecting || (m.domainPrefix && !m.tenantId))) {
    const words = t?.platformConnecting || ordered(lc.view, m)
      ? 'Your Microsoft tenant is being connected by PragOptics. Your team\'s mailboxes are made once it is; nothing is needed from you.'
      : `${m.domainPrefix}.onmicrosoft.com is made by your first order of mail or a license, then connected by PragOptics. Nothing to do here yet.`;
    return `<div class="lic-admin">${head}<p class="acct-card-note">${e(words)}</p></div>`;
  }
  if (lc.tnErr) return `<div class="lic-admin">${head}<p class="acct-card-note ev-note is-bad">${e(sentence(lc.tnErr))}</p></div>`;
  if (!t) return lc.tn === null && lc.view ? '' : `<div class="lic-admin">${head}<p class="acct-card-note">Reading your tenant at Microsoft…</p></div>`;
  if (!t.configured) return `<div class="lic-admin">${head}<p class="acct-card-note">Connecting your tenant is being set up. Look again soon.</p></div>`;
  const ro = t.writes === false ? '<p class="acct-card-note ev-note">This lane reads your tenant and shows what each step would do; nothing is written from here.</p>' : '';
  if (!t.connected) {
    const lost = t.lost ? `<p class="acct-card-note ev-note is-bad">${e(sentence(t.why || 'Your administrator removed PragOptics from the tenant.'))}</p>` : '';
    const who = t.named ? `<span class="ev-code">${e(t.named)}</span>` : 'your tenant';
    if (p.readOnly) return `<div class="lic-admin">${head}${lost}<p class="acct-card-note">Not connected. ${e(sentence(lc.view?.readOnlyWhy || 'Licensing is read-only right now.'))}</p></div>`;
    if (!canDomains()) return `<div class="lic-admin">${head}${lost}<p class="acct-card-note">Not connected yet. The owner, or a role with Connect your Microsoft tenant and set up its mail, connects ${who}: they sign in at Microsoft as its administrator and approve PragOptics for your organization.</p></div>`;
    // a tenant the distributor made for this team: the customer holds its administrator login (mailed to them with the
    // order) and may connect with it now, while PragOptics keeps trying to connect it on its own
    // 2026-09-29, Cameron: the least clicks; the customer never uses the tenant's admin@. PragOptics makes the owner's own
    // Microsoft account in the tenant (their mail account) and makes it the tenant's administrator; the owner approves
    // PragOptics once with it. Until that account is ready there is nothing to press.
    if (t.madeByPlatform && !t.ownerAccount && t.ownerAccountWaits === 'seat') return `<div class="lic-admin">${head}${lost}${ro}<p class="acct-card-note">Your own Microsoft account in ${who} comes with your included mailbox. On the Mailboxes card of this tab (step ${stepNo('mail')}), give yourself your included mailbox, and PragOptics makes the account on its next pass.</p></div>`;
    // 2026-10-01, Cameron: this card went quiet in exactly the window where the customer holds the one thing nobody else
    // can do. A tenant the distributor creates stays provisional until its OWN administrator signs in once and sets the
    // first password, and Microsoft lets no partner do that for them, so PragOptics cannot finish until they have.
    // "PragOptics is making your own Microsoft account" read as work in progress while nothing could actually move
    // (bridgecc1028+wiz sat in this state for hours). The card now names the sign-in they were mailed, where to use it,
    // and why the step is theirs. t.adminLogin has been sent by the server since 2026-09-29 and was never surfaced.
    // Decision 13: the distributor is never named to a customer.
    // 2026-10-02: these last two carried no step number anywhere, so the tab promised four and the owner met six.
    // They are steps 5 and 6 of the same list every other card numbers from (licensingShared.LICENSING_STEPS).
    // 2026-10-02: this required madeByPlatform, the platform having RECORDED the tenant, so in the window where the
    // customer already holds the credentials Pax8 mailed them the card said nothing. t.adminLogin is derived from the
    // prefix at the order now, so the address is known then; having it is the signal there is something to do.
    // step 5 is its own card now (signInHtml, at the end of this file). It used to render HERE, inside the card
    // titled "Step 2 of 6", so a card labelled step 2 contained step 5, and all of it was invisible while that card
    // sat folded (Cameron, 2026-10-02: "why is it step 2 all of a sudden... there is no step 5 or 6 visible").
    // CONNECT STAYS OFFERED WHILE THE OWNER ACCOUNT IS BEING MADE (2026-10-02). Moving step 5 to its own card made this
    // branch return nothing for a platform-made tenant without an owner account yet, which took the Connect button with
    // it. That button is step 6 and it is the whole point: the consent it collects IS the connection, and the admin
    // account the distributor mailed can give it. Waiting on PragOptics to make the owner's account first is a
    // convenience, not a requirement, and on this walk it left the owner with no way forward at all for three hours.
    const whoSignsIn = t.ownerAccount
      ? `<p class="acct-card-note"><span class="lic-step">Step ${stepNo('connected')} of ${STEPS}</span> · Your Microsoft account <span class="ev-code">${e(t.ownerAccount.upn)}</span> is ready and runs ${who}. See its first password once on your My mailbox card, then press Connect your tenant, sign in with that account when Microsoft asks, and approve PragOptics once.</p>`
      : t.adminLogin
        ? `<p class="acct-card-note"><span class="lic-step">Step ${stepNo('connected')} of ${STEPS}</span> · Press Connect your tenant and sign in as <span class="ev-code">${e(t.adminLogin)}</span>, the administrator you set a password for in step ${stepNo('msSignIn')}, then approve PragOptics once. PragOptics is also making you your own Microsoft account in ${who}; you do not have to wait for it to do this.</p>`
        : '';
    return `<div class="lic-admin">${head}${lost}${ro}${whoSignsIn}
      ${t.autoStuck ? `<p class="acct-card-note ev-note">PragOptics has not been able to connect ${who} on its own, so this is open to you. Your approval is the connection; PragOptics keeps trying underneath and nothing is lost either way.</p>` : ''}
      <p class="acct-card-note">${t.madeByPlatform ? 'The link works once and for ten minutes.' : `Connect ${who} so PragOptics can make each seat's mailbox, add your domains to it and switch your mail. You sign in at Microsoft as an administrator of that tenant, approve PragOptics for your organization, and come back here. The link works once and for ten minutes.`}</p>
      <div class="acct-actions-row">${reqLead('tn-connect', { lic: 'tn-connect' }, 'external', t.lost ? 'Connect it again' : 'Connect your tenant', 'Opening Microsoft…', '', 'btn-primary')}</div>
    </div>`;
  }
  const facts = [
    `<div class="lic-fact"><span class="lic-k">Organization</span><span class="lic-v">${e(t.orgName || t.tenantId)}</span></div>`,
    `<div class="lic-fact"><span class="lic-k">Tenant ID</span><span class="lic-v"><span class="ev-code">${e(t.tenantId)}</span></span></div>`,
    t.consentAt ? `<div class="lic-fact"><span class="lic-k">Connected</span><span class="lic-v">${e(dayWord(t.consentAt))}</span></div>` : ''
  ].join('');
  const err = t.error ? `<p class="acct-card-note ev-note is-bad">${e(sentence(t.error))}</p>` : '';
  return `<div class="lic-admin">${head}${ro}<div class="lic-facts">${facts}</div>${err}${licensesInUseHtml(t)}${seatsHtml(t, p)}${domainsHtml(t)}</div>`;
}

/** The licenses the tenant holds at Microsoft, and how many are in use: read live. */
function licensesInUseHtml(t) {
  const e = st.D.escapeHtml;
  const list = Array.isArray(t.licenses) ? t.licenses : null;
  if (!list) return '';
  if (!list.length) return '<p class="lic-hint">Microsoft shows no licenses in this tenant yet.</p>';
  return `<div class="lic-facts lic-facts--tight">${list.map(l => `<div class="lic-fact"><span class="lic-k">${e(l.name)}</span><span class="lic-v">${e(`${l.consumed} of ${l.enabled} in use`)}${l.available > 0 ? ` <span class="lic-state is-quiet">${e(countWord(l.available, 'free', 'free'))}</span>` : ''}</span></div>`).join('')}</div>`;
}

/** Each seat's person and license, brought up to date now ("Give out mailboxes and licenses"); the hourly pass does it too. */
function seatsHtml(t, p) {
  const e = st.D.escapeHtml;
  const can = p.canAssign;
  const note = t.writes === false ? 'shows what it would make' : 'makes each seat\'s person and gives the license';
  return `
    <p class="acct-card-note">Every seat with a mailbox gets its person in the tenant and its license, checked every hour. ${can ? `Bring every seat up to date ${note} now.` : 'The owner, or a role with Give out mailboxes and licenses, can bring them up to date now.'}</p>
    ${can ? `<div class="acct-actions-row">${reqLead('tn-sync', { lic: 'tn-sync' }, 'refresh', 'Bring every seat up to date', 'Checking every seat…')}</div>` : ''}`;
}

/** The team's verified domains against the tenant: each added, verified, then its mail switched, one deliberate step at a time. */
function domainsHtml(t) {
  const e = st.D.escapeHtml, v = lc.view;
  const hosts = v.mailDomains || [];
  const inTenant = Array.isArray(t.domains) ? t.domains : [];
  const head = '<h4 class="lic-sub lic-sub--gap">Your domains</h4>';
  if (!hosts.length) return `${head}<p class="acct-card-note">No verified domain yet. Add and verify one on the Domains tab; then it can join your tenant here and carry your mail.</p>`;
  const can = canDomains();
  const rows = hosts.map(host => {
    const d = inTenant.find(x => x.host === host) || null;
    const plan = lc.tnPlan[host] || null;
    let state, actions = '';
    if (!d) {
      state = '<span class="lic-state is-quiet">Not in your tenant</span>';
      if (can) actions = reqIcon(`tn-dom:${host}`, { lic: 'tn-dom-add' }, 'userPlus', `Add ${host} to your tenant`, 'Adding…', `data-host="${e(host)}"`, 'btn-primary');
    } else if (d.state !== 'verified') {
      state = `<span class="lic-state is-pending">${e(d.planned ? sentence(d.planned) : 'Waiting for Microsoft to see the record')}</span>`;
      if (can) actions = reqIcon(`tn-dom:${host}`, { lic: 'tn-dom-verify' }, 'refresh', `Check ${host} again at Microsoft`, 'Checking…', `data-host="${e(host)}"`);
    } else if (d.mailAt) {
      state = `<span class="lic-state is-verified">${ico('check', 12)}${e(`Mail goes to Microsoft since ${dayWord(d.mailAt)}`)}</span>`;
    } else {
      state = `<span class="lic-state is-verified">${ico('check', 12)}In your tenant</span>`;
      if (can && !plan) actions = reqIcon(`tn-dom:${host}`, { lic: 'tn-mail-plan' }, 'mail', `Switch ${host}'s mail to Microsoft: see what changes first`, 'Reading the plan…', `data-host="${e(host)}"`, 'btn-primary');
    }
    const txt = d && d.state !== 'verified' && d.txt && !d.written ? `
      <div class="lic-txt">
        <p class="lic-hint">Add this TXT record where ${e(host)}'s DNS is managed, then Check again. Microsoft looks for it to prove the domain is yours.</p>
        <div class="lic-pw-row"><input class="acct-input ev-code" id="licTxt-${e(host)}" type="text" readonly value="${e(d.txt.value)}" autocomplete="off" spellcheck="false">${iconBtn({ lic: 'tn-dom-copy' }, 'copy', 'Copy the record', `data-host="${e(host)}"`)}</div>
      </div>` : '';
    const why = d && d.why && d.state !== 'verified' ? `<p class="lic-hint">${e(sentence(d.why))}</p>` : '';
    return `<li class="lic-dom"><div class="lic-dom-row"><span class="ev-code lic-dom-host">${e(host)}</span>${state}${actions ? `<span class="lic-dom-act">${actions}</span>` : ''}</div>${why}${txt}${plan ? planHtml(host, plan, t) : ''}</li>`;
  }).join('');
  return `${head}<p class="acct-card-note">A verified domain joins your tenant first; then its mail can be switched to Microsoft, which is shown in full and confirmed before anything is written.</p>${errHtml('tenant-domains')}<ul class="lic-dom-list">${rows}</ul>`;
}

/** Exactly what switching the domain's mail writes, against what the domain has now, before the person confirms it. */
function planHtml(host, plan, t) {
  const e = st.D.escapeHtml;
  const rec = (w) => w.type === 'MX' ? `MX ${w.name} -> ${w.exchange} (priority ${w.preference})` : w.type === 'CNAME' ? `CNAME ${w.name} -> ${w.target}` : `TXT ${w.name}: ${w.value}`;
  const writes = (plan.writes || []).map(w => `<li><span class="ev-code">${e(rec(w))}</span></li>`).join('');
  const shows = (plan.shows || []).map(s => `<li><span class="ev-code">${e(rec(s))}</span><p class="lic-hint">${e(sentence(s.why))}${s.replaces ? ` It replaces <span class="ev-code">${e(s.replaces)}</span>.` : ''}</p></li>`).join('');
  const notes = (plan.notes || []).map(n => `<p class="acct-card-note ev-note">${e(sentence(n))}</p>`).join('');
  const self = plan.managed === 'self';
  const words = self
    ? `${host}'s DNS is managed elsewhere, so add these records there yourself. When they are in, press I have added them; the switch is recorded once Microsoft's mail server answers for the domain.`
    : `PragOptics writes these records for ${host}. Mail sent to ${host} then goes to Microsoft; what is already in the old mailboxes stays there until it is moved.`;
  const act = t.writes === false
    ? '<p class="lic-hint">A read-only lane: nothing is written from here.</p>'
    : self
      ? reqLead(`tn-mail:${host}`, { lic: 'tn-mail-confirm' }, 'check', 'I have added them', 'Checking DNS…', `data-host="${e(host)}"`, 'btn-primary')
      : reqLead(`tn-mail:${host}`, { lic: 'tn-mail-switch' }, 'mail', 'Switch mail to Microsoft', 'Switching…', `data-host="${e(host)}"`, 'btn-primary is-risky');
  return `
    <div class="lic-plan" role="group" aria-label="What switching ${e(host)}'s mail changes">
      <p class="acct-card-note">${e(words)}</p>
      ${writes ? `<p class="lic-hint">${self ? 'Records to add' : 'Records PragOptics writes'}</p><ul class="lic-plan-list">${writes}</ul>` : '<p class="lic-hint">Nothing to write: the records are already in place.</p>'}
      ${shows ? `<p class="lic-hint">Replace yourself</p><ul class="lic-plan-list">${shows}</ul>` : ''}
      ${notes}
      <div class="acct-actions-row">${act}${iconBtn({ lic: 'tn-mail-cancel' }, 'x', 'Not now', `data-host="${e(host)}"`)}</div>
    </div>`;
}

/* ---------- Part 2 actions ---------- */

const LANE_CODES = { LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.', TENANT_NOT_CONNECTED: 'Connect your Microsoft tenant first.', SCOPE_REQUIRED: (ex) => ex?.data?.error || 'Your role cannot do this. The owner can turn it on for your role on the Team tab.', PLAN_ENDED: 'Your plan ended, so nothing changes in your tenant.' };

/** Decision 15: to Microsoft's sign-in for the named tenant; the answer comes back to this card. */
async function connectTenant() {
  lc.err.tenant = ''; setNote('tenant', '');
  await send('tn-connect', 'Opening Microsoft…', async () => {
    const d = await call(`${LIC_URL}/tenant/connect`, 'POST');
    if (!d || typeof d.url !== 'string' || !/^https:\/\/login\.microsoftonline\.com\//.test(d.url)) throw new Error('Microsoft\'s sign-in page could not be opened.');
    // the page leaves for Microsoft; the button stays turning until it does, and says so if the page never left
    window.location.assign(d.url);
    await new Promise((_, reject) => setTimeout(() => reject(new Error('Microsoft\'s page did not open. Try again.')), 15000));
  }, {
    errKey: 'tenant', fallback: 'Microsoft\'s sign-in page could not be opened.',
    codes: { ...LANE_CODES, PLATFORM_TENANT_CONNECTS: 'Your Microsoft tenant is being connected by PragOptics.', MICROSOFT_DETAILS_REQUIRED: 'Name your Microsoft tenant first.', MS_NOT_CONFIGURED: 'Connecting your tenant is being set up. Look again soon.', UNKNOWN_ORIGIN: 'Open this page at pragoptics.com and try again.' }
  });
}

/** Every seat with a mailbox: its person and license, now. */
async function syncSeats() {
  lc.err.tenant = ''; setNote('tenant', '');
  await send('tn-sync', 'Checking every seat…', async () => {
    const d = await call(`${LIC_URL}/tenant/seats/sync`, 'POST');
    const seats = d?.seats || [];
    const ready = seats.filter(s => s.state === 'ready').length, waiting = seats.filter(s => s.state === 'waiting').length, planned = seats.filter(s => s.state === 'planned').length, failed = seats.filter(s => s.state === 'failed').length;
    const parts = [];
    if (ready) parts.push(`${countWord(ready, 'seat is', 'seats are')} ready`);
    if (waiting) parts.push(`${countWord(waiting, 'seat waits', 'seats wait')} for Microsoft's license (the next hourly check gives it)`);
    if (planned) parts.push(`${countWord(planned, 'seat would be', 'seats would be')} made on a lane that writes`);
    if (failed) parts.push(`${countWord(failed, 'seat could', 'seats could')} not be made; we are looking into it`);
    setNote('tenant', seats.length ? `${parts.join('; ')}.` : 'No seat holds a mailbox yet. Give people their mailboxes on the Mailboxes card.', failed > 0);
    await st.load();
  }, { errKey: 'tenant', fallback: 'The seats could not be checked right now.', codes: LANE_CODES });
}

async function domainAction(btn, what) {
  const host = String(btn.dataset.host || '');
  if (!host || lc.busy) return;
  lc.err['tenant-domains'] = ''; setNote('tenant', '');
  const key = `tn-dom:${host}`;
  await send(key, what === 'add' ? 'Adding…' : 'Checking…', async () => {
    const d = what === 'add' ? await call(`${LIC_URL}/tenant/domains`, 'POST', { host }) : await call(`${LIC_URL}/tenant/domains/${encodeURIComponent(host)}/verify`, 'POST');
    const dom = d?.domain || {};
    setNote('tenant', dom.state === 'verified' ? `${host} is in your tenant and verified.` : dom.planned ? sentence(dom.planned) : dom.written ? `${host} is added. Microsoft's record was written for you; Microsoft usually sees it within the hour. Check again then.` : `${host} is added. Add the TXT record shown, then Check again.`);
    await st.load();
  }, { errKey: 'tenant-domains', fallback: what === 'add' ? 'The domain could not be added.' : 'The domain could not be checked.', codes: { ...LANE_CODES, DOMAIN_NOT_VERIFIED: 'Verify the domain on the Domains tab first.', DOMAIN_NOT_ADDED: 'Add the domain to your tenant first.' } });
}

/** What switching the domain's mail writes, read and shown first; nothing is written by this. */
async function mailPlan(btn) {
  const host = String(btn.dataset.host || '');
  if (!host || lc.busy) return;
  lc.err['tenant-domains'] = '';
  await send(`tn-dom:${host}`, 'Reading the plan…', async () => {
    const d = await st.D.apiFetch(url(`${LIC_URL}/tenant/domains/${encodeURIComponent(host)}/mail`));
    lc.tnPlan[host] = d?.mail || { writes: [], shows: [], notes: [] };
  }, { errKey: 'tenant-domains', fallback: 'The mail plan could not be read.', codes: { ...LANE_CODES, DOMAIN_NOT_VERIFIED_IN_TENANT: 'Verify the domain in your tenant first.' } });
}

/** The switch itself (asked twice: the plan was read, and the button asks again), or a self-managed domain's records confirmed. */
async function mailSwitch(btn, confirmOnly) {
  const host = String(btn.dataset.host || '');
  if (!host || lc.busy) return;
  if (!confirmOnly && !armed(btn, 'Switch mail?', { keep: 'Leave mail as it is' })) return;
  lc.err['tenant-domains'] = ''; setNote('tenant', '');
  await send(`tn-mail:${host}`, confirmOnly ? 'Checking DNS…' : 'Switching…', async () => {
    const d = confirmOnly ? await call(`${LIC_URL}/tenant/domains/${encodeURIComponent(host)}/mail/confirm`, 'POST') : await call(`${LIC_URL}/tenant/domains/${encodeURIComponent(host)}/mail`, 'POST', { confirm: true });
    const mail = d?.mail || {};
    delete lc.tnPlan[host];
    setNote('tenant', mail.switched ? `Mail for ${host} goes to Microsoft now.${mail.written ? ` ${countWord(mail.written, 'record was', 'records were')} written.` : ''} DNS changes can take up to an hour to reach everyone.` : mail.planned ? sentence(mail.planned) : `The records for ${host} are shown above; add them where its DNS is managed, then press I have added them.`);
    if (!mail.switched && !mail.planned) lc.tnPlan[host] = mail;
    await st.load();
  }, { errKey: 'tenant-domains', fallback: 'The mail switch could not be made.', codes: { ...LANE_CODES, MX_NOT_SEEN: (ex) => ex?.data?.error || 'The domain does not point its mail at Microsoft yet. DNS changes can take up to an hour.', CONFIRM_REQUIRED: 'Read the plan and confirm the switch.' } });
}

function copyTxt(btn) {
  const box = document.getElementById(`licTxt-${btn.dataset.host || ''}`);
  if (box) copyButton(btn, box.value, { select: () => box });
}

/* ---------- decision 17: My mailbox, the person's own ---------- */

/** The signed-in person's own mailbox card; nothing when they hold no seat with a mailbox. */
export function myMailboxHtml() {
  const v = lc.view, mine = lc.tn?.mine;
  if (!showsLicensing() || !v?.account || !mine || !mine.seat) return '';
  const e = st.D.escapeHtml, t = tn() || {};
  const STATE = { ready: ['is-verified', 'Ready'], waiting: ['is-pending', 'Waiting for Microsoft\'s license'], 'waiting-license': ['is-pending', 'Waiting for Microsoft\'s license'], failed: ['is-bad', 'Not made yet. We are looking into it.'], planned: ['is-pending', 'Waiting'] };
  // connected but not yet synced (the first read after Microsoft's redirect, 2026-10-05): the mailbox is being made by that very
  // read or the next; never "waiting for your tenant" once the tenant is there
  const [cls, word] = !mine.connected ? ['is-pending', 'Waiting for your Microsoft tenant'] : STATE[mine.state] || ['is-pending', 'Being made now. This card updates itself when it is ready.'];
  const address = mine.address ? `<span class="ev-code">${e(mine.address)}</span>` : '<span class="adm-muted">Your address is made with your mailbox</span>';
  const pw = mbShown && mbShown.address === mine.address ? mbShown : null;
  let first = '';
  if (pw) first = `
      <div class="lic-pw" role="group" aria-label="Your first password">
        <label class="acct-label" for="licMbPw">Your first password</label>
        <div class="lic-pw-row"><input class="acct-input ev-code" id="licMbPw" type="text" readonly value="${e(pw.password)}" autocomplete="off" spellcheck="false" autocapitalize="off">${iconBtn({ lic: 'mb-pw-copy' }, 'copy', 'Copy the password')}</div>
        <p class="acct-card-note ev-note is-bad">Copy it now and keep it somewhere safe until you sign in. It is not kept anywhere any more, so it cannot be shown again. Microsoft asks you to choose your own password the first time you sign in.</p>
        <div class="acct-actions-row">${leadBtn({ lic: 'mb-pw-hide' }, 'check', 'I have kept it: hide it')}</div>
      </div>`;
  else if (mine.firstPasswordWaiting) first = `
      <p class="acct-card-note">Your first password is waiting for you. It is shown once, then deleted, so have somewhere safe to keep it before you press. Microsoft asks you to choose your own password the first time you sign in.</p>
      <div class="acct-actions-row">${reqLead('mb-pw', { lic: 'mb-pw' }, 'lock', 'Show my first password', 'Getting it…', '', 'btn-primary')}</div>`;
  else if (mine.firstPasswordFailed) first = '<p class="acct-card-note ev-note is-bad">Your first password could not be kept for you. Reset it below and a new one waits here.</p>';
  else if (mine.firstPasswordShownAt) first = `<p class="acct-card-note">You saw your first password on ${e(dayWord(mine.firstPasswordShownAt))}; it is no longer kept. If you did not keep it, reset it below.</p>`;
  // a seat that is the person's own existing Microsoft account (created: false from the server) is not the platform's
  // to reset: their organization manages that password, so no Reset row, and the ready-state note says so
  const own = mine.created === false;
  // its own row with room above it: it sat flush under Show my first password (2026-10-05, Cameron: "no breathing room")
  const reset = mine.hasMailbox && !own && (t.writes !== false) ? `<div class="acct-actions-row lic-reset-row">${reqLead('mb-reset', { lic: 'mb-reset' }, 'key', 'Reset my password', 'Resetting…', '', 'is-risky')}</div>` : '';
  // Choose your own mailbox name, or one press puts it back to automatic (2026-09-30). Only before the mailbox is made,
  // and only once the tenant has a name to make the address on.
  // the name is chosen in the setup form before anything is ordered (licensingWizard.js, 2026-10-05); once the tenant is
  // connected the mailbox is seconds away, so no field appears here to be beaten by it
  const canName = !mine.nameLocked && mine.plannedAddress && t.writes !== false && !mine.connected;
  const suffix = mine.plannedAddress ? `@${mine.plannedAddress.split('@')[1]}` : '';
  const chosenNow = !!mine.mailName;
  const naming = canName ? `
      <div class="lic-span">
        <p class="acct-card-note">Your address will be <span class="ev-code">${e(mine.plannedAddress)}</span>, ${chosenNow ? 'the name you chose.' : 'made automatically from your email. You can choose your own instead.'}</p>
        <label class="acct-label" for="licMbName">Your mailbox name</label>
        <div class="lic-suffix"><input class="acct-input" id="licMbName" type="text" data-keep value="${e(kept('licMbName', mine.mailName || ''))}" maxlength="60" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${e(mine.autoName)}" aria-describedby="licMbNameHint"><span>${e(suffix)}</span></div>
        <p class="lic-hint" id="licMbNameHint">Letters, numbers, dots, dashes. If it is taken, the next free number is added.</p>
        <div class="acct-actions-row">${reqLead('mb-name-save', { lic: 'mb-name-save' }, 'check', 'Save this name', 'Saving…', '', 'btn-primary')}${chosenNow ? reqLead('mb-name-auto', { lic: 'mb-name-auto' }, 'refresh', 'Use an automatic name', 'Saving…', '') : ''}</div>
      </div>` : '';
  return cardHtml({
    key: 'mailbox-mine', icon: 'mail', title: 'My mailbox', summary: e(mine.address || word),
    body: `
      ${noteHtml('mailbox-mine')}${errHtml('mailbox-mine')}
      <div class="lic-facts">
        <div class="lic-fact"><span class="lic-k">Address</span><span class="lic-v">${address}</span></div>
        <div class="lic-fact"><span class="lic-k">State</span><span class="lic-v"><span class="lic-state ${cls}">${e(mine.state === 'failed' && mine.why ? sentence(mine.why) : word)}</span></span></div>
      </div>
      ${naming}
      ${mine.state === 'ready' ? `<p class="acct-card-note">Sign in at <a href="https://outlook.office.com" target="_blank" rel="noopener noreferrer">outlook.office.com</a>, or in the Outlook app on your phone. ${own ? 'This is your own Microsoft account, so your password is managed by your organization, not reset here.' : 'Nobody at PragOptics, and no administrator on your team, can see or set your password: it is yours alone.'}</p>` : ''}
      ${first}
      ${reset}`
  });
}

async function showMyPassword() {
  lc.err['mailbox-mine'] = ''; setNote('mailbox-mine', '');
  await send('mb-pw', 'Getting it…', async () => {
    const d = await call(`${LIC_URL}/tenant/mailbox/password`, 'POST');
    mbShown = d && typeof d.password === 'string' ? { password: d.password, address: String(d.address || '') } : null;
    await st.load();
  }, { errKey: 'mailbox-mine', fallback: 'The password could not be shown right now. Try again in a moment.', codes: LANE_CODES });
  if (!mbShown && lc.err['mailbox-mine']) { try { await st.load(); } catch { /* the card keeps its sentence */ } }
  if (mbShown) requestAnimationFrame(() => document.getElementById('licMbPw')?.select());
}
function copyMyPassword(btn) {
  const box = document.getElementById('licMbPw');
  if (box) copyButton(btn, box.value, { select: () => box });
}
async function saveMyMailName() {
  lc.err['mailbox-mine'] = ''; setNote('mailbox-mine', '');
  const name = String(document.getElementById('licMbName')?.value || '').trim();
  await send('mb-name-save', 'Saving…', async () => {
    const d = await call(`${LIC_URL}/tenant/mailbox/name`, 'POST', { name });
    setNote('mailbox-mine', d?.auto ? 'Your mailbox name is automatic now.' : `Your mailbox will be made as ${d?.plannedAddress || 'the name you chose'}.`);
    await st.load();
  }, { errKey: 'mailbox-mine', fallback: 'That name could not be saved right now.', codes: { ...LANE_CODES, NAME_LOCKED: 'Your mailbox is already made, so its name cannot be changed here.', NO_MAILBOX: 'You have no mailbox seat to name yet.' } });
}
async function autoMyMailName() {
  lc.err['mailbox-mine'] = ''; setNote('mailbox-mine', '');
  await send('mb-name-auto', 'Saving…', async () => {
    const d = await call(`${LIC_URL}/tenant/mailbox/name`, 'POST', { name: '' });
    setNote('mailbox-mine', `Your mailbox name is automatic now${d?.plannedAddress ? `: ${d.plannedAddress}` : ''}.`);
    await st.load();
  }, { errKey: 'mailbox-mine', fallback: 'That could not be saved right now.', codes: LANE_CODES });
}
async function resetMyPassword(btn) {
  if (!armed(btn, 'Reset it?', { keep: 'Do not reset it' })) return;
  lc.err['mailbox-mine'] = ''; setNote('mailbox-mine', '');
  mbShown = null;
  await send('mb-reset', 'Resetting…', async () => {
    const d = await call(`${LIC_URL}/tenant/mailbox/reset`, 'POST');
    setNote('mailbox-mine', d?.planned ? 'A read-only lane: nothing was reset.' : 'Your password was reset. A new first password waits here for you, shown once.');
    await st.load();
  }, { errKey: 'mailbox-mine', fallback: 'The password could not be reset right now.', codes: { ...LANE_CODES, NO_MAILBOX: 'You have no mailbox to reset yet.', NOT_PLATFORM_ACCOUNT: 'This is your own Microsoft account, so your password is managed by your organization, not reset here.' } });
}

/** Decision 29: the owner's own administrator account in the tenant PragOptics made. The owner only; '' otherwise.
 * On a tenant PragOptics made, the automatic connect makes the owner's account on its own (tenantAccess.ownerAdmin), so
 * this manual "ask us to make it" offer is hidden there: it only confused, sitting beside the mailbox (Cameron,
 * 2026-09-30). It stays for a tenant the business brought, where the platform does not make the owner an account. */
function adminAskHtml(m, p) {
  const a = m.adminAsk || {};
  // The guard said m.madeByPlatform, which the server never sends on `microsoft`: the field there is createdByPlatform
  // (auth/licensing.js), so this read undefined and the section has ALWAYS shown, including for a tenant PragOptics
  // made, where PragOptics creates the owner's account itself and there is nothing to ask for. It put a section headed
  // "Your administrator account", with a button to ask for one, inside the card titled "Step 2 of 6", in the middle of
  // a sequence whose step 5 is a different administrator sign-in entirely (Cameron, 2026-10-02: "you still have step 2
  // as the admin request... that was not there on the first round").
  if (!p.isOwner || !a.offered || m.createdByPlatform) return '';
  const e = st.D.escapeHtml;
  const suffix = a.suffix || (m.domainPrefix ? `@${m.domainPrefix}.onmicrosoft.com` : '');
  const head = '<h4 class="lic-sub">Your administrator account</h4>';
  if (a.state === 'asked') {
    return `<div class="lic-admin">${head}
      <p class="acct-card-note">You asked for <span class="ev-code">${e(a.signIn)}</span>${a.askedAt ? ` on ${e(dayWord(a.askedAt))}` : ''}. PragOptics makes it by hand in Microsoft; you get an email when it is ready, and its first password waits here for you, shown once.</p>
      ${a.canWithdraw ? `<div class="acct-actions-row">${reqLead('tn-admin-withdraw', { lic: 'tn-admin-withdraw' }, 'x', 'Withdraw the request', 'Withdrawing…')}</div>` : ''}
    </div>`;
  }
  if (a.state === 'ready') {
    // decision 37(3): the first password waits here for the owner, shown once and then deleted on the server
    const pw = shown && shown.signIn === a.signIn ? shown : null;
    const first = pw ? `
      <div class="lic-pw" role="group" aria-label="The first password">
        <label class="acct-label" for="licTnAdminPw">First password</label>
        <div class="lic-pw-row"><input class="acct-input ev-code" id="licTnAdminPw" type="text" readonly value="${e(pw.password)}" autocomplete="off" spellcheck="false" autocapitalize="off">${iconBtn({ lic: 'tn-admin-pw-copy' }, 'copy', 'Copy the password')}</div>
        <p class="acct-card-note ev-note is-bad">Copy it now and keep it somewhere safe until you sign in. It is not kept anywhere any more, so it cannot be shown again. Microsoft asks you to choose a new password the first time you sign in.</p>
        <div class="acct-actions-row">${leadBtn({ lic: 'tn-admin-pw-hide' }, 'check', 'I have kept it: hide it')}</div>
      </div>` : a.passwordWaiting ? `
      <p class="acct-card-note">Its first password is waiting for you. It is shown once, then deleted, so have somewhere safe to keep it before you press. Microsoft asks you to choose a new password the first time you sign in.</p>
      <div class="acct-actions-row">${reqLead('tn-admin-pw', { lic: 'tn-admin-pw' }, 'lock', 'Show the first password', 'Getting it…', '', 'btn-primary')}</div>`
      : a.passwordShownAt ? `<p class="acct-card-note">You saw its first password on ${e(dayWord(a.passwordShownAt))}; it is no longer kept. If you did not keep it, write to support@bridgesindust.com and PragOptics sets a new one.</p>` : '';
    return `<div class="lic-admin">${head}
      <p class="acct-card-note">Your administrator account: <span class="ev-code">${e(a.signIn)}</span>${a.readyAt ? `, made ${e(dayWord(a.readyAt))}` : ''}. Sign in at <a href="https://admin.microsoft.com" target="_blank" rel="noopener noreferrer">admin.microsoft.com</a>.</p>
      ${first}
    </div>`;
  }
  const acc = m.accepter || {};
  const who = acc.hasName ? `${acc.firstName} ${acc.lastName}` : '';
  const err = lc.err['tenant-admin'] ? `<p class="lic-field-err" id="licTnAdminErr" role="alert">${e(lc.err['tenant-admin'])}</p>` : '';
  const needName = !acc.hasName;
  return `<div class="lic-admin">${head}
    ${a.state === 'refused' ? `<p class="acct-card-note ev-note is-bad">PragOptics could not make <span class="ev-code">${e(a.signIn)}</span>: ${e(sentence(a.reason))} You can ask again.</p>` : ''}
    <p class="acct-card-note">PragOptics works in this tenant through the approval you give it above, never through an account of its own. The tenant is yours, so you can have an administrator account of your own, with full control of the tenant (Microsoft calls it Global Administrator). When it is made, its first password waits on this card for you, shown once, and never by email.</p>
    ${a.canAsk ? `
      <label class="acct-label" for="licTnAdminName">Sign-in name</label>
      <div class="lic-suffix ${err ? 'is-bad' : ''}"><input class="acct-input" id="licTnAdminName" type="text" data-keep value="${e(kept('licTnAdminName', signInSuggestion(m)))}" maxlength="64" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="licTnAdminHint${err ? ' licTnAdminErr' : ''}"><span>${e(suffix)}</span></div>
      ${err}
      <p class="lic-hint" id="licTnAdminHint">1 to 64 letters, digits, dots, dashes or underscores.${who ? ` The account is made in your name, ${e(who)}.` : ''}</p>
      ${needName ? '<p class="acct-card-note ev-note is-bad">Add your first and last name on Profile, then ask. The account is made in your name.</p>' : ''}
      <p class="acct-card-note">Changes you make yourself in Microsoft that stop what PragOptics manages, such as removing its administrator account or the licenses it placed, are yours to put right.</p>
      <div class="acct-actions-row">${reqLead('tn-admin-ask', { lic: 'tn-admin-ask' }, 'userPlus', 'Ask for an administrator account', 'Asking…', needName ? 'disabled data-tip="Add your first and last name on Profile first"' : '', 'btn-primary')}</div>` : ''}
  </div>`;
}

async function askAdmin() {
  const typed = String(kept('licTnAdminName', document.getElementById('licTnAdminName')?.value || '')).trim();
  lc.err['tenant-admin'] = ''; lc.err.tenant = ''; setNote('tenant', '');
  // checked as typed, never rewritten; the server checks it again
  if (!SIGNIN_RULE.test(typed) || typed.endsWith('.')) { lc.err['tenant-admin'] = SIGNIN_WORDS; st.paint(); document.getElementById('licTnAdminName')?.focus(); return; }
  await send('tn-admin-ask', 'Asking…', async () => {
    try { await call(`${LIC_URL}/tenant/admin-account`, 'POST', { signInName: typed }); }
    catch (ex) { if (ex?.data?.code === 'SIGNIN_INVALID') { lc.err['tenant-admin'] = ex.data.error; return; } throw ex; }
    forget('licTnAdminName');
    setNote('tenant', 'Asked. PragOptics makes the account by hand; you get an email when it is ready.');
    await st.load();
  }, {
    errKey: 'tenant', fallback: 'The request could not be sent.',
    codes: { LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.' }
  });
  if (lc.err['tenant-admin']) document.getElementById('licTnAdminName')?.focus();
}
/** Decision 37(3): the first password, once. The server deletes its copy before it answers; this page keeps it in memory. */
async function showPassword() {
  lc.err.tenant = ''; setNote('tenant', '');
  await send('tn-admin-pw', 'Getting it…', async () => {
    const d = await call(`${LIC_URL}/tenant/admin-account/password`, 'POST');
    shown = d && typeof d.password === 'string' ? { password: d.password, signIn: String(d.signIn || '') } : null;
    await st.load();
  }, {
    errKey: 'tenant', fallback: 'The password could not be shown right now. Try again in a moment.',
    codes: { LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.' }
  });
  // a refusal (already shown, no longer kept) changes what the card offers: read it again
  if (!shown && lc.err.tenant) { try { await st.load(); } catch { /* the card keeps its sentence */ } }
  if (shown) requestAnimationFrame(() => document.getElementById('licTnAdminPw')?.select());
}
/** The password to the clipboard (cards.js copyButton); where the browser refuses, its box is selected for the keyboard. */
function copyPassword(btn) {
  const box = document.getElementById('licTnAdminPw');
  if (!box) return;
  copyButton(btn, box.value, { select: () => box });
}

async function withdrawAdmin() {
  lc.err.tenant = ''; setNote('tenant', '');
  await send('tn-admin-withdraw', 'Withdrawing…', async () => {
    await call(`${LIC_URL}/tenant/admin-account`, 'DELETE');
    setNote('tenant', 'Withdrawn. You can ask again at any time.');
    await st.load();
  }, { errKey: 'tenant', fallback: 'The request could not be withdrawn.' });
}

/**
 * The owner's form in two modes (2026-09-22): a new tenant by name, or the ID of a tenant the business has. `gate` is
 * the sentence Save waits on (step 1, the account, not done yet): Save is disabled with it under the row.
 */
function formHtml(v, m, gate = '') {
  const e = st.D.escapeHtml, mode = modeOf(m), named = tenantNamed(m);
  // switching the form's mode sends nothing; while the save is out the form waits with it
  const saving = lc.busy === 'tn-save';
  const tab = (k, label) => `<button class="ev-tab ${mode === k ? 'is-on' : ''}" type="button" role="tab" aria-selected="${mode === k}" data-lic-action="tn-mode" data-mode="${k}" ${saving && mode !== k ? 'disabled data-tip="Waiting for the answer: saving the tenant"' : ''}>${label}</button>`;
  const nameErr = lc.err['tenant-name'] ? `<p class="lic-field-err" id="licTnNameErr" role="alert">${e(lc.err['tenant-name'])}</p>` : '';
  // suggested from the business name when nothing is named yet; the preview shows exactly what the address becomes
  const tnDefault = m.domainPrefix || suggestion(v) || slugName(v.account?.businessName);
  const tnSlug = slugName(kept('licTnName', tnDefault));
  const tnPreview = tnSlug ? `${tnSlug}.onmicrosoft.com` : '…';
  return `
    <p class="acct-card-note">Your licenses and mailboxes live in a Microsoft tenant: your business's own space at Microsoft. Name a new one, or give the ID of one your business already has.</p>
    <div class="ev-tabs lic-ms-tabs" role="tablist" aria-label="Your Microsoft tenant">${tab('new', 'New tenant')}${tab('existing', 'We have one')}</div>
    <div class="lic-tn-form">
      <div id="licTnNameWrap" ${mode === 'existing' ? 'hidden' : ''}>
        <label class="acct-label" for="licTnName">Tenant name</label>
        <div class="lic-suffix ${nameErr ? 'is-bad' : ''}"><input class="acct-input" id="licTnName" type="text" data-keep value="${e(kept('licTnName', tnDefault))}" placeholder="yourbusiness" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="licTnNameHint${nameErr ? ' licTnNameErr' : ''}"><span>.onmicrosoft.com</span></div>
        ${nameErr}
        <p class="lic-hint">Your Microsoft address will be <span class="ev-code" id="licTnNamePreview">${e(tnPreview)}</span>, suggested from your business name. Change it if you like.</p>
        <p class="lic-hint" id="licTnNameHint">${e(NAME_HINT)}</p>
      </div>
      <div id="licTnIdWrap" ${mode === 'existing' ? '' : 'hidden'}>
        <label class="acct-label" for="licTnId">Tenant ID</label>
        <input class="acct-input" id="licTnId" type="text" data-keep value="${e(kept('licTnId', m.tenantId && !m.domainPrefix ? m.tenantId : ''))}" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="licTnIdHint">
        <p class="lic-hint" id="licTnIdHint">Your business's Microsoft tenant ID. It looks like 6eda43f3-fbf0-4e2b-9978-b543d9dd31e3. Licenses you add join that tenant.</p>
      </div>
    </div>
    <div class="acct-actions-row">
      ${reqLead('tn-save', { lic: 'tn-save' }, 'check', mode === 'existing' ? 'Save the tenant ID' : 'Save the name', mode === 'existing' ? 'Saving…' : 'Asking Microsoft…', gate ? `disabled data-tip="${e(gate)}"` : '', 'btn-primary')}
      ${named && !saving ? iconBtn({ lic: 'tn-cancel' }, 'x', 'Keep it as it is') : ''}
    </div>
    ${gate ? `<p class="lic-hint">${e(gate)}</p>` : ''}`;
}

/* ---------- actions ---------- */

async function saveTenant() {
  if (stepGate(lc.view, 1)) return;   // Save is disabled with the reason under it; nothing is sent
  const m = lc.view?.microsoft || {};
  const mode = modeOf(m);
  lc.err['tenant-name'] = ''; lc.err.tenant = ''; setNote('tenant', '');
  let payload;
  if (mode === 'new') {
    const typed = String(kept('licTnName', document.getElementById('licTnName')?.value || '')).trim();
    // the rule, checked as typed: never rewritten (a trailing .onmicrosoft.com is allowed, as the server allows it)
    if (!NAME_RULE.test(typed.replace(/\.onmicrosoft\.com$/i, ''))) { lc.err['tenant-name'] = 'Use 3 to 27 letters and digits: no spaces, dots, dashes or other characters.'; st.paint(); document.getElementById('licTnName')?.focus(); return; }
    payload = { domainPrefix: typed };
  } else {
    const typed = String(kept('licTnId', document.getElementById('licTnId')?.value || '')).trim();
    if (!ID_RULE.test(typed)) { lc.err.tenant = 'A Microsoft tenant ID looks like 6eda43f3-fbf0-4e2b-9978-b543d9dd31e3.'; st.paint(); document.getElementById('licTnId')?.focus(); return; }
    payload = { tenantId: typed };
  }
  await send('tn-save', mode === 'new' ? 'Asking Microsoft…' : 'Saving…', async () => {
    try { await call(`${LIC_URL}/microsoft`, 'POST', payload); }
    catch (ex) {
      // a name Microsoft already has, or one outside the rule: said under the box, where it was typed
      if (ex?.data?.code === 'TENANT_NAME_TAKEN' || ex?.data?.code === 'TENANT_NAME_INVALID') { lc.err['tenant-name'] = ex.data.error; return; }
      throw ex;
    }
    lc.tnEdit = false; lc.tnMode = ''; forget('licTnName', 'licTnId');
    setNote('tenant', mode === 'new' ? `Saved: ${String(payload.domainPrefix).replace(/\.onmicrosoft\.com$/i, '').toLowerCase()}.onmicrosoft.com.` : 'Saved: licenses you add join that tenant.');
    await st.load();
  }, {
    errKey: 'tenant', fallback: 'The tenant could not be saved.',
    codes: { LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.' }
  });
  if (lc.err['tenant-name']) document.getElementById('licTnName')?.focus();
}

/** Switch the form's mode in place, so what was typed stays. */
function setMode(mode) {
  lc.tnMode = mode === 'existing' ? 'existing' : 'new';
  const has = lc.tnMode === 'existing';
  const n = document.getElementById('licTnNameWrap'), t = document.getElementById('licTnIdWrap');
  if (n) n.hidden = has; if (t) t.hidden = !has;
  for (const b of document.querySelectorAll('[data-lic-action="tn-mode"]')) { const on = b.dataset.mode === lc.tnMode; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
  lc.err.tenant = ''; lc.err['tenant-name'] = '';
  st.paint();
}

/** Open the name box with a message under it (Turn on mail found the name taken at Microsoft). */
export function reopenTenant(message) {
  lc.tnEdit = true; lc.tnMode = 'new'; lc.err['tenant-name'] = message || '';
  st.paint();
  requestAnimationFrame(() => document.querySelector('[data-card="licensing:tenant"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function tenantAction(a, btn) {
  if (a === 'tn-save') { saveTenant(); return true; }
  if (a === 'tn-mode') { setMode(btn.dataset.mode); return true; }
  if (a === 'tn-edit') { lc.tnEdit = true; lc.err.tenant = ''; lc.err['tenant-name'] = ''; setNote('tenant', ''); st.paint(); document.getElementById('licTnName')?.focus(); return true; }
  if (a === 'tn-cancel') { lc.tnEdit = false; lc.tnMode = ''; lc.err.tenant = ''; lc.err['tenant-name'] = ''; forget('licTnName', 'licTnId'); st.paint(); return true; }
  if (a === 'tn-admin-ask') { askAdmin(); return true; }
  if (a === 'tn-admin-withdraw') { withdrawAdmin(); return true; }
  if (a === 'tn-admin-pw') { showPassword(); return true; }
  if (a === 'tn-admin-pw-copy') { copyPassword(btn); return true; }
  if (a === 'tn-admin-pw-hide') { shown = null; setNote('tenant', 'Hidden. The password is not kept anywhere any more.'); st.paint(); return true; }
  // Part 2: the connection, the seats, the domains and the mail switch
  if (a === 'tn-ms-signin') { goToMicrosoft(btn); return true; }
  if (a === 'tn-connect') { connectTenant(); return true; }
  if (a === 'tn-sync') { syncSeats(); return true; }
  if (a === 'tn-dom-add') { domainAction(btn, 'add'); return true; }
  if (a === 'tn-dom-verify') { domainAction(btn, 'verify'); return true; }
  if (a === 'tn-dom-copy') { copyTxt(btn); return true; }
  if (a === 'tn-mail-plan') { mailPlan(btn); return true; }
  if (a === 'tn-mail-switch') { mailSwitch(btn, false); return true; }
  if (a === 'tn-mail-confirm') { mailSwitch(btn, true); return true; }
  if (a === 'tn-mail-cancel') { delete lc.tnPlan[btn.dataset.host || '']; st.paint(); return true; }
  // decision 17: the person's own mailbox
  if (a === 'mb-pw') { showMyPassword(); return true; }
  if (a === 'mb-pw-copy') { copyMyPassword(btn); return true; }
  if (a === 'mb-pw-hide') { mbShown = null; setNote('mailbox-mine', 'Hidden. The password is not kept anywhere any more.'); st.paint(); return true; }
  if (a === 'mb-name-save') { saveMyMailName(); return true; }
  if (a === 'mb-name-auto') { autoMyMailName(); return true; }
  if (a === 'mb-reset') { resetMyPassword(btn); return true; }
  return false;
}

/* ---------- step 5: the sign-in only the customer can do, on a card of its own ---------- */

/**
 * ITS OWN CARD (2026-10-02). This lived inside the tenant card, which is step 2, so the owner was told to do step 5
 * from somewhere labelled step 2, and saw nothing at all while that card sat folded. A step with its own number gets
 * its own card, open by default, because nothing else can move until it is done.
 */
export function signInHtml() {
  if (!showsLicensing()) return '';
  const e = st.D.escapeHtml, t = tn(), p = perms();
  if (!t || p.readOnly || t.connected) return '';
  if (!((t.madeByPlatform || t.adminLogin) && !t.ownerAccount)) return '';
  if (t.ownerAccountWaits === 'seat') return '';
  const who = t.named ? `<span class="ev-code">${e(t.named)}</span>` : 'your tenant';
  const addr = t.adminLogin ? e(t.adminLogin) : `admin@${e(String(t.named || 'yourtenant'))}`;
  const lost = t.lost ? `<p class="acct-card-note ev-note is-bad">${e(sentence(t.why || 'Your administrator removed PragOptics from the tenant.'))}</p>` : '';
  const ro = t.writes === false ? '<p class="acct-card-note ev-note">This lane reads your tenant and shows what each step would do; nothing is written from here.</p>' : '';
  return cardHtml({
    key: 'ms-signin', icon: 'external', title: 'Sign in to Microsoft', summary: stepWord('msSignIn', 'yours to do now'), open: true,
    body: `${lost}${ro}
      <div class="lic-call">
        <p class="lic-call-head">Sign in once, and set your password</p>
        <p class="lic-call-line">Only you can do this. Microsoft lets no one else set ${who}'s first password, so nothing else moves until it is done.</p>
        <dl class="lic-call-facts">
          <div><dt>Your account name</dt><dd><span class="ev-code" id="licMsUpn">${addr}</span></dd></div>
          <div><dt>Your first password</dt><dd>In the mail from Pax8, our license distributor, titled as a Microsoft software order fulfilment and sent from a noreply address. You need it <strong>twice</strong>: once to sign in, then again to change it to a password of your own. If it has not arrived, you are waiting on it, and nothing is wrong.</dd></div>
          <div><dt>Where to sign in</dt><dd>The button below copies your sign-in name and opens Microsoft in a new tab. The link in that mail works too, as does typing <span class="ev-code">admin.microsoft.com</span> yourself. Microsoft does not send you back, so return to this page when you are done.</dd></div>
        </dl>
        <div class="acct-actions-row">${leadBtn({ lic: 'tn-ms-signin' }, 'external', 'Copy my sign-in and open Microsoft', `data-upn="${addr}"`, 'btn-primary')}</div>
        <p class="lic-call-line" id="licMsGo" role="status" aria-live="polite" hidden></p>
        <p class="lic-call-line">Microsoft asks you to set a new password on that first sign-in. Once you do, your tenant activates and your mail licensing goes live. Come back to this page afterwards: nothing sends you back on its own, and step ${STEPS} of ${STEPS} is waiting here for you, which is approving PragOptics once.</p>
      </div>`
  });
}

/**
 * THE HAND-OFF TO MICROSOFT (2026-10-02, Cameron's spec). The sign-in name is copied first, then said, then Microsoft
 * is opened a beat later, so the person sees what was done before the tab appears and can paste it straight in. The
 * password from the distributor's mail is needed TWICE at Microsoft: once to sign in, once to set their own.
 */
async function goToMicrosoft(btn) {
  const upn = String(btn?.dataset?.upn || '');
  const line = document.getElementById('licMsGo');
  const say = (text) => { if (line) { line.textContent = text; line.hidden = !text; } };
  // when the clipboard is refused (an embedded browser, a page without the permission), copyButton selects the address
  // on the card instead, so Ctrl and C still works and the person is never left to retype it
  const copied = upn ? await copyButton(btn, upn, { select: () => document.getElementById('licMsUpn') }) : false;
  say(copied
    ? `${upn} is on your clipboard. Paste it at Microsoft with Ctrl and V, or right click and Paste. Your first password is in the mail from Pax8, our license distributor, and you need it twice: once to sign in, then again to change it to one of your own. When you are done, come back here and do step ${STEPS} of ${STEPS}.`
    : `Your browser would not let the page copy for you, so ${upn || 'your administrator account'} is selected above: press Ctrl and C to take it. Your first password is in the mail from Pax8, our license distributor, and you need it twice: once to sign in, then again to change it to one of your own. When you are done, come back here and do step ${STEPS} of ${STEPS}.`);
  // a beat to read it before the new tab takes the foreground
  await new Promise(r => setTimeout(r, 1400));
  window.open('https://admin.microsoft.com', '_blank', 'noopener,noreferrer');
}

/* ---------- step 6: the connection, on its own card ---------- */

/**
 * ITS OWN CARD (2026-10-02), for the same reason step 5 got one: it rendered inside the tenant card, which is step 2.
 * The consent this collects IS the connection, so it is the last thing the owner does and it deserves to be findable.
 */
export function connectHtml() {
  if (!showsLicensing()) return '';
  const v = lc.view, m = v?.microsoft || {}, p = perms();
  if (!m.tenantId && !m.domainPrefix) return '';          // nothing named yet: step 2's business
  const t = tn();
  if (t?.connected) return '';                            // done: the tenant card carries the facts
  const inner = connectionHtml(m, p);
  if (!inner) return '';
  const waiting = !!t?.platformConnecting;
  const summary = t?.autoStuck ? 'yours to do now' : waiting ? 'PragOptics is connecting it' : 'not connected yet';
  return cardHtml({
    key: 'tenant-connect', icon: 'plug', title: 'Connect your tenant', summary: stepWord('connected', st.D.escapeHtml(summary)),
    open: !waiting, body: `${noteHtml('tenant-connect')}${errHtml('tenant-connect')}${inner}`
  });
}
