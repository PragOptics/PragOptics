// src/account/account.js
//
// Customer account panel: the signed-in surface for managing the account
// itself. Sections: Profile (email addresses), Subscription, Orders, Builds.
//
// The email-management calls hit the identity endpoints designed for the
// multi-address backend (GET/POST /v1/auth/aliases, .../confirm, .../primary,
// .../remove). Every mutating call is step-up: it carries the account password
// and, for set-primary / remove, an OTP delivered to the current primary. The
// panel is built to that contract; until the backend ships those routes it
// shows a friendly "not available yet" rather than breaking.

import { PRAG_API_BASE, LANE } from '../runtime/config.js';
import { switchLane, isPlatformOperator } from '../runtime/lane.js';
const ALIASES_URL = `${PRAG_API_BASE}/auth/aliases`;
const MINE_URL = `${PRAG_API_BASE}/warranty/mine`;
const REQUEST_CODE_URL = `${PRAG_API_BASE}/auth/request-code`;
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/4gM00beIf91O1Kzc3DdjO00';

let $body = null;
let mounted = false;
let activeSection = 'profile';

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
  if (ex?.status === 401) return 'That password did not match. Try again.';
  if (ex instanceof TypeError) return 'Could not reach the API. Check that you are online.';
  return ex?.message || fallback;
}

/* ---------- shell ---------- */

const ICONS = {
  profile:      '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  products:     '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  subscription: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  orders:       '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  builds:       '<path d="M12 2l9 4.9V17L12 22 3 17V6.9z"/><path d="M12 22V12"/><path d="M21 7l-9 5-9-5"/>'
};
const SECTIONS = [
  { id: 'profile',      label: 'Profile' },
  { id: 'products',     label: 'My Products' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'orders',       label: 'Orders' },
  { id: 'builds',       label: 'My Builds' }
];
function icon(id) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;
}

function shellHtml() {
  return `
    <div class="acct-shell">
      <nav class="acct-side" aria-label="Account sections">
        <div class="acct-side-brand">
          <span class="acct-side-kicker">Account</span>
          <span class="acct-side-title">${escapeHtml(currentEmail() || 'You')}</span>
        </div>
        <ul class="acct-nav">
          ${SECTIONS.map(s => `
            <li><button class="acct-nav-item ${s.id === activeSection ? 'is-active' : ''}" type="button"
                data-acct-section="${s.id}" aria-current="${s.id === activeSection ? 'page' : 'false'}">
              <span class="acct-nav-ico">${icon(s.id)}</span><span>${escapeHtml(s.label)}</span>
            </button></li>
          `).join('')}
        </ul>
        <div class="acct-side-foot">
          <button class="btn acct-signout" type="button" data-acct-action="logout">Sign out</button>
        </div>
      </nav>
      <main class="acct-main" id="acctMain"><!-- section --></main>
    </div>
  `;
}

/* ---------- section: profile (email addresses) ---------- */

function aliasRowHtml(a) {
  const primary = a.isPrimary || a.primary;
  const verified = a.state === 'VERIFIED' || a.verified === true;
  const pending = a.state === 'PENDING' || a.verified === false;
  return `
    <li class="acct-alias" data-alias-id="${escapeHtml(a.aliasId || '')}">
      <div class="acct-alias-main">
        <span class="acct-alias-email">${escapeHtml(a.displayEmail || a.email || a.value || '')}</span>
        <span class="acct-alias-tags">
          ${primary ? '<span class="acct-tag is-primary">Primary</span>' : ''}
          ${verified && !primary ? '<span class="acct-tag is-verified">Verified</span>' : ''}
          ${pending ? '<span class="acct-tag is-pending">Unverified</span>' : ''}
        </span>
      </div>
      <div class="acct-alias-actions">
        ${verified && !primary ? `<button class="btn btn-sm" type="button" data-acct-action="make-primary" data-alias="${escapeHtml(a.aliasId)}">Make primary</button>` : ''}
        ${!primary ? `<button class="btn btn-sm btn-ghost" type="button" data-acct-action="remove-alias" data-alias="${escapeHtml(a.aliasId)}">Remove</button>` : ''}
        ${pending ? `<button class="btn btn-sm" type="button" data-acct-action="verify-alias" data-alias="${escapeHtml(a.aliasId)}" data-claim="${escapeHtml(a.claimId || '')}">Enter code</button>` : ''}
      </div>
    </li>
  `;
}

