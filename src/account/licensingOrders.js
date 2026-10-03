// src/account/licensingOrders.js
//
// The money side of the Licensing section (2026-09-22; Part 1, 2026-09-23): the Microsoft Customer Agreement, the
// licenses the team bought, and adding one. Every call is the platform's own route; the card is charged before
// anything is ordered, nothing is ever refunded, and the words here say so.
//
// Who may do what is the server's answer (describe().permissions), mirrored here and checked again on every call:
//   the owner                          buys, changes license seats, ends and keeps licenses
//   a role with "Ask for purchases"     asks the owner instead (auth/requestsQueue.js): the button says "Ask", and
//                                       the answer is "Sent to the owner for approval"
//   a role with "Give out mailboxes and licenses"   gives a bought license to a person on the team, takes it back
//   a role with "Accept agreements"     accepts the Microsoft Customer Agreement as the signed-in person
//   everyone else                       reads
//
//   POST   v1/environment/licensing/microsoft          { accept: true }   the signed-in person's acceptance, in the name on their account
//   POST   v1/environment/licensing/licenses           { productId, billingTerm, commitmentMonths, quantity, expectedTotalCents,
//                                                      prorationDate? } -> 201 { license }: charged exactly the quoted amount
//                                                      (licensingMoney.js), on the license's own bill (decision 37(8))
//   PUT    v1/environment/licensing/licenses/{id}      { quantity, expectedTotalCents?, prorationDate? }  more now, charged the
//                                                      quoted amount; fewer on Microsoft's renewal date, nothing charged
//   DELETE v1/environment/licensing/licenses/{id}      ends at the end of what was paid for, or of its commitment; nothing refunded
//   POST   v1/environment/licensing/licenses/{id}/keep an ending taken back before it was sent
//   POST   v1/environment/licensing/licenses/{id}/holders/{userId}   a bought license given to a person (MINE M10)
//   DELETE v1/environment/licensing/licenses/{id}/holders/{userId}   taken back
//
// licensing.js paints these cards and routes clicks here through orderAction.

import { explainLink } from '../components/explainer.js';
import { iconBtn, armed, btnLabel } from './cards.js';
import { LIC_URL, lc, st, cardHtml, countWord, money, cents, dayWord, sentence, cap, TERM_NAMES, STATUS_WORDS, loadOffers, billWord, commitWord, ruleWords, licName, perms, me, call, send, sayError, reqLead, reqIcon, errHtml, noteHtml, setNote, kept, forget, withLink, showsLicensing, forgetMarks, stepWord, stepGate, agreementStands, saveAccountName } from './licensingShared.js';
import { ask, lineRequestHtml } from './licensingRequests.js';
import { quoteNew, quoteSeats, fresh, moved, moneyCodes, addChargeWords, addGoLabel, seatChargeWords, planTermLine, notForPlanLine } from './licensingMoney.js';

const MCA_URL = 'https://www.microsoft.com/licensing/docs/customeragreement';
const CHANGEABLE = ['ORDERED', 'ACTIVE'];

/** Can the person looking add a license from the catalog (buy it, or ask the owner to)? */
export function canAdd() {
  const v = lc.view, p = perms();
  return !!(v && v.eligible && v.account && v.microsoft && v.microsoft.ready && (p.canBuy || p.canRequest));
}

/* ---------- the Microsoft Customer Agreement (decision 5) ---------- */

export function agreementHtml() {
  const v = lc.view;
  if (!showsLicensing()) return '';
  const e = st.D.escapeHtml, m = v.microsoft || {}, p = perms(), mca = m.mca, a = m.agreement;
  const stands = a ? !!a.stands : !!mca;
  const named = !!(m.tenantId || m.domainPrefix);
  // step 3 of the owner's six: the card stands before the account and the tenant too, folded, its
  // Accept waiting on them with the sentence under it
  const gate = stands ? '' : stepGate(v, 2);
  const summary = stands ? 'accepted' : gate ? (v.account ? 'after your Microsoft tenant' : 'after the licensing account') : mca ? 'to accept again' : 'not accepted yet';
  let inner = '';
  if (mca && stands) {
    inner = `
      <div class="lic-facts">
        <div class="lic-fact"><span class="lic-k">Accepted by</span><span class="lic-v">${e(`${mca.firstName} ${mca.lastName}`.trim())}, <span class="ev-code">${e(mca.email)}</span></span></div>
        <div class="lic-fact"><span class="lic-k">On</span><span class="lic-v">${e(dayWord(mca.acceptedAt))}</span></div>
      </div>
      <p class="lic-hint">It stands while that person is on the team with "Accept agreements". If they leave or lose it, someone who has it accepts again before the next order.</p>`;
  } else {
    const why = mca && a?.message ? `<p class="acct-card-note ev-note is-bad">${e(sentence(a.message))}</p>` : '';
    let act;
    if ((p.canAccept || (p.isOwner && !v.readOnly)) && gate) act = acceptFormHtml(v, m, gate);
    else if (p.canAccept && named) act = acceptFormHtml(v, m, '');
    else if (p.canAccept) act = '<p class="acct-card-note">Accept it here once the tenant above is named.</p>';
    else if (v.readOnly) act = `<p class="acct-card-note">${e(sentence(v.readOnlyWhy))}</p>`;
    else act = '<p class="acct-card-note">Someone who can accept agreements accepts it here: the owner, or a role the owner gives "Accept agreements" on the Team tab.</p>';
    inner = `${why}${act}`;
  }
  return cardHtml({
    key: 'agreement', icon: 'file', title: 'Microsoft Customer Agreement', summary: stepWord('agreement', e(summary)), open: !gate,
    explain: explainLink('licensing', 'The agreement and the tenant'),
    body: `${noteHtml('agreement')}${errHtml('agreement')}${inner}`
  });
}

