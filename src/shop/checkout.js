// src/shop/checkout.js
// Reserve/notify checkout for the current cart.  Real Stripe wired in later;
// today the flow collects an email and (optionally) contact details and shows
// a confirmation.  Cart contents are echoed on the page for user review.

import { lines, subtotal, clear, subscribe } from './cart.js';
import { formatPrice, ALL_PRODUCTS } from './products.js';

let $view, $host;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

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

function readNotifyIntent() {
  try { return localStorage.getItem('pragoptics_notify_intent_v1') || null; }
  catch { return null; }
}

function clearNotifyIntent() {
  try { localStorage.removeItem('pragoptics_notify_intent_v1'); } catch {}
}

function summaryHtml(ls) {
  const sub = subtotal();
  const subLabel = sub == null ? 'Pricing at checkout' : formatPrice(sub);
  const hasPreorder = ls.some(l => l.isPreorder);
  const hasStock = ls.some(l => !l.isPreorder);
  const note = hasPreorder && hasStock
    ? 'Your order mixes in-stock items and preorder deposits. In-stock items are charged in full; each preorder is a deposit that reserves your unit, with the balance due when it ships.'
    : hasPreorder
      ? 'This is a preorder. The amount below is a deposit that reserves your unit — the balance is due when it ships, and it is fully refundable until then.'
      : 'Review your items below, then confirm your details to place the order.';
  return `
    <section class="co-summary">
      <h2 class="co-h2">Your order</h2>
      <div class="co-lines">
        ${ls.map(lineHtml).join('')}
      </div>
      <div class="co-totals">
        <span class="co-totals-lbl">Due now</span>
        <span class="co-totals-val">${escapeHtml(subLabel)}</span>
      </div>
      <p class="muted co-note">${escapeHtml(note)}</p>
    </section>
  `;
}

function isSignedIn() {
  try { return typeof window.isAccessTokenValid === 'function' && window.isAccessTokenValid(); }
  catch { return false; }
}

function formHtml() {
  const signedIn = isSignedIn();
  return `
    <form class="co-form" id="reserveForm" novalidate>
      <h2 class="co-h2">Your details</h2>

      ${signedIn ? `
        <div class="co-signedin">
          <span class="co-signedin-icon" aria-hidden="true">✓</span>
          <span>Signed in — this reservation will link to your PragOptics account.</span>
        </div>
      ` : `
        <div class="co-signin-prompt">
          <span>Already have a PragOptics account?</span>
          <button class="co-signin-link" type="button" data-co-signin>Sign in</button>
        </div>
      `}

      <div class="co-field">
        <label for="co-email">Email <span class="req">*</span></label>
        <input id="co-email" name="email" type="email" required autocomplete="email" placeholder="you@company.com">
      </div>
      <div class="co-field">
        <label for="co-name">Name <span class="muted">(optional)</span></label>
        <input id="co-name" name="name" type="text" autocomplete="name" placeholder="Full name">
      </div>
      <div class="co-field">
        <label for="co-company">Company <span class="muted">(optional)</span></label>
        <input id="co-company" name="company" type="text" autocomplete="organization" placeholder="Company or org">
      </div>
      <div class="co-field">
        <label for="co-notes">Notes <span class="muted">(optional)</span></label>
        <textarea id="co-notes" name="notes" rows="3" placeholder="Anything we should know? Volume, timing, use case…"></textarea>
      </div>

      ${signedIn ? '' : `
        <label class="co-checkbox">
          <input type="checkbox" name="createAccount" value="1">
          <span>Also create a PragOptics account with this email so I can track this order.</span>
        </label>
      `}

      <div class="co-actions">
        <button class="ph-btn" type="submit">Place order</button>
        <button class="ph-btn ph-btn-ghost" type="button" data-co-cancel>Back to shop</button>
      </div>
      <p class="co-privacy muted">
        We use your details to process this order and keep you updated on it.
        See our <a href="/docs/#doc=PragOptics-Privacy.md">privacy policy</a>.
      </p>
    </form>
  `;
}

function notifyConfirmationHtml(email) {
  return `
    <div class="co-confirm">
      <div class="co-check" aria-hidden="true">✓</div>
      <h1 class="co-title">You're on the list</h1>
      <p>Thanks — we'll email <strong>${escapeHtml(email)}</strong> the moment it ships.</p>
      <div class="co-empty-actions">
        <button class="ph-btn" type="button" onclick="window.setAppMode?.('shop')">Keep shopping</button>
        <button class="ph-btn ph-btn-ghost" type="button" onclick="window.setAppMode?.('landing')">Back to home</button>
      </div>
    </div>
  `;
}