async function renderProfile(main) {
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Profile</h2></header>
    <section class="acct-card">
      <h3 class="acct-card-h">Email addresses</h3>
      <p class="acct-card-note">Any verified address can sign you in. Your primary address is where account and recovery mail is sent.</p>
      <ul class="acct-alias-list" id="acctAliasList"><li class="acct-loading">Loading…</li></ul>
      <div class="acct-add-row">
        <input class="acct-input" id="acctNewEmail" type="email" autocomplete="email" placeholder="add another email…" aria-label="New email address">
        <button class="cta btn-sm" type="button" data-acct-action="add-alias">Add</button>
      </div>
      <p class="acct-error" id="acctProfileError" hidden></p>
    </section>
    ${platformLaneCardHtml()}
  `;
  await loadAliases();
}

/* ---------- platform lane (operators only) ---------- */

// Platform-level operators (isAdmin or isDev on the OWNER's Users table) can
// route this browser to the dev sandbox. Each lane is its own platform with
// its own accounts, so switching signs you out and opens sign-in on the
// target lane; nothing from this session carries over or runs stale. The
// gate is cosmetic, like every front-end gate: the sandbox authenticates
// server-side against its own tables regardless.
function platformLaneCardHtml() {
  if (!isPlatformOperator()) return '';
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Platform lane</h3>
      <p class="acct-card-note">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane.
      Switching lanes signs you out and asks you to sign in on the other lane with that lane's
      account; the site itself never changes, only where your calls go.</p>
      <div class="acct-add-row">
        <button class="btn btn-sm" type="button" data-acct-action="lane-live" ${LANE === 'live' ? 'disabled' : ''}>Sign in to live</button>
        <button class="btn btn-sm" type="button" data-acct-action="lane-dev" ${LANE === 'dev' ? 'disabled' : ''}>Sign in to dev</button>
      </div>
    </section>
  `;
}

async function loadAliases() {
  const host = document.getElementById('acctAliasList');
  if (!host) return;
  showError('acctProfileError', '');
  try {
    const data = await apiFetch(ALIASES_URL);
    const list = data.aliases || data.addresses || [];
    if (!list.length) {
      // Fall back to the ping's primary so the section is never empty.
      host.innerHTML = aliasRowHtml({ displayEmail: currentEmail(), isPrimary: true, state: 'VERIFIED' });
      return;
    }
    host.innerHTML = list.map(aliasRowHtml).join('');
  } catch (ex) {
    // Until the endpoint ships, show the current primary from the ping.
    host.innerHTML = aliasRowHtml({ displayEmail: currentEmail(), isPrimary: true, state: 'VERIFIED' });
    if (ex.status && ex.status !== 404) showError('acctProfileError', friendlyError(ex, 'Could not load addresses.'));
  }
}

/* ---------- step-up prompt (password, and optionally an OTP) ---------- */

function stepUpHtml({ title, note, needCode }) {
  return `
    <div class="acct-modal-mask" data-acct-close></div>
    <div class="acct-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <h3 class="acct-modal-h">${escapeHtml(title)}</h3>
      <p class="acct-modal-note">${escapeHtml(note)}</p>
      <label class="acct-label" for="suPass">Account password</label>
      <input class="acct-input" id="suPass" type="password" autocomplete="current-password" placeholder="Your password">
      ${needCode ? `
        <label class="acct-label" for="suCode">Verification code</label>
        <input class="acct-input" id="suCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" maxlength="6">
      ` : ''}
      <p class="acct-error" id="suError" hidden></p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-acct-close>Cancel</button>
        <button class="cta" type="button" data-acct-confirm>Confirm</button>
      </div>
    </div>
  `;
}