/**
 * The signed-in person accepts (decision 5; finding F16): the agreement records the name and email on their own
 * account, never typed here. With no name on the account yet, the card says to add it on Profile first, and the
 * server refuses the acceptance the same way (409 NAME_REQUIRED).
 */
function acceptFormHtml(v, m, gate = '') {
  const e = st.D.escapeHtml, who = me(), n = m.accepter || {};
  const biz = v.account?.businessName || 'your business';
  const email = who.email || 'the account you are signed in with';
  const intro = 'Microsoft asks someone at your business to accept its Customer Agreement before anything is ordered.';
  if (!n.hasName) {
    // The agreement records THIS person's name (finding F16). It used to send them to Profile and come back; now the
    // name is set right here, so step 3 is actionable on its own card (Cameron, 2026-10-03: "make the input field live
    // there as well"). The server still records the name on the account, so Profile shows it too.
    return `
    <p class="acct-card-note">${e(intro)} Microsoft records the name and email on the account you are signed in with, <strong>${e(email)}</strong>. Add your name here, then accept.</p>
    <div class="acct-name-fields">
      <label class="acct-name-field"><span class="acct-label">First name</span><input class="acct-input" id="licMcaFirst" type="text" autocomplete="given-name" spellcheck="false" value="${e(kept('licMcaFirst', n.firstName || ''))}"></label>
      <label class="acct-name-field"><span class="acct-label">Last name</span><input class="acct-input" id="licMcaLast" type="text" autocomplete="family-name" spellcheck="false" value="${e(kept('licMcaLast', n.lastName || ''))}"></label>
    </div>
    <div class="acct-actions-row">${reqLead('mca-name', { lic: 'mca-name' }, 'check', 'Save my name', 'Saving…', '', 'btn-primary')}</div>
    <p class="lic-hint">This is the name Microsoft records on the agreement. It saves to your account, so <a href="#account?section=profile" data-acct-section="profile">Profile</a> shows it too.</p>`;
  }
  const name = `${n.firstName} ${n.lastName}`.trim();
  return `
    <p class="acct-card-note">${e(intro)} You accept as <strong>${e(name)}</strong>, <strong>${e(email)}</strong>: the name and email on the account you are signed in with. Microsoft records them, and a copy is emailed to you. Your name is changed on Profile.</p>
    <label class="ev-agree"><input type="checkbox" id="licMcaAccept" data-keep ${kept('licMcaAccept', false) ? 'checked' : ''} ${gate ? 'disabled' : ''}><span>I accept the <a href="${MCA_URL}" target="_blank" rel="noopener">Microsoft Customer Agreement</a> for <strong>${e(biz)}</strong>.</span></label>
    <div class="acct-actions-row">${reqLead('mca-accept', { lic: 'mca-accept' }, 'check', 'Accept the agreement', 'Accepting…', gate ? `disabled data-tip="${e(gate)}"` : '', 'btn-primary')}</div>
    ${gate ? `<p class="lic-hint">${e(gate)}</p>` : ''}`;
}

async function saveMcaName() {
  const first = String(document.getElementById('licMcaFirst')?.value || '').trim();
  const last = String(document.getElementById('licMcaLast')?.value || '').trim();
  lc.err.agreement = ''; setNote('agreement', '');
  if (!first || !last) { lc.err.agreement = 'Give your first and last name.'; st.paint(); document.getElementById(first ? 'licMcaLast' : 'licMcaFirst')?.focus(); return; }
  await send('mca-name', 'Saving…', async () => {
    await saveAccountName(first, last);
    forget('licMcaFirst'); forget('licMcaLast');
    setNote('agreement', 'Saved. Now tick "I accept" and accept the agreement below.');
    await st.load();   // the next view sees the name; the card advances to the accept form
  }, { errKey: 'agreement', fallback: 'Your name could not be saved.' });
}

async function acceptAgreement() {
  if (stepGate(lc.view, 2)) return;   // Accept is disabled with the reason under it; nothing is sent
  const ticked = !!(Object.prototype.hasOwnProperty.call(lc.draft, 'licMcaAccept') ? lc.draft.licMcaAccept : document.getElementById('licMcaAccept')?.checked);
  lc.err.agreement = ''; setNote('agreement', '');
  if (!ticked) { lc.err.agreement = 'Tick "I accept" to accept the agreement.'; st.paint(); document.getElementById('licMcaAccept')?.focus(); return; }
  await send('mca-accept', 'Accepting…', async () => {
    await call(`${LIC_URL}/microsoft`, 'POST', { accept: true });
    forget('licMcaAccept');
    setNote('agreement', `Accepted as ${me().email || 'you'}. A copy is emailed to you.`);
    await st.load();
  }, {
    errKey: 'agreement', fallback: 'The agreement could not be accepted.',
    codes: {
      // the name is the one on the signed-in person's account: none there yet, Profile is where it is added
      NAME_REQUIRED: (ex) => withLink('agreement', 'profile', 'Open Profile', ex.data.error || 'Add your first and last name on Profile, then accept.')(),
      TENANT_REQUIRED: 'Name the tenant above first.',
      LIVE_LANE_ONLY: 'Licensing is managed on your live environment, not the sandbox.'
    }
  });
}

/* ---------- the licenses the team bought ---------- */

/** The state's colour: settled, waiting, or something the customer should read. */
function stateClass(l) {
  if (l.status === 'ACTIVE') return 'is-verified';
  if (l.status === 'FAILED' || l.delayed || (l.status === 'ENDING' && ['unpaid', 'provider', 'closed'].includes(l.endedFor))) return 'is-bad';
  if (l.status === 'CANCELED') return 'is-quiet';
  return 'is-pending';
}
function statusOf(l) { return sentence(l.statusText || STATUS_WORDS[l.status] || String(l.status || '').toLowerCase()); }

