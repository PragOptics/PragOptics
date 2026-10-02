// src/account/licensingRequests.js
//
// The owner's approval queue on the Licensing tab (2026-09-23, decision 4; the backend's auth/requestsQueue.js). A
// request belongs to the team in view and nowhere else: the owner sees every request and approves or declines it,
// with the price; anyone else sees only their own. Someone whose role holds "Ask for purchases" asks instead of
// buying (the catalog and the licenses list send it here); a team member with a seat asks for their own mailbox.
//
//   GET  v1/environment/licensing/requests                      member and above -> { requests, canDecide }
//   POST v1/environment/licensing/requests { kind, payload }     -> 202 { request }, or 200 { request, duplicate }
//   POST v1/environment/licensing/requests/{id}/approve          owner -> { request }  APPROVED, or FAILED with why; a
//                                                               purchase or more license seats carries the exact charge
//                                                               the owner saw { expectedTotalCents, prorationDate? }
//   GET  v1/environment/licensing/requests/{id}/quote            owner -> { quote }  that exact charge, sales tax included
//   POST v1/environment/licensing/requests/{id}/decline { reason } owner -> { request }
//
// licensing.js reads the list with the tab, paints this card and routes its clicks here.

import { REQ_URL, lc, st, url, cardHtml, countWord, cents, dayWord, sentence, perms, call, send, reqLead, errHtml, noteHtml, setNote, kept, forget, showsLicensing, forgetMarks } from './licensingShared.js';
import { iconBtn, armed } from './cards.js';
import { quoteRequest, fresh, moved, amountWords, moneyCodes } from './licensingMoney.js';

const KIND_WORDS = { 'license.add': 'Buy a license', 'license.seats': 'Change license seats', 'license.end': 'End a license', 'mailbox.request': 'A mailbox' };
const PER = { Monthly: 'a month', Annual: 'a year', '2-Year': 'every two years', '3-Year': 'every three years' };

/** The requests read with the tab; a lane without the queue answers 404 (no code) and the card stays away. */
export async function loadRequests() {
  try {
    const d = await st.D.apiFetch(url(REQ_URL));
    lc.reqs = Array.isArray(d?.requests) ? d.requests : [];
    lc.canDecide = !!d?.canDecide;
    lc.err.requests = '';
  } catch (ex) {
    const absent = ex?.status === 404 && !ex?.data?.code;
    lc.reqs = absent ? null : (lc.reqs || []);
    lc.err.requests = absent ? '' : (ex?.data?.error || st.D.friendlyError(ex, 'The requests could not be read.'));
  }
}

/** Requests still waiting for the owner. */
export function pendingRequests() { return (lc.reqs || []).filter(r => r.status === 'PENDING'); }
/** A waiting request for this kind and license line (the licenses list shows it on the line). */
export function pendingFor(kind, lineId) { return pendingRequests().find(r => r.kind === kind && String(r.payload?.lineId || '') === String(lineId)); }
/** A waiting mailbox request from this person. */
export function pendingMailbox(userId) { return pendingRequests().find(r => r.kind === 'mailbox.request' && String(r.requestedBy?.userId || r.payload?.userId || '') === String(userId)); }

/**
 * Money plan item 2 (2026-09-24): a waiting purchase or a request for more license seats is approved on the exact
 * charge it takes now, Stripe's own quote with sales tax, read for the owner when the card paints (once, and again
 * after ten minutes) and sent back with the approval. The Approve button waits, saying why, while it is read.
 */
