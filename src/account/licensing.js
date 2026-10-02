// src/account/licensing.js
//
// The Licensing section of the account panel (2026-09-18; Part 1, 2026-09-23): Microsoft 365 licenses for the team's
// environment, and a mailbox included with every team seat. PragOptics is the partner: the customer pays Microsoft's
// list price; wholesale, the distributor and the margin are never on this screen, and neither is the distributor's
// name (decision 13). Members and above see it (decision 3); a viewer has no Licensing tab (account.js) and the
// server refuses them.
//
// What each person may do is the server's answer (describe().permissions) and is checked again on every call:
// the owner decides everything and approves every purchase; a role the owner gave "Ask for purchases" asks, "Give
// out mailboxes and licenses" gives them, "Accept agreements" accepts the Microsoft Customer Agreement; everyone
// else reads. Paused, or with the plan ended, the whole tab is read only (MINE M12). The dev lane says "Test lane:
// nothing is ordered at Microsoft."
//
//   GET  v1/environment/licensing          the tab in one read: eligibility, read-only and why, the lane, the
//                                          account, the tenant and agreement, mail, each seat's mailbox in words,
//                                          the licenses with their state in words, permissions, the catalog
//   POST v1/environment/licensing/account  the owner creates the licensing account under the business name they
//                                          confirmed { businessName, phone? } (decision 6); PUT renames it
//   POST v1/environment/licensing/enroll   the owner turns on the team's mail (the included mailbox, nothing charged)
//   POST/DELETE v1/environment/licensing/mailboxes/{userId}   a seat's included mailbox given (recorded, waiting for
//                                          the tenant in Part 1) or taken back ("Give out mailboxes and licenses")
//
// The cards, top to bottom: what a failed license payment left owed (licensingMoney.js, which also holds the exact
// charge every charging button shows), requests (licensingRequests.js), then the owner's four steps in order, each
// summary saying "Step n of 6" (2026-09-28, widened 2026-10-02): the licensing account (here), the tenant (licensingTenant.js), the
// agreement (licensingOrders.js), the mailboxes with Turn on mail (here); then the licenses held and adding one
// (licensingOrders.js), the catalog (licensingCatalog.js), and for the platform's operator the charges and the
// distributor check (licensingBilling.js, licensingPax8.js). What they share is licensingShared.js, where stepGate
// says which step a control waits on: steps 2 to 4 stand before the account exists, folded, their one control
// disabled with that sentence under it.

import { tierName } from '../components/tierCopy.js';
import { explainLink } from '../components/explainer.js';
import { ico, leadBtn, armed, initCards } from './cards.js';
import { LIC_URL, lc, st, url, cardHtml, countWord, cap, dayWord, sentence, perms, isOperator, me, call, send, reqLead, reqIcon, errHtml, noteHtml, setNote, kept, forget, keepInput, withLink, cardLink, showsLicensing, stepWord, stepGate } from './licensingShared.js';
import { agreementHtml, licensesHtml, orderAction, orderChange } from './licensingOrders.js';
import { catalogHtml, catalogAction, catalogInput } from './licensingCatalog.js';
import { billingHtml, billingAction } from './licensingBilling.js';
import { pax8Html, pax8Action } from './licensingPax8.js';
import { tenantHtml, tenantAction, resetTenant, reopenTenant, loadTenantStatus, myMailboxHtml, signInHtml } from './licensingTenant.js';
import { requestsHtml, requestsAction, loadRequests, pendingMailbox, ask } from './licensingRequests.js';
import { owedHtml, moneyAction } from './licensingMoney.js';

const LIVE_INCLUDED = ['PAID', 'ORDERED', 'ACTIVE'];

// Licensing L5e (2026-09-24): while the environment is still being set up, the tab reads again every 15 seconds while
// it is open, for at most ten minutes (nothing retries forever), then says it is taking longer than usual.
const SETUP_EVERY_MS = 15000, SETUP_FOR_MS = 10 * 60 * 1000;
const SLOW_WORDS = 'Your environment is taking longer than usual to set up. Look again in a few minutes; nothing is lost.';
const setup = { since: 0, timer: 0, slow: false };
function watchSetup(waiting) {
  clearTimeout(setup.timer); setup.timer = 0;
  if (!waiting) { setup.since = 0; setup.slow = false; return; }
  if (!setup.since) setup.since = Date.now();
  if (Date.now() - setup.since >= SETUP_FOR_MS) { setup.slow = true; return; }
  setup.timer = setTimeout(() => { setup.timer = 0; if (document.getElementById('licBody')) load(); }, SETUP_EVERY_MS);
}

