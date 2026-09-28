// src/account/licensingBilling.js
//
// The billing check on the Licensing tab (2026-09-22), for the platform's
// operator only: every licensing charge this environment has in Stripe, which
// license owns it, and a way to stop a charge that owns nothing, without
// leaving the platform. A charge with no license behind it is money billed
// for nothing; the list says so in red and offers Stop.
//
// Its buttons keep the tab's one habit (licensingShared.js send): while a
// request is out its button says what it is doing, every other request button
// on the tab waits with the reason in its tip, and the answer, errors
// included, brings each back with its own word (2026-09-23, standing rule c).
//
//   GET  v1/admin/licensing/billing          the environment's licensing subscriptions and their items, classified
//   POST v1/admin/licensing/billing/stop     { subscriptionId, itemId }  stops a charge that owns nothing
//
// licensing.js paints the card and routes its clicks here.

import { PRAG_API_BASE } from '../runtime/config.js';
import { lc, st, url, call, cardHtml, money, isOperator, send, reqLead, reqIcon, errHtml, noteHtml, setNote } from './licensingShared.js';
import { armed } from './cards.js';

const BILL_URL = `${PRAG_API_BASE}/admin/licensing/billing`;

function billState() { return lc.bill || (lc.bill = { subs: null }); }

export function billingHtml() {
  if (!isOperator() || !lc.view?.account) return '';
  const e = st.D.escapeHtml, b = billState();
  const orphans = (b.subs || []).flatMap(s => s.status === 'canceled' ? [] : s.items.filter(i => !i.license));
  const summary = b.subs == null ? 'operator view' : orphans.length ? `${orphans.length} charge${orphans.length === 1 ? '' : 's'} with no license` : 'every charge has its license';
  let inner;
  if (b.subs == null) inner = `<div class="acct-actions-row">${reqLead('bill-read', { lic: 'bill-read' }, 'search', 'Check the licensing charges', 'Reading Stripe…')}</div>`;
  else if (!b.subs.length) inner = `<p class="acct-empty">No licensing subscription in Stripe for this environment.</p><div class="acct-actions-row">${reqIcon('bill-read', { lic: 'bill-read' }, 'refresh', 'Read Stripe again', 'Reading Stripe…')}</div>`;
  else inner = `<div class="lic-bill">${b.subs.map(s => subHtml(s, e)).join('')}</div>
    <div class="acct-actions-row">${reqIcon('bill-read', { lic: 'bill-read' }, 'refresh', 'Read Stripe again', 'Reading Stripe…')}</div>`;
  return cardHtml({
    key: 'billing', icon: 'card', title: 'Licensing charges', summary: e(summary),
    body: `<p class="acct-card-note">Operator only. Every licensing charge this environment has in Stripe, and the license that owns it; since 2026-09-24 each license is a subscription of its own. A charge with no license is billing for nothing; stop it here.</p>${noteHtml('billing')}${errHtml('billing')}${inner}`
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
  const owned = !!i.license;
  const price = `${money(i.unitCents / 100)} a ${i.interval || 'period'} × ${i.quantity}`;
  const stop = !owned && !canceled ? reqLead(`bill-stop:${i.id}`, { lic: 'bill-stop' }, 'stop', 'Stop this charge', 'Stopping…', `data-sub="${e(s.id)}" data-item="${e(i.id)}"`, 'is-danger') : '';
  return `
    <div class="lic-bill-item ${owned ? '' : 'is-orphan'}">
      <div><span class="lic-name">${e(i.productName || i.id)}</span><br><span class="adm-muted">${e(price)}</span></div>
      <div>${owned ? `<span class="acct-tag is-verified">license ${e(String(i.license.status).toLowerCase())}</span>` : '<span class="acct-tag is-bad">no license</span>'}</div>
      ${stop ? `<div>${stop}</div>` : ''}
    </div>`;
}

async function readSubs() {
  const d = await st.D.apiFetch(url(BILL_URL));
  billState().subs = Array.isArray(d?.subscriptions) ? d.subscriptions : [];
}

function readBilling() {
  setNote('billing', '');
  return send('bill-read', 'Reading Stripe…', readSubs, { errKey: 'billing', fallback: 'Stripe could not be read.' });
}

async function stopCharge(btn) {
  if (lc.busy) return;
  const subscriptionId = btn.dataset.sub || '', itemId = btn.dataset.item || '';
  if (!subscriptionId || !itemId) return;
  if (!armed(btn, 'Stop it now?')) return;
  setNote('billing', '');
  await send(`bill-stop:${itemId}`, 'Stopping…', async () => {
    const d = await call(`${BILL_URL}/stop`, 'POST', { subscriptionId, itemId });
    setNote('billing', d?.stopped === 'subscription'
      ? 'Stopped: the whole subscription is canceled, since nothing on it belonged to a license.'
      : 'Stopped: the charge came off its subscription.');
    await readSubs();
  }, { errKey: 'billing', fallback: 'The charge could not be stopped.' });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function billingAction(a, btn) {
  if (a === 'bill-read') { readBilling(); return true; }
  if (a === 'bill-stop') { stopCharge(btn); return true; }
  return false;
}