/** The people on the team who can hold a bought license: a seat, active, not holding this one. */
function takersFor(l) {
  const held = new Set((l.holders || []).map(h => String(h.userId)));
  return (lc.view.seats || []).filter(s => s.status === 'ACTIVE' && !held.has(String(s.userId)));
}

function holdersCell(l, p, e) {
  const hs = l.holders || [];
  const list = hs.map(h => `<span class="lic-holder"><span class="ev-code">${e(h.email || h.userId)}</span>${p.canAssign && CHANGEABLE.concat('ENDING').includes(l.status) ? reqIcon(`unhold:${l.id}:${h.userId}`, { lic: 'holder-take' }, 'userMinus', `Take ${licName(l.productName)} back from ${h.email || 'this person'}`, 'Taking it back…', `data-line="${e(l.id)}" data-user="${e(h.userId)}"`, 'is-risky') : ''}</span>`).join('');
  const free = Number(l.free || 0);
  const takers = takersFor(l);
  const give = p.canAssign && CHANGEABLE.includes(l.status) && free > 0 && takers.length ? `
    <span class="lic-give">
      <select class="acct-input" id="licGive-${e(l.id)}" data-keep aria-label="Give a license seat of ${e(licName(l.productName))} to">
        ${takers.map(s => `<option value="${e(s.userId)}" ${kept(`licGive-${l.id}`, '') === s.userId ? 'selected' : ''}>${e(s.email)}</option>`).join('')}
      </select>
      ${reqIcon(`hold:${l.id}`, { lic: 'holder-give' }, 'userPlus', 'Give this license seat to the person chosen', 'Giving it…', `data-line="${e(l.id)}"`, 'btn-primary')}
    </span>` : '';
  const freeWord = CHANGEABLE.includes(l.status) ? `<span class="adm-muted">${e(free ? `${countWord(free, 'license seat', 'license seats')} not given yet` : 'every license seat is given')}</span>` : '';
  // nothing held and nothing to give (an ending or a past license): the cell stays empty, and on a phone its label goes
  return list || freeWord || give ? `<div class="lic-holders">${list}${freeWord}${give}</div>` : '';
}

/**
 * Decision 18: a lower license-seat count waiting for Microsoft's renewal date for this license, with that exact date
 * (pendingAt), and that the dropped license seats are paid for until then. Past the date, the change is inside
 * Microsoft's window after the renewal and lands once Microsoft takes it.
 */
export function pendingWords(l) {
  if (!l || l.included || l.pendingQuantity == null || l.pendingQuantity === '' || !(Number(l.pendingQuantity) < Number(l.quantity))) return null;
  const to = countWord(Number(l.pendingQuantity), 'license seat', 'license seats'), held = countWord(Number(l.quantity), 'license seat', 'license seats');
  const at = Date.parse(l.pendingAt || '');
  // decision 37(10): on a license billed on Microsoft's dates the bill already dropped at the renewal; the day or so until
  // Microsoft takes the lower count is on the license's next bill
  if (Number.isFinite(at) && at <= Date.now()) return { state: `Going down to ${to} now`, hint: l.billAligned ? 'Microsoft\'s renewal date has come. The days until Microsoft takes the change are billed for the dropped license seats on this license\'s next bill.' : `Microsoft's renewal date has come; you pay for ${held} until Microsoft takes the change.` };
  const on = dayWord(l.pendingAt);
  return on
    ? { state: `Goes down to ${to} on ${on}`, hint: `That is Microsoft's renewal date for this license. You pay for ${held} until then.` }
    : { state: `Goes down to ${to} on Microsoft's next renewal date`, hint: `You pay for ${held} until then.` };
}

/** A commitment's end as it stands now: the order-time end, moved on by whole commitments once it has passed. */
function currentEnd(iso, months) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t) || !(months > 0)) return '';
  const d = new Date(t);
  for (let i = 0; d.getTime() <= Date.now() && i < 120; i += 1) d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/**
 * Licensing L5b and money plan item 3 (2026-09-24): the End button's tip names the date an ending pressed now takes
 * (the server's endsIfEndedAt, the same arithmetic the ending uses): a commitment longer than the billing period runs,
 * and is billed, to its end, whatever the distributor says of ending early; otherwise the end of what was paid for.
 */
function endTip(l) {
  const on = dayWord(l.endsIfEndedAt);
  const committed = Number(l.commitmentMonths || 0) > ({ Monthly: 1, Annual: 12, '2-Year': 24, '3-Year': 36 }[l.billingTerm] || 1);
  if (!on) return 'End it at the end of what was paid for, or of its commitment when it has one. It is billed and usable until then; nothing is refunded.';
  if (committed) return `End it on ${on}, the end of its commitment; it is billed and usable until then. Nothing is refunded.`;
  return `End it on ${on}, the end of what was paid for; it is billed and usable until then. Nothing is refunded.`;
}

