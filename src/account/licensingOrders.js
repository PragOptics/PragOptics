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
import { LIC_URL, lc, st, url, body, cardHtml, countWord, money, TERM_NAMES, RENEW_WORDS, STATUS_WORDS } from './licensingShared.js';

/* ---------- the Microsoft details: the agreement and the tenant (2026-09-22) ---------- */

export function canAdd() { const v = lc.view; return !!(v && v.eligible && v.account && v.microsoft && v.microsoft.ready && v.canManage); }

export function microsoftHtml() {
  const e = st.D.escapeHtml, v = lc.view, m = v.microsoft || {};
  if (!v.eligible || !v.account) return '';
  const canManage = !!v.canManage;
  let summary, inner;
  if (m.ready && !lc.msEdit) {
    summary = m.tenantId ? 'existing tenant' : 'new tenant';
    inner = `
      <div class="lic-facts">
        <div class="lic-fact"><span class="lic-k">Tenant</span><span class="lic-v">${m.tenantId ? `<span class="ev-code">${e(m.tenantId)}</span>` : `<span class="ev-code">${e(m.domainPrefix)}.onmicrosoft.com</span> <span class="adm-muted">created with the first license</span>`}</span></div>
        <div class="lic-fact"><span class="lic-k">Agreement</span><span class="lic-v">Microsoft Customer Agreement accepted by ${e(m.mca.firstName)} ${e(m.mca.lastName)}, ${e(m.mca.email)}, on ${e(st.D.fmtDate(m.mca.acceptedAt))}</span></div>
      </div>
      ${canManage ? `<div class="acct-actions-row"><button class="btn btn-sm" type="button" data-lic-action="ms-edit">Change</button></div>` : ''}`;
  } else {
    summary = m.ready ? 'changing' : 'needed before the first license';
    inner = canManage ? msFormHtml(m) : '<p class="acct-card-note">The owner or an admin accepts the Microsoft Customer Agreement and names the tenant before a license can be added.</p>';
  }
  return cardHtml({
    key: 'microsoft', icon: 'file', title: 'Microsoft details', summary,
    explain: explainLink('licensing', 'The agreement and the tenant'),
    body: `<p class="acct-error" id="licMsError" hidden></p>${inner}`
  });
}
function msFormHtml(m) {
  const e = st.D.escapeHtml, mca = m.mca || {};
  const f = (id, label, val, attrs = '') => `<div><label class="acct-label" for="${id}">${e(label)}</label><input class="acct-input" id="${id}" type="text" value="${e(val || '')}" ${attrs}></div>`;
  return `
    <p class="acct-card-note">Microsoft records who accepted its Customer Agreement for your organization, and every license lands in a Microsoft tenant: yours if you have one, or a new one created with the first order.</p>
    <div class="ev-reg-form">
      ${f('licMsFirst', 'First name', mca.firstName, 'autocomplete="given-name"')}
      ${f('licMsLast', 'Last name', mca.lastName, 'autocomplete="family-name"')}
      ${f('licMsEmail', 'Email', mca.email, 'autocomplete="email" inputmode="email"')}
      ${f('licMsTenant', 'Existing tenant id (empty for a new tenant)', m.tenantId, 'placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false"')}
      ${f('licMsPrefix', 'New tenant prefix (becomes prefix.onmicrosoft.com)', m.domainPrefix, 'placeholder="yourcompany" spellcheck="false" autocapitalize="off"')}
    </div>
    <label class="ev-agree"><input type="checkbox" id="licMsAccept"><span>I have read and accept the <a href="https://www.microsoft.com/licensing/docs/customeragreement" target="_blank" rel="noopener">Microsoft Customer Agreement</a> on behalf of my organization.</span></label>
    <div class="acct-actions-row">
      <button class="btn" type="button" data-lic-action="ms-save" ${lc.saving === 'ms' ? 'disabled' : ''}>${lc.saving === 'ms' ? 'Saving…' : 'Save the Microsoft details'}</button>
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
    const pending = l.pendingQuantity != null && l.pendingQuantity !== l.quantity ? `<br><span class="adm-muted">${e(String(l.pendingQuantity))} from ${e(l.periodEnd ? st.D.fmtDate(l.periodEnd) : 'the period end')}</span>` : '';
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
        <td class="cell-tight" data-th="Price">${e(money((l.listCents || 0) / 100))} <span class="adm-muted">${e(TERM_NAMES[l.billingTerm] || l.billingTerm || '')}</span></td>
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
  const terms = lc.prices[p.id] || null;
  const chosen = terms ? terms.find(t => t.billingTerm === a.term) || terms[0] : null;
  const termOpts = terms ? terms.map(t => `<option value="${e(t.billingTerm)}" ${a.term === t.billingTerm ? 'selected' : ''}>${e(money(t.list))} ${e(TERM_NAMES[t.billingTerm] || t.billingTerm)} per seat</option>`).join('') : '<option value="Monthly">Monthly</option>';
  const total = chosen ? money(chosen.list * a.quantity) : '';
  return `
    <div class="lic-add" id="licAdd">
      <h4 class="acct-card-h">Add ${e(p.name)}</h4>
      <div class="ev-reg-form">
        <div><label class="acct-label" for="licAddTerm">Term</label><select class="acct-input" id="licAddTerm">${termOpts}</select></div>
        <div><label class="acct-label" for="licAddQty">Seats</label><input class="acct-input" id="licAddQty" type="number" min="1" max="500" value="${e(String(a.quantity))}"></div>
      </div>
      <p class="acct-card-note">${chosen ? `Your card on file is charged <strong>${e(total)}</strong> plus any tax now, and again ${e(RENEW_WORDS[chosen.billingTerm] || 'each term')} until you end it. The order goes to Microsoft's distributor on that charge; the license activates within a few hours.` : lc.prices[p.id] === null ? 'This license has no list price to charge on; write to support@bridgesindust.com and it is added by hand.' : 'Reading the price…'}</p>
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
  const fields = { mca: { firstName: g('licMsFirst'), lastName: g('licMsLast'), email: g('licMsEmail'), accepted }, tenantId: g('licMsTenant'), domainPrefix: g('licMsPrefix').toLowerCase() };
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
  lc.add = { productId: id, term: 'Monthly', quantity: 1 };
  if (lc.prices[id] === undefined) {
    st.paint();
    try {
      const d = await st.D.apiFetch(url(`${LIC_URL}/products/${encodeURIComponent(id)}/pricing`));
      const terms = (d.terms || []).filter(t => (t.rates || []).length).map(t => ({ billingTerm: t.billingTerm, commitmentMonths: t.commitmentMonths, list: t.rates[0].list }));
      lc.prices[id] = terms.length ? terms : null;
    } catch (ex) { lc.prices[id] = null; }
    if (!lc.add || lc.add.productId !== id) return;
  }
  const terms = lc.prices[id];
  if (terms && terms.length) lc.add.term = terms.find(t => t.billingTerm === 'Monthly') ? 'Monthly' : terms[0].billingTerm;
  st.paint();
  document.getElementById('licAdd')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function readAdd() {
  if (!lc.add) return;
  lc.add.term = String(document.getElementById('licAddTerm')?.value || lc.add.term);
  lc.add.quantity = Math.max(1, Math.min(500, Math.floor(Number(document.getElementById('licAddQty')?.value) || 1)));
}
async function confirmAdd() {
  if (!lc.add || lc.saving) return;
  readAdd();
  lc.saving = 'add'; st.paint();
  try {
    const d = await st.D.apiFetch(url(`${LIC_URL}/licenses`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({ productId: lc.add.productId, billingTerm: lc.add.term, quantity: lc.add.quantity }) });
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
  if (a === 'ms-edit') { lc.msEdit = true; st.paint(); return true; }
  if (a === 'ms-cancel') { lc.msEdit = false; st.paint(); return true; }
  if (a === 'add-open') { openAdd(btn); return true; }
  if (a === 'add-cancel') { lc.add = null; st.paint(); return true; }
  if (a === 'add-confirm') { confirmAdd(); return true; }
  if (a === 'seats') { setSeats(btn); return true; }
  if (a === 'end') { endLicense(btn); return true; }
  return false;
}
/** The add box's term or seat count changed: the charge sentence follows. */
export function orderChange(e) {
  const t = e.target;
  if (t && (t.id === 'licAddTerm' || t.id === 'licAddQty') && lc.add && !lc.saving) { readAdd(); st.paint(); }
}