// Opens the step-up overlay and resolves with { password, code } or null.
function stepUp({ title, note, needCode }) {
  return new Promise(resolve => {
    let host = document.getElementById('acctStepUp');
    if (!host) { host = document.createElement('div'); host.id = 'acctStepUp'; host.className = 'acct-modal-host'; document.body.appendChild(host); }
    host.innerHTML = stepUpHtml({ title, note, needCode });
    host.hidden = false;
    const close = (val) => { host.hidden = true; host.innerHTML = ''; resolve(val); };
    host.querySelector('#suPass')?.focus();
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-acct-close]')) return close(null);
      if (e.target.closest('[data-acct-confirm]')) {
        const password = host.querySelector('#suPass')?.value || '';
        const code = host.querySelector('#suCode')?.value || '';
        if (!password) { const er = host.querySelector('#suError'); er.textContent = 'Enter your password.'; er.hidden = false; return; }
        if (needCode && !code) { const er = host.querySelector('#suError'); er.textContent = 'Enter the code we emailed you.'; er.hidden = false; return; }
        close({ password, code });
      }
    }, { once: false });
  });
}

/* ---------- email actions ---------- */

async function addAlias() {
  const input = document.getElementById('acctNewEmail');
  const address = (input?.value || '').trim();
  showError('acctProfileError', '');
  if (!address) { showError('acctProfileError', 'Enter an email address to add.'); return; }
  const su = await stepUp({ title: 'Add an email', note: `Confirm it is you, then we will send a code to ${address}.`, needCode: false });
  if (!su) return;
  try {
    const claimId = (crypto.randomUUID?.() || String(Date.now()));
    await apiFetch(ALIASES_URL, { method: 'POST', body: JSON.stringify({ address, password: su.password, claimId }) });
    if (input) input.value = '';
    await loadAliases();
    showError('acctProfileError', `Check ${address} for a verification code, then use "Enter code".`);
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not add that address.')); }
}

async function verifyAlias(aliasId, claimId) {
  const su = await stepUp({ title: 'Verify this email', note: 'Enter the code we emailed to that address.', needCode: true });
  if (!su) return;
  try {
    // requestId flow: the add call returned/queued a code; the backend confirm
    // matches on (claimId, code). requestId is carried by the backend per claim.
    await apiFetch(`${ALIASES_URL}/confirm`, { method: 'POST', body: JSON.stringify({ claimId, code: su.code, password: su.password }) });
    await loadAliases();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'That code did not verify.')); }
}

async function makePrimary(aliasId) {
  showError('acctProfileError', '');
  // set-primary needs an OTP sent to the CURRENT primary first.
  try { await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: currentEmail(), purpose: 'primary-change' }) }); } catch { /* uniform */ }
  const su = await stepUp({ title: 'Make this your primary', note: `We emailed a code to your current primary (${currentEmail()}). Enter it to confirm.`, needCode: true });
  if (!su) return;
  try {
    await apiFetch(`${ALIASES_URL}/primary`, { method: 'POST', body: JSON.stringify({ aliasId, password: su.password, code: su.code }) });
    await loadAliases();
    // Primary drives the sidebar title; re-render the shell brand.
    const t = document.querySelector('.acct-side-title'); if (t) t.textContent = currentEmail();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not change your primary address.')); }
}

async function removeAlias(aliasId) {
  showError('acctProfileError', '');
  try { await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: currentEmail(), purpose: 'alias-remove' }) }); } catch { /* uniform */ }
  const su = await stepUp({ title: 'Remove this email', note: `We emailed a code to your primary (${currentEmail()}). Enter it to confirm removal.`, needCode: true });
  if (!su) return;
  try {
    await apiFetch(`${ALIASES_URL}/remove`, { method: 'POST', body: JSON.stringify({ aliasId, password: su.password, code: su.code }) });
    await loadAliases();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not remove that address.')); }
}