function rowHtml(l, p, e) {
  const name = licName(l.productName);
  const pw = pendingWords(l);
  const pending = pw ? `<span class="lic-state is-pending">${e(pw.state)}</span><span class="lic-hint-inline">${e(pw.hint)}</span>` : '';
  const commitEnd = Number(l.commitmentMonths || 0) > 1 ? currentEnd(l.commitmentEndsAt, Number(l.commitmentMonths)) : '';
  const commit = commitEnd ? `<span class="lic-hint-inline">The commitment runs to ${e(dayWord(commitEnd))}</span>` : '';
  // decision 37(11): a new Microsoft list price waiting for this license's renewal, in the server's words
  const newPrice = l.priceText ? `<span class="lic-hint-inline lic-price-next">${e(l.priceText)}</span>` : '';
  const price = `${e(cents(l.listCents))} a license seat <span class="adm-muted">${e(TERM_NAMES[l.billingTerm] || '')}</span><span class="lic-hint-inline">${e(l.termWord || '')}</span>${commit}${newPrice}`;
  // money plan item 2: the exact charge read for more license seats on this row, said under it before the second press
  const sq = lc.seatQuote[l.id];
  const seatNote = sq && sq.q?.kind === 'seats' && Number(kept(`licQty-${l.id}`, l.quantity)) === Number(sq.qty) ? `<span class="lic-hint-inline lic-charge">${seatChargeWords(sq.q, l.billingTerm)}</span>` : '';
  const status = `<span class="lic-state ${stateClass(l)}">${e(statusOf(l))}</span>${seatNote}${lineRequestHtml(l.id)}`;
  let acts = '';
  const qty = (label) => `<input class="acct-input lic-qty" type="number" min="1" max="500" inputmode="numeric" id="licQty-${e(l.id)}" data-keep value="${e(String(kept(`licQty-${l.id}`, l.quantity)))}" aria-label="${e(label)}" ${lc.busy ? 'disabled' : ''}>`;
  if (p.canBuy && CHANGEABLE.includes(l.status)) {
    acts = `
      <span class="lic-acts">
        ${qty(`License seats of ${name}`)}
        ${reqIcon(`seats:${l.id}`, { lic: 'seats' }, 'check', 'Set the license seats: more are charged now; fewer from the renewal date, billed until then', 'Saving the license seats…', `data-line="${e(l.id)}"`, 'btn-primary')}
        ${reqIcon(`end:${l.id}`, { lic: 'end' }, 'calendarX', endTip(l), 'Ending…', `data-line="${e(l.id)}"`, 'is-risky')}
      </span>`;
  } else if (p.canBuy && l.status === 'ENDING' && l.canKeep) {
    acts = `<span class="lic-acts">${reqLead(`keep:${l.id}`, { lic: 'keep' }, 'undo', 'Keep it', 'Keeping…', `data-line="${e(l.id)}" data-tip="Take the ending back; it is billed and renews as before"`)}</span>`;
  } else if (p.canRequest && CHANGEABLE.includes(l.status)) {
    acts = `
      <span class="lic-acts">
        ${qty(`License seats to ask for on ${name}`)}
        ${reqIcon(`askseats:${l.id}`, { lic: 'ask-seats' }, 'send', 'Ask the owner for this many license seats', 'Sending…', `data-line="${e(l.id)}"`, 'btn-primary')}
        ${reqIcon(`askend:${l.id}`, { lic: 'ask-end' }, 'calendarX', 'Ask the owner to end it', 'Sending…', `data-line="${e(l.id)}"`)}
      </span>`;
  }
  return `
    <tr>
      <td data-th="License"><span class="lic-name">${e(name)}</span>${l.sku ? `<br><span class="ev-code lic-sku">${e(l.sku)}</span>` : ''}</td>
      <td class="lic-seats-cell" data-th="License seats"><span class="lic-count">${e(String(l.quantity))}</span>${pending}</td>
      <td data-th="Price">${price}</td>
      <td data-th="Status">${status}</td>
      <td data-th="Given to">${holdersCell(l, p, e)}</td>
      <td class="lic-acts-cell" data-th="">${acts}</td>
    </tr>`;
}

export function licensesHtml() {
  const e = st.D.escapeHtml, v = lc.view, p = perms();
  if (!showsLicensing() || !v.account) return '';
  // the included mailbox is not a bought license: it is on the Mailboxes card
  const bought = (v.licenses || []).filter(l => !l.included);
  const rows = bought.filter(l => l.status !== 'CANCELED' && l.status !== 'FAILED');
  const past = bought.filter(l => l.status === 'CANCELED' || l.status === 'FAILED');
  const seats = rows.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const summary = rows.length ? `${countWord(seats, 'license seat', 'license seats')} across ${countWord(rows.length, 'license', 'licenses')}` : 'none yet';
  const head = '<thead><tr><th>License</th><th>License seats</th><th>Price</th><th>Status</th><th>Given to</th><th></th></tr></thead>';
  const table = !rows.length ? `<p class="acct-empty">No licenses bought yet.${canAdd() ? ' Add one from the Licenses list below.' : ''}</p>` : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table lic-table">${head}<tbody>${rows.map(l => rowHtml(l, p, e)).join('')}</tbody></table>
      </div>`;
  const history = past.length ? `<details class="lic-past"><summary>${e(countWord(past.length, 'past license', 'past licenses'))}</summary><div class="adm-table-scroll"><table class="adm-table adm-table--wrap ev-table lic-table">${head}<tbody>${past.map(l => rowHtml(l, p, e)).join('')}</tbody></table></div></details>` : '';
  return cardHtml({
    key: 'licenses', icon: 'layers', title: 'Your licenses', summary: e(summary),
    explain: explainLink('licensing', 'How a license is billed'),
    body: `${noteHtml('licenses')}${errHtml('licenses')}${table}${history}<p class="acct-card-note ev-note">More license seats are charged now, for the rest of the current period, and apply now. Fewer license seats take effect on Microsoft's renewal date for the license, shown on it; you pay for them until then. An ending takes effect at the end of what was paid for, or at the end of its commitment when it has one; it is billed and usable until then. Each license renews on the day it was bought. ${lc.view?.salesTax === false ? '' : 'Sales tax is added to every charge. '}Nothing is refunded.</p>`
  });
}

/* ---------- adding a license ---------- */

/**
 * The add box's price sentence and its button's word, from the plan and the license-seat count as they stand. Painted
 * by addHtml, and set in place as the count is typed (addTyped), so the button always says what a press charges and
 * a press is never lost to a repaint.
 */
/** "A", "A or B", "A, B or C", and past five "A, B, C, D, E or one of 3 more" (the server's own wording rule). */
function orList(names, max = 5) {
  const n = [...new Set((names || []).map(licName).filter(Boolean))];
  if (n.length <= 1) return n[0] || '';
  if (n.length > max) return `${n.slice(0, max).join(', ')} or one of ${n.length - max} more`;
  return `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}`;
}
/**
 * Licensing L3b (2026-09-24): the base licenses an add-on needs that nobody on this team holds, from the price read's
 * marks (a "Requires" group with held: false), or from the server's refusal when it found none either. Microsoft
 * accepts one bought anywhere, so the person ticks that their tenant has one; nothing is charged until they do.
 */
