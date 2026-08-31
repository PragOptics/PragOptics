// src/warranty/redeem.js
// Case-replacement redemption: the customer-facing side of the lifetime
// warranty. No account required: the registered code plus the email it was
// registered under proves ownership. One redemption per year per owner; the
// year starts when a redemption is engaged (paid), and each redemption ships
// a new case with a new warranty card, physical and digital.
//
// Steps: identify (code + email) -> eligibility -> address -> live rates ->
// pay shipping (Stripe Elements) -> engaged: the new digital card code is
// shown, and the platform offer (tier cards) follows.
//
// Amounts here are display only. The backend re-checks eligibility, quotes
// shipping itself, and only the Stripe webhook engages the redemption.

import { PRAG_API_BASE } from '../runtime/config.js';
import { getProduct } from '../shop/products.js';
import { tierCardsHtml, bindTierCards } from '../components/tierCards.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

function formatCode(raw) {
  const clean = String(raw || '').toUpperCase().split('')
    .filter(c => CODE_ALPHABET.includes(c)).slice(0, 8).join('');
  return clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean;
}
function codeLen(v) {
  return String(v || '').toUpperCase().split('').filter(c => CODE_ALPHABET.includes(c)).length;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}
function friendlyError(err, fallback) {
  const m = err?.message || '';
  if (err instanceof TypeError || /fetch/i.test(m)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return m || fallback;
}
function fmtUSD(cents) {
  return (cents % 100 === 0) ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso; }
}

let $root = null;
// Mount generation, not a boolean: every mount, cancel, and reset bumps it,
// and every async continuation compares its captured value, so a tab-switch
// round trip can never resurrect stale in-flight work into the fresh view.
let epoch = 0;
const isLive = (e) => e === epoch && !!$root;

const state = {
  step: 'identify',      // identify | address | rates | payment | engaged
  code: '', email: '',
  productId: '',
  address: { name: '', street1: '', street2: '', city: '', state: '', zip: '' },
  rates: [], rateId: null,
  redemption: null,       // { redemptionId, orderId, clientSecret, breakdown }
  newCode: '',
  busy: false, error: ''
};

let stripe = null, elements = null;

function getAccessToken() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || null; }
  catch { return null; }
}
function isSignedIn() { return !!getAccessToken(); }
function pingEmail() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null')?.user?.email || ''; }
  catch { return ''; }
}

/* ====================================================== render ============ */

function errorHtml() {
  return state.error ? `<div class="co-error" role="alert">${esc(state.error)}</div>` : '';
}

function identifyHtml() {
  const signedIn = !!getAccessToken();
  const emailVal = state.email || (signedIn ? pingEmail() : '');
  return `
    <div class="wr-step wr-redeem" data-wr-step="redeem-identify">
      <p class="wr-thanks-sub">Your case is covered for life. Enter the code from your registered
      warranty card${signedIn ? '' : ' and the email you registered it with'}. One redemption per year;
      a new case and a new card ship to you, and shipping is on you.</p>
      ${signedIn ? `<div class="wr-signedin"><span class="wr-signedin-ico" aria-hidden="true">✓</span>
        <span>Signed in: any device on your account, no need to match the exact email.</span></div>` : ''}
      <div class="wr-fields">
        <div class="form-field">
          <label for="rdCode">Warranty code</label>
          <input id="rdCode" type="text" inputmode="text" autocomplete="off" spellcheck="false"
                 maxlength="9" placeholder="XXXX-XXXX" value="${esc(state.code)}">
        </div>
        <div class="form-field">
          <label for="rdEmail">${signedIn ? 'Email <span class="wr-optional">(if registered under another address)</span>' : 'Registered email'}</label>
          <input id="rdEmail" type="email" autocomplete="email" placeholder="you@company.com" value="${esc(emailVal)}">
        </div>
      </div>
      ${errorHtml()}
      <div class="co-actions">
        <button class="cta" type="button" data-rd-action="check" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Checking…' : 'Check my redemption'}
        </button>
      </div>
    </div>
  `;
}

function lockedHtml({ reason, nextEligibleAt }) {
  return `
    <div class="wr-step wr-redeem" data-wr-step="redeem-locked">
      <p class="wr-thanks-sub">${esc(reason || 'Not eligible yet.')}</p>
      ${nextEligibleAt ? `<p class="wr-redeem-unlock">Next redemption unlocks <strong>${esc(fmtDate(nextEligibleAt))}</strong>.</p>` : ''}
      <div class="co-actions">
        <button class="btn" type="button" data-rd-action="restart">Back</button>
      </div>
    </div>
  `;
}

