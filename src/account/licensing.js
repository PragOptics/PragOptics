// src/account/licensing.js
//
// The Licensing section of the account panel (2026-09-18): Microsoft 365
// licenses as add-ons for the team's environment, each seat able to carry a
// mailbox under the owner's own domain. Bridges is the broker: the customer
// pays Microsoft's list price; wholesale, the distributor and the margin are
// never on this screen. Three cards, all from one read:
//
//   GET  v1/environment/licensing                       eligibility (User plan and above), the licensing account,
//                                                       seats, verified mail domains, the catalog
//   POST v1/environment/licensing/account               owner or admin opens the licensing account (no charge)
//   GET  v1/environment/licensing/products/{id}/pricing the list price of one license, read when asked
//
//   POST v1/environment/licensing/microsoft            the Microsoft Customer Agreement attestation and the tenant (2026-09-22)
//   POST v1/environment/licensing/licenses             add a license: the card charged first, then the order at the distributor
//   PUT  v1/environment/licensing/licenses/{id}        seats: more now, fewer at the period's end
//   DELETE v1/environment/licensing/licenses/{id}      ends at the period's end
//
// Follows the Team section's choice of team (the same sessionStorage key).
// This module is the section: the read, the head, the account and the
// mailboxes. The Microsoft details, the licenses held and the add flow live
// in licensingOrders.js; the catalog with its search, kinds, filters and
// cards in licensingCatalog.js; the state and helpers all share are in
// licensingShared.js. Creating a mailbox is the next slice.

import { tierName } from '../components/tierCopy.js';
import { explainLink } from '../components/explainer.js';
import { iconBtn, setCardSummary, initCards } from './cards.js';
import { LIC_URL, lc, st, url, body, cardHtml, countWord, cap } from './licensingShared.js';
import { microsoftHtml, licensesHtml, orderAction, orderChange } from './licensingOrders.js';
import { catalogHtml, catalogAction, catalogInput } from './licensingCatalog.js';


