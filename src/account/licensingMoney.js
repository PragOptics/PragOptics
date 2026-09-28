// src/account/licensingMoney.js
//
// THE MONEY ON THE LICENSING TAB (2026-09-24, the money plan with Cameron's decisions 21, 37 and 38), in one place so
// the add box, a license-seat change and an owner's approval say the same thing about the same charge:
//
//   THE EXACT CHARGE (decisions 37(8) and 37(12)). Every button that charges shows Stripe's own preview of the charge,
//   sales tax included, read from the server just before; the press sends that amount back, and the server charges
//   nothing unless it is still the amount (409 AMOUNT_CHANGED answers the new one, which the button then shows). Each
//   license is billed on its own from the day it is bought, on Microsoft's dates, so a new license's first charge is the
//   whole period, never a part of another license's bill.
//   WHAT IS OWED (decision 21). A license whose payment failed after every retry ends when Microsoft ends it, and the
//   rest of that term is charged; when that charge fails too it is owed: the tab says so at the top, the owner pays it
//   with Pay now, and new licenses and more license seats wait until it is paid.
//
//   POST v1/environment/licensing/quote               { productId, billingTerm, commitmentMonths, quantity } -> { quote }
//   POST v1/environment/licensing/licenses/{id}/quote { quantity } -> { quote }
//   GET  v1/environment/licensing/requests/{id}/quote -> { quote }   the owner, for a waiting request
//   POST v1/environment/licensing/debt/pay            { lineId? } -> { paid, totalCents }   the owner
//
// A quote is { kind: "new"|"seats"|"fewer", subtotalCents, taxCents, totalCents, perPeriodCents, prorationDate?,
// periodEnd?, quantity, from?, at?, taxed } (auth/licenseOrders.js quoteAdd and quoteSeats).

import { LIC_URL, REQ_URL, lc, st, url, cardHtml, countWord, cents, dayWord, sentence, perms, call, send, reqLead, errHtml, noteHtml, setNote, withLink, licName } from './licensingShared.js';

/** The server takes a quote's proration date for 15 minutes; the tab asks again after 10, so a press is never refused for it. */
export const QUOTE_FRESH_MS = 10 * 60 * 1000;
const PER = { Monthly: 'every month', Annual: 'every year', '2-Year': 'every 2 years', '3-Year': 'every 3 years' };
/** "every month", "every year". */
export function perWord(term) { return PER[term] || 'each period'; }
/** Whether this lane adds sales tax (the server's describe says it; on unless the lane turns it off). */
function taxOn() { return lc.view?.salesTax !== false; }
const esc = (s) => st.D.escapeHtml(s);
/** A quote still good to charge on: read under 10 minutes ago. */
export function fresh(q) { return !!q && Number.isFinite(q._at) && Date.now() - q._at < QUOTE_FRESH_MS; }
/** A quote as read, stamped with when it was read. */
function stamped(q) { return q ? { ...q, _at: Date.now() } : null; }

/* ---------- the words for a charge ---------- */

/** "$50.66 ($46.80 plus $3.86 sales tax)", or "$46.80" where this lane adds no sales tax. */
export function amountWords(q, { forWhat = '' } = {}) {
  const total = cents(q.totalCents), sub = cents(q.subtotalCents);
  if (!taxOn()) return `<strong>${esc(total)}</strong>${forWhat ? ` for ${esc(forWhat)}` : ''}`;
  return `<strong>${esc(total)}</strong> (${esc(sub)}${forWhat ? ` for ${esc(forWhat)}` : ''}, plus ${esc(cents(q.taxCents))} sales tax)`;
}
/** "$46.80 plus tax every month" (the regular charge after the first). */
function thenWords(cents_, term) { return `${cents(cents_)}${taxOn() ? ' plus tax' : ''} ${perWord(term)}`; }

/**
 * The add box's sentence for a quote (money plan item 2): what is charged now and what after, for the owner who buys,
 * or what the owner's approval would charge for someone who asks. A license already held on that plan quotes its
 * extra license seats instead.
 */
