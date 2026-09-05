// src/shop/checkout.js
// Real checkout: review -> details -> shipping rates -> card payment.
//
// Amounts are decorative here; the backend re-prices every line and fetches
// the shipping rate itself, so nothing this file sends can change what Stripe
// charges. Payment is Stripe Elements against a PaymentIntent minted by
// POST /orders/checkout, and the order only becomes PAID when the Stripe
// webhook says so.
//
// Gating: full checkout runs when SHOP_LIVE is on, or always on the dev lane
// so it can be tested end to end against sandbox Stripe before launch.

import { lines, subtotal, removeItem, subscribe } from './cart.js';
import { formatPrice, ALL_PRODUCTS, SHOP_LIVE } from './products.js';
import { LANE, PRAG_API_BASE } from '../runtime/config.js';

const CHECKOUT_ENABLED = SHOP_LIVE || LANE === 'dev';

let $view, $host;

// Flow state. Contact and address survive Back/retry; everything else resets
// each time the customer enters checkout.
const state = {
  step: 'details',              // details | rates | payment | done
  contact: { email: '', name: '' },
  address: { street1: '', street2: '', city: '', state: '', zip: '' },
  rates: [],
  rateId: null,
  order: null,                  // { orderId, clientSecret, breakdown }
  busy: false,
  error: ''
};

let stripe = null;              // Stripe.js instance, created on first payment step
let elements = null;            // Stripe Elements bound to the current clientSecret

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Network-level failures surface as TypeError("Failed to fetch"), which means
// nothing to a customer. Backend messages pass through as-is.
function friendlyError(err, fallback) {
  const m = err?.message || '';
  if (err instanceof TypeError || /fetch/i.test(m)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return m || fallback;
}

function getAccessToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null');
    return t?.access_token || null;
  } catch { return null; }
}

function pingEmail() {
  try {
    const p = JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null');
    return p?.user?.email || '';
  } catch { return ''; }
}

// Physical = ships now. Donations never ship; a preorder is a deposit whose
// shipping rides on the balance at fulfillment (mirrors the backend).
function physicalLines(ls) {
  return ls.filter(l => !l.isDonation && !l.isPreorder);
}

// Free shipping: physical subtotal at or above the threshold ships free with
// the lowest-cost service in the quote. Faster services stay full price. The
// display here MIRRORS the rule; the server decides it authoritatively from
// its own re-quote at checkout.
const FREE_SHIPPING_MIN_CENTS = 5000; // $50
function physicalSubtotalCents(ls) {
  return physicalLines(ls).reduce((n, l) => n + (l.lineCents || 0), 0);
}
function freeShipEligible(ls) {
  return physicalSubtotalCents(ls) >= FREE_SHIPPING_MIN_CENTS;
}

// Cart lines in the backend's wire shape.
function wireLines(ls) {
  return ls.map(l => ({
    productId: l.productId,
    variantId: l.variantId,
    qty: l.qty,
    ...(l.isDonation ? { donationCents: l.unitCents } : {})
  }));
}

// After a successful payment, remove exactly the lines that were on the paid
// order (snapshotted when the order was created). Anything the customer added
// to the cart afterwards survives.
function consumeOrderedLines() {
  for (const l of state.orderedLines || []) {
    removeItem(l.productId, l.variantId);
  }
  state.orderedLines = [];
}

/* ======================================================
   SHARED FRAGMENTS
   ====================================================== */

function lineHtml(l) {
  const p = l.product;
  const v = l.variant;
  const unit = l.unitCents != null ? formatPrice(l.unitCents) : 'Reserve';
  const total = l.lineCents != null ? formatPrice(l.lineCents) : 'Reserve';
  return `
    <div class="co-line">
      <div class="co-line-name">
        <strong>${escapeHtml(p.name)}</strong>
        ${l.isDonation ? '<span class="muted"> · donation ♥</span>' : v ? `<span class="muted"> · ${escapeHtml(v.name)}</span>` : ''}
      </div>
      <div class="co-line-qty">× ${l.qty}</div>
      <div class="co-line-price muted">${escapeHtml(unit)}</div>
      <div class="co-line-total">${escapeHtml(total)}</div>
    </div>
  `;
}