function chargesNow(r) {
  if (r.kind === 'license.add') return true;
  if (r.kind !== 'license.seats') return false;
  const line = (lc.view?.licenses || []).find(l => l.id === r.payload?.lineId);
  return !!line && Number(r.payload?.quantity) > Number(line.quantity);
}
function reqQuoteOf(r) { const x = lc.reqQuote[r.id]; return x && x.q && fresh(x.q) ? x.q : null; }
const reading = new Set();
/** The quotes the owner's card needs, read one at a time after a paint; the card follows when each lands. */
function readQuotes() {
  const need = pendingRequests().filter(r => chargesNow(r) && !reqQuoteOf(r) && !lc.reqQuote[r.id]?.err && !reading.has(r.id));
  for (const r of need) {
    reading.add(r.id);
    quoteRequest(r.id)
      .then(q => { lc.reqQuote[r.id] = q ? { q } : { err: 'nothing' }; })
      .catch(ex => { lc.reqQuote[r.id] = { err: ex?.data?.error || 'The exact charge could not be worked out right now.' }; })
      .finally(() => { reading.delete(r.id); if (!lc.busy) st.paint(); });
  }
}

/** The price line of a request, in words: what is charged, and when. `owner` reads "you approve"; the person who asked, "the owner approves". */
function priceLine(r, owner) {
  const e = st.D.escapeHtml;
  const when = owner ? 'when you approve' : 'when the owner approves';
  if (r.kind === 'mailbox.request') return '<span class="lic-req-price">Included with your plan. Nothing is charged.</span>';
  if (r.kind === 'license.end') return '<span class="lic-req-price">Nothing is refunded; it is billed until it ends.</span>';
  if (owner && chargesNow(r)) {
    const q = reqQuoteOf(r), x = lc.reqQuote[r.id];
    if (q) return `<span class="lic-req-price">Charged now when you approve: ${amountWords(q)}.</span>`;
    if (x?.err) return `<span class="lic-req-price">${e(x.err === 'nothing' ? 'Nothing is charged now.' : sentence(x.err))}</span>`;
    return '<span class="lic-req-price">Working out the exact charge…</span>';
  }
  if (r.priceCents == null) return '';
  const tax = lc.view?.salesTax === false ? '' : ' plus tax';
  if (r.kind === 'license.add') return `<span class="lic-req-price"><strong>${e(cents(r.priceCents))}</strong> ${e(PER[r.payload?.billingTerm] || 'each period')}${tax} at today's price, charged to ${owner ? 'your' : "the owner's"} card ${when}.</span>`;
  const line = (lc.view?.licenses || []).find(l => l.id === r.payload?.lineId);
  const per = PER[line?.billingTerm] || 'each period';
  const up = line && Number(r.payload?.quantity) > Number(line.quantity);
  return up
    ? `<span class="lic-req-price">New price <strong>${e(cents(r.priceCents))}</strong> ${e(per)}${tax}. The added license seats are charged ${when}, for the rest of the paid period.</span>`
    : `<span class="lic-req-price">New price <strong>${e(cents(r.priceCents))}</strong> ${e(per)}${tax} once the lower count takes effect, on Microsoft's renewal date for this license. The dropped license seats are billed until then, and the date shows on the license ${when}.</span>`;
}

/** A request's state in words, for the person who asked and for the owner's history. */
function stateOf(r) {
  if (r.status === 'PENDING') return { cls: 'is-pending', text: 'Sent to the owner for approval' };
  if (r.status === 'APPROVED') return { cls: 'is-verified', text: 'Approved and done' };
  if (r.status === 'DECLINED') return { cls: 'is-quiet', text: 'Declined' };
  return { cls: 'is-bad', text: 'Approved, but it could not be done' };
}