export async function renderLicensing(main, deps) {
  st.D = deps; st.paint = paint; st.load = load;
  Object.assign(lc, { view: null, reqs: null, canDecide: false, busy: '', busyWord: '', draft: {}, err: {}, links: {}, notes: {}, add: null, needPhone: false, tnMode: '', tnEdit: false, bizEdit: false, acctConfirm: '', declining: '', bill: null, p8: null, loadMsg: '', seatQuote: {}, reqQuote: {} });
  clearTimeout(setup.timer); Object.assign(setup, { since: 0, timer: 0, slow: false });
  resetTenant();
  initCards();
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Licensing</h2>${explainLink('licensing', 'How licenses and mailboxes work')}</header>
    <div id="licBody"><p class="acct-loading">Loading…</p></div>
  `;
  await load();
}

/** The tab's one read, and the requests with it. A failed read after a good one keeps what is on screen and says so. */
async function load() {
  if (!document.getElementById('licBody')) return;
  try {
    const v = await st.D.apiFetch(url(LIC_URL));
    lc.view = v; lc.err.load = ''; lc.loadMsg = '';
    // L4: the requests are read whenever the team has a licensing account, so a paused or ended owner can decline one;
    // Part 2: the tenant's connection and the person's own mailbox, once the tenant is named (licensingTenant.js)
    if (v?.account) await Promise.all([loadRequests(), loadTenantStatus(v)]); else { lc.reqs = null; lc.tn = null; }
    watchSetup(!!v?.settingUp);
  } catch (ex) {
    const setupWait = ex?.status === 404 && !!ex?.data?.needsTenant;
    // a read that failed on the way (no answer, a 5xx, too many) while the tab was waiting on the setup keeps waiting:
    // the next read comes as before, and the ten-minute limit still ends it. A refusal ends the waiting.
    const passing = !ex?.status || ex.status >= 500 || ex.status === 429;
    watchSetup(setupWait || (passing && setup.since > 0));
    const msg = setupWait ? (setup.slow ? SLOW_WORDS : 'Your environment is being set up. Licensing opens the moment it is ready.')
      : ex?.status === 404 && !ex?.data?.code ? 'Licensing is not on this lane yet.'
      : (ex?.data?.error || st.D.friendlyError(ex, 'Licensing could not be read.'));
    if (lc.view) lc.err.load = msg; else lc.loadMsg = msg;
  }
  paint();
}

function paint() {
  const host = document.getElementById('licBody');
  if (!host) return;
  if (!lc.view) { host.innerHTML = lc.loadMsg ? `<p class="acct-empty">${st.D.escapeHtml(lc.loadMsg)}</p>` : '<p class="acct-loading">Loading…</p>'; return; }
  // decision 21: what a failed license payment left owed comes first, with Pay now for the owner (licensingMoney.js)
  // the owner's four steps stand in order (2026-09-28): the account, the tenant, the agreement, then mail; the licenses held come after
  host.innerHTML = `${headHtml()}${errHtml('load')}<div class="ev-cards">${owedHtml()}${requestsHtml()}${myMailboxHtml()}${accountHtml()}${tenantHtml()}${agreementHtml()}${mailboxesHtml()}${signInHtml()}${licensesHtml()}${catalogHtml()}${billingHtml()}${pax8Html()}</div>`;
}

/* ---------- the head ---------- */

/** What the person looking may do here, in a sentence (the owner decides everything and reads none). */
function roleLine(v, p) {
  if (p.isOwner || !v.eligible) return '';
  const can = [];
  if (p.canRequest) can.push('ask the owner to buy, change or end licenses');
  if (p.canAssign) can.push('give out mailboxes and licenses');
  if (p.canAccept) can.push('accept the Microsoft Customer Agreement');
  if (p.canAskForMailbox && !p.canAssign) can.push('ask for your own mailbox');
  if (!can.length) return 'You can see licensing here. The owner makes the changes and can give your role more on the Team tab.';
  const list = can.length > 1 ? `${can.slice(0, -1).join(', ')} and ${can[can.length - 1]}` : can[0];
  return `You can ${list}. The owner decides the rest.`;
}

function headHtml() {
  const e = st.D.escapeHtml, v = lc.view, p = perms(), a = v.account;
  const state = !v.eligible ? `<span class="acct-tag">${e(tierName(v.minimumTier))} plan and above</span>`
    : a ? (a.active ? '<span class="acct-tag is-verified">account active</span>' : '<span class="acct-tag is-pending">account not active yet</span>')
    : v.distributor?.configured ? '<span class="acct-tag is-pending">no account yet</span>'
    : '<span class="acct-tag is-pending">being set up</span>';
  const lane = v.lane?.test ? `<p class="lic-banner is-test" role="note">${ico('tool')}<span>${e(sentence(v.lane.note || 'Test lane: nothing is ordered at Microsoft'))}</span></p>` : '';
  // L4: read-only says why wherever the team's licensing shows (paused, ended, on Free); L5e: setting up, or taking long
  const why = v.settingUp && setup.slow ? SLOW_WORDS : v.readOnlyWhy;
  const ro = showsLicensing() && v.readOnly && why ? `<p class="lic-banner is-paused" role="note">${ico('lock')}<span>${e(sentence(why))}</span></p>` : '';
  const role = roleLine(v, p);
  return `
    <section class="acct-card ev-summary">
      <div class="ev-head">
        <div class="ev-id">
          <div class="ev-tags"><span class="acct-tag is-primary">${e(tierName(v.tier))}</span>${state}</div>
          <h3 class="acct-card-h ev-name">Microsoft 365 for your team</h3>
          <p class="ev-owner adm-muted">${e(mailSummary(v))} · a mailbox for each team seat is included; other licenses at Microsoft's list price</p>
          ${role ? `<p class="ev-owner adm-muted lic-role">${e(role)}</p>` : ''}
        </div>
        <div class="ev-actions">${reqIcon('refresh', { lic: 'refresh' }, 'refresh', 'Read it again', 'Reading…')}</div>
      </div>
    </section>${lane}${ro}`;
}

/* ---------- the licensing account (decision 6) ---------- */

/** Where the tenant stands, in the server's words (decision 7: the name and ID once Microsoft has it). */
function tenantWords(m) {
  if (m?.tenantText) return m.tenantText;
  return m?.domainPrefix ? `${m.domainPrefix}.onmicrosoft.com` : 'Not named yet.';
}

function accountHtml() {
  const e = st.D.escapeHtml, v = lc.view, a = v.account, p = perms();
  let summary, inner;
  const tierNote = `
      <p class="acct-card-note">Licenses and mailboxes come with the ${e(tierName(v.minimumTier))} plan and above. Your team is on ${e(tierName(v.tier))}.</p>
      ${p.isOwner || !v.permissions ? `<div class="acct-actions-row"><button class="btn btn-sm btn-lead btn-primary" type="button" data-acct-section="subscription">${ico('layers')}<span>See the plans</span></button></div>` : '<p class="acct-card-note">The owner can move the team to that plan on Billing.</p>'}`;
  if (!v.eligible && !a) {
    summary = `starts on the ${e(tierName(v.minimumTier))} plan`;
    inner = tierNote;
  } else if (a) {
    summary = a.active ? 'active' : 'not active yet';
    const name = lc.bizEdit && p.isOwner && !v.readOnly ? `
        <div class="lic-inline-form">
          <input class="acct-input" id="licBizEdit" type="text" maxlength="160" data-keep value="${e(kept('licBizEdit', a.businessName || ''))}" autocomplete="organization" aria-label="Your business's name">
          ${reqLead('biz', { lic: 'biz-save' }, 'check', 'Save the name', 'Saving…', '', 'btn-primary')}
          ${reqIcon('biz-cancel', { lic: 'biz-cancel' }, 'x', 'Keep the name as it is', '')}
        </div>`
      : `${e(a.businessName || 'Not given')}${p.isOwner && !v.readOnly ? ` ${reqIcon('biz-edit', { lic: 'biz-edit' }, 'edit', 'Change the business name', '')}` : ''}`;
    inner = `
      <div class="lic-facts">
        <div class="lic-fact"><span class="lic-k">Business</span><span class="lic-v">${name}</span></div>
        <div class="lic-fact"><span class="lic-k">Status</span><span class="lic-v"><span class="lic-state ${a.active ? 'is-verified' : 'is-bad'}">${e(sentence(a.statusText || (a.active ? 'Active' : 'Not active yet. We are looking into it')))}</span></span></div>
        <div class="lic-fact"><span class="lic-k">Opened</span><span class="lic-v">${e(dayWord(a.createdAt))}</span></div>
        <div class="lic-fact"><span class="lic-k">Microsoft tenant</span><span class="lic-v">${e(sentence(tenantWords(v.microsoft)))}</span></div>
        ${isOperator() ? `<div class="lic-fact"><span class="lic-k">Pax8 company</span><span class="lic-v"><span class="ev-code">${e(a.customerId)}</span> <span class="adm-muted">operator only</span></span></div>` : ''}
      </div>${v.eligible ? '' : tierNote}`;
  } else if (!v.distributor?.configured) {
    summary = 'being set up';
    inner = '<p class="acct-card-note">Licensing is being set up on the platform. Nothing to do on your side; this card opens on its own.</p>';
  } else if (p.canOpenAccount && lc.acctConfirm) {
    // decision 6: the owner confirms the exact name the account is created under before anything is sent
    summary = 'not created yet';
    inner = `
      <div class="lic-confirm" role="group" aria-labelledby="licAcctConfirmQ">
        <p class="acct-card-note" id="licAcctConfirmQ">Create your licensing account as <strong>${e(lc.acctConfirm)}</strong>? This is the name Microsoft shows for your business. You can change it later here.</p>
        <div class="acct-actions-row">
          ${reqLead('account', { lic: 'open-account-go' }, 'check', 'Yes, create it', 'Creating…', '', 'btn-primary')}
          ${lc.busy === 'account' ? '' : leadBtn({ lic: 'open-account-back' }, 'edit', 'Change the name')}
        </div>
        <p class="lic-hint">Creates your business's Microsoft licensing account. Nothing is charged.</p>
      </div>`;
  } else if (p.canOpenAccount) {
    summary = 'not created yet';
    const uses = usesHtml(v);
    inner = `
      <p class="acct-card-note">Your business's Microsoft licenses are held under this account.${uses ? '' : ' It is created with the billing address you gave on Billing.'}</p>
      <div class="ev-reg-form">
        <div class="lic-span">
          <label class="acct-label" for="licBizName">Your business's name</label>
          <input class="acct-input" id="licBizName" type="text" maxlength="160" data-keep value="${e(kept('licBizName', v.accountDraft?.businessName || ''))}" autocomplete="organization" placeholder="Your business's legal name" aria-describedby="licBizHint">
          <p class="lic-hint" id="licBizHint">${v.accountDraft?.from === 'billing'
            ? "Filled in from the business name in your billing details. Check it is your business's legal name and change it here if it is not. It is not your own name. You confirm it before the account is created."
            : "Type your business's legal name. It is not your own name. You confirm it before the account is created. A business name added to your billing details on Billing is filled in here."}</p>
        </div>
        <div class="lic-span">
          <label class="acct-label" for="licWebsite">Your business's website</label>
          <input class="acct-input" id="licWebsite" type="url" inputmode="url" autocomplete="url" data-keep value="${e(kept('licWebsite', ''))}" placeholder="yourbusiness.com" aria-describedby="licWebHint">
          <p class="lic-hint" id="licWebHint">Your licensing account is filed under your website's domain, so it must be your business's own website.</p>
        </div>
        ${lc.needPhone ? `<div class="lic-span"><label class="acct-label" for="licPhone">Phone number for the account</label><input class="acct-input" id="licPhone" type="tel" inputmode="tel" autocomplete="tel" data-keep value="${e(kept('licPhone', ''))}" placeholder="+1 555 555 5555"></div>` : ''}
      </div>
      ${uses}
      <div class="acct-actions-row">${leadBtn({ lic: 'open-account' }, 'plus', 'Create licensing account', '', 'btn-primary')}</div>
      <p class="lic-hint">Creates your business's Microsoft licensing account. Nothing is charged.</p>`;
  } else {
    summary = 'not created yet';
    inner = `<p class="acct-card-note">${e(v.readOnly && v.readOnlyWhy ? sentence(v.readOnlyWhy) : 'The owner creates the licensing account here.')}</p>`;
  }
  return cardHtml({
    // step 1 of the owner's six (licensingShared.LICENSING_STEPS), wherever the team's licensing shows
    key: 'account', icon: 'shield', title: 'Licensing account', summary: showsLicensing() ? stepWord('account', summary) : summary,
    explain: explainLink('licensing', 'What the licensing account is'),
    body: `${noteHtml('account')}${errHtml('account')}${inner}`
  });
}