function addressHtml() {
  const p = getProduct(state.productId);
  return `
    <div class="wr-step wr-redeem" data-wr-step="redeem-address">
      <div class="wr-code-chip">
        <span class="wr-chip-device">${esc(p?.name || 'Your device')}</span>
        <code class="wr-chip-code">${esc(state.code)}</code>
      </div>
      <p class="wr-contact-lede">You are eligible. Where does the replacement case ship?</p>
      <div class="wr-fields">
        <div class="form-field">
          <label for="rdName">Name</label>
          <input id="rdName" type="text" autocomplete="name" placeholder="Full name" value="${esc(state.address.name)}">
        </div>
        <div class="form-field">
          <label for="rdStreet1">Street address</label>
          <input id="rdStreet1" type="text" autocomplete="address-line1" placeholder="Street address" value="${esc(state.address.street1)}">
        </div>
        <div class="form-field">
          <label for="rdStreet2">Apt, suite, unit <span class="wr-optional">optional</span></label>
          <input id="rdStreet2" type="text" autocomplete="address-line2" value="${esc(state.address.street2)}">
        </div>
      </div>
      <div class="co-field-row">
        <div class="form-field"><label for="rdCity">City</label>
          <input id="rdCity" type="text" autocomplete="address-level2" placeholder="City" value="${esc(state.address.city)}"></div>
        <div class="form-field co-field-sm"><label for="rdState">State</label>
          <input id="rdState" type="text" maxlength="2" autocomplete="address-level1" placeholder="TX" value="${esc(state.address.state)}"></div>
        <div class="form-field co-field-sm"><label for="rdZip">ZIP</label>
          <input id="rdZip" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="77001" value="${esc(state.address.zip)}"></div>
      </div>
      ${errorHtml()}
      <div class="co-actions">
        <button class="cta" type="button" data-rd-action="rates" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Working…' : 'Get shipping rates'}
        </button>
        <button class="btn" type="button" data-rd-action="restart" ${state.busy ? 'disabled' : ''}>Back</button>
      </div>
    </div>
  `;
}

function ratesHtml() {
  return `
    <div class="wr-step wr-redeem" data-wr-step="redeem-rates">
      <p class="wr-contact-lede">Live rates to ${esc(state.address.city)}, ${esc(state.address.state)} ${esc(state.address.zip)}. Shipping is the only charge.</p>
      <div class="co-rates" role="radiogroup" aria-label="Shipping options">
        ${state.rates.map((r, i) => `
          <label class="co-rate ${state.rateId === r.id ? 'is-selected' : ''}">
            <input type="radio" name="rdRate" value="${esc(r.id)}" ${state.rateId === r.id || (!state.rateId && i === 0) ? 'checked' : ''}>
            <span class="co-rate-main">
              <strong>${esc(r.carrier)} ${esc(r.service)}</strong>
              <span class="muted">${r.estDays != null ? `about ${r.estDays} day${r.estDays === 1 ? '' : 's'}` : 'transit time varies'}</span>
            </span>
            <span class="co-rate-price">${fmtUSD(Math.round(r.amount * 100))}</span>
          </label>
        `).join('')}
      </div>
      ${errorHtml()}
      <div class="co-actions">
        <button class="cta" type="button" data-rd-action="pay" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Working…' : 'Continue to payment'}
        </button>
        <button class="btn" type="button" data-rd-action="back-address" ${state.busy ? 'disabled' : ''}>Back</button>
      </div>
    </div>
  `;
}

function paymentHtml() {
  const bd = state.redemption.breakdown;
  return `
    <div class="wr-step wr-redeem" data-wr-step="redeem-payment">
      <div class="co-breakdown">
        <div class="co-sumrow"><span>Replacement case</span><span>$0</span></div>
        <div class="co-sumrow"><span>Shipping</span><span>${fmtUSD(bd.shippingCents)}</span></div>
        <div class="co-sumrow co-sumrow-total"><span>Total</span><span>${fmtUSD(bd.totalCents)}</span></div>
      </div>
      <div id="rdPaymentEl" class="co-payment-el"><!-- Stripe Payment Element --></div>
      ${errorHtml()}
      <div class="co-actions">
        <button class="cta" type="button" data-rd-action="confirm" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Processing…' : `Pay ${fmtUSD(bd.totalCents)} shipping`}
        </button>
      </div>
      <p class="co-privacy muted">Payment is processed by Stripe. Card details never touch PragOptics servers.</p>
    </div>
  `;
}