export function addChargeWords(q, { asking = false, term = 'Monthly', name = '' } = {}) {
  const seats = countWord(Number(q.quantity || 1), 'license seat', 'license seats');
  if (q.kind === 'seats') {
    const has = `Your team already has ${esc(name || 'this license')} on this plan, so this adds license seats to it.`;
    if (!asking) return `${has} ${seatChargeWords(q, term)}`;
    const p = seatParts(q, term);
    return `${has} The owner approves before anything is charged. At today's price that is ${p.now}, charged to the owner's card. ${p.then}`;
  }
  const per = esc(thenWords(q.perPeriodCents ?? q.subtotalCents, term));
  return asking
    ? `The owner approves before anything is charged. At today's price that is ${amountWords(q, { forWhat: seats })}, charged to the owner's card, then ${per} until it ends.`
    : `Charged now: ${amountWords(q, { forWhat: seats })}. Then ${per} until you end it. It renews on this day each period, the same day Microsoft renews it.`;
}
/** The add box's button word for a quote. */
export function addGoLabel(q, asking) {
  if (asking) return 'Ask the owner to buy it';
  return q.kind === 'seats' ? `Charge ${cents(q.totalCents)} and add` : `Charge ${cents(q.totalCents)} and order`;
}
/** More license seats in words: what they charge now, from today to the period's end, and what after. */
function seatParts(q, term) {
  const added = countWord(Math.max(0, Number(q.quantity) - Number(q.from || 0)), 'more license seat', 'more license seats');
  const to = dayWord(q.periodEnd);
  return { now: `${amountWords(q)} for ${esc(added)} from today${to ? ` to ${esc(to)}` : ''}`, then: `From then, ${esc(thenWords(q.perPeriodCents, term))}.` };
}
/** Under a license's row (and the add box's own sentence for a license held on that plan): what more license seats charge now and after (money plan item 2). */
export function seatChargeWords(q, term) {
  const p = seatParts(q, term);
  return `Charged now: ${p.now}. ${p.then}`;
}

/* ---------- the plan's term (decision 38) ---------- */

/** The platform plan's term, as the licenses offered follow it; '' when the plan's cadence is not recorded. */
export function planTermLine() {
  const c = lc.view?.planCadence;
  if (c === 'annual') return 'Your plan is billed yearly, so licenses are bought on a 1-year term.';
  if (c === 'monthly') return 'Your plan is billed monthly, so licenses are bought month to month.';
  return '';
}
/** Why a license has nothing to order on when every term it has is off the plan's; '' otherwise. */
export function notForPlanLine(productId) {
  const c = lc.view?.planCadence;
  if (!c || !(Number(lc.notForPlan?.[productId]) > 0) || lc.prices?.[productId]) return '';
  return c === 'annual' ? 'This license is not offered on a 1-year term, which your yearly plan needs.' : 'This license is not offered month to month, which your monthly plan needs.';
}

/* ---------- reading a quote ---------- */

/** The exact charge of a new license (or more license seats of one held on that plan). */
export async function quoteNew({ productId, billingTerm, commitmentMonths, quantity }) {
  const d = await call(`${LIC_URL}/quote`, 'POST', { productId, billingTerm, commitmentMonths, quantity });
  return stamped(d?.quote || null);
}
/** The exact charge of more license seats now; fewer answer kind "fewer" with Microsoft's date and nothing charged. */
export async function quoteSeats(lineId, quantity) {
  const d = await call(`${LIC_URL}/licenses/${encodeURIComponent(lineId)}/quote`, 'POST', { quantity });
  return stamped(d?.quote || null);
}
/** The exact charge approving a waiting request takes now (the owner); null for one that charges nothing now. */
export async function quoteRequest(id) {
  const d = await st.D.apiFetch(url(`${REQ_URL}/${encodeURIComponent(id)}/quote`));
  return stamped(d?.quote || null);
}
/** A 409 AMOUNT_CHANGED (or AMOUNT_CONFIRM) carries the new quote: merged over the one shown, stamped now. */
export function moved(old, ex) { const q = ex?.data?.quote; return q ? stamped({ ...(old || {}), ...q }) : null; }

/**
 * The sentences every charging button shares for the codes the server answers before anything is charged; `key` is the
 * card whose error line shows them. The server's own sentence stands where it is plain already.
 */