/**
 * What the account is created with, said before Create (2026-09-28): the server's accountDraft.uses names the billing
 * address and phone it takes from Billing details ({ address, phone, from }); with no phone there, the verified mobile
 * on Profile is used (and with none there either, the card asks for one). An older backend sends no uses: nothing extra.
 */
function usesHtml(v) {
  const u = v.accountDraft?.uses;
  if (!u || typeof u !== 'object') return '';
  const e = st.D.escapeHtml;
  const address = String(u.address || '').trim(), phone = String(u.phone || '').trim();
  if (!address && !phone) return '';
  const src = u.from === 'billing' ? 'Billing details' : 'your account';
  const what = address && phone ? 'billing address and phone' : address ? 'billing address' : 'billing phone';
  const parts = [address, phone || 'no phone on file: the verified mobile on Profile is used'].filter(Boolean);
  return `<p class="acct-card-note lic-uses">${e(`Created with your ${what} from ${src}: ${parts.join('; ')}.`)} ${cardLink('subscription', 'details', 'Change them on Billing')}</p>`;
}

/** The name as typed in the box (spaces run together), the website, and the phone when one was asked for. */
function accountInput() {
  return {
    name: String(kept('licBizName', document.getElementById('licBizName')?.value || '') || '').trim().replace(/\s+/g, ' '),
    website: String(kept('licWebsite', document.getElementById('licWebsite')?.value || '') || '').trim(),
    phone: lc.needPhone ? String(kept('licPhone', document.getElementById('licPhone')?.value || '') || '').trim() : ''
  };
}