function itemHtml(r, owner) {
  const e = st.D.escapeHtml, s = stateOf(r);
  const when = r.createdAt ? dayWord(r.createdAt) : '';
  const summary = sentence(r.summary || KIND_WORDS[r.kind] || 'A request');
  const why = r.reason && r.status !== 'PENDING' ? `<p class="lic-req-why">${r.status === 'DECLINED' ? 'Reason: ' : ''}${e(sentence(r.reason))}</p>` : '';
  let acts = '';
  if (owner && r.status === 'PENDING') {
    // L4 (2026-09-24): the owner can always decline; approving needs licensing open (not paused, the plan not ended)
    const p = perms(), readOnly = !!lc.view?.readOnly, paused = !!lc.view?.paused, ended = !!lc.view?.planEnded;
    const canDecline = p.canDecline !== undefined ? !!p.canDecline : !paused;
    const onlyDecline = paused ? 'This environment is paused, so a request can only be declined.'
      : ended ? 'Your plan ended, so a request can only be declined.'
      : 'Licensing is read-only right now, so a request can only be declined.';
    if (!canDecline) acts = '<p class="lic-hint">Paused: this waits until a paid plan is restored.</p>';
    else if (lc.declining === r.id) {
      acts = `
        <div class="lic-req-decline">
          <label class="acct-label" for="licDecline-${e(r.id)}">Reason, sent to ${e(r.requestedBy?.email || 'them')} (optional)</label>
          <input class="acct-input" id="licDecline-${e(r.id)}" type="text" maxlength="500" data-keep value="${e(kept(`licDecline-${r.id}`, ''))}">
          <div class="acct-actions-row act-row">
            ${reqLead(`decline:${r.id}`, { lic: 'req-decline-go' }, 'x', 'Decline', 'Declining…', `data-req="${e(r.id)}"`, 'is-danger')}
            ${lc.busy === `decline:${r.id}` ? '' : iconBtn({ lic: 'req-decline-cancel' }, 'undo', 'Keep it waiting', `data-req="${e(r.id)}"`)}
          </div>
        </div>`;
    } else {
      // a purchase or more license seats says the exact charge on the button itself (money plan item 2: Stripe's quote,
      // sales tax included); until it is read the button waits, saying why
      const money = chargesNow(r), q = money ? reqQuoteOf(r) : null, failed = money && !q && !!lc.reqQuote[r.id]?.err && lc.reqQuote[r.id].err !== 'nothing';
      const approveWord = q ? `Approve: charge ${cents(q.totalCents)}` : money && !failed && lc.reqQuote[r.id]?.err !== 'nothing' ? 'Working out the exact charge…' : failed ? 'Work out the charge again' : 'Approve';
      const wait = money && !q && !failed && lc.reqQuote[r.id]?.err !== 'nothing' ? 'disabled data-tip="Working out the exact charge"' : '';
      acts = `
        <div class="acct-actions-row act-row">
          ${readOnly ? '' : reqLead(`approve:${r.id}`, { lic: 'req-approve' }, 'check', approveWord, 'Approving…', `data-req="${e(r.id)}" ${wait}`, 'btn-primary')}
          ${reqLead(`decline:${r.id}`, { lic: 'req-decline' }, 'x', 'Decline', 'Declining…', `data-req="${e(r.id)}"`)}
        </div>
        ${readOnly ? `<p class="lic-hint">${e(onlyDecline)}</p>` : ''}`;
    }
  }
  return `
    <li class="lic-req ${r.status === 'PENDING' ? 'is-open' : ''}">
      <div class="lic-req-head">
        <span class="lic-state ${s.cls}">${e(owner && r.status === 'PENDING' ? 'Waiting for you' : s.text)}</span>
        <span class="lic-req-kind">${e(KIND_WORDS[r.kind] || 'Request')}</span>
        ${owner ? `<span class="lic-req-who">${e(r.requestedBy?.email || '')}</span>` : ''}
        ${when ? `<span class="adm-muted lic-req-when">${e(when)}</span>` : ''}
      </div>
      <p class="lic-req-sum">${e(summary)}</p>
      ${r.status === 'PENDING' ? priceLine(r, owner) : ''}
      ${why}
      ${acts}
    </li>`;
}

/**
 * The card: for the owner, what waits for their approval (approve with the price, or decline with a reason) and what
 * was decided; for anyone else, their own requests and where each stands. Hidden for a person with no requests and
 * nothing they could ask for, and on a lane without the queue.
 */
