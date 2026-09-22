// src/account/licensingOrders.js
//
// The money side of the Licensing section (2026-09-22): the Microsoft
// details a first order needs, the licenses held, and adding one. Every
// call is the platform's own route; the customer's card is charged before
// anything is ordered, and the words here say so.
//
//   POST   v1/environment/licensing/microsoft        { mca: { firstName, lastName, email, accepted }, tenantId? | domainPrefix? }
//   POST   v1/environment/licensing/licenses         { productId, billingTerm, quantity } -> 201 the line; 402 CARD_DECLINED orders nothing
//   PUT    v1/environment/licensing/licenses/{id}    { quantity }  more seats now; fewer at the period's end
//   DELETE v1/environment/licensing/licenses/{id}    ends at the period's end, nothing refunded
//
// licensing.js paints these cards and routes clicks here through orderAction.

import { explainLink } from '../components/explainer.js';
import { LIC_URL, lc, st, url, body, cardHtml, countWord, money, TERM_NAMES, RENEW_WORDS, STATUS_WORDS, loadOffers, billWord, commitWord, ruleWords } from './licensingShared.js';

/* ---------- the Microsoft details: the agreement and the tenant (2026-09-22) ---------- */

export function canAdd() { const v = lc.view; return !!(v && v.eligible && v.account && v.microsoft && v.microsoft.ready && v.canManage); }

