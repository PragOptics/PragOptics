// src/account/licensingPax8.js
//
// The operator's Pax8 card on the Licensing tab (2026-09-23): whether the platform and Pax8 agree, and the
// webhook that keeps them agreeing. For the platform's operator only (the ping's isAdmin; the backend checks it
// again on every call).
//
//   POST v1/admin/licensing/pax8/reconcile      the daily check, now: companies, lines, what changed, what disagrees,
//                                               what Pax8 bills with no line behind it
//   POST v1/admin/licensing/pax8/webhook        point Pax8 at this lane (made or brought up to date)
//   POST v1/admin/licensing/pax8/webhook/test   { topic }  Pax8 sends that topic's sample payload here
//   GET  v1/admin/licensing/pax8/events         the last deliveries received
//
// licensing.js paints the card and routes its clicks here.

import { PRAG_API_BASE } from '../runtime/config.js';
import { lc, st, cardHtml, countWord } from './licensingShared.js';
import { iconBtn, leadBtn, btnLabel } from './cards.js';

const P8 = `${PRAG_API_BASE}/admin/licensing/pax8`;

function isOperator() { try { return st.D.cachedPing?.()?.user?.isAdmin === true; } catch { return false; } }
function ps() { return lc.p8 || (lc.p8 = { report: null, hook: null, events: null, topic: '', busy: '' }); }

export function pax8Html() {
  if (!isOperator() || !lc.view?.account) return '';
  const e = st.D.escapeHtml, p = ps(), r = p.report;
  const summary = r ? (r.drift.length || r.orphans.length ? `${r.drift.length + r.orphans.length} to look at` : 'in agreement') : 'operator view';
  const busy = (k) => p.busy === k;
  const reportHtml = !r ? '' : `
    <div class="p8-report">
      <p class="acct-card-note">Checked ${e(st.D.fmtDate(r.at))}: ${e(countWord(r.companies, 'company', 'companies'))}, ${e(countWord(r.lines, 'line', 'lines'))} with a Pax8 subscription${r.changed.length ? `, ${e(String(r.changed.length))} brought up to date` : ''}.</p>
      ${r.drift.length ? `<ul class="p8-list">${r.drift.map(d => `<li class="is-warn"><b>${e(d.productName || d.lineId)}</b> ${e(d.drift.join('; '))}</li>`).join('')}</ul>` : ''}
      ${r.orphans.length ? `<ul class="p8-list">${r.orphans.map(o => `<li class="is-bad"><b>${e(o.productName || o.subscriptionId)}</b> ${e(String(o.quantity))} at Pax8 (${e(o.status)}) with no line on the platform; Pax8 bills the platform for it <span class="ev-code">${e(o.subscriptionId)}</span></li>`).join('')}</ul>` : ''}
      ${r.errors.length ? `<ul class="p8-list">${r.errors.map(x => `<li class="is-bad">${e(x.companyId || x.environmentId || '')}: ${e(x.error)}</li>`).join('')}</ul>` : ''}
      ${!r.drift.length && !r.orphans.length && !r.errors.length ? '<p class="acct-card-note p8-ok">The platform and Pax8 agree.</p>' : ''}
    </div>`;
  const hook = p.hook;
  const topics = hook ? hook.topics.map(t => t.topic) : [];
  const events = p.events;
  return cardHtml({
    key: 'pax8', icon: 'zap', title: 'Pax8', summary,
    body: `
      <p class="acct-card-note">Operator only. The daily check compares every license line with its Pax8 subscription and finds what Pax8 bills with no line behind it. The webhook tells the platform the moment Pax8 changes something.</p>
      <p class="acct-error" id="licP8Error" hidden></p>
      <div class="acct-actions-row act-row">
        ${leadBtn({ lic: 'p8-check' }, busy('check') ? 'refresh' : 'search', busy('check') ? 'Checking…' : 'Check against Pax8', busy('check') ? 'disabled' : '', busy('check') ? 'is-spinning' : 'btn-primary')}
        ${leadBtn({ lic: 'p8-sync' }, busy('sync') ? 'refresh' : 'zap', busy('sync') ? 'Syncing…' : 'Sync the webhook', `${busy('sync') ? 'disabled' : ''} data-tip="Points Pax8 at this lane, with every subscription and provisioning event"`, busy('sync') ? 'is-spinning' : '')}
      </div>
      ${reportHtml}
      ${hook ? `<p class="acct-card-note p8-hook">Webhook ${e(hook.created ? 'made' : 'up to date')}: ${hook.topics.map(t => `<b>${e(t.topic)}</b> (${e(t.actions.join(', ').toLowerCase())})`).join(', ')}.</p>
        <div class="tm-inline-edit p8-test">
          <select class="acct-input" id="licP8Topic" aria-label="Topic to test">${topics.map(t => `<option value="${e(t)}" ${p.topic === t ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>
          ${iconBtn({ lic: 'p8-test' }, 'send', 'Send a test event: Pax8 posts the topic’s sample here', busy('test') ? 'disabled' : '', busy('test') ? 'is-spinning' : '')}
        </div>` : ''}
      <div class="p8-events-head"><span class="lic-k">Last events received</span>${iconBtn({ lic: 'p8-events' }, 'refresh', 'Read the last events', busy('events') ? 'disabled' : '', busy('events') ? 'is-spinning' : '')}</div>
      ${events == null ? '<p class="acct-card-note">Not read yet.</p>' : !events.length ? '<p class="acct-card-note">None received on this lane yet.</p>' : `
        <ul class="p8-events">${events.map(ev => `
          <li><details><summary><span class="adm-muted">${e(st.D.fmtDate(ev.at))} ${e(new Date(ev.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</span> <b>${e(ev.topic || 'event')}</b> ${e(ev.action || '')} ${ev.subscriptionIds.length ? `<span class="adm-muted">${e(countWord(ev.subscriptionIds.length, 'subscription', 'subscriptions'))}</span>` : ''}</summary><pre class="adm-pre p8-body">${e(pretty(ev.body))}</pre></details></li>`).join('')}</ul>`}` });
}
function pretty(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return String(s || ''); } }

async function run(key, fn, errText) {
  const p = ps();
  if (p.busy) return;
  p.busy = key; st.D.showError('licP8Error', ''); st.paint();
  try { await fn(); }
  catch (ex) { st.D.showError('licP8Error', ex?.data?.error || st.D.friendlyError(ex, errText)); }
  finally { p.busy = ''; st.paint(); }
}
const post = (path, payload = {}) => st.D.apiFetch(`${P8}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function pax8Action(a, btn) {
  const p = ps();
  if (a === 'p8-check') { run('check', async () => { const d = await post('/reconcile'); p.report = d.report; }, 'Pax8 could not be checked.'); return true; }
  if (a === 'p8-sync') { run('sync', async () => { const d = await post('/webhook'); p.hook = { created: d.created, topics: d.topics || [] }; p.topic = p.topic || (d.topics?.[0]?.topic || ''); }, 'The webhook could not be synced.'); return true; }
  if (a === 'p8-test') {
    p.topic = String(document.getElementById('licP8Topic')?.value || p.topic || '');
    run('test', async () => { await post('/webhook/test', { topic: p.topic }); btnLabel(btn, 'Sent'); }, 'The test could not be sent.');
    return true;
  }
  if (a === 'p8-events') { run('events', async () => { const d = await st.D.apiFetch(`${P8}/events`); p.events = d.events || []; }, 'The events could not be read.'); return true; }
  return false;
}
