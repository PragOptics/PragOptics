// src/account/billingDetails.js
//
// THE BILLING DETAILS CARD (decision 24, 2026-09-23). The name, the optional business name, the phone and the address
// PragOptics bills, on Billing. Before this card nothing could change them after sign-up, though Licensing sent the
// owner to Billing to complete an address. Read first (a short record with an Edit button); Edit opens the same field
// set the domain registrant uses; Save sends PUT v1/billing/profile/details, which gives Stripe's customer the details
// first (invoices are made out to the business name when one is given, else the person) and then keeps them. The same
// checks run here first, in the same words, so a slip is said before anything is sent; a refusal from the server names
// its field, which is marked and focused. The answer is written into the cached ping, so Licensing and the registrant
// read the new details with no second ping.
//
// Your own customers never see this name: the name they see when they pay you is on your own Stripe account.

import { cardHtml, iconBtn, leadBtn, busy, setCardSummary } from './cards.js';
import { esc } from '../ui/words.js';

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();

const BUSINESS_MAX = 150, PART_MAX = 60, PHONE_MAX = 20, STREET_MAX = 200, CITY_MAX = 100, STATE_MAX = 100, POSTAL_MAX = 20;
const PING_KEY = 'pragoptics_ping';
const FIELDS = [
  ['firstName', 'bdFirst', 'First name', 'autocomplete="given-name"'],
  ['lastName', 'bdLast', 'Last name', 'autocomplete="family-name"'],
  ['businessName', 'bdBusiness', 'Business name (optional)', `autocomplete="organization" maxlength="${BUSINESS_MAX}" aria-describedby="bdBusinessHint"`],
  ['phone', 'bdPhone', 'Phone', 'autocomplete="tel" inputmode="tel"'],
  ['addressLine1', 'bdAddr1', 'Street', 'autocomplete="address-line1"'],
  ['addressLine2', 'bdAddr2', 'Street, line 2 (optional)', 'autocomplete="address-line2"'],
  ['city', 'bdCity', 'City', 'autocomplete="address-level2"'],
  ['state', 'bdState', 'State', 'autocomplete="address-level1"'],
  ['postalCode', 'bdZip', 'Postal code', 'autocomplete="postal-code"'],
  ['country', 'bdCountry', 'Country (two letters)', 'autocomplete="country" maxlength="2"']
];
const idOf = Object.fromEntries(FIELDS.map(([k, id]) => [k, id]));

// the card's state: the details as the account holds them, whether the form is open, and the last word said
const S = { bp: null, editing: false, note: '', error: '' };

/** The person's first and last name from the one name the profile keeps (first word, then the rest). */
function splitName(n) {
  const s = clean(n); const sp = s.indexOf(' ');
  return sp > 0 ? [s.slice(0, sp), s.slice(sp + 1)] : [s, ''];
}
function profileOf(b) {
  if (!b) return null;
  return {
    customerName: clean(b.customerName), businessName: clean(b.businessName), phone: clean(b.phone),
    addressLine1: clean(b.addressLine1), addressLine2: clean(b.addressLine2), city: clean(b.city), state: clean(b.state),
    postalCode: clean(b.postalCode), country: clean(b.country || 'US').toUpperCase()
  };
}
function summaryOf(bp) {
  const who = bp.businessName || bp.customerName || 'not given yet';
  const where = [bp.city, bp.state].filter(Boolean).join(', ');
  return where ? `${who} · ${where}` : who;
}
function addressLine(bp) {
  return [bp.addressLine1, bp.addressLine2, [bp.city, bp.state].filter(Boolean).join(' '), bp.postalCode, bp.country].filter(Boolean).join(', ');
}

