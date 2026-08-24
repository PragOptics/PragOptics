// src/shop/software.js
// Renders the Software Shop as a gallery of software/service cards.
// Actions supported: wizard (routes to subscription wizard), external (link),
// notify (opens the "notify me" flow via checkout with a notify note),
// donate (adds an adjustable $1-default donation cart line — software itself
// is always free and never a checkout item).

import { SOFTWARE, SHOP_LIVE } from './products.js';
import { addDonation } from './cart.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function statusPill(availability) {
  const soon = availability === 'coming-soon';
  return `<span class="sw-status ${soon ? 'sw-status--soon' : 'sw-status--live'}">` +
         `<span class="sw-dot" aria-hidden="true"></span>${soon ? 'Coming soon' : 'Available'}</span>`;
}

function accessTag(p) {
  const label = p.access === 'subscription' ? 'Subscription'
              : p.access === 'free' ? 'Free'
              : (p.priceLabel || '');
  if (!label) return '';
  return `<span class="sw-access sw-access--${escapeHtml(p.access || 'other')}">${escapeHtml(label)}</span>`;
}

function actionButton(product) {
  const a = product.action;
  if (!a) return '';
  switch (a.kind) {
    case 'wizard':
      return `<button class="cta" type="button" data-sw-action="wizard">${escapeHtml(a.label)}</button>`;
    case 'external':
      return `<a class="cta" href="${escapeHtml(a.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.label)}</a>`;
    case 'notify':
      // Notify routes through checkout — while the shop is gated the card's
      // "Coming soon" status pill carries the message and there is no button.
      if (!SHOP_LIVE) return '';
      return `<button class="btn" type="button" data-sw-action="notify" data-product-id="${escapeHtml(product.id)}">${escapeHtml(a.label)}</button>`;
    default:
      return '';
  }
}

function mediaHtml(p) {
  // Every featured card uses the SAME media frame as the 3D Suite card: a full-bleed
  // banner + a corner app-icon badge. A product without its splash yet gets a branded
  // placeholder banner; drop in `splash` later and only the banner image changes.
  if (!p.splash && !p.icon) return '';
  // splashFit: 'contain' shows a square-ish splash (e.g. a logo) whole in the
  // banner instead of cover-cropping it.
  const fit = p.splashFit === 'contain' ? ' scard-splash--contain' : '';
  const banner = p.splash
    ? `<img class="scard-splash${fit}" src="${escapeHtml(p.splash)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    : `<div class="scard-splash scard-splash--placeholder" role="img" aria-label="${escapeHtml(p.name)}"></div>`;
  const badge = p.icon
    ? `<img class="scard-icon" src="${escapeHtml(p.icon)}" alt="" loading="lazy">`
    : '';
  // Banner box follows the splash's native aspect so nothing is cropped —
  // full card width, whole image, card grows to fit.
  const aspect = p.splash && p.splashAspect ? ` style="aspect-ratio:${escapeHtml(p.splashAspect)}"` : '';
  return `<div class="scard-media"${aspect}>${banner}${badge}</div>`;
}

function cardHtml(p) {
  const featureList = (p.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const featured = (p.splash || p.icon) ? ' scard--featured' : '';
  return `
    <article class="scard${featured} ${p.availability === 'coming-soon' ? 'is-soon' : ''}">
      ${mediaHtml(p)}
      <div class="scard-top">
        ${statusPill(p.availability)}
        ${accessTag(p)}
      </div>
      <h3 class="scard-name">${escapeHtml(p.name)}</h3>
      <p class="scard-tag">${escapeHtml(p.tagline)}</p>
      <p class="scard-sub">${escapeHtml(p.subtitle)}</p>
      ${featureList ? `<ul class="scard-features">${featureList}</ul>` : ''}
      <div class="scard-actions">
        ${actionButton(p)}
        ${SHOP_LIVE ? `<button class="btn sw-donate" type="button" data-sw-action="donate"
                data-product-id="${escapeHtml(p.id)}"
                title="Free to download — donations keep it that way">♥ Donate</button>` : ''}
      </div>
    </article>
  `;
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sw-action]');
    if (!btn) return;
    const kind = btn.dataset.swAction;
    if (kind === 'wizard') {
      e.preventDefault();
      // The existing subscription flow lives behind "Get Started" on the landing.
      // Fire the same agreement modal if available; otherwise fall back to landing.
      if (typeof window.openAgreementModal === 'function') {
        window.openAgreementModal();
      } else {
        window.setAppMode?.('landing');
      }
      return;
    }
    if (kind === 'notify') {
      e.preventDefault();
      // Route to the reserve/notify checkout with a note about which item.
      const pid = btn.dataset.productId;
      try { localStorage.setItem('pragoptics_notify_intent_v1', pid || ''); } catch {}
      window.setAppMode?.('checkout');
      return;
    }
    if (kind === 'donate') {
      e.preventDefault();
      // $1 default; the amount is freely adjustable in the cart drawer.
      addDonation(btn.dataset.productId, 100);
      window.openCart?.();
    }
  });
}

export function renderSoftwareGallery(mountId) {
  const host = document.getElementById(mountId);
  if (!host) return;
  host.innerHTML = SOFTWARE.map(cardHtml).join('');
  bindOnce();
}