export function requestsHtml() {
  const v = lc.view;
  if (!showsLicensing() || !v.account || lc.reqs === null) return '';
  const e = st.D.escapeHtml, p = perms(), owner = !!p.isOwner && lc.canDecide !== false;
  const all = lc.reqs || [];
  const open = all.filter(r => r.status === 'PENDING'), done = all.filter(r => r.status !== 'PENDING');
  if (!owner && !all.length && !lc.err.requests) return '';
  // AN EMPTY CARD IS NOISE (2026-10-02). With nothing waiting this stood above the numbered steps saying "nothing
  // waiting", and an owner halfway through setting the account up read it as one more thing being asked of them.
  // It earns its place when there is something in it, or something went wrong reading it.
  if (owner && !all.length && !lc.err.requests) return '';
  // the owner's waiting money requests read their exact charge once the card is on screen
  if (owner && !v.readOnly && open.some(chargesNow)) queueMicrotask(readQuotes);
  const summary = open.length ? `${countWord(open.length, 'request', 'requests')} waiting${owner ? '' : ' for the owner'}` : owner ? 'nothing waiting' : `${countWord(all.length, 'request', 'requests')}, all answered`;
  const intro = owner
    ? '<p class="acct-card-note">When someone on your team asks to buy a license, change license seats, end a license or have their mailbox, it waits here for you. Nothing is bought or changed until you approve it; they are emailed your answer.</p>'
    : '<p class="acct-card-note">What you asked the owner for, and where each one stands. You are emailed the owner\'s answer.</p>';
  const list = open.length ? `<ul class="lic-reqs">${open.map(r => itemHtml(r, owner)).join('')}</ul>` : owner ? '<p class="acct-empty">Nothing is waiting for you.</p>' : '';
  const history = done.length ? `<details class="lic-past"><summary>${e(countWord(done.length, 'decided request', 'decided requests'))}</summary><ul class="lic-reqs">${done.slice(0, 20).map(r => itemHtml(r, owner)).join('')}</ul></details>` : '';
  return cardHtml({
    key: 'requests', icon: owner ? 'bell' : 'send', title: owner ? 'Requests for you' : 'Your requests', summary: e(summary),
    body: `${intro}${errHtml('requests')}${noteHtml('requests')}${list}${history}`
  });
}

/* ---------- actions ---------- */

async function approve(btn) {
  const id = btn.dataset.req || '';
  const r = (lc.reqs || []).find(x => x.id === id);
  if (!r || lc.busy) return;
  // money plan item 2: a purchase or more license seats is approved on the exact charge on the button; without a fresh
  // one the press reads it again first (the button says so), never an approval on an amount nobody saw
  const money = chargesNow(r), q = money ? reqQuoteOf(r) : null;
  if (money && !q && lc.reqQuote[r.id]?.err !== 'nothing') { delete lc.reqQuote[r.id]; st.paint(); return; }
  // a change to a license asks twice in words, as it does when the owner makes it (Your licenses); a purchase names its
  // charge on the button itself
  const line = (lc.view?.licenses || []).find(l => l.id === r.payload?.lineId);
  if (r.kind === 'license.seats' && line) {
    const to = Number(r.payload?.quantity), cur = Number(line.quantity);
    if (!armed(btn, to > cur ? `Add ${to - cur}? Charge ${cents(q?.totalCents)}` : `Lower to ${to}?`)) return;
  }
  if (r.kind === 'license.end' && !armed(btn, 'End it?')) return;
  setNote('requests', '');
  const requote = (ex) => { lc.reqQuote[id] = { q: moved(q, ex) }; return ex.data.error; };
  await send(`approve:${id}`, 'Approving…', async () => {
    const d = await call(`${REQ_URL}/${encodeURIComponent(id)}/approve`, 'POST', q ? { expectedTotalCents: q.totalCents, ...(q.prorationDate ? { prorationDate: q.prorationDate } : {}) } : {});
    delete lc.reqQuote[id];
    const out = d?.request || {};
    const who = out.requestedBy?.email || r.requestedBy?.email || '';
    if (out.status === 'FAILED') setNote('requests', `Approved, but it could not be done: ${sentence(out.reason || 'This could not be completed right now.')} ${who ? `${who} is` : 'The person who asked is'} emailed.`, true);
    else setNote('requests', `Approved and done: ${sentence(out.summary || r.summary)}`);
    // a license bought or ended here can change which base licenses the team holds (L3b)
    if (r.kind === 'license.add' || r.kind === 'license.end') await forgetMarks();
    await st.load();
  }, {
    errKey: 'requests', fallback: 'The request could not be approved.',
    codes: {
      ...moneyCodes('requests'),
      // decided already (another tab): the list is read again, so it shows how
      REQUEST_DECIDED: (ex) => { queueMicrotask(() => st.load()); return ex.data.error; },
      SUSPENDED: 'This environment is paused. Requests wait until a paid plan is restored.',
      // the amount moved since the button showed it: nothing was charged, the request still waits, the button shows the new one
      AMOUNT_CHANGED: requote, AMOUNT_CONFIRM: requote,
      QUOTE_EXPIRED: (ex) => { delete lc.reqQuote[id]; return ex.data.error; }
    }
  });
}

