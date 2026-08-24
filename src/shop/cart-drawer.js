// src/shop/cart-drawer.js
// Slide-in shopping cart drawer.  Reads live cart state and re-renders on every
// change.  Also owns the live cart-count badge in the header menu.

import { lines, subtotal, count, setQty, removeItem, setDonationAmount, subscribe } from './cart.js';
import { formatPrice } from './products.js';

let $mask, $panel, $body;
let lastFocus = null;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function ensureRefs() {
  $mask  = document.getElementById('cartMask');
  $panel = document.getElementById('cartPanel');
  $body  = document.getElementById('cartBody');
}

function isSignedIn() {
  try { return typeof window.isAccessTokenValid === 'function' && window.isAccessTokenValid(); }
  catch { return false; }
}

function accountBanner() {
  if (isSignedIn()) {
    return `
      <div class="cart-account cart-account-signed">
        <span class="cart-account-icon" aria-hidden="true">✓</span>
        <span class="cart-account-text">Signed in — reservations will link to your account.</span>
      </div>
    `;
  }
  return `
    <div class="cart-account">
      <span class="cart-account-text">
        <strong>Sign in</strong> to save your cart across devices and track orders.
      </span>
      <div class="cart-account-actions">
        <button class="ph-btn ph-btn-ghost cart-account-btn" type="button" data-cart-signin>Sign in</button>
      </div>
    </div>
  `;
}

function emptyBodyHtml() {
  return `
    ${accountBanner()}
    <div class="cart-empty">
      <div class="cart-empty-glyph" aria-hidden="true">⌾</div>
      <h3>Your cart is empty</h3>
      <p class="muted">Add an OmniSource, or preorder an OmniBus.</p>
      <div class="cart-empty-actions">
        <button class="ph-btn" type="button" data-cart-close data-goto-shop>Open the Hardware Shop</button>
      </div>
    </div>
  `;
}