function engagedHtml() {
  const p = getProduct(state.productId);
  return `
    <div class="wr-step wr-step-done wr-redeem" data-wr-step="redeem-done">
      <span class="wr-done-badge">✓</span>
      <span class="wr-thanks-big">Redemption engaged.</span>
      <p class="wr-thanks-sub">Your replacement <strong>${esc(p?.name || '')} case</strong> is on its way,
      with a new printed warranty card inside. Here is your digital copy of the new code:</p>
      ${state.newCode
        ? `<code class="wr-chip-code wr-newcode">${esc(state.newCode)}</code>
           <p class="wr-done-hint">Register this new card when the case arrives. That keeps your lifetime
           coverage active for the next redemption. We emailed it to <strong>${esc(state.email)}</strong> too.</p>`
        : `<p class="wr-done-hint">Payment is settling. Your new card code lands at
           <strong>${esc(state.email)}</strong> within a few minutes, and a printed copy ships in the case.</p>`}
      <div class="wr-done-actions">
        <button class="btn" type="button" data-rd-action="restart">Done</button>
      </div>
      ${tierCardsHtml({
        heading: 'While the case is in the mail',
        sub: 'Your warranty never needs an account. The platform is here when you want it.'
      })}
    </div>
  `;
}

function render() {
  if (!$root) return;
  const views = {
    identify: identifyHtml,
    address: addressHtml,
    rates: ratesHtml,
    payment: paymentHtml,
    engaged: engagedHtml
  };
  if (state.step === 'locked') {
    $root.innerHTML = lockedHtml(state.locked || {});
    return;
  }
  $root.innerHTML = (views[state.step] || identifyHtml)();
  if (state.step === 'payment') mountPaymentElement();
  if (state.step === 'engaged') bindTierCards($root);
}

/* ====================================================== api ============ */

async function post(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PRAG_API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Request failed.');
    e.nextEligibleAt = data.nextEligibleAt || '';
    throw e;
  }
  return data;
}

async function doCheck() {
  const data = await post('/warranty/redeem/check', { code: state.code, email: state.email });
  if (!data.eligible) {
    state.step = 'locked';
    state.locked = { reason: data.reason, nextEligibleAt: data.nextEligibleAt };
    return;
  }
  state.productId = data.productId || 'omnisource';
  state.step = 'address';
}

async function doRates() {
  const res = await fetch(`${PRAG_API_BASE}/shipping/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: { ...state.address, country: 'US', email: state.email },
      items: [{ id: `${state.productId}-case`, qty: 1 }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not get shipping rates.');
  if (!Array.isArray(data.rates) || !data.rates.length) {
    throw new Error('No shipping rates for that address. Check it and try again.');
  }
  state.rates = data.rates;
  state.rateId = data.rates[0]?.id || null;
  state.step = 'rates';
}

async function doStart() {
  const chosen = state.rates.find(r => r.id === state.rateId);
  state.redemption = await post('/warranty/redeem', {
    code: state.code,
    email: state.email,
    shipTo: { ...state.address, country: 'US' },
    rate: { carrier: chosen?.carrier || '', service: chosen?.service || '' }
  });
  state.step = 'payment';
}

function mountPaymentElement() {
  const holder = document.getElementById('rdPaymentEl');
  if (!holder || !state.redemption?.clientSecret) return;
  if (typeof window.Stripe !== 'function') {
    state.error = 'Payment library failed to load. Refresh and try again.';
    state.redemption = null; elements = null;
    state.step = 'rates';
    render();
    return;
  }
  if (!stripe) stripe = window.Stripe(window.STRIPE_PUBLISHABLE_KEY);
  elements = stripe.elements({
    clientSecret: state.redemption.clientSecret,
    appearance: { theme: 'night', variables: { colorPrimary: '#7dd3fc', borderRadius: '10px' } }
  });
  elements.create('payment').mount(holder);
}

// Confirm is deliberately NOT routed through run(): run() re-renders before
// acting, which would remount the Payment Element and wipe the card the
// customer just typed. The button is updated in place instead, and render()
// only runs once there is a result.
async function doConfirm() {
  if (state.busy || !stripe || !elements) return;
  const e = epoch;
  state.busy = true; state.error = '';
  const btn = $root?.querySelector('[data-rd-action="confirm"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  let error, paymentIntent;
  try {
    ({ error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + window.location.pathname },
      redirect: 'if_required'
    }));
  } catch (err) {
    error = { message: friendlyError(err, 'Payment failed. Try again.') };
  } finally {
    state.busy = false;
  }
  if (!isLive(e)) return;

  if (error) {
    // render() rebuilds the payment step and remounts the element itself.
    state.error = error.message || 'Payment failed. Try another card.';
    elements = null;
    render();
    return;
  }
  if (!paymentIntent || (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing')) {
    state.error = 'Payment did not complete. Try again.';
    elements = null;
    render();
    return;
  }
  // Engaged pending settlement: poll for the webhook-minted new code.
  state.step = 'engaged';
  state.newCode = '';
  render();
  for (let i = 0; i < 6 && isLive(e); i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (!isLive(e)) return;
    try {
      const token = getAccessToken();
      const res = await fetch(
        `${PRAG_API_BASE}/warranty/redemption?id=${encodeURIComponent(state.redemption.redemptionId)}&email=${encodeURIComponent(state.email || '')}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      const data = await res.json().catch(() => ({}));
      if (!isLive(e)) return;
      if (res.ok && data.status === 'ENGAGED' && data.newCode) {
        state.newCode = data.newCode;
        render();
        return;
      }
    } catch { /* keep polling */ }
  }
}

