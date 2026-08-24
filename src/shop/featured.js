// src/shop/featured.js
// Landing "Featured hardware" highlight — ONE consistent card per product, built
// from the catalog so nothing goes stale, plus the Field Node Manager demo card.
// Cards use the VIBRANT flyer art (p.flyer) and the site's real buttons (.cta / .btn):
//   • primary  — Add to cart (available) / Preorder — $X (preorder) / Notify me (soon)
//   • details  — View details (opens the product modal, with specs + schematic)

import { HARDWARE, SOFTWARE, formatPrice, preorderVariant, SHOP_LIVE } from './products.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function priceLine(p) {
  const pre = preorderVariant(p);
  if (p.availability === 'available' && p.priceCents != null) {
    return `${escapeHtml(formatPrice(p.priceCents))} <span class="muted">· Available now</span>`;
  }
  if (pre) {
    const full = p.priceCents != null ? `${escapeHtml(formatPrice(p.priceCents))} · ` : '';
    return `Preorder ${escapeHtml(formatPrice(pre.priceCents))} <span class="muted">· ${full}Coming soon</span>`;
  }
  return `<span class="muted">Coming soon</span>`;
}

function primaryBtn(p) {
  const pre = preorderVariant(p);
  if (p.availability === 'available') {
    const v = p.variants?.[0]?.id || '';
    return `<button class="cta" type="button" data-action="buy" data-product-id="${escapeHtml(p.id)}" data-variant="${escapeHtml(v)}">Add to cart</button>`;
  }
  if (pre) {
    return `<button class="cta" type="button" data-action="buy" data-product-id="${escapeHtml(p.id)}" data-variant="preorder">Preorder — ${escapeHtml(formatPrice(pre.priceCents))}</button>`;
  }
  return `<button class="cta" type="button" data-action="notify" data-product-id="${escapeHtml(p.id)}">Notify me</button>`;
}

function cardHtml(p) {
  const img = p.flyer || p.image || '';
  return `
    <article class="ph-card ph-brochure">
      ${img ? `<img class="ph-flyer" src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy">` : ''}
      <div class="ph-card-body">
        <h3>${escapeHtml(p.name)}</h3>
        <p class="ph-price">${priceLine(p)}</p>
        <p class="muted">${escapeHtml(p.subtitle || p.tagline || '')}</p>
        <div class="ph-actions">
          ${primaryBtn(p)}
          <button class="btn" type="button" data-action="open-product" data-product-id="${escapeHtml(p.id)}">View details</button>
        </div>
      </div>
    </article>
  `;
}

// Software / service featured card — SAME structure as the hardware cards (image
// tile + price line + .cta / .btn) so every featured card is identical in style;
// only the content differs. Image is the product's logo/icon.
function softwareCardHtml(s) {
  if (!s) return '';
  const a = s.action || {};
  const status = s.availability === 'available' ? 'Available now' : 'Coming soon';
  // Notify routes through checkout — while the shop is gated it becomes a
  // plain "Coming soon" pill instead of a link anywhere.
  const primary = a.kind === 'external'
    ? `<a class="cta" href="${escapeHtml(a.href || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.label || 'Open')}</a>`
    : SHOP_LIVE
      ? `<button class="cta" type="button" data-action="notify" data-product-id="${escapeHtml(s.id)}">${escapeHtml(a.label || 'Notify me')}</button>`
      : `<button class="cta" type="button" disabled>Coming soon</button>`;
  // Splash + app icon together, same treatment as the software-shop cards:
  // the splash as a full-bleed top banner wrapped into the card (the card's
  // own radius rounds it — no border, no frame), icon badged over the corner.
  // Banner takes the splash's native aspect (splashAspect) — full card width,
  // whole image, nothing cut off; the card grows to fit.
  const media = s.splash
    ? `<div class="ph-media"${s.splashAspect ? ` style="aspect-ratio:${escapeHtml(s.splashAspect)}"` : ''}>
         <img class="ph-media-img" src="${escapeHtml(s.splash)}" alt="${escapeHtml(s.name)}" loading="lazy">
         ${s.icon ? `<img class="ph-media-badge" src="${escapeHtml(s.icon)}" alt="" loading="lazy">` : ''}
       </div>`
    : `<img class="ph-flyer ph-icon" src="${escapeHtml(s.icon || s.image || '/images/logo.png')}" alt="${escapeHtml(s.name)}" loading="lazy">`;
  return `
    <article class="ph-card ph-brochure${s.splash ? ' ph-vert' : ''}">
      ${media}
      <div class="ph-card-body">
        <h3>${escapeHtml(s.name)}</h3>
        <p class="ph-price">${escapeHtml(s.priceLabel || 'Free')} <span class="muted">· ${status}</span></p>
        <p class="muted">${escapeHtml(s.subtitle || s.tagline || '')}</p>
        <div class="ph-actions">
          ${primary}
          ${SHOP_LIVE ? `<button class="btn" type="button" data-action="open-product" data-product-id="${escapeHtml(s.id)}">View details</button>` : ''}
        </div>
      </div>
    </article>
  `;
}