/** Back to the account form with the server's sentence, the named box focused (the website or the phone refused). */
function backToBox(id) {
  return (ex) => { lc.acctConfirm = ''; queueMicrotask(() => document.getElementById(id)?.focus()); return ex.data.error; };
}

/** "Create licensing account": the name and website checked here, then the owner confirms the name before anything is sent. */
function askAccount() {
  const { name, website, phone } = accountInput();
  lc.err.account = ''; setNote('account', '');
  if (!name) { lc.err.account = 'Give your business\'s name. It goes on your Microsoft licensing account.'; st.paint(); document.getElementById('licBizName')?.focus(); return; }
  if (name.length > 160) { lc.err.account = 'The business name is at most 160 characters.'; st.paint(); document.getElementById('licBizName')?.focus(); return; }
  if (!website) { lc.err.account = 'Give your business\'s website. Your licensing account is filed under its domain.'; st.paint(); document.getElementById('licWebsite')?.focus(); return; }
  if (/\s/.test(website) || !website.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0].includes('.')) { lc.err.account = 'That is not a website address. Give it as yourbusiness.com or https://yourbusiness.com.'; st.paint(); document.getElementById('licWebsite')?.focus(); return; }
  if (lc.needPhone && !phone) { lc.err.account = 'Give a phone number for the account.'; st.paint(); document.getElementById('licPhone')?.focus(); return; }
  lc.acctConfirm = name;
  st.paint();
  document.querySelector('[data-lic-action="open-account-go"]')?.focus();
}

