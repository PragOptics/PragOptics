// src/account/licensingBilling.js
//
// The billing check on the Licensing tab (2026-09-22), for the platform's
// operator only: every licensing charge this environment has in Stripe, which
// license owns it, and a way to stop a charge that owns nothing, without
// leaving the platform. A charge with no license behind it is money billed
// for nothing; the list says so in red and offers Stop.
//
//   GET  v1/admin/licensing/billing          the environment's licensing subscriptions and their items, classified
//   POST v1/admin/licensing/billing/stop     { subscriptionId, itemId }  stops a charge that owns nothing
//
// licensing.js paints the card and routes its clicks here.

import { PRAG_API_BASE } from '../runtime/config.js';
import { lc, st, url, body, cardHtml, money } from './licensingShared.js';
import { iconBtn, leadBtn, armed } from './cards.js';

const BILL_URL = `${PRAG_API_BASE}/admin/licensing/billing`;

/** The operator flag, from the session's ping; the backend checks it again on every call. */
function isOperator() { try { return st.D.cachedPing?.()?.user?.isAdmin === true; } catch { return false; } }

function billState() { return lc.bill || (lc.bill = { subs: null, busy: false, stopping: '' }); }

export function billingHtml() {
  if (!isOperator() || !lc.view?.account) return '';
  const e = st.D.escapeHtml, b = billState();
  const orphans = (b.subs || []).flatMap(s => s.status === 'canceled' ? [] : s.items.filter(i => !i.license));
  const summary = b.subs == null ? 'operator view' : orphans.length ? `${orphans.length} charge${orphans.length === 1 ? '' : 's'} with no license` : 'every charge has its license';
  let inner;
  if (b.subs == null) inner = `<div class="acct-actions-row">${leadBtn({ lic: 'bill-read' }, 'search', b.busy ? 'Reading Stripe…' : 'Check the licensing charges', b.busy ? 'disabled' : '')}</div>`;
  else if (!b.subs.length) inner = '<p class="acct-empty">No licensing subscription in Stripe for this environment.</p>';
  else inner = `<div class="lic-bill">${b.subs.map(s => subHtml(s, e)).join('')}</div>
    <div class="acct-actions-row">${iconBtn({ lic: 'bill-read' }, 'refresh', 'Read Stripe again', b.busy ? 'disabled' : '', b.busy ? 'is-spinning' : '')}</div>`;
  return cardHtml({
    key: 'billing', icon: 'card', title: 'Licensing charges', summary,
    body: `<p class="acct-card-note">Operator only. Every licensing charge this environment has in Stripe, and the license that owns it. A charge with no license is billing for nothing; stop it here.</p><p class="acct-error" id="licBillError" hidden></p>${inner}`
  });
}

function subHtml(s, e) {
  const canceled = s.status === 'canceled';
  const state = canceled ? 'canceled' : s.cancelAtPeriodEnd ? `ends ${st.D.fmtDate(s.periodEnd)}` : s.status;
  return `
    <div class="lic-bill-sub ${canceled ? 'is-canceled' : ''}">
      <div class="lic-bill-head"><span class="ev-code">${e(s.id)}</span><span class="acct-tag ${canceled ? '' : 'is-verified'}">${e(state)}</span>${s.created ? `<span class="adm-muted">since ${e(st.D.fmtDate(s.created))}</span>` : ''}</div>
      ${s.items.map(i => itemHtml(s, i, e, canceled)).join('')}
    </div>`;
}

function itemHtml(s, i, e, canceled) {
  const b = billState();
  const owned = !!i.license;
  const price = `${money(i.unitCents / 100)} a ${i.interval || 'period'} × ${i.quantity}`;
  const stop = !owned && !canceled ? leadBtn({ lic: 'bill-stop' }, 'stop', b.stopping === i.id ? 'Stopping…' : 'Stop this charge', `data-sub="${e(s.id)}" data-item="${e(i.id)}" ${b.stopping ? 'disabled' : ''}`, 'is-danger') : '';
  return `
    <div class="lic-bill-item ${owned ? '' : 'is-orphan'}">
      <div><span class="lic-name">${e(i.productName || i.id)}</span><br><span class="adm-muted">${e(price)}</span></div>
      <div>${owned ? `<span class="acct-tag is-verified">license ${e(String(i.license.status).toLowerCase())}</span>` : `<span class="acct-tag is-bad">no license</span>`}</div>
      ${stop ? `<div>${stop}</div>` : ''}
    </div>`;
}

async function readBilling() {
  const b = billState();
  if (b.busy) return;
  b.busy = true; st.paint();
  try { const d = await st.D.apiFetch(url(BILL_URL)); b.subs = Array.isArray(d.subscriptions) ? d.subscriptions : []; }
  catch (ex) { b.busy = false; st.paint(); st.D.showError('licBillError', ex?.data?.error || st.D.friendlyError(ex, 'Stripe could not be read.')); return; }
  b.busy = false; st.paint();
}

async function stopCharge(btn) {
  const b = billState();
  if (b.stopping) return;
  if (!armed(btn, 'Stop it now?')) return;
  b.stopping = btn.dataset.item; st.paint();
  try {
    await st.D.apiFetch(url(`${BILL_URL}/stop`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({ subscriptionId: btn.dataset.sub, itemId: btn.dataset.item }) });
    b.stopping = ''; b.subs = null;
    await readBilling();
  } catch (ex) {
    b.stopping = ''; st.paint();
    st.D.showError('licBillError', ex?.data?.error || st.D.friendlyError(ex, 'The charge could not be stopped.'));
  }
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function billingAction(a, btn) {
  if (a === 'bill-read') { readBilling(); return true; }
  if (a === 'bill-stop') { stopCharge(btn); return true; }
  return false;
}