/* ---------- section: subscription ---------- */

function renderSubscription(main) {
  const bp = cachedPing()?.billingProfile || null;
  const tier = cachedPing()?.user?.tier || 'free';
  const status = (bp?.status || '').toUpperCase();
  const active = status === 'ACTIVE';
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Subscription</h2></header>
    <section class="acct-card">
      <div class="acct-plan">
        <div>
          <span class="acct-plan-tier">${escapeHtml(tier)}</span>
          <span class="acct-tag ${active ? 'is-verified' : 'is-pending'}">${escapeHtml(status || 'Not subscribed')}</span>
        </div>
        <p class="acct-card-note">${active
          ? 'Your platform subscription is active. Manage the plan, payment method, add-ons, or cancel through the billing portal.'
          : 'You are on the free tier. Subscribe to publish builds, sync to the cloud, and use the API.'}</p>
      </div>
      <div class="acct-actions-row">
        ${active
          ? `<a class="cta" href="${STRIPE_PORTAL_URL}" target="_blank" rel="noopener">Manage billing</a>`
          : `<button class="cta" type="button" data-acct-action="subscribe">Subscribe</button>`}
      </div>
    </section>
  `;
}

/* ---------- placeholder sections ---------- */

function renderSoon(main, title, line) {
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">${escapeHtml(title)}</h2></header>
    <div class="acct-soon"><div class="acct-soon-badge">Coming soon</div><p>${escapeHtml(line)}</p></div>
  `;
}

/* ---------- routing ---------- */

function showSection(id) {
  activeSection = id;
  document.querySelectorAll('.acct-nav-item').forEach(b => {
    const on = b.dataset.acctSection === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const main = document.getElementById('acctMain');
  if (!main) return;
  if (id === 'profile')      return void renderProfile(main);
  if (id === 'products')     return void renderProducts(main);
  if (id === 'subscription') return renderSubscription(main);
  if (id === 'orders')       return renderSoon(main, 'Orders', 'Your order history and tracking will appear here once checkout is live.');
  if (id === 'builds')       return renderSoon(main, 'My Builds', 'Builds you publish to the community wall will be managed here.');
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
        <span class="acct-product-meta muted">Registered ${escapeHtml(fmtDate(it.registeredAt))}${
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
    <header class="acct-sec-head"><h2 class="acct-sec-title">My Products</h2></header>
    <section class="acct-card">
      <p class="acct-card-note">Devices registered to your account. Lifetime case coverage; one redemption per year.</p>
      <ul class="acct-product-list" id="acctProductList"><li class="acct-loading">Loading…</li></ul>
      <p class="acct-error" id="acctProductsError" hidden></p>
    </section>
  `;
  const host = document.getElementById('acctProductList');
  try {
    const data = await apiFetch(`${MINE_URL}`);
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      host.innerHTML = `<li class="acct-empty">No registered products yet. Register a device at
        <a href="#" data-acct-action="go-register">the warranty page</a>, and it will appear here.</li>`;
      return;
    }
    host.innerHTML = items.map(productItemHtml).join('');
  } catch (ex) {
    host.innerHTML = '';
    showError('acctProductsError', friendlyError(ex, 'Could not load your products.'));
  }
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
    if (a === 'add-alias') return void addAlias();
    if (a === 'make-primary') return void makePrimary(act.dataset.alias);
    if (a === 'remove-alias') return void removeAlias(act.dataset.alias);
    if (a === 'verify-alias') return void verifyAlias(act.dataset.alias, act.dataset.claim);
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
  if (!mounted) { activeSection = 'profile'; $body.innerHTML = shellHtml(); mounted = true; }
  showSection(activeSection);
}