async function openAccount() {
  const name = lc.acctConfirm;
  const { website, phone } = accountInput();
  if (!name) return;
  lc.err.account = ''; setNote('account', '');
  await send('account', 'Creating…', async () => {
    try { await call(`${LIC_URL}/account`, 'POST', { businessName: name, website, ...(phone ? { phone } : {}) }); }
    catch (ex) {
      // the account needs a phone and none is on the billing profile or the owner's Profile: asked for here, back on
      // the name box, and the owner confirms again
      // PHONE_INVALID (2026-09-28): the billing phone is in a form the distributor refuses; the same phone box opens with the server's words
      if (ex?.data?.code === 'PHONE_REQUIRED' || ex?.data?.code === 'PHONE_INVALID') { lc.needPhone = true; lc.acctConfirm = ''; lc.err.account = ex.data.error || 'Licensing needs a phone number for the account.'; return; }
      throw ex;
    }
    lc.needPhone = false; lc.acctConfirm = ''; forget('licBizName', 'licWebsite', 'licPhone');
    setNote('account', `Your licensing account is created as ${name}.`);
    await st.load();
  }, {
    errKey: 'account', fallback: 'The licensing account could not be created.',
    codes: {
      BILLING_ADDRESS_INCOMPLETE: withLink('account', 'subscription', 'Open Billing', 'Your billing address is incomplete. Complete it on Billing, then try again.'),
      // made already (another tab, or an answer that was lost): the card reads it again and shows the account
      LICENSING_ACCOUNT_EXISTS: (ex) => { lc.acctConfirm = ''; queueMicrotask(() => st.load()); return ex.data.error; },
      // the server did not take the name: back to the box, where it is changed
      NAME_REQUIRED: (ex) => { lc.acctConfirm = ''; return ex.data.error; },
      NAME_TOO_LONG: (ex) => { lc.acctConfirm = ''; return ex.data.error; },
      // the website (2026-09-28): missing, not an address, or its domain already filed at the distributor; back to the box
      WEBSITE_REQUIRED: backToBox('licWebsite'), WEBSITE_INVALID: backToBox('licWebsite'), WEBSITE_TAKEN: backToBox('licWebsite'),
      LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.'
    }
  });
}