/** The same checks the server makes, in its words and its order: { field, error } or { value }. */
export function checkDetails(v) {
  const firstName = clean(v.firstName), lastName = clean(v.lastName), businessName = clean(v.businessName), phone = clean(v.phone);
  const addressLine1 = clean(v.addressLine1), addressLine2 = clean(v.addressLine2), city = clean(v.city), state = clean(v.state), postalCode = clean(v.postalCode);
  const country = clean(v.country).toUpperCase();
  const no = (field, error) => ({ field, error });
  if (!firstName) return no('firstName', 'Give your first name.');
  if (firstName.length > PART_MAX) return no('firstName', `Your first name is at most ${PART_MAX} characters.`);
  if (!lastName) return no('lastName', 'Give your last name.');
  if (lastName.length > PART_MAX) return no('lastName', `Your last name is at most ${PART_MAX} characters.`);
  if (businessName.length > BUSINESS_MAX) return no('businessName', `A business name is at most ${BUSINESS_MAX} characters.`);
  if (!phone) return no('phone', 'Give a phone number.');
  if (phone.length > PHONE_MAX) return no('phone', `A phone number is at most ${PHONE_MAX} characters.`);
  if (!addressLine1) return no('addressLine1', 'Give the street address.');
  if (addressLine1.length > STREET_MAX) return no('addressLine1', `The street address is at most ${STREET_MAX} characters.`);
  if (addressLine2.length > STREET_MAX) return no('addressLine2', `The second street line is at most ${STREET_MAX} characters.`);
  if (!city) return no('city', 'Give the city.');
  if (city.length > CITY_MAX) return no('city', `The city is at most ${CITY_MAX} characters.`);
  if (!/^[A-Z]{2}$/.test(country)) return no('country', 'Give the country as two letters, like US.');
  if (!state && country === 'US') return no('state', 'Give the state.');
  if (state.length > STATE_MAX) return no('state', `The state is at most ${STATE_MAX} characters.`);
  if (!postalCode) return no('postalCode', 'Give the postal code.');
  if (postalCode.length > POSTAL_MAX) return no('postalCode', `The postal code is at most ${POSTAL_MAX} characters.`);
  return { value: { firstName, lastName, businessName, phone, addressLine1, addressLine2, city, state, postalCode, country } };
}

function readHtml(bp) {
  return `
      <dl class="ev-record ev-registrant" aria-label="Billing details">
        <dt>Name</dt><dd>${esc(bp.customerName || 'not given yet')}</dd><dd>${iconBtn({ acct: 'bd-edit' }, 'edit', 'Change your billing details')}</dd>
        <dt>Business</dt><dd>${bp.businessName ? esc(bp.businessName) : '<span class="muted">None given</span>'}</dd><dd></dd>
        <dt>Phone</dt><dd>${esc(bp.phone)}</dd><dd></dd>
        <dt>Address</dt><dd>${esc(addressLine(bp))}</dd><dd></dd>
      </dl>
      <p class="acct-card-note ev-dom-note">Your invoices are made out to ${esc(bp.businessName || bp.customerName || 'you')}. A business name also fills in your Microsoft licensing account's name on Licensing.</p>
      ${S.note ? `<p class="acct-card-note" role="status">${esc(S.note)}</p>` : ''}`;
}
function formHtml(bp) {
  const [first, last] = splitName(bp.customerName);
  const val = { ...bp, firstName: first, lastName: last };
  return `
      <div class="ev-reg-form">
        ${FIELDS.map(([k, id, label, extra]) => `<label class="acct-label" for="${id}">${esc(label)}</label><input class="acct-input" type="text" id="${id}" data-bd-field="${k}" value="${esc(val[k] || (k === 'country' ? 'US' : ''))}" spellcheck="false" ${extra} />${k === 'businessName'
          ? `<p class="acct-card-note" id="bdBusinessHint" style="grid-column: 1 / -1; margin: 0 0 4px;">Optional. Your invoices are made out to it, and it fills in your Microsoft licensing account's name on Licensing, where you confirm it. Your own customers see the name on your own Stripe account instead.</p>` : ''}`).join('')}
      </div>
      <p class="acct-error" id="bdError" ${S.error ? '' : 'hidden'}>${esc(S.error)}</p>
      <div class="ev-dom-actions">
        ${leadBtn({ acct: 'bd-save' }, 'check', 'Save billing details', '', 'btn-primary')}
        ${iconBtn({ acct: 'bd-cancel' }, 'x', 'Keep them as they are')}
      </div>`;
}
function bodyHtml() { return S.bp ? (S.editing ? formHtml(S.bp) : readHtml(S.bp)) : ''; }
function paint() {
  const host = document.getElementById('acctBdBody');
  if (host) host.innerHTML = bodyHtml();
  if (S.bp) setCardSummary('billing:details', esc(summaryOf(S.bp)));
}