// Row-closing card: sends the scroller into its shop. Same card surface,
// dashed edge so it reads as "there's more" rather than another product.
//
// Each shop card carries technical line art in the site's own language —
// thin emerald strokes, glowing pads/nodes, one slow dashed run. Hardware:
// a circuit constellation (chip, traces, vias). Software: code brackets
// feeding a deploy-graph constellation. Pure SVG, nothing pictorial.

const HW_ART = `
<svg class="ph-tail-art" viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="none" stroke="rgba(54,230,202,.55)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="100" y="32" width="40" height="32" rx="6" fill="rgba(33,188,165,.07)"/>
    <path d="M100 38 H82 L70 26 H60"/>
    <path class="tart-dash" d="M100 48 H62"/>
    <path d="M100 58 H82 L70 70 H60"/>
    <path d="M140 38 H158 L170 26 H180"/>
    <path class="tart-dash" d="M140 48 H178"/>
    <path d="M140 58 H158 L170 70 H180"/>
    <path d="M112 32 V20"/><path d="M128 32 V20"/>
    <path d="M112 64 V76"/><path d="M128 64 V76"/>
  </g>
  <g fill="#36e6ca">
    <circle cx="56" cy="26" r="6" opacity=".16"/><circle cx="56" cy="26" r="2.6"/>
    <circle cx="58" cy="48" r="2.6"/>
    <circle cx="56" cy="70" r="6" opacity=".16"/><circle cx="56" cy="70" r="2.6"/>
    <circle cx="184" cy="26" r="2.6"/>
    <circle cx="182" cy="48" r="6" opacity=".16"/><circle cx="182" cy="48" r="2.6"/>
    <circle cx="112" cy="18" r="1.6"/><circle cx="128" cy="18" r="1.6"/>
    <circle cx="112" cy="78" r="1.6"/><circle cx="128" cy="78" r="1.6"/>
  </g>
  <g fill="#bf7dff">
    <circle cx="184" cy="70" r="6" opacity=".18"/><circle cx="184" cy="70" r="2.6"/>
  </g>
  <rect x="112" y="42" width="16" height="12" rx="2" fill="none" stroke="rgba(54,230,202,.4)" stroke-width="1.2"/>
</svg>`;

const SW_ART = `
<svg class="ph-tail-art" viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="none" stroke="rgba(54,230,202,.55)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M58 30 L40 48 L58 66"/>
    <path d="M70 66 L84 30"/>
    <path d="M96 30 L114 48 L96 66"/>
  </g>
  <g fill="none" stroke="rgba(54,230,202,.45)" stroke-width="1.3" stroke-linecap="round">
    <path d="M141 31 L163 43"/>
    <path d="M137 60 L162 48"/>
    <path class="tart-dash" d="M172 43 L196 32"/>
    <path d="M172 48 L198 61"/>
  </g>
  <g fill="#36e6ca">
    <circle cx="138" cy="29" r="2.6"/>
    <circle cx="134" cy="62" r="2.6"/>
    <circle cx="200" cy="30" r="6" opacity=".16"/><circle cx="200" cy="30" r="2.8"/>
  </g>
  <g fill="#bf7dff">
    <circle cx="167" cy="45" r="8" opacity=".16"/><circle cx="167" cy="45" r="3.4"/>
    <circle cx="202" cy="63" r="2.8"/>
  </g>
  <circle cx="167" cy="45" r="13" fill="none" stroke="rgba(191,125,255,.3)" stroke-width="1" stroke-dasharray="2 5"/>
</svg>`;