async function renameBusiness() {
  const name = String(kept('licBizEdit', document.getElementById('licBizEdit')?.value || '') || '').trim().replace(/\s+/g, ' ');
  lc.err.account = ''; setNote('account', '');
  if (!name || name.length > 160) { lc.err.account = 'Give the business name, at most 160 characters.'; st.paint(); document.getElementById('licBizEdit')?.focus(); return; }
  await send('biz', 'Saving…', async () => {
    await call(`${LIC_URL}/account`, 'PUT', { businessName: name });
    lc.bizEdit = false; forget('licBizEdit');
    setNote('account', `Saved. Your Microsoft licensing account shows ${name}.`);
    await st.load();
  }, { errKey: 'account', fallback: 'The business name could not be changed.' });
}

/* ---------- mail and the mailbox of each team seat ---------- */

function includedLive() { return (lc.view.licenses || []).find(l => l.included && LIVE_INCLUDED.includes(l.status)) || null; }

/** Team seats, and how many hold their included mailbox. */
function mailSummary(v) {
  const seats = v.seats || [];
  return `${countWord(seats.length, 'team seat', 'team seats')} · ${seats.filter(s => s.included).length} with a mailbox`;
}

/** Mail's state in a few words, for the card's line. */
const MAIL_WORDS = { ordering: 'mail turning on', delayed: 'mail delayed', on: 'mail on', ending: 'mail ending', cancelled: 'mail off', off: 'mail off' };

/** Mail for the team: where the order stands in the server's words (decisions 8 to 12), or Turn on mail for the owner. */
function mailStateHtml(v, p) {
  const e = st.D.escapeHtml, m = v.mail || { state: 'off', text: '' };
  const CLS = { ordering: 'is-pending', delayed: 'is-bad', on: 'is-verified', ending: 'is-pending' };
  if (CLS[m.state]) {
    // "On." alone says little: mail is on, and the test lane's line stays when the server adds it
    const text = m.state === 'on' ? `Mail is on.${String(m.text || '').replace(/^On\.?\s*/, ' ').replace(/^\s+$/, '')}` : sentence(m.text);
    return `<div class="lic-mail-on"><span class="lic-state ${CLS[m.state]}">${e(text.trim())}</span></div>`;
  }
  // off: never turned on, refused (its reason), or cancelled (decision 10: "Your mail order was cancelled: ...")
  const told = m.text ? `<p class="acct-card-note ev-note is-bad">${e(sentence(m.text))}</p>` : '';
  // before the account the server has no say yet: the owner sees the button, waiting on step 1
  const may = p.canTurnOnMail || (!v.account && p.isOwner && !v.readOnly);
  if (!may) {
    const why = v.readOnly && v.readOnlyWhy ? sentence(v.readOnlyWhy) : 'Mail is not on for your team yet. The owner turns it on here.';
    return `${told}<p class="acct-card-note">${e(why)}</p>`;
  }
  // step 4 of six: Turn on mail waits, disabled, until the account exists, the tenant is named and the
  // agreement stands, and says under it which of those comes first and where; the server's own ready flag still counts
  const gate = stepGate(v, 3) || (v.microsoft?.ready ? '' : 'Your Microsoft tenant and agreement are not complete yet. Finish the cards above, then turn on mail here.');
  return `
    ${told}
    <div class="lic-enroll">
      <p class="acct-card-note">Turn on mail for your team. Your own mailbox comes first, included with your plan; nothing is charged. Then give each team seat its mailbox below.</p>
      ${errHtml('mail')}
      <div class="acct-actions-row">${reqLead('enroll', { lic: 'mail-enroll' }, 'mail', 'Turn on mail', 'Turning on…', gate ? `disabled data-tip="${e(gate)}"` : '', 'btn-primary')}</div>
      ${gate ? `<p class="lic-hint">${e(gate)}</p>` : ''}
    </div>`;
}

/**
 * One team seat's mailbox in Part 1's words (decision 11): waiting for the tenant at most; the address once it exists.
 * Licensing L1 (2026-09-24): a bought license stands in for the included mailbox only when it has one of its own
 * (Exchange Online Plan 1, say, by Microsoft's skuId: the server's `mailbox: "yes"`); Copilot or Visio sit beside
 * whatever the included mailbox shows, and a license not known yet is not treated as a mailbox.
 */
