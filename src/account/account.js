// src/account/account.js
//
// Customer account panel. Three sections, all real:
//   My Products    devices registered to the account, with redemption status
//   Plan & billing subscription state + the billing portal / wizard
//   Sign-in        the email on the account, and (operators only) the lane card
//
// Multi-email management is deliberately absent: the backend has no alias
// routes yet, and a UI that prompts for a password and then 404s is worse than
// no UI. It returns when /v1/auth/aliases ships.

import { PRAG_API_BASE, LANE } from '../runtime/config.js';
import { switchLane, isPlatformOperator } from '../runtime/lane.js';
const MINE_URL = `${PRAG_API_BASE}/warranty/mine`;
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/4gM00beIf91O1Kzc3DdjO00';

let $body = null;
let mounted = false;
let activeSection = 'products';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- identity / session ---------- */

function cachedPing() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}
function hasLiveSession() {
  try {
    if (typeof window.isAccessTokenValid === 'function') return window.isAccessTokenValid();
    return !!JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token;
  } catch { return false; }
}
function accessToken() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || ''; }
  catch { return ''; }
}
function currentEmail() { return cachedPing()?.user?.email || ''; }

async function apiFetch(url, options = {}) {
  const token = accessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data || {};
}

function friendlyError(ex, fallback) {
  if (ex?.status === 404) return 'This feature is not available yet.';
  if (ex instanceof TypeError) return 'Could not reach the API. Check that you are online.';
  return ex?.message || fallback;
}

/* ---------- shell ---------- */

const SECTIONS = [
  { id: 'products',     label: 'My Products' },
  { id: 'subscription', label: 'Plan & billing' },
  { id: 'profile',      label: 'Sign-in' }
];

function shellHtml() {
  return `
    <div class="acct-shell">
      <header class="acct-head">
        <div class="acct-head-id">
          <span class="acct-kicker">Account</span>
          <h1 class="acct-title">${escapeHtml(currentEmail() || 'Signed in')}</h1>
        </div>
        <button class="btn acct-signout" type="button" data-acct-action="logout">Sign out</button>
      </header>
      <nav class="acct-tabs" role="tablist" aria-label="Account sections">
        ${SECTIONS.map(s => `
          <button class="acct-tab ${s.id === activeSection ? 'is-active' : ''}" type="button"
                  role="tab" aria-selected="${s.id === activeSection ? 'true' : 'false'}"
                  data-acct-section="${s.id}">${escapeHtml(s.label)}</button>
        `).join('')}
      </nav>
      <main class="acct-main" id="acctMain"><!-- section --></main>
    </div>
  `;
}

/* ---------- section: my products (registered warranties) ---------- */