function summaryHtml(ls) {
  const sub = subtotal();
  const subLabel = sub == null ? 'Pricing at checkout' : formatPrice(sub);
  const hasPreorder = ls.some(l => l.isPreorder);
  const shippingLine = state.order
    ? `<div class="co-sumrow"><span>Shipping</span><span>${state.order.breakdown.freeShipping ? 'Free' : formatPrice(state.order.breakdown.shippingCents)}</span></div>`
    : physicalLines(ls).length
      ? `<div class="co-sumrow muted"><span>Shipping</span><span>${freeShipEligible(ls) ? 'free at the lowest rate' : 'calculated next'}</span></div>`
      : '';
  const totalLabel = state.order ? formatPrice(state.order.breakdown.totalCents) : subLabel;
  return `
    <section class="co-summary">
      <h2 class="co-h2">Your order</h2>
      <div class="co-lines">${ls.map(lineHtml).join('')}</div>
      ${shippingLine}
      <div class="co-totals">
        <span class="co-totals-lbl">${state.order ? 'Total' : 'Subtotal'}</span>
        <span class="co-totals-val">${escapeHtml(totalLabel)}</span>
      </div>
      ${hasPreorder ? `<p class="muted co-note">Preorder deposits reserve your unit. The balance, plus shipping, is due when it ships, and the deposit is fully refundable until then.</p>` : ''}
    </section>
  `;
}

function stepperHtml(ls) {
  const needsShipping = physicalLines(ls).length > 0;
  const steps = needsShipping
    ? [['details', 'Details'], ['rates', 'Shipping'], ['payment', 'Payment']]
    : [['details', 'Details'], ['payment', 'Payment']];
  const idx = steps.findIndex(s => s[0] === state.step);
  return `
    <ol class="co-steps" aria-label="Checkout progress">
      ${steps.map(([id, label], i) => `
        <li class="co-step ${i < idx ? 'is-done' : ''} ${id === state.step ? 'is-current' : ''}">
          <span class="co-step-dot">${i < idx ? '✓' : i + 1}</span>${label}
        </li>
      `).join('')}
    </ol>
  `;
}

function errorHtml() {
  return state.error
    ? `<div class="co-error" role="alert">${escapeHtml(state.error)}</div>`
    : '';
}

/* ======================================================
   STEP: DETAILS
   ====================================================== */

function detailsHtml(ls) {
  const needsShipping = physicalLines(ls).length > 0;
  const signedIn = !!getAccessToken();
  const email = state.contact.email || pingEmail();
  return `
    <form class="co-form" id="coDetailsForm" novalidate>
      ${stepperHtml(ls)}
      <h2 class="co-h2">${needsShipping ? 'Contact and shipping' : 'Your details'}</h2>

      ${signedIn ? `
        <div class="co-signedin">
          <span class="co-signedin-icon" aria-hidden="true">✓</span>
          <span>Signed in: this order will link to your PragOptics account.</span>
        </div>
      ` : `
        <div class="co-signin-prompt">
          <span>Already have a PragOptics account?</span>
          <button class="co-signin-link" type="button" data-co-signin>Sign in</button>
        </div>
      `}

      <div class="co-field">
        <label for="co-email">Email <span class="req">*</span></label>
        <input id="co-email" name="email" type="email" required autocomplete="email"
               placeholder="you@company.com" value="${escapeHtml(email)}">
      </div>
      <div class="co-field">
        <label for="co-name">Name <span class="req">*</span></label>
        <input id="co-name" name="name" type="text" required autocomplete="name"
               placeholder="Full name" value="${escapeHtml(state.contact.name)}">
      </div>

      ${needsShipping ? `
        <div class="co-field">
          <label for="co-street1">Street address <span class="req">*</span></label>
          <input id="co-street1" name="street1" type="text" required autocomplete="address-line1"
                 placeholder="Street address" value="${escapeHtml(state.address.street1)}">
        </div>
        <div class="co-field">
          <label for="co-street2">Apt, suite, unit <span class="muted">(optional)</span></label>
          <input id="co-street2" name="street2" type="text" autocomplete="address-line2"
                 placeholder="Apt, suite, unit" value="${escapeHtml(state.address.street2)}">
        </div>
        <div class="co-field-row">
          <div class="co-field">
            <label for="co-city">City <span class="req">*</span></label>
            <input id="co-city" name="city" type="text" required autocomplete="address-level2"
                   placeholder="City" value="${escapeHtml(state.address.city)}">
          </div>
          <div class="co-field co-field-sm">
            <label for="co-state">State <span class="req">*</span></label>
            <input id="co-state" name="state" type="text" required autocomplete="address-level1"
                   maxlength="2" placeholder="TX" value="${escapeHtml(state.address.state)}">
          </div>
          <div class="co-field co-field-sm">
            <label for="co-zip">ZIP <span class="req">*</span></label>
            <input id="co-zip" name="zip" type="text" required autocomplete="postal-code"
                   inputmode="numeric" placeholder="77001" value="${escapeHtml(state.address.zip)}">
          </div>
        </div>
        <p class="muted co-note">US shipping for now. International is coming; email support@bridgesindust.com and we will quote it by hand. <a href="#" data-legal="shipping">Shipping policy</a></p>
      ` : ''}

      ${errorHtml()}

      <div class="co-actions">
        <button class="ph-btn" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Working…' : needsShipping ? 'Get shipping rates' : 'Continue to payment'}
        </button>
        <button class="ph-btn ph-btn-ghost" type="button" data-co-cancel>Back to shop</button>
      </div>
      <p class="co-privacy muted">
        We use your details to process this order and keep you updated on it.
        See our <a href="/docs/#doc=PragOptics-Privacy.md">privacy policy</a>.
      </p>
    </form>
  `;
}