function seatMailCell(s, p, mailOn, e) {
  const self = !!me().userId && String(s.userId) === me().userId;
  const bought = (s.licenses || []).map(x => `<span class="lic-tag">${e(x.productName)}</span>`).join('');
  if (s.included && s.mailbox) {
    const mb = s.mailbox;
    const cls = mb.state === 'ready' ? 'is-verified' : mb.state === 'failed' ? 'is-bad' : 'is-pending';
    const text = mb.state === 'ready' && mb.address ? `<span class="ev-code">${e(mb.address)}</span>` : e(mb.text || 'Waiting for your Microsoft tenant');
    const take = p.canAssign && s.role !== 'owner' && (s.role !== 'admin' || p.isOwner)
      ? reqIcon(`seat:${s.userId}`, { lic: 'seat-release' }, 'userMinus', `Take back ${s.email}'s mailbox`, 'Taking the mailbox back…', `data-user="${e(s.userId)}"`, 'is-risky') : '';
    return `<div class="lic-seat-mail"><span class="lic-state ${cls}">${text}</span>${take}</div>${bought}`;
  }
  // a license with its own mailbox: the person's mailbox comes with it (pending until Microsoft has made it)
  const withBox = (s.licenses || []).find(x => x.mailbox === 'yes');
  if (withBox) return `<div class="lic-seat-mail">${bought}<span class="lic-state is-pending">${e(`Mailbox with ${withBox.productName}`)}</span></div>`;
  const asked = pendingMailbox(s.userId);
  if (asked) return `<span class="lic-state is-pending">${e(p.isOwner ? 'Asked for: approve it in Requests for you' : self ? 'Sent to the owner for approval' : 'Asked for, waiting for the owner')}</span>${bought}`;
  if (mailOn && p.canAssign && s.status === 'ACTIVE') return `<div class="lic-seat-mail">${reqIcon(`seat:${s.userId}`, { lic: 'seat-give' }, 'mail', `Give ${s.email} their included mailbox; nothing is charged`, 'Giving the mailbox…', `data-user="${e(s.userId)}"`, 'btn-primary')}${bought}</div>`;
  if (self && p.canAskForMailbox && !p.canAssign) return `<div class="lic-seat-mail">${reqLead('askmail', { lic: 'ask-mailbox' }, 'send', 'Ask for my mailbox', 'Sending…', '', 'btn-primary')}${bought}</div>`;
  return `<div class="lic-seat-mail"><span class="adm-muted">${e(mailOn ? 'No mailbox yet' : 'No mailbox')}</span>${bought}</div>`;
}