export async function renderLicensing(main, deps) {
  st.D = deps; st.paint = paint; st.load = load;
  lc.view = null; lc.busy = false; lc.note = ''; lc.pricing = ''; lc.add = null; lc.saving = ''; lc.msEdit = false; lc.lineNote = ''; lc.needPhone = false; lc.msMode = '';
  initCards();
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Licensing</h2>${explainLink('licensing', 'How licenses and mailboxes work')}</header>
    <p class="acct-error" id="licError" hidden></p>
    <div id="licBody"><p class="acct-loading">Loading…</p></div>
  `;
  await load();
}

async function load() {
  const host = document.getElementById('licBody');
  if (!host) return;
  st.D.showError('licError', '');
  try {
    lc.view = await st.D.apiFetch(url(LIC_URL));
    paint();
  } catch (ex) {
    host.innerHTML = '';
    if (ex?.status === 404 && ex?.data?.needsTenant) { host.innerHTML = `<p class="acct-empty">Your environment is being set up. Licensing opens the moment it is ready.</p>`; return; }
    if (ex?.status === 404) { host.innerHTML = `<p class="acct-empty">The licensing routes are not on this lane yet. Deploy the backend that carries them, then reload.</p>`; return; }
    // The server's refusal names the plan ("Licensing starts on the User plan"); show it as is.
    st.D.showError('licError', (ex?.status === 403 && ex?.data?.error) || st.D.friendlyError(ex, 'Could not load licensing.'));
  }
}

function paint() {
  const host = document.getElementById('licBody');
  if (!host || !lc.view) return;
  host.innerHTML = `${summaryHtml()}<div class="ev-cards">${accountHtml()}${microsoftHtml()}${licensesHtml()}${catalogHtml()}${mailboxesHtml()}</div>`;
}

/* ---------- the head ---------- */

function summaryHtml() {
  const e = st.D.escapeHtml, v = lc.view;
  const seats = v.seats || [], boxes = v.mailboxes || [];
  const state = !v.eligible ? `<span class="acct-tag">${e(tierName(v.minimumTier))} plan and above</span>`
    : v.account ? '<span class="acct-tag is-verified">account open</span>'
    : v.distributor?.configured ? '<span class="acct-tag is-pending">no account yet</span>'
    : '<span class="acct-tag is-pending">being set up</span>';
  return `
    <section class="acct-card ev-summary">
      <div class="ev-head">
        <div class="ev-id">
          <div class="ev-tags"><span class="acct-tag is-primary">${e(tierName(v.tier))}</span>${state}</div>
          <h3 class="acct-card-h ev-name">Microsoft 365 for your team</h3>
          <p class="ev-owner adm-muted">${e(countWord(seats.length, 'seat', 'seats'))} · ${e(countWord(boxes.length, 'mailbox', 'mailboxes'))} · a mailbox per seat included, other licenses at Microsoft's list price</p>
        </div>
        <div class="ev-actions">${iconBtn({ lic: 'refresh' }, 'refresh', 'Refresh')}</div>
      </div>
    </section>`;
}

/* ---------- the licensing account ---------- */

function accountHtml() {
  const e = st.D.escapeHtml, v = lc.view, a = v.account;
  const canManage = !!v.canManage;
  let summary, inner;
  if (!v.eligible) {
    summary = `starts on the ${e(tierName(v.minimumTier))} plan`;
    inner = `
      <p class="acct-card-note">Licenses and mailboxes come with the ${e(tierName(v.minimumTier))} plan and above. Your team is on ${e(tierName(v.tier))}.</p>
      <div class="acct-actions-row"><button class="btn" type="button" data-acct-section="subscription">See the plans</button></div>`;
  } else if (a) {
    summary = `open${a.status ? ` · ${e(a.status.toLowerCase())}` : ''}`;
    inner = `
      <div class="lic-facts">
        <div class="lic-fact"><span class="lic-k">Account</span><span class="lic-v ev-code">${e(a.customerId)}</span></div>
        <div class="lic-fact"><span class="lic-k">Opened</span><span class="lic-v">${e(a.createdAt ? st.D.fmtDate(a.createdAt) : '')}</span></div>
        <div class="lic-fact"><span class="lic-k">Microsoft tenant</span><span class="lic-v">${a.microsoftTenantId ? `<span class="ev-code">${e(a.microsoftTenantId)}</span>` : '<span class="adm-muted">created with the first license</span>'}</span></div>
      </div>`;
  } else if (!v.distributor?.configured) {
    summary = 'being set up';
    inner = `<p class="acct-card-note">Licensing is being set up on the platform. Nothing to do on your side; this card opens on its own.</p>`;
  } else {
    summary = 'not open yet';
    inner = `
      <p class="acct-card-note">Open your licensing account to add licenses. It is opened with the billing address you already gave, and nothing is charged for opening it.</p>
      ${canManage ? `${lc.needPhone ? `<div class="ev-reg-form"><div><label class="acct-label" for="licPhone">Phone number for the account</label><input class="acct-input" id="licPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 555 555 5555"></div></div>` : ''}<div class="acct-actions-row"><button class="btn" type="button" data-lic-action="open-account" ${lc.busy ? 'disabled' : ''}>${lc.busy ? 'Opening…' : lc.needPhone ? 'Open with this number' : 'Open the licensing account'}</button></div>` : '<p class="acct-card-note">The team\'s owner or an admin opens it.</p>'}`;
  }
  return cardHtml({
    key: 'account', icon: 'shield', title: 'Licensing account', summary,
    explain: explainLink('licensing', 'What the licensing account is'),
    body: `${inner}<p class="acct-error" id="licAccountError" hidden></p>${lc.note ? `<p class="acct-card-note ev-note">${e(lc.note)}</p>` : ''}`
  });
}

/* ---------- mailboxes per seat ---------- */

function mailboxesHtml() {
  const e = st.D.escapeHtml, v = lc.view;
  const seats = v.seats || [], domains = v.mailDomains || [];
  const boxes = (v.mailboxes || []).length;
  const summary = `${countWord(seats.length, 'seat', 'seats')} · ${countWord(boxes, 'mailbox', 'mailboxes')}`;
  const m = v.microsoft || {};
  const tenant = m.tenantId ? 'your tenant' : m.domainPrefix ? `${m.domainPrefix}.onmicrosoft.com` : 'your tenant name';
  const domainLine = domains.length
    ? `<p class="acct-card-note">Every seat can have one, included: an Exchange Online Kiosk mailbox for the web and the phone, under ${domains.map(d => `<strong>${e(d)}</strong>`).join(', ')}. A seat that needs 50 GB upgrades to Plan 1 from the Licenses list.</p>`
    : `<p class="acct-card-note">Every seat can have one, included: an Exchange Online Kiosk mailbox for the web and the phone, at ${e(tenant)} until you add a domain on <a href="#account?section=environment&card=domains" data-acct-section="environment">Environment</a>.</p>`;
  const table = !seats.length ? '<p class="acct-empty">No seats yet. Invite people on Team; each seat can carry a mailbox.</p>' : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table lic-table">
          <thead><tr><th>Person</th><th>Role</th><th>Mailbox</th></tr></thead>
          <tbody>
            ${seats.map(s => `
              <tr>
                <td class="cell-ellip" data-th="Person" title="${e(s.email)}">${e(s.email)}${s.status === 'SUSPENDED' ? ' <span class="acct-tag is-pending">suspended</span>' : ''}</td>
                <td class="cell-tight" data-th="Role">${e(cap(s.role))}</td>
                <td class="cell-tight" data-th="Mailbox">${s.mailbox ? `<span class="ev-code">${e(s.mailbox)}</span>` : '<span class="adm-muted">none</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  return cardHtml({
    key: 'mailboxes', icon: 'mail', title: 'Mailboxes', summary,
    explain: explainLink('licensing', 'A mailbox for every seat'),
    body: `${enrollHtml()}${domainLine}${table}`
  });
}

/* ---------- turning on the team's mail (2026-09-22): the included Kiosk, at the platform's cost ---------- */