function tailCardHtml({ title, sub, mode, btnLabel, art }) {
  return `
    <article class="ph-card ph-tail">
      <div class="ph-tail-body">
        ${art || ''}
        <h3>${escapeHtml(title)}</h3>
        <p class="muted">${escapeHtml(sub)}</p>
        <button class="cta" type="button" data-action="set-mode" data-mode="${escapeHtml(mode)}">${escapeHtml(btnLabel)}</button>
      </div>
    </article>
  `;
}

// Auto-advance a spotlight row: one card every few seconds, wrapping back to
// the start. Pauses on hover/focus, and backs off after any manual scroll or
// touch so it never fights the user. Respects prefers-reduced-motion.
function startAutoScroll(scroller, { interval = 4200 } = {}) {
  if (scroller.__spotTimer) clearInterval(scroller.__spotTimer);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  let hover = false;
  let holdUntil = 0; // manual interaction backs the carousel off for a beat

  scroller.addEventListener('mouseenter', () => { hover = true; });
  scroller.addEventListener('mouseleave', () => { hover = false; });
  scroller.addEventListener('focusin',  () => { hover = true; });
  scroller.addEventListener('focusout', () => { hover = false; });
  const backOff = () => { holdUntil = Date.now() + 8000; };
  scroller.addEventListener('wheel', backOff, { passive: true });
  scroller.addEventListener('touchstart', backOff, { passive: true });
  scroller.addEventListener('pointerdown', backOff);

  scroller.__spotTimer = setInterval(() => {
    if (hover || Date.now() < holdUntil) return;
    if (document.hidden) return;
    if (!scroller.isConnected || scroller.offsetParent === null) return; // view hidden
    const card = scroller.querySelector('.ph-card');
    if (!card) return;
    const step = card.getBoundingClientRect().width + 16; // card + gap
    const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 24;
    scroller.scrollTo({ left: atEnd ? 0 : scroller.scrollLeft + step, behavior: 'smooth' });
  }, interval);
}

export function renderFeaturedProducts(mountId) {
  const host = document.getElementById(mountId);
  if (!host) return;
  // Featured software: the PragOptics studio first, then FNM (live demo) + the 3D Suite.
  const featuredSoftware = ['pragoptics-studio', 'fnm', 'pragoptics-3d-suite']
    .map(id => SOFTWARE.find(s => s.id === id))
    .filter(Boolean);

  // Product Spotlight: two scrolling rows — hardware, then software — each
  // closing on its shop card. The hardware row is pure shop (add-to-cart,
  // preorder, the shop tail) so the whole row sits behind the SHOP_LIVE seam.
  const hardwareRow = !SHOP_LIVE ? '' : `
    <div class="ph-row">
      <span class="ph-row-label">Field Hardware</span>
      <div class="ph-scroller" tabindex="0" aria-label="Featured hardware">
        ${HARDWARE.map(cardHtml).join('')}
        ${tailCardHtml({
          title: 'The Hardware Shop',
          sub: 'Everything on the bench — assembled units, kits, and the free plans behind them.',
          mode: 'shop', btnLabel: 'Open the Hardware Shop', art: HW_ART
        })}
      </div>
    </div>`;

  host.innerHTML = `
    ${hardwareRow}
    <div class="ph-row">
      <span class="ph-row-label">Software</span>
      <div class="ph-scroller" tabindex="0" aria-label="Featured software">
        ${featuredSoftware.map(softwareCardHtml).join('')}
        ${tailCardHtml({
          title: 'The Software Shop',
          sub: 'Free downloads, the live FNM demo, and the platform subscription that powers them.',
          mode: 'software', btnLabel: 'Open the Software Shop', art: SW_ART
        })}
      </div>
    </div>
  `;

  // Auto-advance the rows, offset by half a beat so they don't move in
  // lockstep — a slow, ambient drift through the spotlight.
  [...host.querySelectorAll('.ph-scroller')].forEach((row, i) =>
    setTimeout(() => startAutoScroll(row, { interval: 8400 }), i * 4200)
  );
}