function missingBase(productId) {
  if (Array.isArray(lc.add?.needs) && lc.add.needs.length) return lc.add.needs;
  return (lc.requires[productId] || []).filter(g => g.required === true && g.held === false);
}
const TICK_TIP = 'Tick that your Microsoft tenant already has one of them first';

/**
 * The exact charge (money plan item 2, decision 37(8)): the add box reads Stripe's own quote for the plan and the
 * license-seat count in it (licensingMoney.js), shows it in words and on the button, and sends that amount with the
 * press; the server charges nothing unless it still is the amount. The quote is read again when the plan or the count
 * changes, and after ten minutes.
 */
const WORKING = 'Working out the exact charge';
function quoteKeyOf(a) { return `${a?.key || ''}|${a?.quantity || 0}`; }
function currentQuote(a) { return a && a.quote && a.quoteFor === quoteKeyOf(a) && fresh(a.quote) ? a.quote : null; }

function addWords() {
  const e = st.D.escapeHtml, a = lc.add, v = lc.view, p = perms();
  const prod = (v?.catalog || []).find(x => x.id === a?.productId);
  if (!prod) return null;
  const offers = (lc.prices[prod.id] || []).filter(o => o.available !== false);
  const chosen = offers.find(o => o.key === a.key) || offers[0] || null;
  const rule = chosen ? ruleWords(chosen) : '';
  const asking = !p.canBuy && p.canRequest;
  const needs = missingBase(prod.id);
  const q = chosen ? currentQuote(a) : null;
  let words, goLabel, waiting = false;
  if (!chosen) {
    // decision 38: a license whose every term is off the plan's says so, never "no price"
    const off = notForPlanLine(prod.id);
    words = e(off || (lc.prices[prod.id] === null ? 'This license has no list price to order on right now. Try again later, or ask Support.' : 'Reading the price…'));
    goLabel = off ? 'Not offered on your plan\'s term' : 'No price to order on';
  } else if (q) {
    words = `${addChargeWords(q, { asking, term: chosen.billingTerm, name: licName(prod.name) })}${rule ? ` ${e(cap(rule))}.` : ''}`;
    goLabel = addGoLabel(q, asking);
  } else if (a.quoteErrFor === quoteKeyOf(a)) {
    words = e('The exact charge could not be worked out right now. Nothing was charged.');
    goLabel = asking ? 'Ask the owner to buy it' : 'Work out the charge again';
  } else {
    words = e(`${WORKING}…`); waiting = true;
    goLabel = asking ? 'Ask the owner to buy it' : `${WORKING}…`;
  }
  // someone who asks charges nothing, so the ask never waits on the quote; the owner's press waits for the exact charge
  return { prod, offers, chosen, asking, words, goLabel, needs, waiting: waiting && !asking, blocked: needs.length > 0 && !a.ticked };
}

let quoteTimer = 0;
/** The quote for the box as it stands, once the plan and the count stop changing. */
function scheduleQuote(ms = 400) { clearTimeout(quoteTimer); quoteTimer = setTimeout(requestQuote, ms); }
/** Reads the exact charge for the add box; the words and the button follow in place (refreshAdd), never a repaint. */
async function requestQuote() {
  const a = lc.add;
  if (!a) return;
  const offers = (lc.prices[a.productId] || []).filter(o => o.available !== false);
  const o = offers.find(x => x.key === a.key) || offers[0];
  if (!o) return;
  const want = quoteKeyOf(a);
  if (currentQuote(a) || a.quoting === want) return;
  a.quoting = want; a.quoteErrFor = '';
  refreshAdd();
  try {
    const q = await quoteNew({ productId: a.productId, billingTerm: o.billingTerm, commitmentMonths: o.commitmentMonths ?? null, quantity: a.quantity });
    if (lc.add === a && a.quoting === want) { a.quote = q; a.quoteFor = want; if (lc.err.add) { lc.err.add = ''; lc.links.add = null; st.paint(); } }
  } catch (ex) {
    if (lc.add === a && a.quoting === want) {
      a.quote = null; a.quoteErrFor = want;
      // the reason, with the way to fix it (Billing for an address or a card), on the box's own error line
      lc.err.add = sayError(ex, 'The exact charge could not be worked out right now. Try again in a moment. Nothing was charged.', moneyCodes('add'));
      a.quoting = '';
      st.paint();
      return;
    }
  } finally { if (lc.add === a && a.quoting === want) a.quoting = ''; }
  refreshAdd();
}
/** The add box's words and its button, set in place from addWords. */
function refreshAdd() {
  const w = addWords();
  if (!w) return;
  const note = document.getElementById('licAddWords');
  if (note) note.innerHTML = w.words;
  const go = document.querySelector('[data-lic-action="add-confirm"]');
  if (!go || lc.busy) return;
  go.disabled = !w.chosen || !!w.blocked || !!w.waiting;
  if (w.blocked) go.setAttribute('data-tip', TICK_TIP);
  else if (w.waiting) go.setAttribute('data-tip', WORKING);
  else go.removeAttribute('data-tip');
  btnLabel(go, w.goLabel);
}