/* ======================================================
   STEP: RATES
   ====================================================== */

function ratesHtml(ls) {
  const free = freeShipEligible(ls);
  return `
    <form class="co-form" id="coRatesForm" novalidate>
      ${stepperHtml(ls)}
      <h2 class="co-h2">Choose shipping</h2>
      <p class="muted co-note">Live rates to ${escapeHtml(state.address.city)}, ${escapeHtml(state.address.state)} ${escapeHtml(state.address.zip)}.${free
        ? ' Your order is $50 or more, so the lowest-cost service ships free; faster services are yours at their listed price.' : ''}</p>

      <div class="co-rates" role="radiogroup" aria-label="Shipping options">
        ${state.rates.map((r, i) => `
          <label class="co-rate ${state.rateId === r.id ? 'is-selected' : ''}">
            <input type="radio" name="rate" value="${escapeHtml(r.id)}" ${state.rateId === r.id || (!state.rateId && i === 0) ? 'checked' : ''}>
            <span class="co-rate-main">
              <strong>${escapeHtml(r.carrier)} ${escapeHtml(r.service)}</strong>
              <span class="muted">${r.estDays != null ? `about ${r.estDays} day${r.estDays === 1 ? '' : 's'}` : 'transit time varies'}</span>
            </span>
            <span class="co-rate-price">${free && i === 0
              ? `<s class="muted">${formatPrice(Math.round(r.amount * 100))}</s><span class="co-free">Free</span>`
              : formatPrice(Math.round(r.amount * 100))}</span>
          </label>
        `).join('')}
      </div>

      ${errorHtml()}

      <div class="co-actions">
        <button class="ph-btn" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Working…' : 'Continue to payment'}
        </button>
        <button class="ph-btn ph-btn-ghost" type="button" data-co-back>Back</button>
      </div>
    </form>
  `;
}

/* ======================================================
   STEP: PAYMENT
   ====================================================== */

