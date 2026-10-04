// src/account/licensingPax8.js
//
// The operator's Pax8 card on the Licensing tab (2026-09-23): whether the platform and Pax8 agree, and the
// webhook that keeps them agreeing. For the platform's operator only (the ping's isAdmin; the backend checks it
// again on every call). A customer never sees this card, so it names the distributor; nothing on it reaches a
// customer.
//
// Its buttons keep the tab's one habit (licensingShared.js send): while a request is out its button says what it is
// doing, every other request button on the tab waits with the reason in its tip, and the answer, errors included,
// brings each back with its own word (standing rule c).
//
//   POST v1/admin/licensing/pax8/reconcile      the daily check, now: companies, lines, what changed, what disagrees,
//                                               what Pax8 bills with no line behind it
//   POST v1/admin/licensing/pax8/webhook        point Pax8 at this lane (made or brought up to date)
//   POST v1/admin/licensing/pax8/webhook/test   { topic }  Pax8 sends that topic's sample payload here
//   GET  v1/admin/licensing/pax8/events         the last deliveries received
//   GET  v1/admin/licensing/endings             every license set to end or ended, with what the sweep sent Pax8 and when
//                                               (2026-10-04, Cameron: "make damn sure the sweep ran and sent that")
//   POST v1/admin/licensing/prices/ahead        { productId, billingTerm, commitmentMonths, newListCents, effectiveAt,
//                                               remove? }  a Microsoft price change entered ahead (decision 37(11)): Pax8
//                                               shows a new price only once it is current, Microsoft announces it
//                                               earlier; every owner holding it is told at once, each license moves from
//                                               its first renewal on or after the effective date
//   POST v1/admin/licensing/products/{id}/segment { segment }  who a license is sold to, corrected (licensing L3a:
//                                               a product's name is only the first guess; decisions 37(6) and 37(7))
//
// licensing.js paints the card and routes its clicks here.

import { PRAG_API_BASE } from '../runtime/config.js';
import { lc, st, cardHtml, countWord, isOperator, send, reqLead, reqIcon, errHtml, noteHtml, setNote, kept, cents } from './licensingShared.js';

const P8 = `${PRAG_API_BASE}/admin/licensing/pax8`;
const ADM = `${PRAG_API_BASE}/admin/licensing`;
const TERMS = ['Monthly', 'Annual', '2-Year', '3-Year'];
const AUD = [['', 'By its name'], ['commercial', 'Business'], ['education', 'Education (approval first)'], ['nonprofit', 'Nonprofit (approval first)'], ['government', 'Government (never sold)']];

