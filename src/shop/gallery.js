// src/shop/gallery.js
// Hardware Shop gallery: search + sort + availability tabs → filtered grid.
// State lives in URL params (?q=&filter=&sort=) so links are shareable and
// the browser back-button restores the shop with the same view.

import { HARDWARE, formatPrice, preorderVariant } from './products.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function availabilityChip(availability) {
  const map = {
    'available':   { label: 'Available',    cls: 'chip-avail' },
    'preorder':    { label: 'Preorder',     cls: 'chip-pre' },
    'coming-soon': { label: 'Coming soon',  cls: 'chip-soon' }
  };
  const meta = map[availability] || { label: availability, cls: 'chip-pre' };
  return `<span class="chip ${meta.cls}">${meta.label}</span>`;
}

function priceLabel(product) {
  const pre = preorderVariant(product);
  if (pre && pre.priceCents != null) return 'Preorder ' + formatPrice(pre.priceCents);
  if (product.priceCents != null) return formatPrice(product.priceCents);
  const cheapest = (product.variants || []).map(v => v.priceCents).filter(c => c != null).sort((a, b) => a - b)[0];
  if (cheapest != null) return 'from ' + formatPrice(cheapest);
  return 'Pricing soon';
}

function cardHtml(p) {
  return `
    <article class="pcard" data-product-id="${escapeHtml(p.id)}">
      <button class="pcard-hit"
              type="button"
              data-action="open-product"
              data-product-id="${escapeHtml(p.id)}"
              aria-label="Open details for ${escapeHtml(p.name)}">
        <div class="pcard-media">
          <img class="pcard-img"
               src="${escapeHtml(p.image)}"
               alt="${escapeHtml(p.name)}"
               loading="lazy">
          ${p.badge ? `<span class="pcard-badge">${escapeHtml(p.badge)}</span>` : ''}
          ${availabilityChip(p.availability)}
        </div>
        <div class="pcard-body">
          <h3 class="pcard-name">${escapeHtml(p.name)}</h3>
          <p class="pcard-tag">${escapeHtml(p.tagline)}</p>
          <p class="pcard-sub">${escapeHtml(p.subtitle)}</p>
          <div class="pcard-foot">
            <span class="pcard-price">${escapeHtml(priceLabel(p))}</span>
            <span class="pcard-cta">View details <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </button>
    </article>
  `;
}

// ---- State: URL-backed so shop links are shareable ----
const DEFAULTS = { q: '', filter: 'all', sort: 'featured' };

function readState() {
  const p = new URLSearchParams(location.hash.split('?')[1] || location.search);
  return {
    q:      p.get('q')      ?? DEFAULTS.q,
    filter: p.get('filter') ?? DEFAULTS.filter,
    sort:   p.get('sort')   ?? DEFAULTS.sort,
  };
}

function writeState(state) {
  const nonDefault = Object.fromEntries(
    Object.entries(state).filter(([k, v]) => v !== DEFAULTS[k] && v !== '')
  );
  const params = new URLSearchParams(nonDefault).toString();
  const url = new URL(location.href);
  url.search = params;
  history.replaceState(null, '', url.toString());
}

// ---- Filter / sort ----
function matchesSearch(p, q) {
  if (!q) return true;
  const hay = [
    p.name, p.tagline, p.subtitle,
    ...(p.features || []).map(f => `${f.title} ${f.body}`),
    ...(p.specs || []).map(s => `${s.k} ${s.v}`)
  ].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(term => hay.includes(term));
}

const AVAILABILITY_RANK = { 'available': 0, 'preorder': 1, 'coming-soon': 2 };

function applySort(list, sort) {
  const copy = list.slice();
  switch (sort) {
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'availability':
      copy.sort((a, b) => (AVAILABILITY_RANK[a.availability] ?? 9) - (AVAILABILITY_RANK[b.availability] ?? 9));
      break;
    case 'featured':
    default:
      /* original catalog order */
      break;
  }
  return copy;
}

function matchesFilter(p, filter) {
  if (filter === 'all') return true;
  // A product with a preorder variant is orderable under the Preorder tab even
  // while its availability label still reads "coming soon".
  if (filter === 'preorder') return p.availability === 'preorder' || !!preorderVariant(p);
  return p.availability === filter;
}

function computeVisible(state) {
  let list = HARDWARE.slice();
  if (state.filter !== 'all') list = list.filter(p => matchesFilter(p, state.filter));
  if (state.q) list = list.filter(p => matchesSearch(p, state.q));
  return applySort(list, state.sort);
}

// ---- Render ----
function renderCount(visible, total) {
  const el = document.getElementById('shopCount');
  if (!el) return;
  if (visible === total) {
    el.innerHTML = `<strong>${total}</strong> ${total === 1 ? 'product' : 'products'}`;
  } else {
    el.innerHTML = `<strong>${visible}</strong> of ${total} ${total === 1 ? 'product' : 'products'}`;
  }
}

function renderList(host, state) {
  const list = computeVisible(state);
  const empty = document.getElementById('shopEmpty');
  if (!list.length) {
    host.innerHTML = '';
    if (empty) empty.hidden = false;
  } else {
    if (empty) empty.hidden = true;
    host.innerHTML = list.map(cardHtml).join('');
  }
  renderCount(list.length, HARDWARE.length);
}

// ---- Wire toolbar ----
let state;

function syncToolbarFromState() {
  const searchInput = document.getElementById('shopSearch');
  const sortSelect  = document.getElementById('shopSort');
  const clearBtn    = document.querySelector('[data-shop-clear-search]');
  if (searchInput && searchInput.value !== state.q) searchInput.value = state.q;
  if (sortSelect  && sortSelect.value  !== state.sort) sortSelect.value = state.sort;
  if (clearBtn) clearBtn.hidden = !state.q;
  document.querySelectorAll('.shop-tab').forEach(t => {
    const active = (t.dataset.shopFilter || 'all') === state.filter;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function refresh(hostId) {
  writeState(state);
  syncToolbarFromState();
  const host = document.getElementById(hostId);
  if (host) renderList(host, state);
}

function debounce(fn, ms = 140) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function bindOnce(hostId) {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  const debouncedSearch = debounce((val) => { state.q = val; refresh(hostId); });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'shopSearch') debouncedSearch(e.target.value.trim());
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'shopSort') { state.sort = e.target.value; refresh(hostId); }
  });

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-shop-filter]');
    if (tab) { e.preventDefault(); state.filter = tab.dataset.shopFilter || 'all'; refresh(hostId); return; }
    if (e.target.closest('[data-shop-clear-search]')) {
      e.preventDefault();
      state.q = '';
      const input = document.getElementById('shopSearch');
      if (input) input.value = '';
      refresh(hostId);
      input?.focus();
      return;
    }
    if (e.target.closest('[data-shop-reset]')) {
      e.preventDefault();
      state = { ...DEFAULTS };
      const input = document.getElementById('shopSearch');
      if (input) input.value = '';
      refresh(hostId);
    }
  });
}

export function renderHardwareGallery(hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  state = readState();
  bindOnce(hostId);
  refresh(hostId);
}