function mailboxesHtml() {
  const e = st.D.escapeHtml, v = lc.view, p = perms();
  // step 4 of the owner's six: the card stands before the account too, folded, its button waiting on step 1
  if (!showsLicensing()) return '';
  // the person looking first, so their own mailbox (or Ask for my mailbox) is the first row on a phone
  const mine = me().userId;
  const seats = [...(v.seats || [])].sort((a, b) => (String(b.userId) === mine) - (String(a.userId) === mine));
  const mailOn = !!includedLive();
  const table = !seats.length ? '<p class="acct-empty">No team seats yet. Invite people on Team; each team seat can have a mailbox.</p>' : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table lic-table">
          <thead><tr><th>Person</th><th>Role</th><th>Mailbox</th></tr></thead>
          <tbody>
            ${seats.map(s => `
              <tr>
                <td class="cell-ellip" data-th="Person" title="${e(s.email)}">${e(s.email)}${String(s.userId) === me().userId ? ' <span class="adm-muted">(you)</span>' : ''}${s.status === 'SUSPENDED' ? ' <span class="acct-tag is-pending">suspended</span>' : ''}</td>
                <td class="cell-tight" data-th="Role">${e(cap(s.role))}</td>
                <td data-th="Mailbox">${seatMailCell(s, p, mailOn, e)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  const state = MAIL_WORDS[v.mail?.state] || 'mail off';
  const summary = v.account ? `${state} · ${seats.filter(s => s.included).length} of ${countWord(seats.length, 'team seat', 'team seats')} with a mailbox` : 'after the licensing account';
  return cardHtml({
    key: 'mailboxes', icon: 'mail', title: 'Mailboxes', summary: stepWord('mail', e(summary)), open: !!v.account,
    explain: explainLink('licensing', 'A mailbox for every seat'),
    body: `
      <p class="acct-card-note">Each team seat can have one mailbox, included with your plan: Exchange Online Kiosk, 2 GB, for Outlook on the web and the Outlook phone apps (not the desktop Outlook app). A mailbox ends when it is taken back, when its seat ends, or when the person becomes a viewer. Once a mailbox ends, Microsoft keeps its mail for 30 days, then deletes it.</p>
      ${mailStateHtml(v, p)}
      ${noteHtml('mailboxes')}${errHtml('mailboxes')}
      ${table}`
  });
}

async function enrollMail() {
  if (stepGate(lc.view, 3)) return;   // the button is disabled with the reason under it; nothing is sent
  setNote('mailboxes', '');
  await send('enroll', 'Turning on…', async () => {
    let d;
    try { d = await call(`${LIC_URL}/enroll`); }
    catch (ex) {
      // a refused order leaves a line with its reason, which the read shows; the error below says what happened
      await st.load();
      if (ex?.data?.code === 'TENANT_NAME_TAKEN') reopenTenant(ex.data.error);
      throw ex;
    }
    setNote('mailboxes', d?.note ? sentence(d.note) : d?.license?.status === 'ACTIVE' ? 'Mail is on. Give each team seat its mailbox below.' : 'Mail is turning on: Microsoft is setting it up. Give each team seat its mailbox below.');
    await st.load();
  }, {
    errKey: 'mail', fallback: 'Mail could not be turned on.',
    codes: {
      MICROSOFT_DETAILS_REQUIRED: 'Name your Microsoft tenant and accept the Microsoft Customer Agreement first.',
      TENANT_NAME_TAKEN: 'That tenant name is already taken at Microsoft. Choose another on the tenant card above; nothing was ordered.',
      LIVE_LANE_ONLY: 'Mail is turned on for your live environment, not the sandbox.'
    }
  });
}

async function seatMail(btn, give) {
  const userId = btn.dataset.user || '';
  const s = (lc.view?.seats || []).find(x => String(x.userId) === userId);
  if (!s || lc.busy) return;
  // taking one back asks first: the person loses the mailbox
  if (!give && !armed(btn, 'Take it back?')) return;
  setNote('mailboxes', '');
  await send(`seat:${userId}`, give ? 'Giving the mailbox…' : 'Taking the mailbox back…', async () => {
    await call(`${LIC_URL}/mailboxes/${encodeURIComponent(userId)}`, give ? 'POST' : 'DELETE');
    setNote('mailboxes', give ? `A mailbox is given to ${s.email}. It waits for your Microsoft tenant; nothing is charged.` : `${s.email}'s mailbox is taken back.`);
    await st.load();
  }, {
    errKey: 'mailboxes', fallback: give ? 'The mailbox could not be given.' : 'The mailbox could not be taken back.',
    codes: { MAIL_NOT_ON: 'Turn on the team\'s mail first.', LIVE_LANE_ONLY: 'Mailboxes are managed on your live environment, not the sandbox.' }
  });
}

/* ---------- actions ---------- */

export function bindLicensingActions(deps) {
  if (bindLicensingActions._bound) return;
  bindLicensingActions._bound = true;
  st.D = st.D || deps;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lic-action]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    const a = btn.dataset.licAction;
    if (a === 'refresh') return void send('refresh', 'Reading…', () => load());
    if (a === 'open-account') return void askAccount();
    if (a === 'open-account-go') return void openAccount();
    if (a === 'open-account-back') { lc.acctConfirm = ''; lc.err.account = ''; paint(); document.getElementById('licBizName')?.focus(); return; }
    if (a === 'biz-edit') { lc.bizEdit = true; lc.err.account = ''; setNote('account', ''); paint(); document.getElementById('licBizEdit')?.focus(); return; }
    if (a === 'biz-cancel') { lc.bizEdit = false; forget('licBizEdit'); paint(); return; }
    if (a === 'biz-save') return void renameBusiness();
    if (a === 'mail-enroll') return void enrollMail();
    if (a === 'seat-give') return void seatMail(btn, true);
    if (a === 'seat-release') return void seatMail(btn, false);
    if (a === 'ask-mailbox') return void ask('askmail', 'Sending…', 'mailbox.request', {}, 'mailboxes', 'mailboxes', 'A mailbox for you');
    if (requestsAction(a, btn)) return;
    if (moneyAction(a, btn)) return;
    if (catalogAction(a, btn)) return;
    if (billingAction(a, btn)) return;
    if (pax8Action(a, btn)) return;
    if (tenantAction(a, btn)) return;
    orderAction(a, btn);
  });
  // what is typed in the tab is remembered as it is typed, so a repaint never wipes it
  const remember = (e) => { if (e.target?.closest?.('#licBody')) keepInput(e); };
  document.addEventListener('change', (e) => { remember(e); orderChange(e); catalogInput(e); });
  document.addEventListener('input', (e) => { remember(e); if (e.target && e.target.id === 'licCatQ') catalogInput(e); if (e.target && e.target.id === 'licAddQty') orderChange(e); });
}