/** The operator's two licensing facts: a Microsoft price change entered ahead, and who a license is sold to. */
function factsHtml() {
  const e = st.D.escapeHtml;
  const list = (lc.view?.catalog || []).map(p => `<option value="${e(p.id)}">${e(p.name)}</option>`).join('');
  const opt = (arr, id) => arr.map(([v, l]) => `<option value="${e(v)}" ${kept(id, '') === v ? 'selected' : ''}>${e(l)}</option>`).join('');
  return `
    <datalist id="licAdmProducts">${list}</datalist>
    <div class="p8-facts">
      <span class="lic-k">Price change ahead</span>
      <p class="acct-card-note">Microsoft announces a list price change about 30 days ahead; Pax8 shows it only once it is current. Enter it here and every owner holding that license is told now, and each license moves to it from its first renewal on or after the date.</p>
      <div class="ev-reg-form">
        <div class="lic-span"><label class="acct-label" for="licAdmPriceProduct">Product id</label><input class="acct-input" id="licAdmPriceProduct" list="licAdmProducts" data-keep value="${e(kept('licAdmPriceProduct', ''))}" autocomplete="off"></div>
        <div><label class="acct-label" for="licAdmPriceTerm">Billing term</label><select class="acct-input" id="licAdmPriceTerm" data-keep>${TERMS.map(t => `<option ${kept('licAdmPriceTerm', 'Monthly') === t ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></div>
        <div><label class="acct-label" for="licAdmPriceMonths">Commitment, months</label><input class="acct-input" id="licAdmPriceMonths" type="number" min="0" max="36" inputmode="numeric" data-keep value="${e(kept('licAdmPriceMonths', '1'))}"></div>
        <div><label class="acct-label" for="licAdmPriceNew">New list price per license seat ($)</label><input class="acct-input" id="licAdmPriceNew" type="number" min="0.01" step="0.01" inputmode="decimal" data-keep value="${e(kept('licAdmPriceNew', ''))}"></div>
        <div><label class="acct-label" for="licAdmPriceAt">Microsoft's effective date</label><input class="acct-input" id="licAdmPriceAt" type="date" data-keep value="${e(kept('licAdmPriceAt', ''))}"></div>
      </div>
      <div class="acct-actions-row act-row">
        ${reqLead('adm-price', { lic: 'adm-price' }, 'tag', 'Enter the price change', 'Saving…', '', 'btn-primary')}
        ${reqIcon('adm-price-remove', { lic: 'adm-price-remove' }, 'undo', 'Take this price change back: the notices already sent are withdrawn', 'Taking it back…', '', 'is-risky')}
      </div>
      <span class="lic-k">Who a license is sold to</span>
      <p class="acct-card-note">Read from its name as a first guess. Correct it here: Government is never sold; Education and Nonprofit wait for Microsoft's approval of the business.</p>
      <div class="ev-reg-form">
        <div class="lic-span"><label class="acct-label" for="licAdmSegProduct">Product id</label><input class="acct-input" id="licAdmSegProduct" list="licAdmProducts" data-keep value="${e(kept('licAdmSegProduct', ''))}" autocomplete="off"></div>
        <div><label class="acct-label" for="licAdmSeg">Sold to</label><select class="acct-input" id="licAdmSeg" data-keep>${opt(AUD, 'licAdmSeg')}</select></div>
      </div>
      <div class="acct-actions-row act-row">${reqLead('adm-seg', { lic: 'adm-seg' }, 'save', 'Save who it is sold to', 'Saving…')}</div>
    </div>`;
}
/** The operator's price change, from the form (remove: taken back). */
async function priceAhead(remove) {
  const v = (id, d = '') => String(kept(id, document.getElementById(id)?.value ?? d) ?? d).trim();
  const productId = v('licAdmPriceProduct'), billingTerm = v('licAdmPriceTerm', 'Monthly'), commitmentMonths = Math.max(0, Math.floor(Number(v('licAdmPriceMonths', '0')) || 0));
  const newListCents = Math.round(Number(v('licAdmPriceNew')) * 100), effectiveAt = v('licAdmPriceAt');
  lc.err.pax8 = '';
  if (!productId) { lc.err.pax8 = 'Give the product id.'; st.paint(); return; }
  if (!remove && (!(newListCents > 0) || !effectiveAt)) { lc.err.pax8 = 'Give the new list price and Microsoft\'s effective date.'; st.paint(); return; }
  await run(remove ? 'adm-price-remove' : 'adm-price', remove ? 'Taking it back…' : 'Saving…', async () => {
    const d = await st.D.apiFetch(`${ADM}/prices/ahead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, billingTerm, commitmentMonths, newListCents, effectiveAt, remove }) });
    const r = d?.result || {};
    setNote('pax8', remove ? `Taken back. ${countWord(Number(r.withdrawn || 0), 'license was', 'licenses were')} told the price stays.` : `Saved: ${cents(newListCents)} from ${effectiveAt}. ${countWord(Number(r.changed || 0), 'license', 'licenses')} told; each moves from its first renewal on or after it.`);
  }, 'The price change could not be saved.');
}
/** The operator's correction of who a license is sold to. */
async function saveSegment() {
  const id = String(kept('licAdmSegProduct', document.getElementById('licAdmSegProduct')?.value || '') || '').trim();
  const segment = String(kept('licAdmSeg', document.getElementById('licAdmSeg')?.value || '') || '');
  lc.err.pax8 = '';
  if (!id) { lc.err.pax8 = 'Give the product id.'; st.paint(); return; }
  await run('adm-seg', 'Saving…', async () => {
    await st.D.apiFetch(`${ADM}/products/${encodeURIComponent(id)}/segment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment }) });
    setNote('pax8', `Saved: ${id} is sold to ${(AUD.find(a => a[0] === segment) || AUD[0])[1].toLowerCase()}.`);
    await st.load();
  }, 'Who it is sold to could not be saved.');
}

function ps() { return lc.p8 || (lc.p8 = { report: null, hook: null, events: null, topic: '', endings: null }); }

/** Every license set to end or ended on the lane, with what the sweep sent Pax8 and when (2026-10-04, GET v1/admin/licensing/endings). */
function endingsHtml(p) {
  const d = p.endings;
  if (!d) return '';
  const e = st.D.escapeHtml, fmt = st.D.fmtDate;
  const word = (l) => {
    const x = l.pax8;
    if (x.state === 'sent') return `Pax8 took the cancellation on ${fmt(x.sentAt)} for ${x.endsAt ? fmt(x.endsAt) : 'its end date'}`;
    if (x.state === 'waiting') return 'not sent to Pax8 yet; the sweep runs every hour at :20';
    if (x.state === 'stuck') return `Pax8 refused it${x.stuck?.tries ? ` ${x.stuck.tries} times` : ''}: ${x.stuck?.lastError || 'no reason kept'}`;
    return 'nothing at Pax8 (a test-lane order)';
  };
  const cls = (l) => l.pax8.state === 'sent' || l.pax8.state === 'none' ? '' : l.pax8.state === 'stuck' ? 'is-bad' : 'is-warn';
  return `
    <div class="p8-report p8-endings">
      <p class="acct-card-note">Read ${e(fmt(d.at))}: ${e(countWord(d.lines.length, 'ending', 'endings'))}, ${e(String(d.sent))} sent to Pax8, ${e(String(d.waiting))} waiting for the sweep, ${e(String(d.stuck))} stuck, ${e(String(d.none))} test-lane.</p>
      ${d.lines.length ? `<ul class="p8-list">${d.lines.map(l => `<li class="${cls(l)}"><b>${e(l.organizationName || l.environmentId.slice(0, 8))}</b> ${e(l.productName)} × ${e(String(l.quantity))}${l.included ? ' (included)' : ''}${l.ownerStatus === 'CLOSED' ? ' · account closed' : ''}: ${l.status === 'CANCELED' ? `ended ${e(fmt(l.canceledAt))}` : `ends ${e(fmt(l.cancelAt))}`}; ${e(word(l))}${l.bill.stopped ? '' : '; still on the customer\'s bill until the sweep'}</li>`).join('')}</ul>` : '<p class="acct-card-note">No license is set to end on this lane.</p>'}
    </div>`;
}

export function pax8Html() {
  if (!isOperator() || !lc.view?.account) return '';
  const e = st.D.escapeHtml, p = ps(), r = p.report;
  const summary = r ? (r.drift.length || r.orphans.length ? `${r.drift.length + r.orphans.length} to look at` : 'in agreement') : 'operator view';
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
    key: 'pax8', icon: 'zap', title: 'Pax8', summary: e(summary),
    body: `
      <p class="acct-card-note">Operator only. The daily check compares every license line with its Pax8 subscription and finds what Pax8 bills with no line behind it. The webhook tells the platform the moment Pax8 changes something.</p>
      ${noteHtml('pax8')}${errHtml('pax8')}
      <div class="acct-actions-row act-row">
        ${reqLead('p8-check', { lic: 'p8-check' }, 'search', 'Check against Pax8', 'Checking…', '', 'btn-primary')}
        ${reqLead('p8-sync', { lic: 'p8-sync' }, 'zap', 'Sync the webhook', 'Syncing…', 'data-tip="Points Pax8 at this lane, with every subscription and provisioning event"')}
        ${reqLead('p8-endings', { lic: 'p8-endings' }, 'refresh', 'Endings at Pax8', 'Reading…', 'data-tip="Every license set to end or ended, with what the sweep sent Pax8 and when"')}
      </div>
      ${reportHtml}
      ${endingsHtml(p)}
      ${hook ? `<p class="acct-card-note p8-hook">Webhook ${e(hook.created ? 'made' : 'up to date')}: ${hook.topics.map(t => `<b>${e(t.topic)}</b> (${e(t.actions.join(', ').toLowerCase())})`).join(', ')}.</p>
        <div class="tm-inline-edit p8-test">
          <select class="acct-input" id="licP8Topic" data-keep aria-label="Topic to test">${topics.map(t => `<option value="${e(t)}" ${kept('licP8Topic', p.topic) === t ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>
          ${reqIcon('p8-test', { lic: 'p8-test' }, 'send', 'Send a test event: Pax8 posts the topic’s sample here', 'Asking Pax8 for the test event…')}
        </div>` : ''}
      <div class="p8-events-head"><span class="lic-k">Last events received</span>${reqIcon('p8-events', { lic: 'p8-events' }, 'refresh', 'Read the last events', 'Reading the events…')}</div>
      ${events == null ? '<p class="acct-card-note">Not read yet.</p>' : !events.length ? '<p class="acct-card-note">None received on this lane yet.</p>' : `
        <ul class="p8-events">${events.map(ev => `
          <li><details><summary><span class="adm-muted">${e(st.D.fmtDate(ev.at))} ${e(new Date(ev.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</span> <b>${e(ev.topic || 'event')}</b> ${e(ev.action || '')} ${ev.subscriptionIds.length ? `<span class="adm-muted">${e(countWord(ev.subscriptionIds.length, 'subscription', 'subscriptions'))}</span>` : ''}</summary><pre class="adm-pre p8-body">${e(pretty(ev.body))}</pre></details></li>`).join('')}</ul>`}
      ${factsHtml()}` });
}
function pretty(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return String(s || ''); } }

const post = (path, payload = {}) => st.D.apiFetch(`${P8}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
/** One operator call through the tab's send: its words while out, the error on this card. */
function run(key, word, fn, fallback) { setNote('pax8', ''); return send(key, word, fn, { errKey: 'pax8', fallback }); }

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function pax8Action(a) {
  const p = ps();
  if (a === 'p8-check') { run('p8-check', 'Checking…', async () => { const d = await post('/reconcile'); p.report = d.report; }, 'Pax8 could not be checked.'); return true; }
  if (a === 'p8-sync') { run('p8-sync', 'Syncing…', async () => { const d = await post('/webhook'); p.hook = { created: d.created, topics: d.topics || [] }; p.topic = p.topic || (d.topics?.[0]?.topic || ''); }, 'The webhook could not be synced.'); return true; }
  if (a === 'p8-test') {
    p.topic = String(kept('licP8Topic', document.getElementById('licP8Topic')?.value || p.topic || '') || '');
    if (!p.topic) return true;
    run('p8-test', 'Asking Pax8 for the test event…', async () => {
      await post('/webhook/test', { topic: p.topic });
      setNote('pax8', `Pax8 was asked to send a ${p.topic} test event. Read the last events to see it arrive.`);
    }, 'The test could not be sent.');
    return true;
  }
  if (a === 'p8-events') { run('p8-events', 'Reading the events…', async () => { const d = await st.D.apiFetch(`${P8}/events`); p.events = d.events || []; }, 'The events could not be read.'); return true; }
  if (a === 'p8-endings') { run('p8-endings', 'Reading…', async () => { p.endings = await st.D.apiFetch(`${ADM}/endings`); }, 'The endings could not be read.'); return true; }
  if (a === 'adm-price') { priceAhead(false); return true; }
  if (a === 'adm-price-remove') { priceAhead(true); return true; }
  if (a === 'adm-seg') { saveSegment(); return true; }
  return false;
}