const PRODUCT_NAMES = { omnisource: 'OmniSource', omnibus: 'OmniBus' };

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function productItemHtml(it) {
  const name = PRODUCT_NAMES[it.productId] || it.productId || 'Device';
  const e = it.eligibility || {};
  let statusHtml, action;
  if (e.pendingRedemptionId) {
    statusHtml = '<span class="acct-tag is-pending">Redemption in progress</span>';
    action = '';
  } else if (e.eligible) {
    statusHtml = '<span class="acct-tag is-verified">Redemption available</span>';
    action = `<button class="btn btn-sm" type="button" data-acct-action="redeem-product" data-code="${escapeHtml(it.code || '')}">Redeem warranty</button>`;
  } else if (e.nextEligibleAt) {
    statusHtml = `<span class="acct-tag">Next redemption ${escapeHtml(fmtDate(e.nextEligibleAt))}</span>`;
    action = '';
  } else {
    statusHtml = '<span class="acct-tag is-verified">Covered</span>';
    action = '';
  }
  return `
    <li class="acct-product">
      <div class="acct-product-main">
        <span class="acct-product-name">${escapeHtml(name)}</span>
        <code class="acct-product-code">${escapeHtml(it.code || '')}</code>
        <span class="acct-product-meta">Registered ${escapeHtml(fmtDate(it.registeredAt))}${
          it.redemptionCount ? ` · ${it.redemptionCount} redemption${it.redemptionCount === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div class="acct-product-side">
        ${statusHtml}
        ${action}
      </div>
    </li>
  `;
}

async function renderProducts(main) {
  main.innerHTML = `
    <section class="acct-card">
      <h2 class="acct-card-h">My Products</h2>
      <p class="acct-card-note">Devices registered to your account. Lifetime case coverage; one redemption per year, per device.</p>
      <ul class="acct-product-list" id="acctProductList"><li class="acct-loading">Loading…</li></ul>
      <p class="acct-error" id="acctProductsError" hidden></p>
    </section>
  `;
  const host = document.getElementById('acctProductList');
  try {
    const data = await apiFetch(`${MINE_URL}`);
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      host.innerHTML = `<li class="acct-empty">No registered products yet. Register a device on
        <a href="#" data-acct-action="go-register">the warranty page</a> and it will appear here.</li>`;
      return;
    }
    host.innerHTML = items.map(productItemHtml).join('');
  } catch (ex) {
    host.innerHTML = '';
    showError('acctProductsError', friendlyError(ex, 'Could not load your products.'));
  }
}

/* ---------- section: plan & billing ---------- */

function renderSubscription(main) {
  const bp = cachedPing()?.billingProfile || null;
  const tier = cachedPing()?.user?.tier || 'free';
  const status = (bp?.status || '').toUpperCase();
  const active = status === 'ACTIVE';
  main.innerHTML = `
    <section class="acct-card">
      <h2 class="acct-card-h">Plan &amp; billing</h2>
      <div class="acct-plan">
        <span class="acct-plan-tier">${escapeHtml(tier)}</span>
        <span class="acct-tag ${active ? 'is-verified' : 'is-pending'}">${escapeHtml(status || 'Not subscribed')}</span>
      </div>
      <p class="acct-card-note">${active
        ? 'Your platform subscription is active. Manage the plan, payment method, add-ons, or cancel through the billing portal.'
        : 'You are on the free tier. Subscribe to publish builds, sync to the cloud, and use the API.'}</p>
      <div class="acct-actions-row">
        ${active
          ? `<a class="cta" href="${STRIPE_PORTAL_URL}" target="_blank" rel="noopener">Manage billing</a>`
          : `<button class="cta" type="button" data-acct-action="subscribe">Subscribe</button>`}
      </div>
    </section>
  `;
}

/* ---------- section: sign-in ---------- */

// Platform-level operators (isAdmin or isDev on the OWNER's Users table) can
// route this browser to the dev sandbox. Each lane is its own platform with
// its own accounts. When the two accounts are linked the switch is seamless
// (the source lane vouches for you, no password); otherwise it opens sign-in
// on the target. Either way the session comes back fresh; nothing runs stale.
function platformLaneCardHtml() {
  if (!isPlatformOperator()) return '';
  return `
    <section class="acct-card">
      <h2 class="acct-card-h">Platform lane</h2>
      <p class="acct-card-note">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane.
      When your accounts are linked, switching is seamless; otherwise it asks you to sign in on the
      other lane. The site itself never changes, only where your calls go.</p>
      <div class="acct-actions-row">
        <button class="btn btn-sm" type="button" data-acct-action="lane-live" ${LANE === 'live' ? 'disabled' : ''}>Switch to live</button>
        <button class="btn btn-sm" type="button" data-acct-action="lane-dev" ${LANE === 'dev' ? 'disabled' : ''}>Switch to dev</button>
      </div>
    </section>
  `;
}

function renderProfile(main) {
  main.innerHTML = `
    <section class="acct-card">
      <h2 class="acct-card-h">Sign-in</h2>
      <p class="acct-card-note">You sign in with this email. It is also where account and recovery mail is sent.</p>
      <div class="acct-signin-row">
        <span class="acct-signin-email">${escapeHtml(currentEmail())}</span>
        <span class="acct-tag is-primary">Primary</span>
      </div>
      <p class="acct-card-note acct-card-note-tight">To change your password, sign out and use
      &ldquo;Forgot password&rdquo; on the sign-in screen.</p>
    </section>
    ${platformLaneCardHtml()}
  `;
}

/* ---------- routing ---------- */

function showSection(id) {
  activeSection = id;
  document.querySelectorAll('.acct-tab').forEach(b => {
    const on = b.dataset.acctSection === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const main = document.getElementById('acctMain');
  if (!main) return;
  if (id === 'products')     return void renderProducts(main);
  if (id === 'subscription') return renderSubscription(main);
  if (id === 'profile')      return renderProfile(main);
}

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (message) { el.textContent = message; el.hidden = false; } else { el.textContent = ''; el.hidden = true; }
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-acct-section]');
    if (nav) { e.preventDefault(); showSection(nav.dataset.acctSection); return; }
    const act = e.target.closest('[data-acct-action]');
    if (!act) return;
    e.preventDefault();
    const a = act.dataset.acctAction;
    if (a === 'logout') return void window.logout?.();
    if (a === 'subscribe') return void (window.openWizardFromMenu?.() || window.setAppMode?.('wizard'));
    if (a === 'lane-live') return void switchLane('live');
    if (a === 'lane-dev') return void switchLane('dev');
    if (a === 'redeem-product') {
      try { sessionStorage.setItem('pragoptics_redeem_prefill', act.dataset.code || ''); } catch {}
      window.location.hash = '#redeem';
      return void window.setAppMode?.('warranty');
    }
    if (a === 'go-register') { window.location.hash = '#warranty'; return void window.setAppMode?.('warranty'); }
  });
}

export function initAccountView() {
  $body = document.getElementById('accountBody');
  if (!$body) return;
  bindOnce();
  // Deep link from the warranty success screen: jump to a named section.
  window.addEventListener('pragoptics:account-section', (e) => {
    const target = e?.detail;
    if (target && SECTIONS.some(s => s.id === target)) {
      if (mounted) showSection(target); else activeSection = target;
    }
  });
}

export function onAccountEnter() {
  if (!$body) return;
  if (!hasLiveSession()) {
    $body.innerHTML = '';
    mounted = false;
    window.openLoginModal?.() || window.setAppMode?.('landing');
    return;
  }
  if (!mounted) { activeSection = 'products'; $body.innerHTML = shellHtml(); mounted = true; }
  showSection(activeSection);
}