function paymentHtml(ls) {
  const bd = state.order.breakdown;
  return `
    <div class="co-form" id="coPaymentPane">
      ${stepperHtml(ls)}
      <h2 class="co-h2">Payment</h2>

      ${state.order.linked === false && !!getAccessToken()
        ? `<p class="muted co-note">Your sign-in expired while checking out, so this order will not appear in your account's Orders section. Your receipt and tracking arrive by email either way.</p>`
        : ''}
      <div class="co-breakdown">
        <div class="co-sumrow"><span>Items</span><span>${formatPrice(bd.goodsCents)}</span></div>
        ${bd.shippingCents ? `<div class="co-sumrow"><span>Shipping</span><span>${formatPrice(bd.shippingCents)}</span></div>`
          : bd.freeShipping ? `<div class="co-sumrow"><span>Shipping</span><span>Free</span></div>` : ''}
        <div class="co-sumrow co-sumrow-total"><span>Total</span><span>${formatPrice(bd.totalCents)}</span></div>
      </div>

      <div id="coPaymentEl" class="co-payment-el"><!-- Stripe Payment Element mounts here --></div>

      ${errorHtml()}

      <div class="co-actions">
        <button class="ph-btn" type="button" id="coPayBtn" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Processing…' : `Pay ${formatPrice(bd.totalCents)}`}
        </button>
        <button class="ph-btn ph-btn-ghost" type="button" data-co-back ${state.busy ? 'disabled' : ''}>Back</button>
      </div>
      <p class="co-privacy muted">
        Payment is processed by Stripe. Card details never touch PragOptics servers.
      </p>
    </div>
  `;
}

async function mountPaymentElement() {
  const holder = document.getElementById('coPaymentEl');
  if (!holder || !state.order?.clientSecret) return;
  if (typeof window.Stripe !== 'function') {
    // Step back rather than re-rendering the payment step: render() on the
    // payment step calls this function, so erroring in place would recurse.
    state.error = 'Payment library failed to load. Refresh and try again.';
    state.order = null;
    elements = null;
    state.step = state.rates.length ? 'rates' : 'details';
    render();
    return;
  }
  if (!stripe) stripe = window.Stripe(window.STRIPE_PUBLISHABLE_KEY);
  elements = stripe.elements({
    clientSecret: state.order.clientSecret,
    appearance: {
      theme: 'night',
      variables: { colorPrimary: '#7dd3fc', borderRadius: '10px' }
    }
  });
  elements.create('payment').mount(holder);
}

async function submitPayment() {
  if (state.busy || !stripe || !elements) return;
  state.busy = true; state.error = '';
  const btn = document.getElementById('coPayBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  // confirmPayment can throw (not just resolve with .error); a throw must
  // never strand busy=true or the payment step deadlocks.
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

  if (error) {
    // render() re-creates the payment step and remounts the element itself;
    // calling mountPaymentElement() here as well would double-mount it.
    state.error = error.message || 'Payment failed. Try another card.';
    render();
    return;
  }
  if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
    state.step = 'done';
    state.processing = paymentIntent.status === 'processing';
    // Remove exactly what was ordered. clear() would also wipe anything the
    // customer added to the cart after this order was created.
    consumeOrderedLines();
    render();
    return;
  }
  state.error = 'Payment did not complete. Try again.';
  render();
}

/* ======================================================
   STEP: DONE
   ====================================================== */

function doneHtml() {
  const orderId = state.order?.orderId || '';
  const shortId = orderId.slice(0, 8).toUpperCase();
  return `
    <div class="co-confirm">
      <div class="co-check" aria-hidden="true">✓</div>
      <h1 class="co-title">${state.processing ? 'Payment processing' : 'Order confirmed'}</h1>
      <p>
        ${state.processing
          ? `Your payment is processing. We'll email <strong>${escapeHtml(state.contact.email)}</strong> as soon as it settles.`
          : `Thanks! A receipt is on its way to <strong>${escapeHtml(state.contact.email)}</strong>.`}
      </p>
      <p class="muted">Order reference: <code>${escapeHtml(shortId)}</code></p>
      ${getAccessToken()
        ? `<p class="muted">This order is saved to your account. Track it under Orders.</p>`
        : `<p class="muted">Want to track this order and keep its history? Create an account with
           <strong>${escapeHtml(state.contact.email)}</strong> and it links to you automatically once the address is verified.</p>`}
      <div class="co-empty-actions">
        ${getAccessToken()
          ? `<button class="ph-btn" type="button" onclick="window.pragOrderToAccount?.()">View in your account</button>`
          : `<button class="ph-btn" type="button" onclick="window.pragAccountForOrder?.()">Create an account to track this order</button>`}
        <button class="ph-btn ph-btn-ghost" type="button" onclick="window.setAppMode?.('shop')">Keep shopping</button>
        <button class="ph-btn ph-btn-ghost" type="button" onclick="window.setAppMode?.('landing')">Back to home</button>
      </div>
    </div>
  `;
}

// Order-confirmation actions. A guest starts an account through the same
// agreement -> signup path as everywhere else, with the order's email stashed
// for the signup form; once that address is verified the backend claims every
// guest order placed under it. A signed-in buyer's order is already theirs.
window.pragAccountForOrder = () => {
  try { sessionStorage.setItem('pragoptics_signup_prefill_email', state.contact.email || ''); } catch { /* fine */ }
  window.setAppMode?.('landing');
  setTimeout(() => { window.openAgreementModal?.(); }, 250);
};
window.pragOrderToAccount = () => {
  window.presetAccountSection?.('orders');
  window.setAppMode?.('account');
};

/* ======================================================
   API CALLS
   ====================================================== */

async function fetchRates() {
  const ls = lines();
  const res = await fetch(`${PRAG_API_BASE}/shipping/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: {
        name: state.contact.name,
        street1: state.address.street1,
        street2: state.address.street2,
        city: state.address.city,
        state: state.address.state,
        zip: state.address.zip,
        country: 'US',
        email: state.contact.email
      },
      items: physicalLines(ls).map(l => ({ id: l.productId, qty: l.qty }))
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not get shipping rates.');
  if (!Array.isArray(data.rates) || !data.rates.length) {
    throw new Error('No shipping rates for that address. Check it and try again.');
  }
  return data.rates;
}