/** The card, from the billing profile the ping carries; nothing when there is none (it is made at subscription). */
export function billingDetailsHtml(billingProfile) {
  const bp = profileOf(billingProfile);
  S.bp = bp; S.editing = false; S.note = ''; S.error = '';
  if (!bp) return '';
  return cardHtml({ key: 'billing:details', icon: 'building', title: 'Billing details', summary: esc(summaryOf(bp)), body: `<div id="acctBdBody">${bodyHtml()}</div>` });
}

export function editBillingDetails() {
  if (!S.bp) return;
  S.editing = true; S.note = ''; S.error = '';
  paint();
  document.getElementById(idOf.firstName)?.focus();
}
export function cancelBillingDetails() {
  S.editing = false; S.error = '';
  paint();
}

/** The new details into the cached ping (billingProfile), so Licensing and the registrant read them with no second ping. */
export function rememberBillingProfile(fields) {
  try {
    const p = JSON.parse(sessionStorage.getItem(PING_KEY) || 'null');
    if (!p || !p.billingProfile) return;
    p.billingProfile = { ...p.billingProfile, ...fields };
    sessionStorage.setItem(PING_KEY, JSON.stringify(p));
  } catch { /* the next ping carries them */ }
}

function markField(field) {
  for (const [, id] of FIELDS) document.getElementById(id)?.removeAttribute('aria-invalid');
  const el = field ? document.getElementById(idOf[field]) : null;
  if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
}
function showErr(text) { S.error = text || ''; const el = document.getElementById('bdError'); if (el) { el.textContent = S.error; el.hidden = !S.error; } }
function refusalOf(ex) {
  if (ex?.sessionInvalidated) return '';
  if (ex instanceof TypeError) return 'Could not reach the API. Check that you are online.';
  if (ex?.status === 401) return 'Your session is no longer valid. Sign in again.';
  if (ex?.status === 404 && !ex?.data?.code) return 'Billing details cannot be changed here yet. Try again later.';
  if (ex?.data?.error) return String(ex.data.error);
  return 'Your billing details could not be saved. Try again.';
}

/** Save: every field held and Cancel held while the request is out, the button saying so (standing rule c). */
export async function saveBillingDetails(btn, { apiFetch, url }) {
  if (!btn || btn.disabled || !S.bp) return;
  const typed = {};
  for (const [k, id] of FIELDS) typed[k] = document.getElementById(id)?.value ?? '';
  showErr(''); markField('');
  const checked = checkDetails(typed);
  if (checked.error) { showErr(checked.error); markField(checked.field); return; }
  const fields = FIELDS.map(([, id]) => document.getElementById(id)).filter(Boolean);
  const cancel = document.querySelector('[data-acct-action="bd-cancel"]');
  const done = busy(btn, 'Saving…', { hold: [...fields, cancel].filter(Boolean), why: 'Wait for your billing details being saved' });
  let answer = null, failed = null;
  try { answer = await apiFetch(url, { method: 'PUT', body: JSON.stringify(checked.value) }); }
  catch (ex) { failed = ex; }
  finally { done(); }
  if (!btn.isConnected) return;
  if (failed) {
    showErr(refusalOf(failed));
    if (failed?.data?.field) markField(failed.data.field);
    return;
  }
  const saved = profileOf(answer?.billingProfile || { ...checked.value, customerName: `${checked.value.firstName} ${checked.value.lastName}` });
  S.bp = saved; S.editing = false; S.error = '';
  S.note = answer?.unchanged ? 'These are already your billing details.' : 'Saved. Invoices from now on use these details; invoices already issued keep theirs.';
  rememberBillingProfile(saved);
  paint();
}