/* ====================================================== wiring ============ */

async function run(action) {
  if (state.busy) return;
  const e = epoch;
  state.busy = true; state.error = ''; render();
  try {
    await action();
  } catch (err) {
    if (!isLive(e)) return;
    state.error = friendlyError(err, 'Something went wrong. Try again.');
    if (err.nextEligibleAt) {
      state.step = 'locked';
      state.locked = { reason: err.message, nextEligibleAt: err.nextEligibleAt };
      state.error = '';
    }
  }
  if (!isLive(e)) return;
  state.busy = false;
  render();
}

function readAddress() {
  const g = id => $root.querySelector('#' + id)?.value?.trim() || '';
  state.address = {
    name: g('rdName'), street1: g('rdStreet1'), street2: g('rdStreet2'),
    city: g('rdCity'), state: g('rdState').toUpperCase(), zip: g('rdZip')
  };
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('input', (e) => {
    if (e.target.closest('#rdCode')) e.target.value = formatCode(e.target.value);
  });

  document.addEventListener('change', (e) => {
    const radio = e.target.closest('input[name="rdRate"]');
    if (radio) {
      state.rateId = radio.value;
      document.querySelectorAll('[data-wr-step="redeem-rates"] .co-rate').forEach(el =>
        el.classList.toggle('is-selected', el.contains(radio)));
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rd-action]');
    if (!btn || !$root || !$root.contains(btn)) return;
    const action = btn.dataset.rdAction;

    if (action === 'restart') {
      resetRedeem();
      render();
      return;
    }
    if (action === 'check') {
      const code = formatCode($root.querySelector('#rdCode')?.value);
      const email = $root.querySelector('#rdEmail')?.value?.trim() || '';
      if (codeLen(code) < 8) { state.error = 'Enter the full code, XXXX-XXXX.'; render(); return; }
      // A signed-in owner proves by account, so the email is optional. A guest
      // must supply the registered email.
      if (!isSignedIn() && !isEmail(email)) { state.error = 'Enter the email you registered with.'; render(); return; }
      state.code = code; state.email = email;
      run(doCheck);
      return;
    }
    if (action === 'rates') {
      readAddress();
      const a = state.address;
      if (!a.street1 || !a.city || !a.state || !a.zip) {
        state.error = 'Street, city, state, and ZIP are required.'; render(); return;
      }
      run(doRates);
      return;
    }
    if (action === 'back-address') { state.step = 'address'; state.error = ''; render(); return; }
    if (action === 'pay') { run(doStart); return; }
    if (action === 'confirm') { doConfirm(); return; } // NOT run(): see doConfirm
  });
}

function resetRedeem() {
  epoch++;               // invalidates any in-flight continuation
  state.step = 'identify';
  state.productId = '';
  state.rates = []; state.rateId = null;
  state.redemption = null; state.newCode = '';
  state.busy = false; state.error = ''; state.locked = null;
  elements = null;
  // A "Redeem" click from My Products drops the code here so it pre-fills.
  state.code = '';
  try {
    const pre = sessionStorage.getItem('pragoptics_redeem_prefill');
    if (pre) { state.code = pre; sessionStorage.removeItem('pragoptics_redeem_prefill'); }
  } catch {}
}

/** Mount the redemption flow into the warranty body. */
export function renderRedeem(root) {
  $root = root;
  bindOnce();
  resetRedeem();
  render();
}

/** Leaving the tab: stop in-flight work from painting a dead view. */
export function cancelRedeem() {
  epoch++;
  $root = null;
}