function orderConfirmationHtml(email) {
  return `
    <div class="co-confirm">
      <div class="co-check" aria-hidden="true">✓</div>
      <h1 class="co-title">Order received</h1>
      <p>Thanks — we've recorded your order and sent a copy to <strong>${escapeHtml(email)}</strong>. We'll follow up to confirm and arrange payment. Your cart has been cleared.</p>
      <div class="co-empty-actions">
        <button class="ph-btn" type="button" onclick="window.setAppMode?.('shop')">Keep shopping</button>
        <button class="ph-btn ph-btn-ghost" type="button" onclick="window.setAppMode?.('landing')">Back to home</button>
      </div>
    </div>
  `;
}

function setHeader(kicker, title, sub) {
  const k = document.getElementById('coKicker'); if (k) k.textContent = kicker;
  const t = document.getElementById('coTitle');  if (t) t.textContent = title;
  const s = document.getElementById('coSub');    if (s) s.textContent = sub;
}

function render() {
  if (!$host) return;
  const ls = lines();

  // Notify-me flow (from Software Shop "Notify me" buttons) takes precedence
  // when the cart is empty, so users don't see a confusing empty-cart page.
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
    setHeader('Checkout', 'Nothing to reserve yet.',
              'Add a product to your cart and come back to reserve it.');
    $host.innerHTML = emptyHtml();
    return;
  }

  setHeader('Checkout', 'Review your order.',
            'Confirm your items and details to place your order.');
  $host.innerHTML = `
    <div class="co-grid">
      ${summaryHtml(ls)}
      ${formHtml()}
    </div>
  `;
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-co-cancel]')) {
      e.preventDefault();
      // Read before clearing so we can pick the correct return surface.
      const wasNotify = !!readNotifyIntent();
      clearNotifyIntent();
      window.setAppMode?.(wasNotify ? 'software' : 'shop');
      return;
    }
    if (e.target.closest('[data-co-signin]')) {
      e.preventDefault();
      // The existing login flow, so returning users don't retype their info.
      window.openLoginModal?.();
    }
  });

  document.addEventListener('submit', (e) => {
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
        prior.push({
          email,
          name: notifyForm.name.value.trim(),
          productId,
          at: new Date().toISOString()
        });
        localStorage.setItem('pragoptics_notifies_v1', JSON.stringify(prior));
      } catch {}
      clearNotifyIntent();
      if ($host) $host.innerHTML = notifyConfirmationHtml(email);
      return;
    }

    const form = e.target.closest('#reserveForm');
    if (!form) return;
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      form.email.setCustomValidity('Enter a valid email.');
      form.email.reportValidity();
      return;
    }
    form.email.setCustomValidity('');

    // Persist the reservation locally as a stub.  Real backend endpoint goes here.
    const createAccount = !!form.createAccount?.checked;
    try {
      const stub = {
        email,
        name:    form.name.value.trim(),
        company: form.company.value.trim(),
        notes:   form.notes.value.trim(),
        createAccountRequested: createAccount,
        lines:   lines().map(l => ({
          productId: l.productId,
          variantId: l.variantId,
          qty:       l.qty,
          kind:      l.isDonation ? 'donation' : l.isPreorder ? 'preorder' : 'purchase',
          unitCents: l.unitCents
        })),
        subtotalCents: subtotal(),
        at:      new Date().toISOString()
      };
      const prior = JSON.parse(localStorage.getItem('pragoptics_reservations_v1') || '[]');
      prior.push(stub);
      localStorage.setItem('pragoptics_reservations_v1', JSON.stringify(prior));
    } catch {}

    clear();
    if ($host) $host.innerHTML = orderConfirmationHtml(email);

    // Hand off to the existing agreement/signup modal when the customer opted
    // in.  Backend order-log wiring plugs in here once available.
    if (createAccount && typeof window.openAgreementModal === 'function') {
      setTimeout(() => window.openAgreementModal(), 400);
    }
  });
}

export function initCheckoutView() {
  $view = document.getElementById('checkoutView');
  $host = document.getElementById('checkoutBody');
  if (!$view) return;
  bindOnce();
  // Re-render if user opens checkout again after mutating cart from the drawer.
  subscribe(() => {
    if (!$view.classList.contains('hidden')) render();
  });
}

/** Hook: called by appRouter when switching to checkout mode. */
export function onCheckoutEnter() {
  render();
}