function lineHtml(line) {
  const p = line.product;
  const v = line.variant;
  const unit = line.unitCents != null ? formatPrice(line.unitCents) : 'TBD';
  const lineTotal = line.lineCents != null ? formatPrice(line.lineCents) : 'TBD';
  if (line.isDonation) {
    // Donation line: no qty stepper — a freely adjustable whole-dollar amount.
    const dollars = Math.max(1, Math.round(line.unitCents / 100));
    return `
      <div class="cart-line cart-line--donation" data-pid="${escapeHtml(line.productId)}" data-vid="donation">
        <div class="cart-line-thumb">
          <img src="${escapeHtml(p.icon || p.image || '')}" alt="${escapeHtml(p.name)}" loading="lazy">
        </div>
        <div class="cart-line-info">
          <div class="cart-line-name">${escapeHtml(p.name)}</div>
          <div class="cart-line-variant">Donation ♥</div>
          <div class="cart-line-price muted">The software stays free — thank you.</div>
        </div>
        <div class="cart-line-controls">
          <div class="donate-amt" title="Adjust your donation">
            <span class="donate-cur" aria-hidden="true">$</span>
            <input class="donate-input" type="number" min="1" step="1" value="${dollars}" aria-label="Donation amount in dollars">
          </div>
          <button class="cart-remove" type="button" data-cart-remove aria-label="Remove donation">Remove</button>
          <div class="cart-line-total">${escapeHtml(lineTotal)}</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="cart-line" data-pid="${escapeHtml(line.productId)}" data-vid="${escapeHtml(line.variantId ?? '')}">
      <div class="cart-line-thumb">
        <img src="${escapeHtml(p.image || '')}" alt="${escapeHtml(p.name)}" loading="lazy">
      </div>
      <div class="cart-line-info">
        <div class="cart-line-name">${escapeHtml(p.name)}</div>
        ${v ? `<div class="cart-line-variant">${escapeHtml(v.name)}</div>` : ''}
        <div class="cart-line-price">${escapeHtml(unit)}${line.isPreorder ? ' <span class="muted">· deposit</span>' : (line.unitCents == null ? ' <span class="muted">· reserve</span>' : '')}</div>
      </div>
      <div class="cart-line-controls">
        <div class="qty">
          <button class="qty-btn" type="button" data-cart-qty-dec aria-label="Decrease quantity">−</button>
          <input class="qty-input" type="number" min="0" step="1" value="${line.qty}" aria-label="Quantity">
          <button class="qty-btn" type="button" data-cart-qty-inc aria-label="Increase quantity">+</button>
        </div>
        <button class="cart-remove" type="button" data-cart-remove aria-label="Remove ${escapeHtml(p.name)}">Remove</button>
        <div class="cart-line-total">${escapeHtml(lineTotal)}</div>
      </div>
    </div>
  `;
}

function bodyHtml(items) {
  if (!items.length) return emptyBodyHtml();
  const sub = subtotal();
  const hasPreorder = items.some(l => l.isPreorder);
  const hasStock = items.some(l => !l.isPreorder && !l.isDonation);
  const allDonations = items.every(l => l.isDonation);
  const note = allDonations
    ? 'Donations keep the software free for everyone — thank you. Review at checkout.'
    : hasPreorder && hasStock
      ? 'Deposits reserve preorders; in-stock items ship on order. Review everything at checkout.'
      : hasPreorder
        ? 'A deposit reserves your preorder — the balance is due when it ships. Review at checkout.'
        : 'In-stock items ship on order. Review your order and details at checkout.';
  const subLabel = sub == null ? 'Total: pricing at checkout' : `Due now: ${formatPrice(sub)}`;
  return `
    ${accountBanner()}
    <div class="cart-lines">
      ${items.map(lineHtml).join('')}
    </div>
    <div class="cart-summary">
      <div class="cart-summary-note muted">${note}</div>
      <div class="cart-summary-total">${escapeHtml(subLabel)}</div>
      <div class="cart-summary-actions">
        <button class="ph-btn ph-btn-ghost" type="button" data-cart-close>Keep shopping</button>
        <button class="ph-btn" type="button" data-cart-checkout>Go to checkout →</button>
      </div>
    </div>
  `;
}

function render() {
  if (!$body) return;
  const ls = lines();
  $body.innerHTML = bodyHtml(ls);
  const c = count();
  // Header menu badge + every in-view subnav badge share the .cart-count class.
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = String(c);
    el.classList.toggle('has-items', c > 0);
  });
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
    if (e.target === $mask) { closeCart(); return; }
    const closer = e.target.closest('[data-cart-close]');
    if (closer) { e.preventDefault(); closeCart();
      if (closer.hasAttribute('data-goto-shop')) window.setAppMode?.('shop');
      return;
    }
    const co = e.target.closest('[data-cart-checkout]');
    if (co) { e.preventDefault(); closeCart(); window.setAppMode?.('checkout'); return; }

    if (e.target.closest('[data-cart-signin]')) {
      e.preventDefault();
      closeCart();
      // Opens the existing native login modal; on success the caller runs the
      // shared post-login resolver which will re-open the cart if needed.
      window.openLoginModal?.();
      return;
    }

    const line = e.target.closest('.cart-line');
    if (!line) return;
    const pid = line.dataset.pid;
    const vid = line.dataset.vid || null;

    if (e.target.closest('[data-cart-qty-inc]')) {
      const input = line.querySelector('.qty-input');
      const q = Math.max(0, (parseInt(input.value, 10) || 0) + 1);
      setQty(pid, vid, q);
    } else if (e.target.closest('[data-cart-qty-dec]')) {
      const input = line.querySelector('.qty-input');
      const q = Math.max(0, (parseInt(input.value, 10) || 0) - 1);
      setQty(pid, vid, q);
    } else if (e.target.closest('[data-cart-remove]')) {
      removeItem(pid, vid);
    }
  });

  document.addEventListener('change', (e) => {
    const line = e.target.closest('.cart-line');
    if (!line) return;
    if (e.target.classList.contains('qty-input')) {
      const q = Math.max(0, parseInt(e.target.value, 10) || 0);
      setQty(line.dataset.pid, line.dataset.vid || null, q);
    } else if (e.target.classList.contains('donate-input')) {
      const dollars = Math.max(1, Math.round(parseFloat(e.target.value) || 0));
      setDonationAmount(line.dataset.pid, dollars * 100);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $panel?.classList.contains('is-open')) closeCart();
  });
}

export function openCart() {
  ensureRefs();
  if (!$mask || !$panel) return;
  lastFocus = document.activeElement;
  render();
  $mask.classList.add('is-open');
  $panel.classList.add('is-open');
  $mask.setAttribute('aria-hidden', 'false');
  $panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  bindOnce();
}

export function closeCart() {
  if (!$mask || !$panel) return;
  $mask.classList.remove('is-open');
  $panel.classList.remove('is-open');
  $mask.setAttribute('aria-hidden', 'true');
  $panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocus?.focus) try { lastFocus.focus(); } catch {}
}

export function initCartDrawer() {
  ensureRefs();
  bindOnce();
  // Live re-render on any cart change AND keep the header badge in sync.
  subscribe(() => render());
}
