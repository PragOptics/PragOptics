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
    return `<button class="cta" type="button" data-action="buy" data-product-id="${escapeHtml(p.id)}" data-variant="preorder">Preorder: ${escapeHtml(formatPrice(pre.priceCents))}</button>`;
  }
  // Notify captures an email through checkout, which needs the backend seam.
  if (!SHOP_LIVE) return `<button class="cta" type="button" disabled>Coming soon</button>`;
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
          <button class="btn" type="button" data-action="open-product" data-product-id="${escapeHtml(s.id)}">View details</button>
        </div>
      </div>
    </article>
  `;
}

// Row-closing card: sends the scroller into its shop. Same card surface,
// dashed edge so it reads as "there's more" rather than another product.
//
// Each shop card carries technical line art in the site's own language —
// thin emerald strokes, glowing pads/nodes, one slow dashed run — and both
// share one diagram grammar: a structured block on a left-hand bus, fanning
// out right to endpoint nodes. Hardware: an instrument board (chip, pins,
// vias) fanning to field nodes. Software: a tiered platform stack fanning to
// service endpoints. Pure SVG, nothing pictorial.

const HW_ART = `
<svg class="ph-tail-art" viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="none" stroke="rgba(54,230,202,.55)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="54" y="18" width="62" height="60" rx="6" fill="rgba(33,188,165,.05)"/>
    <rect x="72" y="38" width="22" height="20" rx="3" fill="rgba(33,188,165,.07)"/>
    <path d="M78 38 V32"/><path d="M88 38 V32"/>
    <path d="M78 58 V64"/><path d="M88 58 V64"/>
    <path d="M54 26 H40"/>
    <path d="M54 48 H40"/>
    <path d="M54 70 H40"/>
    <path d="M40 26 V70"/>
    <path d="M116 26 H142 L154 18 H174"/>
    <path class="tart-dash" d="M116 48 H174"/>
    <path d="M116 70 H142 L154 78 H174"/>
  </g>
  <g fill="none" stroke="rgba(54,230,202,.4)" stroke-width="1">
    <path d="M72 44 H62"/><path d="M72 52 H62"/>
    <path d="M94 44 H104"/><path d="M94 52 H104"/>
  </g>
  <g fill="#36e6ca">
    <circle cx="59" cy="26" r="1.7"/>
    <circle cx="59" cy="70" r="1.7"/>
    <circle cx="62" cy="44" r="1.5"/><circle cx="62" cy="52" r="1.5"/>
    <circle cx="104" cy="44" r="1.5"/><circle cx="104" cy="52" r="1.5"/>
    <circle cx="40" cy="48" r="2.4"/>
    <circle cx="178" cy="18" r="6" opacity=".16"/><circle cx="178" cy="18" r="2.6"/>
    <circle cx="178" cy="78" r="6" opacity=".16"/><circle cx="178" cy="78" r="2.6"/>
  </g>
  <g fill="#bf7dff">
    <circle cx="178" cy="48" r="7" opacity=".18"/><circle cx="178" cy="48" r="2.8"/>
  </g>
  <circle cx="178" cy="48" r="12" fill="none" stroke="rgba(191,125,255,.3)" stroke-width="1" stroke-dasharray="2 5"/>
</svg>`;

const SW_ART = `
<svg class="ph-tail-art" viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="none" stroke="rgba(54,230,202,.55)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="58" y="16" width="54" height="16" rx="4" fill="rgba(33,188,165,.07)"/>
    <rect x="58" y="40" width="54" height="16" rx="4" fill="rgba(33,188,165,.07)"/>
    <rect x="58" y="64" width="54" height="16" rx="4" fill="rgba(33,188,165,.07)"/>
    <path d="M58 24 H42"/>
    <path d="M58 48 H42"/>
    <path d="M58 72 H42"/>
    <path d="M42 24 V72"/>
    <path d="M112 24 H140 L154 16 H174"/>
    <path class="tart-dash" d="M112 48 H174"/>
    <path d="M112 72 H140 L154 80 H174"/>
  </g>
  <g fill="none" stroke="rgba(54,230,202,.4)" stroke-width="1">
    <path d="M68 24 H100"/>
    <path d="M68 48 H92"/>
    <path d="M68 72 H96"/>
  </g>
  <g fill="#36e6ca">
    <circle cx="63" cy="24" r="1.7"/>
    <circle cx="63" cy="48" r="1.7"/>
    <circle cx="63" cy="72" r="1.7"/>
    <circle cx="42" cy="48" r="2.4"/>
    <circle cx="178" cy="16" r="6" opacity=".16"/><circle cx="178" cy="16" r="2.6"/>
    <circle cx="178" cy="80" r="6" opacity=".16"/><circle cx="178" cy="80" r="2.6"/>
  </g>
  <g fill="#bf7dff">
    <circle cx="178" cy="48" r="7" opacity=".18"/><circle cx="178" cy="48" r="2.8"/>
  </g>
  <circle cx="178" cy="48" r="12" fill="none" stroke="rgba(191,125,255,.3)" stroke-width="1" stroke-dasharray="2 5"/>
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
  // closing on its shop card.
  host.innerHTML = `
    <div class="ph-row">
      <span class="ph-row-label">Field Hardware</span>
      <div class="ph-scroller" tabindex="0" aria-label="Featured hardware">
        ${HARDWARE.map(cardHtml).join('')}
        ${tailCardHtml({
          title: 'The Hardware Shop',
          sub: 'Everything on the bench: assembled units, kits, and the free plans behind them.',
          mode: 'shop', btnLabel: 'Open the Hardware Shop', art: HW_ART
        })}
      </div>
    </div>
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