function includedLine() { return (lc.view.licenses || []).find(l => l.included && ['CHARGING', 'PAID', 'ORDERED', 'ACTIVE', 'ENDING'].includes(l.status)) || null; }
function enrollHtml() {
  const e = st.D.escapeHtml, v = lc.view;
  if (!v.eligible || !v.account) return '';
  const on = includedLine();
  if (on) return `<p class="acct-card-note lic-mail-on"><span class="acct-tag ${on.status === 'ACTIVE' ? 'is-verified' : 'is-pending'}">${on.status === 'ACTIVE' ? 'mail on' : 'turning on'}</span> ${e(String(on.quantity))} included Kiosk ${on.quantity === 1 ? 'mailbox' : 'mailboxes'}, nothing charged.</p>`;
  if (!v.microsoft?.ready) return '<p class="acct-card-note">Save the Microsoft details above, then turn on your team\'s mail here.</p>';
  if (!v.canManage) return '<p class="acct-card-note">The owner or an admin turns on the team\'s mail.</p>';
  return `
    <div class="lic-enroll">
      <p class="acct-card-note">Turn on mail for your team. Your own Kiosk mailbox comes first, included with your plan; nothing is charged.</p>
      <p class="acct-error" id="licEnrollError" hidden></p>
      <div class="acct-actions-row"><button class="btn" type="button" data-lic-action="mail-enroll" ${lc.busy ? 'disabled' : ''}>${lc.busy ? 'Turning on…' : 'Turn on mail'}</button></div>
    </div>`;
}
async function enrollMail(btn) {
  if (lc.busy) return;
  lc.busy = true; btn.disabled = true; btn.textContent = 'Turning on…'; st.D.showError('licEnrollError', '');
  try {
    await st.D.apiFetch(url(`${LIC_URL}/enroll`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({}) });
    lc.busy = false;
    await load();
  } catch (ex) {
    lc.busy = false;
    // a refused enrollment leaves a failed line: the list shows it with the reason, and the button comes back
    try { await load(); } catch { /* the error below still shows */ }
    const code = ex?.data?.code;
    st.D.showError('licEnrollError', code === 'MICROSOFT_DETAILS_REQUIRED' ? 'Save the Microsoft details first.' : code === 'LIVE_LANE_ONLY' ? 'Mail is turned on for your live environment, not the sandbox.' : (ex?.data?.error || st.D.friendlyError(ex, 'Mail could not be turned on.')));
  }
}

/* ---------- actions ---------- */

async function openAccount(btn) {
  if (lc.busy) return;
  // the distributor needs a phone on the account; the backend asks (PHONE_REQUIRED) when the billing profile has none
  const phone = String(document.getElementById('licPhone')?.value || '').trim();
  if (lc.needPhone && !phone) { st.D.showError('licAccountError', 'Give a phone number for the account.'); return; }
  lc.busy = true; lc.note = ''; st.D.showError('licAccountError', '');
  btn.disabled = true; btn.textContent = 'Opening…';
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/account`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(phone ? { phone } : {}) });
    lc.busy = false;
    lc.view.account = d.account;
    lc.note = 'Your licensing account is open.';
    await load();
  } catch (ex) {
    lc.busy = false;
    const code = ex?.data?.code;
    if (code === 'PHONE_REQUIRED') {
      lc.needPhone = true; paint();
      const el = document.getElementById('licPhone'); if (el && phone) el.value = phone;
      st.D.showError('licAccountError', ex?.data?.error || 'Licensing needs a phone number for the account.');
      return;
    }
    const msg = code === 'BILLING_ADDRESS_INCOMPLETE' ? 'Your billing address is incomplete. Complete it on Billing, then try again.'
      : code === 'DISTRIBUTOR_CANNOT_CREATE' ? 'This account is opened by support on request; write to support@bridgesindust.com and it is done within a business day.'
      : code === 'NOT_CONFIGURED' ? 'Licensing is being set up on the platform. Try again later.'
      : (ex?.data?.error || st.D.friendlyError(ex, 'The account could not be opened.'));
    btn.disabled = false; btn.textContent = lc.needPhone ? 'Open with this number' : 'Open the licensing account';
    st.D.showError('licAccountError', msg);
  }
}

export function bindLicensingActions(deps) {
  if (bindLicensingActions._bound) return;
  bindLicensingActions._bound = true;
  st.D = st.D || deps;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lic-action]');
    if (!btn) return;
    e.preventDefault();
    const a = btn.dataset.licAction;
    if (a === 'refresh') return void load();
    if (a === 'open-account') return void openAccount(btn);
    if (a === 'mail-enroll') return void enrollMail(btn);
    if (catalogAction(a, btn)) return;
    orderAction(a, btn);
  });
  document.addEventListener('change', (e) => { orderChange(e); catalogInput(e); });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'licCatQ') catalogInput(e); });
}

/** The summary line on the tab's own cards, for a caller that re-reads one card. */
export function refreshLicensingSummaries() {
  if (!lc.view) return;
  const v = lc.view;
  setCardSummary('licensing:mailboxes', `${countWord((v.seats || []).length, 'seat', 'seats')} · ${countWord((v.mailboxes || []).length, 'mailbox', 'mailboxes')}`);
}