export function addHtml() {
  const e = st.D.escapeHtml, a = lc.add;
  const w = addWords();
  if (!w) return '';
  const { offers, chosen, asking, words, goLabel, needs, blocked, waiting } = w;
  const opts = offers.map(o => `<option value="${e(o.key)}" ${chosen && chosen.key === o.key ? 'selected' : ''}>${e(money(o.list))} ${e(billWord(o.billingTerm))}, ${e(commitWord(o))}</option>`).join('');
  // standing rule (c): the charge button waits, saying why, while the exact charge is being read
  const hold = !chosen ? 'disabled' : blocked ? `disabled data-tip="${e(TICK_TIP)}"` : waiting ? `disabled data-tip="${e(WORKING)}"` : '';
  // decision 38: the plan's term, which is why only these plans are offered
  const termLine = planTermLine();
  const go = asking
    ? reqLead('add', { lic: 'add-confirm' }, 'send', goLabel, 'Sending…', hold, 'btn-primary')
    : reqLead('add', { lic: 'add-confirm' }, 'card', goLabel, 'Charging and ordering…', hold, 'btn-primary');
  // L3b: the base license the add-on needs, said above the price, with the tick that stands for one bought elsewhere
  const base = needs.length ? `
      <p class="acct-card-note lic-prereq">${e(`Microsoft sells ${licName(w.prod.name)} only to a business whose Microsoft tenant already has one of these: ${orList((needs[0].products || []).map(x => x.name))}. We found none bought through PragOptics.`)}</p>
      <label class="ev-agree"><input type="checkbox" id="licAddPrereq" ${a.ticked ? 'checked' : ''} ${lc.busy ? 'disabled' : ''}><span>Our Microsoft tenant already has one of them</span></label>` : '';
  return `
    <div class="lic-add" id="licAdd">
      <div class="ev-reg-form">
        <div class="lic-span"><label class="acct-label" for="licAddTerm">Plan</label><select class="acct-input" id="licAddTerm" ${offers.length && !lc.busy ? '' : 'disabled'}>${opts || '<option>Reading the price…</option>'}</select></div>
        <div><label class="acct-label" for="licAddQty">License seats</label><input class="acct-input" id="licAddQty" type="number" min="1" max="500" inputmode="numeric" value="${e(String(a.quantity))}" ${lc.busy ? 'disabled' : ''}></div>
      </div>
      ${termLine ? `<p class="lic-hint">${e(termLine)}</p>` : ''}
      ${base}
      <p class="acct-card-note" id="licAddWords" aria-live="polite">${words}</p>
      ${errHtml('add')}
      <div class="acct-actions-row">
        ${go}
        ${iconBtn({ lic: 'add-cancel' }, 'x', 'Close without adding', lc.busy === 'add' ? 'disabled' : '')}
      </div>
    </div>`;
}

/* ---------- actions ---------- */