export function microsoftHtml() {
  const e = st.D.escapeHtml, v = lc.view, m = v.microsoft || {};
  if (!v.eligible || !v.account) return '';
  const canManage = !!v.canManage;
  let summary, inner;
  if (m.ready && !lc.msEdit) {
    summary = m.tenantId ? 'existing tenant' : `${m.domainPrefix}.onmicrosoft.com`;
    inner = `
      <div class="lic-facts">
        <div class="lic-fact"><span class="lic-k">Tenant</span><span class="lic-v">${m.tenantId ? `<span class="ev-code">${e(m.tenantId)}</span> <span class="adm-muted">yours, already there</span>` : `<span class="ev-code">${e(m.domainPrefix)}.onmicrosoft.com</span> <span class="adm-muted">created with the first license</span>`}</span></div>
        <div class="lic-fact"><span class="lic-k">Mail</span><span class="lic-v">${mailWhere(v, m.domainPrefix)}</span></div>
        <div class="lic-fact"><span class="lic-k">Agreement</span><span class="lic-v">accepted by ${e(m.mca.firstName)} ${e(m.mca.lastName)}, ${e(m.mca.email)}, ${e(st.D.fmtDate(m.mca.acceptedAt))}</span></div>
      </div>
      ${canManage ? `<div class="acct-actions-row"><button class="btn btn-sm" type="button" data-lic-action="ms-edit">Change</button></div>` : ''}`;
  } else {
    summary = m.ready ? 'changing' : 'needed before the first license';
    inner = canManage ? msFormHtml(m) : '<p class="acct-card-note">The owner or an admin names the tenant and accepts the Microsoft Customer Agreement before a license can be added.</p>';
  }
  return cardHtml({
    key: 'microsoft', icon: 'file', title: 'Microsoft details', summary,
    explain: explainLink('licensing', 'The agreement and the tenant'),
    body: `<p class="acct-error" id="licMsError" hidden></p>${inner}`
  });
}
/** The first label of a domain as a tenant name: acme.com -> acme, 3 to 27 letters and digits. */
function slugOf(host) { return String(host || '').toLowerCase().split('.')[0].replace(/[^a-z0-9]/g, '').slice(0, 27); }
const DOMAINS_LINK = '<a href="#account?section=environment&card=domains" data-acct-section="environment">Environment</a>';
/** Where mail lands, from the domains this environment has verified: the smart line under the tenant name. */
function mailWhere(v, prefix) {
  const e = st.D.escapeHtml, ds = v.mailDomains || [];
  const name = `${prefix ? e(prefix) : 'yourname'}.onmicrosoft.com`;
  if (v.microsoft?.tenantId) return `mailboxes use the domains already in your tenant${ds.length ? `; <strong>${e(ds[0])}</strong> joins it too` : `, and any you add on ${DOMAINS_LINK}`}`;
  if (ds.length) return `mailboxes start at name@${name} and move to <strong>${e(ds[0])}</strong> when it joins the tenant${ds.length > 1 ? ` (${e(ds.length - 1)} more on ${DOMAINS_LINK})` : ''}`;
  return `mailboxes are name@${name} until a domain of yours is added on ${DOMAINS_LINK}`;
}
/** The form in two modes (Cameron, 2026-09-22): a new tenant by name, or the id of a tenant they have. */
function msModeOf(m) { return lc.msMode || (m.tenantId ? 'existing' : 'new'); }
function msFormHtml(m) {
  const e = st.D.escapeHtml, v = lc.view, mca = m.mca || {}, ds = v.mailDomains || [];
  const mode = msModeOf(m);
  const prefix = m.domainPrefix || slugOf(ds[0]) || '';
  const f = (id, label, val, attrs = '') => `<div><label class="acct-label" for="${id}">${e(label)}</label><input class="acct-input" id="${id}" type="text" value="${e(val || '')}" ${attrs}></div>`;
  const tab = (k, label) => `<button class="ev-tab ${mode === k ? 'is-on' : ''}" type="button" role="tab" aria-selected="${mode === k}" data-lic-action="ms-mode" data-mode="${k}">${label}</button>`;
  return `
    <div class="ev-tabs lic-ms-tabs" role="tablist" aria-label="Your Microsoft tenant">${tab('new', 'New tenant')}${tab('existing', 'I have a tenant')}</div>
    <div class="ev-reg-form">
      <div class="lic-span" id="licMsPrefixWrap" ${mode === 'existing' ? 'hidden' : ''}>
        <label class="acct-label" for="licMsPrefix">Tenant name</label>
        <div class="lic-suffix"><input class="acct-input" id="licMsPrefix" type="text" value="${e(prefix)}" placeholder="yourcompany" spellcheck="false" autocapitalize="off" maxlength="27"><span>.onmicrosoft.com</span></div>
        <p class="lic-hint">${ds.length ? `Mail moves to <strong>${e(ds[0])}</strong> once it is added.` : `Mail moves to your own domain once you add one on ${DOMAINS_LINK}.`}</p>
      </div>
      <div class="lic-span" id="licMsTenantWrap" ${mode === 'existing' ? '' : 'hidden'}>
        <label class="acct-label" for="licMsTenant">Tenant id</label>
        <input class="acct-input" id="licMsTenant" type="text" value="${e(m.tenantId || '')}" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false">
      </div>
      ${f('licMsFirst', 'First name', mca.firstName, 'autocomplete="given-name"')}
      ${f('licMsLast', 'Last name', mca.lastName, 'autocomplete="family-name"')}
      ${f('licMsEmail', 'Email', mca.email, 'autocomplete="email" inputmode="email"')}
    </div>
    <label class="ev-agree"><input type="checkbox" id="licMsAccept"><span>I accept the <a href="https://www.microsoft.com/licensing/docs/customeragreement" target="_blank" rel="noopener">Microsoft Customer Agreement</a> for my organization.</span></label>
    <div class="acct-actions-row">
      <button class="btn" type="button" data-lic-action="ms-save" ${lc.saving === 'ms' ? 'disabled' : ''}>${lc.saving === 'ms' ? 'Saving…' : 'Save'}</button>
      ${lc.msEdit ? '<button class="btn btn-sm" type="button" data-lic-action="ms-cancel">Cancel</button>' : ''}
    </div>`;
}

/* ---------- the licenses held ---------- */

