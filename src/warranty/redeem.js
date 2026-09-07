// src/warranty/redeem.js
// Case-replacement redemption, the warranty page's part of it: identify the
// registration (code + the email it was registered under, or the signed-in
// account) and check eligibility. Everything after that is the site's ONE
// checkout (src/shop/checkout.js in redemption mode): the same summary,
// details, live rates and payment every order uses, then the new card code on
// the confirmation. Nothing here touches Stripe.
//
// Amounts and eligibility here are display only. The backend re-checks
// eligibility, quotes shipping itself, and only the Stripe webhook engages the
// redemption.
import { PRAG_API_BASE } from '../runtime/config.js';
import { getProduct } from '../shop/products.js';

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
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso; }
}

let $root = null;
// Mount generation: every mount, cancel, and reset bumps it, and every async
// continuation compares its captured value, so a tab-switch round trip can
// never resurrect stale in-flight work into the fresh view.
let epoch = 0;
const isLive = (e) => e === epoch && !!$root;

const state = {
  step: 'identify',      // identify | locked
  code: '', email: '',
  locked: null,
  busy: false, error: ''
};

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
  const signedIn = isSignedIn();
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

function render() {
  if (!$root) return;
  $root.innerHTML = state.step === 'locked' ? lockedHtml(state.locked || {}) : identifyHtml();
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

// Eligible: hand the registration to the site's checkout in redemption mode.
// Locked: say when the next one unlocks, here on the warranty page.
async function doCheck() {
  const data = await post('/warranty/redeem/check', { code: state.code, email: state.email });
  if (!data.eligible) {
    state.step = 'locked';
    state.locked = { reason: data.reason, nextEligibleAt: data.nextEligibleAt };
    return;
  }
  const productId = data.productId || 'omnisource';
  const product = getProduct(productId);
  window.pragStartRedemptionCheckout?.({
    code: state.code,
    email: state.email || pingEmail(),
    productId,
    productName: product?.name || 'OmniSource',
    registrationId: data.registrationId || ''
  });
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

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('input', (e) => {
    if (e.target.closest('#rdCode')) e.target.value = formatCode(e.target.value);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rd-action]');
    if (!btn || !$root || !$root.contains(btn)) return;
    const action = btn.dataset.rdAction;
    if (action === 'restart') { resetRedeem(); render(); return; }
    if (action === 'check') {
      const code = formatCode($root.querySelector('#rdCode')?.value);
      const email = $root.querySelector('#rdEmail')?.value?.trim() || '';
      if (codeLen(code) < 8) { state.error = 'Enter the full code, XXXX-XXXX.'; render(); return; }
      // A signed-in owner proves by account, so the email is optional. A guest
      // must supply the registered email.
      if (!isSignedIn() && !isEmail(email)) { state.error = 'Enter the email you registered with.'; render(); return; }
      state.code = code; state.email = email;
      run(doCheck);
    }
  });
}

function resetRedeem() {
  epoch++;               // invalidates any in-flight continuation
  state.step = 'identify';
  state.busy = false; state.error = ''; state.locked = null;
  // A "Redeem" click from My Products drops the code here so it pre-fills.
  state.code = '';
  try {
    const pre = sessionStorage.getItem('pragoptics_redeem_prefill');
    if (pre) { state.code = pre; sessionStorage.removeItem('pragoptics_redeem_prefill'); }
  } catch {}
}

/** Mount the redemption entry into the warranty body. */
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