export function moneyCodes(key) {
  const billing = (text) => withLink(key, 'subscription', 'Open Billing', text)();
  return {
    TAX_LOCATION: (ex) => billing(ex?.data?.error || 'We could not confirm your billing address for sales tax. Check it on Billing, then try again. Nothing was charged.'),
    NO_STRIPE_CUSTOMER: () => billing('Add a card on Billing first. The license is charged to it before it is ordered.'),
    NO_PAYMENT_METHOD: () => billing('Add a card on Billing first. The license is charged to it before it is ordered.'),
    CARD_DECLINED: (ex) => billing(ex?.data?.error || 'The card on file was declined. Update it on Billing and try again; nothing was ordered.'),
    QUOTE_EXPIRED: (ex) => ex?.data?.error || 'The charge was worked out too long ago. Check the new amount and press again. Nothing was charged.',
    RATE_LIMITED: 'Too many prices worked out in an hour. Try again later.',
    LIVE_LANE_ONLY: 'Licenses are managed on your live environment, not the sandbox.'
  };
}

/* ---------- what is owed (decision 21) ---------- */

/** One owed row in the owner's words. */
function owedLine(o) {
  const name = licName(o.productName) || 'a license';
  if (o.kind === 'licensing-seats-held') return `${cents(o.cents)} for ${name}: the license seats Microsoft kept for this term`;
  if (o.kind === 'licensing-kiosk') return `${cents(o.cents)} for the included mailboxes' Microsoft term past your plan's end`;
  const on = dayWord(o.endsAt);
  return `${cents(o.cents)} for ${name}${on ? `, which ends on ${on} because its payment failed` : ', whose payment failed'}`;
}

/**
 * The card at the top of the tab while anything is owed: what, why, and Pay now for the owner (the card on file,
 * charged when pressed; disabled while the request is out). Everyone else reads that the owner pays it.
 */
export function owedHtml() {
  const v = lc.view;
  if (!v || !(Number(v.owedCents) > 0)) return '';
  const p = perms(), list = Array.isArray(v.owed) ? v.owed : [];
  const total = cents(v.owedCents);
  const lines = list.length > 1 ? `<ul class="lic-owed">${list.map(o => `<li>${esc(sentence(owedLine(o)))}</li>`).join('')}</ul>` : '';
  const lead = list.length === 1 ? `Owed: ${owedLine(list[0])}.` : `Owed: ${total} for Microsoft licenses whose payment failed.`;
  const act = v.canPayOwed
    ? `<div class="acct-actions-row">${reqLead('pay-owed', { lic: 'pay-owed' }, 'card', `Pay ${total} now`, 'Paying…', '', 'btn-primary')}</div>`
    : `<p class="acct-card-note">${esc(p.isOwner ? 'Paying is open on the live environment.' : 'The owner pays it here.')}</p>`;
  return cardHtml({
    key: 'owed', icon: 'alert', title: 'Owed for licenses', summary: esc(total), danger: true,
    body: `${noteHtml('owed')}${errHtml('owed')}
      <p class="acct-card-note ev-note is-bad">${esc(lead)} Update the card on Billing if it has changed, then pay.</p>${lines}
      <p class="acct-card-note">New licenses and more license seats wait until it is paid. Microsoft bills a license to the end of its term, so its rest is charged when a payment fails for good; nothing is refunded.</p>
      ${act}`
  });
}

/** Pay now: the owner pays what is owed with the card on file. */
async function payOwed() {
  const v = lc.view;
  if (!v?.canPayOwed || lc.busy) return;
  await send('pay-owed', 'Paying…', async () => {
    const d = await call(`${LIC_URL}/debt/pay`, 'POST', {});
    setNote('licenses', d?.nothing || !Number(d?.totalCents) ? 'Nothing is owed any more.' : `Paid ${cents(d.totalCents)}. New licenses and more license seats can be added again.`);
    await st.load();
  }, { errKey: 'owed', fallback: 'The payment could not be made.', codes: moneyCodes('owed') });
}

/** Handles a data-lic-action this module owns; false when it is not one of them. */
export function moneyAction(a) {
  if (a === 'pay-owed') { payOwed(); return true; }
  return false;
}