async function createOrder() {
  const ls = lines();
  const needsShipping = physicalLines(ls).length > 0;
  const headers = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // The backend never trusts a rate id: it re-quotes from the order's own
  // address and matches the chosen carrier + service by name.
  const chosen = state.rates.find(r => r.id === state.rateId);

  const res = await fetch(`${PRAG_API_BASE}/orders/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: state.contact.email,
      name: state.contact.name,
      lines: wireLines(ls),
      ...(needsShipping ? {
        shipTo: {
          name: state.contact.name,
          street1: state.address.street1,
          street2: state.address.street2,
          city: state.address.city,
          state: state.address.state,
          zip: state.address.zip,
          country: 'US'
        },
        rate: {
          carrier: chosen?.carrier || '',
          service: chosen?.service || '',
          // The price this customer was SHOWN, echoed so the server can
          // refuse a silent upcharge if the live quote drifted; and whether
          // this option displayed as the free one.
          amountCents: chosen ? Math.round(chosen.amount * 100) : null,
          expectFree: freeShipEligible(ls) && chosen?.id === state.rates[0]?.id
        }
      } : {})
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not start checkout.');

  // Snapshot what this order covers, so success removes exactly these lines.
  state.orderedLines = ls.map(l => ({ productId: l.productId, variantId: l.variantId }));
  return data;
}

/* ======================================================
   LEGACY: notify-me + empty cart + gated fallback
   ====================================================== */

function emptyHtml() {
  return `
    <div class="co-empty">
      <h1 class="co-title">Your cart is empty</h1>
      <p class="muted">Add a product to your cart and come back to check out.</p>
      <div class="co-empty-actions">
        <button class="ph-btn" type="button" onclick="window.setAppMode?.('shop')">Open the Hardware Shop</button>
      </div>
    </div>
  `;
}

function notifyHtml(product) {
  const name = product?.name || 'this product';
  return `
    <div class="co-grid">
      <section class="co-summary">
        <h2 class="co-h2">Notify me at launch</h2>
        <div class="co-notify-hero">
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(product?.subtitle || 'We will email you the moment this ships.')}</p>
        </div>
        <p class="muted co-note">
          No charge, no commitment. We only email you when this specific product
          is ready. Unsubscribe with one click any time.
        </p>
      </section>
      <form class="co-form" id="notifyForm" novalidate>
        <h2 class="co-h2">Get on the list</h2>
        <input type="hidden" name="productId" value="${escapeHtml(product?.id || '')}">
        <div class="co-field">
          <label for="co-email">Email <span class="req">*</span></label>
          <input id="co-email" name="email" type="email" required autocomplete="email" placeholder="you@company.com">
        </div>
        <div class="co-field">
          <label for="co-name">Name <span class="muted">(optional)</span></label>
          <input id="co-name" name="name" type="text" autocomplete="name" placeholder="Full name">
        </div>
        <div class="co-actions">
          <button class="ph-btn" type="submit">Notify me at launch</button>
          <button class="ph-btn ph-btn-ghost" type="button" data-co-cancel>Back</button>
        </div>
        <p class="co-privacy muted">
          We only use your email to notify you when this product launches.
          See our <a href="/docs/#doc=PragOptics-Privacy.md">privacy policy</a>.
        </p>
      </form>
    </div>
  `;
}

function notifyConfirmationHtml(email) {
  return `
    <div class="co-confirm">
      <div class="co-check" aria-hidden="true">✓</div>
      <h1 class="co-title">You're on the list</h1>
      <p>Thanks! We'll email <strong>${escapeHtml(email)}</strong> the moment it ships.</p>
      <div class="co-empty-actions">
        <button class="ph-btn" type="button" onclick="window.setAppMode?.('shop')">Keep shopping</button>
        <button class="ph-btn ph-btn-ghost" type="button" onclick="window.setAppMode?.('landing')">Back to home</button>
      </div>
    </div>
  `;
}

function checkoutSoonHtml() {
  return `
    <section class="co-form co-soon">
      <h2 class="co-h2">Checkout opens soon</h2>
      <p class="muted co-note">
        Online ordering is in its final buildout. Your cart is saved on this
        device, so everything here will be waiting the day checkout opens.
      </p>
      <div class="co-actions">
        <button class="ph-btn" type="button" disabled>Checkout coming soon</button>
        <button class="ph-btn ph-btn-ghost" type="button" data-co-cancel>Back to shop</button>
      </div>
    </section>
  `;
}

function readNotifyIntent() {
  try { return localStorage.getItem('pragoptics_notify_intent_v1') || null; }
  catch { return null; }
}

function clearNotifyIntent() {
  try { localStorage.removeItem('pragoptics_notify_intent_v1'); } catch {}
}

/* ======================================================
   RENDER
   ====================================================== */

function setHeader(kicker, title, sub) {
  const k = document.getElementById('coKicker'); if (k) k.textContent = kicker;
  const t = document.getElementById('coTitle');  if (t) t.textContent = title;
  const s = document.getElementById('coSub');    if (s) s.textContent = sub;
}

function render() {
  if (!$host) return;
  const ls = lines();

  if (state.step === 'done') {
    setHeader('Checkout', 'All set.', 'Your order is in.');
    $host.innerHTML = doneHtml();
    return;
  }

  // Notify-me flow (Software Shop "Notify me" buttons) takes precedence when
  // the cart is empty, so users don't land on a confusing empty-cart page.
  if (!ls.length) {
    const intent = readNotifyIntent();
    if (intent) {
      const product = ALL_PRODUCTS.find(p => p.id === intent);
      setHeader('Get notified',
                `Launch alert for ${product?.name || 'this product'}.`,
                'One click. No charge. We email you the moment it ships.');
      $host.innerHTML = notifyHtml(product);
      return;
    }
    setHeader('Checkout', 'Nothing here yet.',
              'Add a product to your cart and come back to check out.');
    $host.innerHTML = emptyHtml();
    return;
  }

  if (!CHECKOUT_ENABLED) {
    setHeader('Checkout', 'Review your order.',
              'Checkout opens soon. Your cart is saved on this device.');
    $host.innerHTML = `<div class="co-grid">${summaryHtml(ls)}${checkoutSoonHtml()}</div>`;
    return;
  }

  setHeader('Checkout', 'Review your order.',
            state.step === 'payment' ? 'One more step: payment.' : 'Confirm your items and details to place your order.');
  const right =
    state.step === 'rates' ? ratesHtml(ls) :
    state.step === 'payment' ? paymentHtml(ls) :
    detailsHtml(ls);
  $host.innerHTML = `<div class="co-grid">${summaryHtml(ls)}${right}</div>`;

  if (state.step === 'payment') mountPaymentElement();
}

/* ======================================================
   EVENTS
   ====================================================== */

function readDetailsForm(form) {
  state.contact.email = form.email.value.trim();
  state.contact.name = form.name.value.trim();
  if (form.street1) {
    state.address.street1 = form.street1.value.trim();
    state.address.street2 = form.street2.value.trim();
    state.address.city = form.city.value.trim();
    state.address.state = form.state.value.trim().toUpperCase();
    state.address.zip = form.zip.value.trim();
  }
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-co-cancel]')) {
      e.preventDefault();
      const wasNotify = !!readNotifyIntent();
      clearNotifyIntent();
      window.setAppMode?.(wasNotify ? 'software' : 'shop');
      return;
    }
    if (e.target.closest('[data-co-back]')) {
      e.preventDefault();
      if (state.busy) return;
      state.error = '';
      // From payment, a physical order goes back to rates, otherwise details.
      // The order/PI is abandoned server-side, which is harmless; a new one is
      // minted on the next pass.
      if (state.step === 'payment') {
        state.order = null;
        elements = null;
        state.step = state.rates.length ? 'rates' : 'details';
      } else if (state.step === 'rates') {
        state.step = 'details';
      }
      render();
      return;
    }
    if (e.target.closest('#coPayBtn')) {
      e.preventDefault();
      submitPayment();
      return;
    }
    if (e.target.closest('[data-co-signin]')) {
      e.preventDefault();
      window.openLoginModal?.();
    }
  });

  document.addEventListener('change', (e) => {
    const radio = e.target.closest('#coRatesForm input[name="rate"]');
    if (radio) {
      state.rateId = radio.value;
      document.querySelectorAll('.co-rate').forEach(el =>
        el.classList.toggle('is-selected', el.contains(radio)));
    }
  });

  document.addEventListener('submit', async (e) => {
    // Notify-me form (Software Shop path) --------------------------------
    const notifyForm = e.target.closest('#notifyForm');
    if (notifyForm) {
      e.preventDefault();
      const email = notifyForm.email.value.trim();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        notifyForm.email.setCustomValidity('Enter a valid email.');
        notifyForm.email.reportValidity();
        return;
      }
      notifyForm.email.setCustomValidity('');
      const productId = notifyForm.productId.value;
      try {
        const prior = JSON.parse(localStorage.getItem('pragoptics_notifies_v1') || '[]');
        prior.push({ email, name: notifyForm.name.value.trim(), productId, at: new Date().toISOString() });
        localStorage.setItem('pragoptics_notifies_v1', JSON.stringify(prior));
      } catch {}
      clearNotifyIntent();
      if ($host) $host.innerHTML = notifyConfirmationHtml(email);
      return;
    }

    // Details step -------------------------------------------------------
    const detailsForm = e.target.closest('#coDetailsForm');
    if (detailsForm) {
      e.preventDefault();
      if (state.busy) return;
      // Clear any custom validity from a previous attempt FIRST: a stale
      // message makes reportValidity() fail forever and deadlocks the form.
      detailsForm.email.setCustomValidity('');
      if (!detailsForm.reportValidity()) return;
      readDetailsForm(detailsForm);
      if (!/^\S+@\S+\.\S+$/.test(state.contact.email)) {
        detailsForm.email.setCustomValidity('Enter a valid email.');
        detailsForm.email.reportValidity();
        return;
      }

      const needsShipping = physicalLines(lines()).length > 0;
      state.busy = true; state.error = ''; render();
      try {
        if (needsShipping) {
          state.rates = await fetchRates();
          state.rateId = state.rates[0]?.id || null;
          state.step = 'rates';
        } else {
          state.order = await createOrder();
          state.step = 'payment';
        }
      } catch (err) {
        state.error = friendlyError(err, 'Something went wrong. Try again.');
      }
      state.busy = false;
      render();
      return;
    }

    // Rates step ---------------------------------------------------------
    const ratesForm = e.target.closest('#coRatesForm');
    if (ratesForm) {
      e.preventDefault();
      if (state.busy) return;
      const chosen = ratesForm.querySelector('input[name="rate"]:checked');
      state.rateId = chosen ? chosen.value : state.rateId;
      if (!state.rateId) { state.error = 'Pick a shipping option.'; render(); return; }

      state.busy = true; state.error = ''; render();
      try {
        state.order = await createOrder();
        state.step = 'payment';
      } catch (err) {
        state.error = friendlyError(err, 'Something went wrong. Try again.');
      }
      state.busy = false;
      render();
      return;
    }
  });
}

/* ======================================================
   PUBLIC API
   ====================================================== */

export function initCheckoutView() {
  $view = document.getElementById('checkoutView');
  $host = document.getElementById('checkoutBody');
  if (!$view) return;
  bindOnce();
  // React to cart edits (drawer) while checkout is visible. On the details
  // step just re-render. Past it, the quoted rates and any minted order no
  // longer match the cart, so drop them and return to details - EXCEPT while
  // busy (a charge may be in flight; its snapshot settles it) or when done
  // (our own post-payment line removal fires this subscription).
  subscribe(() => {
    if ($view.classList.contains('hidden')) return;
    if (state.step === 'details') { render(); return; }
    if (state.step === 'rates' || state.step === 'payment') {
      if (state.busy) return;
      state.order = null;
      state.rates = [];
      state.rateId = null;
      elements = null;
      state.step = 'details';
      state.error = 'Your cart changed. Review it and continue again.';
      render();
    }
  });
}

/** Hook: called by appRouter when switching to checkout mode. */
export function onCheckoutEnter() {
  // Fresh pass every entry: any prior PI is stale, but contact/address stick
  // around so a returning customer never retypes.
  state.step = 'details';
  state.order = null;
  state.rates = [];
  state.rateId = null;
  state.busy = false;
  state.error = '';
  elements = null;
  render();
}
