// src/shop/product-modal.js
// Full-screen product detail modal.  Opens with openProductModal(productId).

import { getProduct, formatPrice, preorderVariant, isPreorder, SHOP_LIVE } from './products.js';
import { addItem, addDonation } from './cart.js';
import { openCart } from './cart-drawer.js';
import { createModelViewer } from '../components/modelViewer.js';

let $mask, $panel, $close, $body;
let currentProductId = null;
let lastFocus = null;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function priceForVariant(v) {
  return v?.priceCents != null ? formatPrice(v.priceCents) : 'Pricing soon';
}

function variantHtml(p) {
  // Only offer the chooser when there is a real choice; a single variant is
  // applied automatically via the action button's data-variant.
  if (!p.variants?.length || p.variants.length < 2) return '';
  return `
    <div class="pm-variants">
      <h4 class="pm-h4">Choose an option</h4>
      <div class="pm-variant-list">
        ${p.variants.map((v, i) => `
          <label class="pm-variant">
            <input type="radio" name="pm-variant-${escapeHtml(p.id)}" value="${escapeHtml(v.id)}" ${i === 0 ? 'checked' : ''}>
            <span class="pm-variant-body">
              <span class="pm-variant-name">${escapeHtml(v.name)}</span>
              <span class="pm-variant-price">${escapeHtml(priceForVariant(v))}</span>
              ${v.note ? `<span class="pm-variant-note">${escapeHtml(v.note)}</span>` : ''}
            </span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function galleryHtml(p) {
  // Hardware leads with its photo; software has no photo, so fall back to its
  // splash banner (best) or app icon so the modal always has a hero image.
  const fallback = p.image || p.splash || p.icon;
  const items = p.gallery?.length ? p.gallery : (fallback ? [{ src: fallback, alt: p.name, kind: 'photo' }] : []);
  if (!items.length) return '';
  return `
    <div class="pm-gallery">
      <div class="pm-hero">
        <img class="pm-hero-img" src="${escapeHtml(items[0].src)}" alt="${escapeHtml(items[0].alt || p.name)}">
      </div>
      ${items.length > 1 ? `
        <div class="pm-thumbs">
          ${items.map((it, i) => `
            <button class="pm-thumb ${i === 0 ? 'is-active' : ''}"
                    type="button"
                    data-pm-thumb="${escapeHtml(it.src)}"
                    data-pm-alt="${escapeHtml(it.alt || p.name)}"
                    aria-label="View ${escapeHtml(it.alt || p.name)}">
              <img src="${escapeHtml(it.src)}" alt="">
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function priceBlockHtml(p) {
  // Software shows its access label (Free / Subscription / Beta …), not a $ figure.
  if (p.category === 'software') {
    return p.priceLabel ? `<div class="pm-price"><span class="pm-price-main">${escapeHtml(p.priceLabel)}</span></div>` : '';
  }
  const pre = preorderVariant(p);
  if (isPreorder(p) && pre && p.priceCents != null) {
    const balance = formatPrice(p.priceCents - pre.priceCents);
    return `
      <div class="pm-price pm-price-preorder">
        <span class="pm-price-main">${escapeHtml(formatPrice(p.priceCents))}</span>
        <span class="pm-price-note">Preorder: ${escapeHtml(formatPrice(pre.priceCents))} deposit today · ${escapeHtml(balance)} on ship</span>
      </div>
    `;
  }
  const base = p.priceCents ?? p.variants?.[0]?.priceCents ?? null;
  if (base != null) {
    return `<div class="pm-price"><span class="pm-price-main">${escapeHtml(formatPrice(base))}</span></div>`;
  }
  return '';
}

// Software isn't a checkout item — it downloads free, opens a demo, or
// subscribes. Mirror the card's action (external / wizard / notify), plus an
// optional donation: the only cart line software ever creates ($1 default,
// freely adjustable in the drawer).
function softwareActionsHtml(p) {
  const a = p.action || {};
  const label = escapeHtml(a.label || 'Learn more');
  const donate = `<button class="btn sw-donate" type="button" data-pm-donate data-product-id="${escapeHtml(p.id)}" title="Free to download — donations keep it that way">♥ Donate</button>`;
  if (a.kind === 'external' && a.href) {
    return `<div class="pm-actions"><a class="cta" href="${escapeHtml(a.href)}" target="_blank" rel="noopener noreferrer">${label}</a>${donate}</div>`;
  }
  if (a.kind === 'wizard') {
    return `<div class="pm-actions"><button class="cta" type="button" data-pm-wizard>${label}</button>${donate}</div>`;
  }
  // Notify captures an email through checkout, which waits on the backend seam.
  if (!SHOP_LIVE) return `<div class="pm-actions"><button class="cta" type="button" disabled>Coming soon</button>${donate}</div>`;
  return `<div class="pm-actions"><button class="cta" type="button" data-pm-notify data-product-id="${escapeHtml(p.id)}">${label}</button>${donate}</div>`;
}

function actionsHtml(p) {
  if (p.category === 'software') return softwareActionsHtml(p);
  const pre = preorderVariant(p);
  const soon = p.availability === 'coming-soon' || p.availability === 'preorder';

  if (soon && pre) {
    return `
      <div class="pm-actions">
        <button class="cta pm-add" type="button"
                data-pm-add data-product-id="${escapeHtml(p.id)}" data-variant="preorder">
          Preorder: ${escapeHtml(formatPrice(pre.priceCents))} deposit
        </button>
        ${SHOP_LIVE ? `<button class="btn" type="button"
                data-pm-notify data-product-id="${escapeHtml(p.id)}">
          Notify me at launch
        </button>` : ''}
      </div>
    `;
  }

  if (soon) {
    // Notify captures an email through checkout, which waits on the backend seam.
    if (!SHOP_LIVE) {
      return `
        <div class="pm-actions">
          <button class="cta" type="button" disabled>Coming soon</button>
        </div>
      `;
    }
    return `
      <div class="pm-actions">
        <button class="cta" type="button"
                data-pm-notify data-product-id="${escapeHtml(p.id)}">
          Notify me at launch
        </button>
      </div>
    `;
  }

  const defaultVariant = p.variants?.[0]?.id || '';
  return `
    <div class="pm-actions">
      <button class="cta pm-add" type="button"
              data-pm-add data-product-id="${escapeHtml(p.id)}" data-variant="${escapeHtml(defaultVariant)}">
        Add to cart
      </button>
      <button class="btn" type="button"
              data-pm-add-and-view data-product-id="${escapeHtml(p.id)}" data-variant="${escapeHtml(defaultVariant)}">
        Add &amp; open cart
      </button>
    </div>
  `;
}

const DL_ICON = '<svg class="dl-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

// A common download button (the down-arrow-to-bar glyph) that pops a small glass
// selector of the available file types. Reused for schematic today, model later.
function dlSelectorHtml(name, formats) {
  if (!formats?.length) return '';
  return `
    <div class="dl" data-dl>
      <button class="dl-trigger" type="button" data-dl-toggle aria-haspopup="true" aria-expanded="false" aria-label="Download ${escapeHtml(name)}">
        ${DL_ICON}
      </button>
      <div class="dl-menu" data-dl-menu hidden role="menu">
        <span class="dl-menu-head">Click to download</span>
        ${formats.map(f => `<a class="dl-item" role="menuitem" href="${escapeHtml(f.href)}" download><span>${escapeHtml(f.ext)}</span>${DL_ICON}</a>`).join('')}
      </div>
    </div>`;
}

function schematicHtml(p) {
  const s = p.schematic;
  if (!s) return '';
  // Schematic is a SINGLE file — the download icon downloads the PDF directly.
  // (The glass multi-type dropdown, dlSelectorHtml, is reserved for the model
  //  files — STL / 3MF — which take several formats.)
  const dl = s.download
    ? `<a class="dl-trigger" href="${escapeHtml(s.download)}" download aria-label="Download ${escapeHtml(s.title || 'schematic')}">${DL_ICON}</a>`
    : '';
  return `
    <section class="pm-schematic">
      <div class="pm-sch-head">
        <h3 class="pm-h3">${escapeHtml(s.title || 'Schematic')}</h3>
        ${dl}
      </div>
      ${s.image ? `<div class="pm-sch-frame"><img class="pm-sch-img" src="${escapeHtml(s.image)}" alt="${escapeHtml(p.name)} schematic"></div>` : ''}
    </section>`;
}

function modelHtml(p) {
  const m = p.model;
  if (!m) return '';
  // Print files — same embed treatment as the schematic. Either a flat
  // `formats` list (one selector) or `groups` (a row per part group, each
  // with its own material/supports meta and glass multi-format selector).
  const groupRows = (m.groups || []).map(g => `
    <div class="pm-model-group">
      <div class="pm-mg-info">
        <span class="pm-mg-name">${escapeHtml(g.name)}</span>
        <span class="pm-mg-meta">${escapeHtml(g.material)} · ${escapeHtml(g.supports)}</span>
      </div>
      ${dlSelectorHtml(g.name, g.formats)}
    </div>
  `).join('');
  // Live 3D preview of the ACTUAL print files — no screenshots to go stale.
  // The static image only appears as a fallback when WebGL is unavailable.
  const hasFiles = (m.groups?.length || m.formats?.length);
  const stage = hasFiles
    ? `<div class="pm-sch-frame pm-sch-frame--dark pm-viewer" data-pm-viewer></div>`
    : (m.image ? `<div class="pm-sch-frame pm-sch-frame--dark"><img class="pm-sch-img" src="${escapeHtml(m.image)}" alt="${escapeHtml(p.name)} model"></div>` : '');
  return `
    <section class="pm-schematic pm-model">
      <div class="pm-sch-head">
        <h3 class="pm-h3">${escapeHtml(m.title || 'Print files')}</h3>
        ${m.groups?.length ? '' : dlSelectorHtml(m.title || 'model', m.formats)}
      </div>
      ${stage}
      ${groupRows ? `<div class="pm-model-groups">${groupRows}</div>` : ''}
      ${m.note ? `<p class="pm-model-note">${escapeHtml(m.note)}</p>` : ''}
      ${m.profilesJson ? `<div class="pm-profiles" data-profiles-src="${escapeHtml(m.profilesJson.href)}"></div>` : ''}
      <div class="pm-model-links">
        ${m.profileDoc ? `<a class="pm-model-doc" href="${escapeHtml(m.profileDoc.href)}">${escapeHtml(m.profileDoc.label)} →</a>` : ''}
        ${m.profilesJson ? `<a class="pm-model-doc" href="${escapeHtml(m.profilesJson.href)}" download>${escapeHtml(m.profilesJson.label)} ↓</a>` : ''}
      </div>
    </section>`;
}

// Mount the live 3D viewer over the product's real print files. Sources come
// straight from the catalog's model block (groups or flat formats); default is
// the first 3MF (smallest download), falling back to the first file.
let activeViewer = null;
function hydrateViewer(root, p) {
  const hostEl = root.querySelector('[data-pm-viewer]');
  if (!hostEl || !p.model) return;
  const m = p.model;
  const sources = (m.groups?.length
    ? m.groups.flatMap(g => (g.formats || []).map(f => ({ label: f.label || `${g.name} · ${f.ext}`, href: f.href })))
    : (m.formats || []).map(f => ({ label: f.label || f.ext, href: f.href })));
  if (!sources.length) return;
  let defaultIndex = sources.findIndex(s => /\.3mf(\?|$)/i.test(s.href));
  if (defaultIndex < 0) defaultIndex = 0;
  activeViewer = createModelViewer(hostEl, sources, { defaultIndex, fallbackImage: m.image });
}

// Fetch print-profiles.json and render it as a styled table — the JSON on disk
// is the single source of truth; the UI just reflects it.
async function hydrateProfiles(root) {
  const host = root.querySelector('[data-profiles-src]');
  if (!host) return;
  let data;
  try {
    const res = await fetch(host.dataset.profilesSrc);
    if (!res.ok) return;
    data = await res.json();
  } catch { return; }
  const profiles = data?.profiles || [];
  if (!profiles.length) return;
  const cell = (v) => {
    const s = String(v ?? 'TBD');
    return s === 'TBD' ? '<span class="pm-tbd">⟨TBD⟩</span>' : escapeHtml(s);
  };
  const row = (k, v) => `<tr><th>${escapeHtml(k)}</th><td>${cell(v)}</td></tr>`;
  const stage = (title, st, withCount) => {
    if (!st) return '';
    return `
      <tr class="pm-pt-sec"><th colspan="2">${escapeHtml(title)}</th></tr>
      ${withCount ? row('Layers', st.layers) : ''}
      ${row('Exposure', st.exposure)}
      ${row('Lift (two-stage)', st.lift)}
      ${row('Lift speed', st.liftSpeed)}
      ${row('Retract (two-stage)', st.retract)}
      ${row('Retract speed', st.retractSpeed)}
      ${row('Wait before print', st.waitBeforePrint)}
      ${row('Wait after print', st.waitAfterPrint)}
    `;
  };
  host.innerHTML = profiles.map(pr => {
    const s = pr.settings || {};
    return `
    <table class="pm-profile-table">
      <caption>${escapeHtml((pr.parts || []).join(' + '))} — ${escapeHtml(pr.material || '')}</caption>
      <tbody>
        ${row('Orientation', pr.orientation)}
        ${row('Supports', pr.supports)}
        ${row('Layer height', s.layerHeight)}
        ${row('Transition layers', s.transitionLayers)}
        ${row('Light intensity', s.lightIntensity)}
        ${stage('Bottom layers', s.bottom, true)}
        ${stage('Normal layers', s.normal, false)}
      </tbody>
    </table>
  `;
  }).join('');
}

function bodyHtml(p) {
  // A software product with a production splash leads with it full-width, then a
  // single info column (it has no gallery/specs to balance a second column).
  const wideSplash = !!p.splash && !p.image && !p.gallery?.length;
  // Reserve the banner's exact aspect box up front (splashAspect) so it doesn't
  // collapse-then-jump while the splash loads. Matching aspect = cover with no crop.
  const banner = wideSplash
    ? `<div class="pm-banner${p.splashAspect ? ' pm-banner--fixed' : ''}"${p.splashAspect ? ` style="aspect-ratio:${escapeHtml(p.splashAspect)}"` : ''}><img class="pm-banner-img" src="${escapeHtml(p.splash)}" alt="${escapeHtml(p.name)}"></div>`
    : '';
  return `
    ${banner}
    <div class="pm-grid${wideSplash ? ' pm-grid--solo' : ''}">
      ${wideSplash ? '' : galleryHtml(p)}
      <div class="pm-info">
        <div class="pm-head">
          <h2 class="pm-name">${escapeHtml(p.name)}</h2>
          <p class="pm-tag">${escapeHtml(p.tagline)}</p>
          <p class="pm-sub">${escapeHtml(p.subtitle)}</p>
        </div>

        ${p.features?.length ? `
          <ul class="pm-features">
            ${p.features.map(f => {
              // Hardware features are { title, body }; software features are plain strings.
              const t = typeof f === 'string' ? f : f.title;
              const b = typeof f === 'string' ? '' : f.body;
              return `
              <li>
                <span class="pm-feature-t">${escapeHtml(t)}</span>
                ${b ? `<span class="pm-feature-b">${escapeHtml(b)}</span>` : ''}
              </li>`;
            }).join('')}
          </ul>
        ` : ''}

        ${variantHtml(p)}

        ${priceBlockHtml(p)}

        ${actionsHtml(p)}

        ${p.kit?.items?.length ? `
          <section class="pm-kit">
            <h3 class="pm-kit-h">${escapeHtml(p.kit.title || "What's in the box")}</h3>
            ${p.kit.intro ? `<p class="pm-kit-intro">${escapeHtml(p.kit.intro)}</p>` : ''}
            <ol class="pm-kit-list">
              ${p.kit.items.map(it => `
                <li class="pm-kit-item">
                  <span class="pm-kit-title">${escapeHtml(it.title)}</span>
                  <span class="pm-kit-body">${escapeHtml(it.body)}</span>
                </li>
              `).join('')}
            </ol>
          </section>
        ` : ''}
      </div>
    </div>

    ${p.specs?.length ? `
      <section class="pm-specs">
        <h3 class="pm-h3">Specs at a glance</h3>
        <dl class="pm-spec-grid">
          ${p.specs.map(s => `
            <div class="pm-spec-row">
              <dt>${escapeHtml(s.k)}</dt>
              <dd>${escapeHtml(s.v)}</dd>
            </div>
          `).join('')}
        </dl>
      </section>
    ` : ''}

    ${schematicHtml(p)}

    ${modelHtml(p)}

    ${p.downloads?.length ? `
      <section class="pm-downloads">
        <h3 class="pm-h3">Docs &amp; downloads</h3>
        <div class="pm-download-list">
          ${p.downloads.map(d => {
            // 'legal' opens in the on-page markdown viewer, the same one the
            // footer Terms/Privacy links use. href stays as a no-JS fallback.
            if (d.kind === 'legal') {
              return `<a class="btn" href="${escapeHtml(d.href)}" data-legal="${escapeHtml(d.legal)}">${escapeHtml(d.label)}</a>`;
            }
            if (d.kind === 'link') {
              return `<a class="btn" href="${escapeHtml(d.href)}">${escapeHtml(d.label)}</a>`;
            }
            return `<span class="btn pm-download-pending" aria-disabled="true">${escapeHtml(d.label)}</span>`;
          }).join('')}
        </div>
      </section>
    ` : ''}

    ${p.license ? `
      <section class="pm-license">
        <h3 class="pm-h3">License</h3>
        <p>${escapeHtml(p.license)}</p>
      </section>
    ` : ''}
  `;
}

function selectedVariantId(productId) {
  const radio = document.querySelector(`.pm-variant input[name="pm-variant-${productId}"]:checked`);
  return radio ? radio.value : null;
}

function ensureRefs() {
  $mask  = document.getElementById('productMask');
  $panel = document.getElementById('productPanel');
  $close = document.getElementById('productClose');
  $body  = document.getElementById('productBody');
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
    // Download-format popover (glass file-type selector)
    const dlToggle = e.target.closest('[data-dl-toggle]');
    if (dlToggle) {
      e.preventDefault();
      const menu = dlToggle.parentElement.querySelector('[data-dl-menu]');
      const willOpen = !!(menu && menu.hidden);
      ($panel || document).querySelectorAll('[data-dl-menu]').forEach(m => { m.hidden = true; });
      if (menu) menu.hidden = !willOpen;
      dlToggle.setAttribute('aria-expanded', String(willOpen));
      return;
    }
    if (e.target.closest('.dl-item')) {
      setTimeout(() => { ($panel || document).querySelectorAll('[data-dl-menu]').forEach(m => { m.hidden = true; }); }, 60);
      return; // let the download proceed
    }
    if (!e.target.closest('[data-dl]')) {
      ($panel || document).querySelectorAll('[data-dl-menu]').forEach(m => { m.hidden = true; });
    }

    if (e.target === $mask) { closeProductModal(); return; }
    const closer = e.target.closest('[data-pm-close]');
    if (closer) { e.preventDefault(); closeProductModal(); return; }

    const thumb = e.target.closest('[data-pm-thumb]');
    if (thumb) {
      const src = thumb.dataset.pmThumb;
      const alt = thumb.dataset.pmAlt || '';
      const hero = $panel?.querySelector('.pm-hero-img');
      if (hero) { hero.src = src; hero.alt = alt; }
      $panel?.querySelectorAll('.pm-thumb').forEach(t => t.classList.remove('is-active'));
      thumb.classList.add('is-active');
      return;
    }

    const wizardBtn = e.target.closest('[data-pm-wizard]');
    if (wizardBtn) {
      e.preventDefault();
      closeProductModal();
      if (typeof window.openAgreementModal === 'function') window.openAgreementModal();
      else window.setAppMode?.('software');
      return;
    }

    const notifyBtn = e.target.closest('[data-pm-notify]');
    if (notifyBtn) {
      e.preventDefault();
      const pid = notifyBtn.dataset.productId;
      // Hand off to the checkout notify flow (email capture, no cart line).
      try { localStorage.setItem('pragoptics_notify_intent_v1', pid || ''); } catch {}
      closeProductModal();
      window.setAppMode?.('checkout');
      return;
    }

    const donateBtn = e.target.closest('[data-pm-donate]');
    if (donateBtn) {
      e.preventDefault();
      addDonation(donateBtn.dataset.productId, 100);
      closeProductModal();
      openCart();
      return;
    }

    const addBtn = e.target.closest('[data-pm-add], [data-pm-add-and-view]');
    if (addBtn) {
      e.preventDefault();
      const pid = addBtn.dataset.productId;
      // Radio chooser wins when present (multi-variant); otherwise use the
      // single variant carried on the button.
      const vid = selectedVariantId(pid) || addBtn.dataset.variant || null;
      addItem(pid, vid, 1);
      if (addBtn.hasAttribute('data-pm-add-and-view')) {
        closeProductModal();
        openCart();
      } else {
        flashAdded(addBtn);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $panel?.classList.contains('is-open')) closeProductModal();
  });
}

function flashAdded(btn) {
  const orig = btn.textContent;
  btn.textContent = 'Added ✓';
  btn.classList.add('is-added');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('is-added'); }, 1200);
}

export function openProductModal(productId) {
  ensureRefs();
  if (!$mask || !$panel || !$body) return;

  const p = getProduct(productId);
  if (!p) return;

  currentProductId = productId;
  lastFocus = document.activeElement;

  $body.innerHTML = bodyHtml(p);
  hydrateProfiles($body);
  hydrateViewer($body, p);
  $mask.classList.add('is-open');
  $panel.classList.add('is-open');
  $mask.setAttribute('aria-hidden', 'false');
  $panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  bindOnce();
  $close?.focus();
}

export function closeProductModal() {
  if (!$mask || !$panel) return;
  activeViewer?.destroy();
  activeViewer = null;
  $mask.classList.remove('is-open');
  $panel.classList.remove('is-open');
  $mask.setAttribute('aria-hidden', 'true');
  $panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentProductId = null;
  if (lastFocus?.focus) try { lastFocus.focus(); } catch {}
}

export function initProductModal() {
  ensureRefs();
  bindOnce();
}