async function openAdd(btn) {
  const id = btn.dataset.product || '';
  if (!id || lc.busy) return;
  lc.err.add = '';
  // the offers are read once per license; a failed read leaves the box saying it has no price to order on
  if (lc.prices[id] === undefined) await send(`add-open:${id}`, 'Reading the price…', () => loadOffers(id), { errKey: 'catalog', fallback: 'The price could not be read.' });
  lc.add = { productId: id, key: '', quantity: 1, quote: null, quoteFor: '', quoting: '', quoteErrFor: '' };
  const offers = (lc.prices[id] || []).filter(o => o.available !== false);
  if (offers.length) lc.add.key = offers[0].key;
  st.paint();
  document.getElementById('licAdd')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // money plan item 2: the exact charge for the first plan and one license seat, read at once
  if (offers.length) requestQuote();
}
function readAdd() {
  if (!lc.add) return;
  lc.add.key = String(document.getElementById('licAddTerm')?.value || lc.add.key);
  lc.add.quantity = Math.max(1, Math.min(500, Math.floor(Number(document.getElementById('licAddQty')?.value) || 1)));
}
async function confirmAdd() {
  if (!lc.add || lc.busy) return;
  readAdd();
  const a = lc.add, p = perms();
  const prod = (lc.view.catalog || []).find(x => x.id === a.productId) || {};
  const o = (lc.prices[a.productId] || []).find(x => x.key === a.key) || {};
  // L3b: an add-on whose base license was not found goes out only with the tick, and carries it
  const needs = missingBase(a.productId);
  if (needs.length && !a.ticked) { lc.err.add = `${TICK_TIP}.`; st.paint(); document.getElementById('licAddPrereq')?.focus(); return; }
  const payload = { productId: a.productId, billingTerm: o.billingTerm || 'Monthly', commitmentMonths: o.commitmentMonths ?? null, quantity: a.quantity, ...(needs.length && a.ticked ? { prerequisiteConfirmed: true } : {}) };
  // L3b: the server found no base license on the team (the mark read with the price was older than the team's licenses):
  // the tick appears in the box, and the server's words say why. The same answer for a purchase and for a request.
  const needsBase = (ex) => { if (lc.add && Array.isArray(ex.data.requires)) { lc.add.needs = ex.data.requires; lc.add.ticked = false; } return ex.data.error; };
  if (!p.canBuy && p.canRequest) {
    const ok = await ask('add', 'Sending…', 'license.add', payload, 'add', 'catalog', `Buy ${licName(prod.name)}, ${countWord(a.quantity, 'license seat', 'license seats')}`, { PREREQUISITE_REQUIRED: needsBase });
    if (ok) { lc.add = null; st.paint(); }
    return;
  }
  // money plan item 2: the owner is charged exactly the amount on the button, or nothing; with no fresh quote the press
  // reads it again first (the button says so), never a charge on an amount nobody saw
  const q = currentQuote(a);
  if (!q) { requestQuote(); return; }
  const confirmed = { expectedTotalCents: q.totalCents, ...(q.kind === 'seats' && q.prorationDate ? { prorationDate: q.prorationDate } : {}) };
  const requote = (ex) => { if (lc.add) { lc.add.quote = moved(lc.add.quote, ex); lc.add.quoteFor = quoteKeyOf(lc.add); } return ex.data.error; };
  const ok = await send('add', 'Charging and ordering…', async () => {
    let d;
    try { d = await call(`${LIC_URL}/licenses`, 'POST', { ...payload, ...confirmed }); }
    catch (ex) {
      // refused after the charge: the line stands, FAILED with its plain reason (our team looks into what was paid, decision
      // 37(9)), in Past licenses
      if (ex?.data?.lineId) await st.load();
      throw ex;
    }
    const l = d.license || {};
    const n = licName(l.productName || prod.name);
    const paid = ` Your card was charged ${cents(q.totalCents)}.`;
    setNote('licenses', d.note ? sentence(d.note)
      : l.status === 'ACTIVE' ? `${n} is active: ${countWord(l.quantity, 'license seat', 'license seats')}.${paid}${l.validatedOnly ? ' Test lane: nothing is ordered at Microsoft.' : ''}`
      : `${n} is ordered: ${countWord(l.quantity, 'license seat', 'license seats')}.${paid} This list shows it active once Microsoft has it.`);
    lc.add = null;
    await forgetMarks();
    await st.load();
  }, {
    errKey: 'add', fallback: 'The license could not be added.',
    codes: {
      ...moneyCodes('add'),
      // the amount moved since the button showed it: nothing was charged, and the button now shows the new amount
      AMOUNT_CHANGED: requote, AMOUNT_CONFIRM: requote,
      QUOTE_EXPIRED: (ex) => { if (lc.add) lc.add.quote = null; queueMicrotask(requestQuote); return ex.data.error; },
      LICENSE_ENDING: (ex) => `${ex.data.error} Keep it is on Your licenses above.`,
      PREREQUISITE_REQUIRED: needsBase
    }
  });
  if (ok) document.querySelector('[data-card="licensing:licenses"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function lineOf(id) { return (lc.view?.licenses || []).find(x => x.id === id) || null; }
function qtyOf(id) { return Math.floor(Number(kept(`licQty-${id}`, document.getElementById(`licQty-${id}`)?.value))); }

async function setSeats(btn) {
  const id = btn.dataset.line || '', l = lineOf(id);
  if (!l || lc.busy) return;
  const qty = qtyOf(id), cur = Number(l.quantity || 0);
  lc.err.licenses = '';
  if (!Number.isFinite(qty) || qty < 1 || qty > 500) { lc.err.licenses = 'License seats are a whole number from 1 to 500.'; st.paint(); return; }
  if (qty === cur && l.pendingQuantity == null) { lc.err.licenses = `${licName(l.productName)} has ${countWord(cur, 'license seat', 'license seats')} already.`; st.paint(); return; }
  if (qty > cur) {
    // money plan item 2: more license seats charge now, so the exact charge is read first and said under the row, and
    // the button asks with the amount; the press sends it, with the quote's own proration date
    const sq = lc.seatQuote[id];
    const q = sq && sq.qty === qty && sq.q?.kind === 'seats' && fresh(sq.q) ? sq.q : null;
    if (!q) {
      const ok = await send(`seats:${id}`, `${WORKING}…`, async () => { lc.seatQuote[id] = { qty, q: await quoteSeats(id, qty) }; }, { errKey: 'licenses', fallback: 'The exact charge could not be worked out right now. Try again in a moment. Nothing was charged.', codes: moneyCodes('licenses') });
      const got = lc.seatQuote[id]?.q;
      const again = ok && got?.kind === 'seats' ? document.querySelector(`[data-lic-action="seats"][data-line="${CSS.escape(id)}"]`) : null;
      if (again) armed(again, `Add ${qty - cur}? Charge ${cents(got.totalCents)}`);
      return;
    }
    if (!armed(btn, `Add ${qty - cur}? Charge ${cents(q.totalCents)}`)) return;
    return putSeats(l, qty, q);
  }
  // the bill changes on a decrease (on Microsoft's renewal date, nothing charged): asked twice, in words; the same count
  // while a lower one waits takes the lower one back
  if (!armed(btn, qty < cur ? `Lower to ${qty}?` : `Stay at ${qty}?`)) return;
  return putSeats(l, qty, null);
}
/** The license-seat change itself; `q` is the exact charge the owner saw for more license seats (none for fewer). */
async function putSeats(l, qty, q) {
  const id = l.id, cur = Number(l.quantity || 0), n = licName(l.productName);
  const requote = (ex) => { lc.seatQuote[id] = { qty, q: moved(q, ex) }; return ex.data.error; };
  await send(`seats:${id}`, 'Saving the license seats…', async () => {
    const d = await call(`${LIC_URL}/licenses/${encodeURIComponent(id)}`, 'PUT', { quantity: qty, ...(q ? { expectedTotalCents: q.totalCents, prorationDate: q.prorationDate } : {}) });
    const r = d.license || {};
    forget(`licQty-${id}`); delete lc.seatQuote[id];
    const pw = pendingWords(r);
    setNote('licenses', pw
      ? `${n}: ${pw.state}. ${pw.hint}`
      : qty === cur ? `${n} stays at ${countWord(Number(r.quantity), 'license seat', 'license seats')}; the lower count is taken back.`
      : `${n}: ${countWord(Number(r.quantity), 'license seat', 'license seats')}, applied now.${q ? ` Your card was charged ${cents(q.totalCents)}.` : ''}`);
    await st.load();
  }, {
    errKey: 'licenses', fallback: 'The license seats could not be changed.',
    codes: { ...moneyCodes('licenses'), AMOUNT_CHANGED: requote, AMOUNT_CONFIRM: requote, QUOTE_EXPIRED: (ex) => { delete lc.seatQuote[id]; return ex.data.error; } }
  });
}

async function endLicense(btn) {
  const id = btn.dataset.line || '', l = lineOf(id);
  if (!l || lc.busy) return;
  // L5b: the question names the day it ends, the same day the tip gives
  const on = dayWord(l.endsIfEndedAt);
  if (!armed(btn, on ? `End it on ${on}?` : 'End it?')) return;
  const n = licName(l.productName);
  await send(`end:${id}`, 'Ending…', async () => {
    const d = await call(`${LIC_URL}/licenses/${encodeURIComponent(id)}`, 'DELETE');
    setNote('licenses', `${n} ends on ${dayWord(d.license?.cancelAt) || 'its renewal date'}. It is billed and usable until then; nothing is refunded.`);
    await forgetMarks();
    await st.load();
  }, { errKey: 'licenses', fallback: 'The license could not be ended.' });
}

/** An ending taken back before its date: the license bills and renews as before. */
async function keepLicense(btn) {
  const id = btn.dataset.line || '', l = lineOf(id);
  if (!l || lc.busy) return;
  await send(`keep:${id}`, 'Keeping…', async () => {
    await call(`${LIC_URL}/licenses/${encodeURIComponent(id)}/keep`);
    setNote('licenses', `${licName(l.productName)} continues; it no longer ends.`);
    await forgetMarks();
    await st.load();
  }, { errKey: 'licenses', fallback: 'The license could not be kept.' });
}

/** Someone with "Ask for purchases": a license-seat change or an ending goes to the owner, never runs. */
async function askSeats(btn) {
  const id = btn.dataset.line || '', l = lineOf(id);
  if (!l || lc.busy) return;
  const qty = qtyOf(id), cur = Number(l.quantity || 0);
  lc.err.licenses = '';
  if (!Number.isFinite(qty) || qty < 1 || qty > 500) { lc.err.licenses = 'License seats are a whole number from 1 to 500.'; st.paint(); return; }
  if (qty === cur) { lc.err.licenses = `${licName(l.productName)} has ${countWord(cur, 'license seat', 'license seats')} now. Change the number, then ask.`; st.paint(); return; }
  const ok = await ask(`askseats:${id}`, 'Sending…', 'license.seats', { lineId: id, quantity: qty }, 'licenses', 'licenses', `Change ${licName(l.productName)} to ${countWord(qty, 'license seat', 'license seats')}`);
  if (ok) { forget(`licQty-${id}`); st.paint(); }
}
async function askEnd(btn) {
  const id = btn.dataset.line || '', l = lineOf(id);
  if (!l || lc.busy) return;
  await ask(`askend:${id}`, 'Sending…', 'license.end', { lineId: id }, 'licenses', 'licenses', `End ${licName(l.productName)}`);
}

/** A bought license given to a person on the team (MINE M10: which person holds which license seat). */
async function giveHolder(btn) {
  const id = btn.dataset.line || '', l = lineOf(id);
  if (!l || lc.busy) return;
  const userId = String(kept(`licGive-${id}`, document.getElementById(`licGive-${id}`)?.value || '') || '');
  const who = (lc.view.seats || []).find(s => String(s.userId) === userId);
  if (!who) { lc.err.licenses = 'Choose the person to give it to.'; st.paint(); return; }
  await send(`hold:${id}`, 'Giving it…', async () => {
    await call(`${LIC_URL}/licenses/${encodeURIComponent(id)}/holders/${encodeURIComponent(userId)}`);
    forget(`licGive-${id}`);
    setNote('licenses', `${licName(l.productName)} given to ${who.email}.`);
    await st.load();
  }, { errKey: 'licenses', fallback: 'The license could not be given.' });
}
async function takeHolder(btn) {
  const id = btn.dataset.line || '', userId = btn.dataset.user || '', l = lineOf(id);
  if (!l || lc.busy) return;
  if (!armed(btn, 'Take it back?')) return;
  const who = (l.holders || []).find(h => String(h.userId) === userId);
  await send(`unhold:${id}:${userId}`, 'Taking it back…', async () => {
    await call(`${LIC_URL}/licenses/${encodeURIComponent(id)}/holders/${encodeURIComponent(userId)}`, 'DELETE');
    setNote('licenses', `${licName(l.productName)} taken back from ${who?.email || 'that person'}. The license seat is free to give again.`);
    await st.load();
  }, { errKey: 'licenses', fallback: 'The license could not be taken back.' });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function orderAction(a, btn) {
  if (a === 'mca-accept') { acceptAgreement(); return true; }
  if (a === 'mca-name') { saveMcaName(); return true; }
  if (a === 'add-open') { openAdd(btn); return true; }
  if (a === 'add-cancel') { lc.add = null; lc.err.add = ''; st.paint(); return true; }
  if (a === 'add-confirm') { confirmAdd(); return true; }
  if (a === 'seats') { setSeats(btn); return true; }
  if (a === 'end') { endLicense(btn); return true; }
  if (a === 'keep') { keepLicense(btn); return true; }
  if (a === 'ask-seats') { askSeats(btn); return true; }
  if (a === 'ask-end') { askEnd(btn); return true; }
  if (a === 'holder-give') { giveHolder(btn); return true; }
  if (a === 'holder-take') { takeHolder(btn); return true; }
  return false;
}
/**
 * The add box's plan or license-seat count changed (each key typed, a plan picked): the charge sentence and the
 * button's word follow in place, never through a repaint, so the button always says what a press charges and the
 * press that ends the typing lands on the same button (a repaint on blur used to swap it out under the click).
 */
export function orderChange(e) {
  const t = e.target;
  if (!t || !(t.id === 'licAddTerm' || t.id === 'licAddQty' || t.id === 'licAddPrereq') || !lc.add || lc.busy) return;
  if (t.id === 'licAddPrereq') { lc.add.ticked = !!t.checked; if (lc.err.add === `${TICK_TIP}.`) { lc.err.add = ''; st.paint(); return; } }
  readAdd();
  // L3b: the button waits for the tick, saying why, and comes back the moment it is ticked (no repaint under the press);
  // money plan item 2: a new plan or count shows "Working out the exact charge" until its quote is read
  refreshAdd();
  if (t.id !== 'licAddPrereq') scheduleQuote(t.id === 'licAddTerm' ? 0 : 400);
}