export function licensesHtml() {
  const e = st.D.escapeHtml, v = lc.view;
  if (!v.eligible || !v.account) return '';
  const all = v.licenses || [];
  const rows = all.filter(l => l.status !== 'CANCELED' && l.status !== 'FAILED');
  const past = all.filter(l => l.status === 'CANCELED' || l.status === 'FAILED');
  const summary = rows.length ? `${countWord(rows.reduce((n, l) => n + (l.quantity || 0), 0), 'seat', 'seats')} across ${countWord(rows.length, 'license', 'licenses')}` : 'none yet';
  const canManage = !!v.canManage;
  const row = (l) => {
    const tag = l.status === 'ACTIVE' ? 'is-verified' : l.status === 'ENDING' || l.status === 'FAILED' ? 'is-bad' : 'is-pending';
    const when = l.status === 'ENDING' && l.cancelAt ? ` on ${e(st.D.fmtDate(l.cancelAt))}` : '';
    const pendingOn = l.pendingAt || l.periodEnd;
    const pending = l.pendingQuantity != null && l.pendingQuantity !== l.quantity ? `<br><span class="adm-muted">${e(String(l.pendingQuantity))} from ${e(pendingOn ? st.D.fmtDate(pendingOn) : 'the period end')}</span>` : '';
    const commit = Number(l.commitmentMonths || 0) > 1 && l.commitmentEndsAt ? `<br><span class="adm-muted">${e(commitWord(l))} until ${e(st.D.fmtDate(l.commitmentEndsAt))}</span>` : '';
    const acts = canManage && (l.status === 'ORDERED' || l.status === 'ACTIVE') ? `
      <span class="lic-acts">
        <input class="acct-input lic-qty" type="number" min="1" max="500" value="${e(String(l.quantity))}" id="licQty-${e(l.id)}" aria-label="Seats">
        <button class="btn btn-sm" type="button" data-lic-action="seats" data-line="${e(l.id)}" ${lc.saving ? 'disabled' : ''}>Set seats</button>
        <button class="btn btn-sm is-danger" type="button" data-lic-action="end" data-line="${e(l.id)}" ${lc.saving ? 'disabled' : ''}>End at period end</button>
      </span>` : '';
    return `
      <tr>
        <td data-th="License"><span class="lic-name">${e(l.productName)}</span>${l.sku ? `<br><span class="ev-code">${e(l.sku)}</span>` : ''}</td>
        <td class="cell-tight" data-th="Seats">${e(String(l.quantity))}${pending}</td>
        <td class="cell-tight" data-th="Price">${e(money((l.listCents || 0) / 100))} <span class="adm-muted">${e(TERM_NAMES[l.billingTerm] || l.billingTerm || '')}</span>${commit}</td>
        <td class="cell-tight" data-th="Status"><span class="acct-tag ${tag}">${e(STATUS_WORDS[l.status] || String(l.status || '').toLowerCase())}${when}</span>${l.error ? `<br><span class="adm-muted lic-desc">${e(l.error)}</span>` : ''}</td>
        <td class="cell-tight" data-th="">${acts}</td>
      </tr>`;
  };
  const table = !rows.length ? '<p class="acct-empty">No licenses yet. Add one from the Licenses list below.</p>' : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table lic-table">
          <thead><tr><th>License</th><th>Seats</th><th>Price</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map(row).join('')}</tbody>
        </table>
      </div>`;
  const history = past.length ? `<details class="lic-past"><summary>${e(countWord(past.length, 'past license', 'past licenses'))}</summary><div class="adm-table-scroll"><table class="adm-table adm-table--wrap ev-table lic-table"><tbody>${past.map(row).join('')}</tbody></table></div></details>` : '';
  return cardHtml({
    key: 'licenses', icon: 'layers', title: 'Your licenses', summary,
    explain: explainLink('licensing', 'How a license is billed'),
    body: `<p class="acct-error" id="licLinesError" hidden></p>${lc.lineNote ? `<p class="acct-card-note ev-note">${e(lc.lineNote)}</p>` : ''}${table}${history}<p class="acct-card-note ev-note">More seats are charged now and applied now. Fewer seats and an ending take effect at the end of the paid period, with nothing refunded. A license renews on the same day each period until you end it.</p>`
  });
}

/* ---------- adding a license ---------- */

export function addHtml() {
  const e = st.D.escapeHtml, a = lc.add, v = lc.view;
  const p = (v.catalog || []).find(x => x.id === a.productId);
  if (!p) return '';
  const offers = (lc.prices[p.id] || []).filter(o => o.available !== false);
  const chosen = offers.find(o => o.key === a.key) || offers[0] || null;
  const opts = offers.map(o => `<option value="${e(o.key)}" ${chosen && chosen.key === o.key ? 'selected' : ''}>${e(money(o.list))} ${e(billWord(o.billingTerm))}, ${e(commitWord(o))}</option>`).join('');
  const total = chosen ? money(chosen.list * a.quantity) : '';
  const rule = chosen ? ruleWords(chosen) : '';
  return `
    <div class="lic-add" id="licAdd">
      <div class="ev-reg-form">
        <div class="lic-span"><label class="acct-label" for="licAddTerm">Plan</label><select class="acct-input" id="licAddTerm" ${offers.length ? '' : 'disabled'}>${opts || '<option>Reading the price…</option>'}</select></div>
        <div><label class="acct-label" for="licAddQty">Seats</label><input class="acct-input" id="licAddQty" type="number" min="1" max="500" inputmode="numeric" value="${e(String(a.quantity))}"></div>
      </div>
      <p class="acct-card-note">${chosen ? `Charged now: <strong>${e(total)}</strong> plus any tax, then ${e(RENEW_WORDS[chosen.billingTerm] || 'each term')} until you end it.${rule ? ` ${e(rule.charAt(0).toUpperCase() + rule.slice(1))}.` : ''}` : lc.prices[p.id] === null ? 'This license has no list price to order on; ask Support and it is added by hand.' : 'Reading the price…'}</p>
      <p class="acct-error" id="licAddError" hidden></p>
      <div class="acct-actions-row">
        <button class="btn" type="button" data-lic-action="add-confirm" ${lc.saving === 'add' || !chosen ? 'disabled' : ''}>${lc.saving === 'add' ? 'Charging and ordering…' : chosen ? `Charge ${e(total)} and order` : 'No price to order on'}</button>
        <button class="btn btn-sm" type="button" data-lic-action="add-cancel" ${lc.saving === 'add' ? 'disabled' : ''}>Cancel</button>
      </div>
    </div>`;
}

/* ---------- actions ---------- */

async function saveMicrosoft() {
  if (lc.saving) return;
  const g = (id) => String(document.getElementById(id)?.value || '').trim();
  const accepted = !!document.getElementById('licMsAccept')?.checked;
  const has = msModeOf(lc.view.microsoft || {}) === 'existing';
  const fields = { mca: { firstName: g('licMsFirst'), lastName: g('licMsLast'), email: g('licMsEmail'), accepted }, tenantId: has ? g('licMsTenant') : '', domainPrefix: has ? '' : slugOf(g('licMsPrefix')) };
  if (!has && fields.domainPrefix.length < 3) { st.D.showError('licMsError', 'The tenant name is 3 to 27 letters and digits.'); return; }
  if (has && !fields.tenantId) { st.D.showError('licMsError', 'Paste the tenant id, or choose New tenant.'); return; }
  if (!accepted) { st.D.showError('licMsError', 'Tick the agreement to continue.'); return; }
  lc.saving = 'ms'; st.D.showError('licMsError', ''); st.paint();
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/microsoft`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(fields) });
    lc.saving = ''; lc.msEdit = false;
    lc.view.microsoft = { ...(d.microsoft || {}), ready: true };
    st.paint();
  } catch (ex) {
    lc.saving = ''; st.paint();
    // the form is repainted from the saved view on a failure; put the typed values back
    for (const [id, val] of [['licMsFirst', fields.mca.firstName], ['licMsLast', fields.mca.lastName], ['licMsEmail', fields.mca.email], ['licMsTenant', fields.tenantId], ['licMsPrefix', fields.domainPrefix]]) { const el = document.getElementById(id); if (el) el.value = val; }
    const el = document.getElementById('licMsAccept'); if (el) el.checked = accepted;
    st.D.showError('licMsError', ex?.data?.error || st.D.friendlyError(ex, 'The details could not be saved.'));
  }
}
async function openAdd(btn) {
  const id = btn.dataset.product || '';
  if (!id || lc.saving) return;
  lc.add = { productId: id, key: '', quantity: 1 };
  if (lc.prices[id] === undefined) {
    st.paint();
    try { await loadOffers(id); } catch { /* the box says it has no price */ }
    if (!lc.add || lc.add.productId !== id) return;
  }
  const offers = (lc.prices[id] || []).filter(o => o.available !== false);
  if (offers.length) lc.add.key = offers[0].key;
  st.paint();
  document.getElementById('licAdd')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function readAdd() {
  if (!lc.add) return;
  lc.add.key = String(document.getElementById('licAddTerm')?.value || lc.add.key);
  lc.add.quantity = Math.max(1, Math.min(500, Math.floor(Number(document.getElementById('licAddQty')?.value) || 1)));
}
async function confirmAdd() {
  if (!lc.add || lc.saving) return;
  readAdd();
  lc.saving = 'add'; st.paint();
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/licenses`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body((() => { const o = (lc.prices[lc.add.productId] || []).find(x => x.key === lc.add.key) || {}; return { productId: lc.add.productId, billingTerm: o.billingTerm || 'Monthly', commitmentMonths: o.commitmentMonths ?? null, quantity: lc.add.quantity }; })()) });
    lc.saving = ''; lc.add = null;
    lc.lineNote = `${d.license.productName} ordered: ${countWord(d.license.quantity, 'seat', 'seats')}. It activates within a few hours; this list shows it active when Microsoft has it.`;
    await st.load();
  } catch (ex) {
    lc.saving = ''; st.paint();
    const code = ex?.data?.code;
    const msg = code === 'CARD_DECLINED' ? (ex?.data?.error || 'The card on file was declined. Update it on Billing and try again; nothing was ordered.')
      : code === 'MICROSOFT_DETAILS_REQUIRED' ? 'Save the Microsoft details first.'
      : code === 'NO_STRIPE_CUSTOMER' ? 'Add a card on Billing first; the license is charged to it before it is ordered.'
      : code === 'LIVE_LANE_ONLY' ? 'Licenses are managed on your live environment, not the sandbox.'
      : (ex?.data?.error || st.D.friendlyError(ex, 'The license could not be added.'));
    st.D.showError('licAddError', msg);
  }
}
async function setSeats(btn) {
  const id = btn.dataset.line || '';
  if (!id || lc.saving) return;
  const qty = Math.floor(Number(document.getElementById(`licQty-${id}`)?.value));
  if (!Number.isFinite(qty) || qty < 1 || qty > 500) { st.D.showError('licLinesError', 'Seats are a whole number from 1 to 500.'); return; }
  lc.saving = id; st.D.showError('licLinesError', ''); st.paint();
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/licenses/${encodeURIComponent(id)}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body({ quantity: qty }) });
    lc.saving = '';
    const l = d.license;
    lc.lineNote = l.pendingQuantity != null && l.pendingQuantity !== l.quantity ? `${l.productName}: ${countWord(l.pendingQuantity, 'seat', 'seats')} from the end of the paid period.` : `${l.productName}: ${countWord(l.quantity, 'seat', 'seats')}, charged and applied.`;
    await st.load();
  } catch (ex) {
    lc.saving = ''; st.paint();
    st.D.showError('licLinesError', ex?.data?.code === 'CARD_DECLINED' ? (ex?.data?.error || 'The card on file was declined; the seats are unchanged.') : (ex?.data?.error || st.D.friendlyError(ex, 'The seats could not be changed.')));
  }
}
async function endLicense(btn) {
  const id = btn.dataset.line || '';
  if (!id || lc.saving) return;
  if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Yes, end it at the period end'; return; }
  lc.saving = id; st.D.showError('licLinesError', ''); st.paint();
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/licenses/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: body({}) });
    lc.saving = '';
    lc.lineNote = `${d.license.productName} ends on ${st.D.fmtDate(d.license.cancelAt)}; it stays usable until then.`;
    await st.load();
  } catch (ex) { lc.saving = ''; st.paint(); st.D.showError('licLinesError', ex?.data?.error || st.D.friendlyError(ex, 'The license could not be ended.')); }
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function orderAction(a, btn) {
  if (a === 'ms-save') { saveMicrosoft(); return true; }
  if (a === 'ms-mode') { setMsMode(btn.dataset.mode); return true; }
  if (a === 'ms-edit') { lc.msEdit = true; st.paint(); return true; }
  if (a === 'ms-cancel') { lc.msEdit = false; st.paint(); return true; }
  if (a === 'add-open') { openAdd(btn); return true; }
  if (a === 'add-cancel') { lc.add = null; st.paint(); return true; }
  if (a === 'add-confirm') { confirmAdd(); return true; }
  if (a === 'seats') { setSeats(btn); return true; }
  if (a === 'end') { endLicense(btn); return true; }
  return false;
}
/** The tenant toggle: a name for a new tenant, or the id of one they have. Typed values stay. */
/** Switch the form's mode in place, so what was typed stays. */
function setMsMode(mode) {
  lc.msMode = mode === 'existing' ? 'existing' : 'new';
  const has = lc.msMode === 'existing';
  const p = document.getElementById('licMsPrefixWrap'), t = document.getElementById('licMsTenantWrap');
  if (p) p.hidden = has; if (t) t.hidden = !has;
  for (const b of document.querySelectorAll('[data-lic-action="ms-mode"]')) { const on = b.dataset.mode === lc.msMode; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
  st.D.showError('licMsError', '');
}
/** The add box's term or seat count changed: the charge sentence follows. */
export function orderChange(e) {
  const t = e.target;
  if (t && (t.id === 'licAddTerm' || t.id === 'licAddQty') && lc.add && !lc.saving) { readAdd(); st.paint(); }
}