async function decline(btn) {
  const id = btn.dataset.req || '';
  const r = (lc.reqs || []).find(x => x.id === id);
  const reason = String(kept(`licDecline-${id}`, '') || '').trim();
  setNote('requests', '');
  const ok = await send(`decline:${id}`, 'Declining…', async () => {
    const d = await call(`${REQ_URL}/${encodeURIComponent(id)}/decline`, 'POST', { reason });
    const who = d?.request?.requestedBy?.email || r?.requestedBy?.email || '';
    setNote('requests', `Declined. ${who ? `${who} is` : 'The person who asked is'} emailed${reason ? ' with your reason' : ''}.`);
    await st.load();
  }, { errKey: 'requests', fallback: 'The request could not be declined.', codes: { REQUEST_DECIDED: (ex) => { queueMicrotask(() => st.load()); return ex.data.error; } } });
  if (ok) { lc.declining = ''; forget(`licDecline-${id}`); st.paint(); }
}

/**
 * Ask the owner (anyone whose role holds "Ask for purchases", or a member with a seat for their own mailbox). The
 * card that asked shows "Sent to the owner for approval" on the answer; `errKey` is that card's error line.
 */
export async function ask(key, word, kind, payload, errKey, noteKey, what, codes = {}) {
  setNote(noteKey, '');
  return send(key, word, async () => {
    const d = await call(REQ_URL, 'POST', { kind, payload });
    setNote(noteKey, d?.duplicate ? `You asked for this already. It is waiting for the owner: ${sentence(d.request?.summary || what)}` : `Sent to the owner for approval: ${sentence(d?.request?.summary || what)} You are emailed the answer.`);
    await st.load();
  }, {
    errKey, fallback: 'The request could not be sent.',
    codes: {
      OWNER_ACTS_DIRECTLY: 'You own this team, so nothing needs approval. Make the change directly.',
      MAILBOX_HELD: 'You already have a mailbox.',
      RATE_LIMITED: 'Too many requests in an hour. Try again later.',
      // the asking card's own answers (the add box's base license, L3b)
      ...codes
    }
  });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function requestsAction(a, btn) {
  if (a === 'req-approve') { approve(btn); return true; }
  if (a === 'req-decline') { if (lc.busy) return true; lc.declining = btn.dataset.req || ''; lc.err.requests = ''; st.paint(); document.getElementById(`licDecline-${lc.declining}`)?.focus(); return true; }
  if (a === 'req-decline-cancel') { lc.declining = ''; st.paint(); return true; }
  if (a === 'req-decline-go') { decline(btn); return true; }
  return false;
}

/** What a line's waiting request says on the licenses list, for the person who asked or the owner. */
export function lineRequestHtml(lineId) {
  const e = st.D.escapeHtml, p = perms();
  const rs = pendingRequests().filter(r => (r.kind === 'license.seats' || r.kind === 'license.end') && String(r.payload?.lineId || '') === String(lineId));
  if (!rs.length) return '';
  return rs.map(r => `<span class="lic-state is-pending">${e(p.isOwner ? `${r.requestedBy?.email || 'Someone'} asked: ${KIND_WORDS[r.kind].toLowerCase()}, see Requests for you` : `Sent to the owner for approval: ${KIND_WORDS[r.kind].toLowerCase()}`)}</span>`).join('');
}
