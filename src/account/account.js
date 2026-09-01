// src/account/account.js
//
// THE panel. One container for everything about the signed-in person:
// account sections for every customer, and the internal operator sections
// appended in the SAME sidebar when (and only when) the ping says the account
// is an administrator. Customers never see the Internal group; operators get
// one place for all of it. Opened from the menu as "Profile".
//
// Gating is COSMETIC and deliberately so: every internal route this panel
// calls is admin-gated server-side in resolveUserContext, so a customer who
// forges isAdmin in their own sessionStorage gets sections where every
// request returns 403.

import { PRAG_API_BASE, LANE } from '../runtime/config.js';
import { switchLane, isPlatformOperator } from '../runtime/lane.js';
import { mountPricingSelect } from '../components/pricingCards.js';

const ALIASES_URL = `${PRAG_API_BASE}/auth/aliases`;
const MINE_URL = `${PRAG_API_BASE}/warranty/mine`;
const REQUEST_CODE_URL = `${PRAG_API_BASE}/auth/request-code`;

const SUB_URL        = `${PRAG_API_BASE}/billing/subscription`;
const SUB_UPDATE_URL = `${PRAG_API_BASE}/billing/subscription/update`;
const SUB_CANCEL_URL = `${PRAG_API_BASE}/billing/subscription/cancel`;
const PM_URL         = `${PRAG_API_BASE}/billing/payment-method`;
const ORDERS_MINE_URL = `${PRAG_API_BASE}/orders/mine`;

const ISSUE_URL = `${PRAG_API_BASE}/warranty/codes/issue`;
const LIST_URL  = `${PRAG_API_BASE}/warranty/codes`;
const USERS_URL = `${PRAG_API_BASE}/admin/users`;
const CATALOG_IMPORT_URL = `${PRAG_API_BASE}/admin/catalog/import`;
const ADMIN_ORDERS_URL = `${PRAG_API_BASE}/admin/orders`;
const ADMIN_ORDER_LABEL_URL = `${PRAG_API_BASE}/admin/orders/label`;
const STRIPE_WH_SYNC_URL = `${PRAG_API_BASE}/admin/stripe/webhook-sync`;
const SHIPPO_WH_SYNC_URL = `${PRAG_API_BASE}/admin/shippo/webhook-sync`;

// Catalog snapshots survive lane flips (localStorage is per-origin, and the
// lane toggle reloads the same origin): snapshot on one lane, import on the
// other.
const CATALOG_SNAPSHOT_KEY = 'pragoptics_catalog_snapshot_v1';

let $body = null;
let mounted = false;
let mountedAsAdmin = false;
let activeSection = 'profile';
// Small cache so switching sections does not re-hit the API every click.
const cache = { users: null };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Third-party URLs (Stripe invoices, Shippo labels and tracking) become
// clickable links here. escapeHtml stops attribute breakout but not a
// javascript: scheme, so only plain https ever reaches an href.
function safeUrl(u) {
  const s = String(u || '');
  return /^https:\/\/[^\s]+$/i.test(s) ? s : '';
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
function isAdmin() {
  return hasLiveSession() && cachedPing()?.user?.isAdmin === true;
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

function friendlyError(ex, fallback, { passwordFlow = false } = {}) {
  if (ex?.status === 404) return 'This feature is not available yet.';
  if (ex?.status === 403) return 'This account is not an administrator.';
  // 401 means "wrong password" only in the step-up flows that just asked for
  // one; on a plain data fetch it means the session died.
  if (ex?.status === 401) {
    return passwordFlow
      ? 'That password did not match. Try again.'
      : 'Your session is no longer valid. Sign in again.';
  }
  if (ex instanceof TypeError) return 'Could not reach the API. Check that you are online.';
  return ex?.message || fallback;
}

/* ---------- shell ---------- */

const ICONS = {
  profile:      '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  products:     '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  subscription: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  orders:       '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  shiporders:   '<path d="M16 3h5v13h-2"/><path d="M1 3h15v13H8"/><path d="M16 8h4l1 3"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  builds:       '<path d="M12 2l9 4.9V17L12 22 3 17V6.9z"/><path d="M12 22V12"/><path d="M21 7l-9 5-9-5"/>',
  overview:     '<path d="M4 13h6V4H4z"/><path d="M14 20h6v-9h-6z"/><path d="M14 8h6V4h-6z"/><path d="M4 20h6v-4H4z"/>',
  users:        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  warranty:     '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 11h5"/><path d="M7 15h8"/><path d="M16 3l4 4"/><path d="M8 3L4 7"/>',
  inventory:    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  catalog:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
};

const ACCOUNT_SECTIONS = [
  { id: 'profile',      label: 'Profile' },
  { id: 'products',     label: 'My Products' },
  { id: 'subscription', label: 'Billing' },
  { id: 'orders',       label: 'Orders' },
  { id: 'builds',       label: 'My Builds' }
];

const INTERNAL_SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'users',      label: 'Users' },
  { id: 'shiporders', label: 'Orders' },
  { id: 'warranty',   label: 'Warranty' },
  { id: 'inventory',  label: 'Inventory' },
  { id: 'catalog',    label: 'Catalog' }
];

function allSections() {
  return isAdmin() ? [...ACCOUNT_SECTIONS, ...INTERNAL_SECTIONS] : ACCOUNT_SECTIONS;
}

function icon(id) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;
}

function navItemsHtml(sections) {
  // title carries the label to the icon-only responsive rail, where the text
  // span is hidden and the glyph is all a user gets.
  return sections.map(s => `
    <li><button class="adm-nav-item ${s.id === activeSection ? 'is-active' : ''}" type="button"
        data-acct-section="${s.id}" aria-current="${s.id === activeSection ? 'page' : 'false'}"
        title="${escapeHtml(s.label)}" aria-label="${escapeHtml(s.label)}">
      <span class="adm-nav-ico">${icon(s.id)}</span><span>${escapeHtml(s.label)}</span>
    </button></li>
  `).join('');
}

function shellHtml() {
  const admin = isAdmin();
  return `
    <div class="adm-shell">
      <nav class="adm-side" aria-label="Account sections">
        <div class="adm-side-brand">
          <span class="adm-side-kicker">Account</span>
          <span class="adm-side-title">${escapeHtml(currentEmail() || 'You')}</span>
        </div>
        <ul class="adm-nav">
          ${navItemsHtml(ACCOUNT_SECTIONS)}
          ${admin ? `
            <li class="adm-nav-div" aria-hidden="true">Internal</li>
            ${navItemsHtml(INTERNAL_SECTIONS)}
          ` : ''}
        </ul>
        <div class="adm-side-foot">
          <button class="btn acct-signout" type="button" data-acct-action="logout">Sign out</button>
        </div>
      </nav>
      <main class="adm-main" id="acctMain"><!-- section --></main>
    </div>
  `;
}

/* ================================================================
   ACCOUNT SECTIONS (every signed-in customer)
   ================================================================ */

/* ---------- profile (email addresses) ---------- */

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
// its own accounts. When the two accounts are linked the switch is seamless
// (the source lane vouches for you, no password); otherwise it opens sign-in
// on the target. Either way the session comes back fresh; nothing runs stale.
function platformLaneCardHtml() {
  if (!isPlatformOperator()) return '';
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Platform lane</h3>
      <p class="acct-card-note">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane.
      When your accounts are linked, switching is seamless; otherwise it asks you to sign in on the
      other lane. The site itself never changes, only where your calls go.</p>
      <div class="acct-add-row">
        <button class="btn btn-sm" type="button" data-acct-action="lane-live" ${LANE === 'live' ? 'disabled' : ''}
          title="${LANE === 'live' ? 'You are already on the live lane' : 'Signs you out here and signs you in on the live lane'}">Switch to live</button>
        <button class="btn btn-sm" type="button" data-acct-action="lane-dev" ${LANE === 'dev' ? 'disabled' : ''}
          title="${LANE === 'dev' ? 'You are already on the dev lane' : 'Signs you out here and signs you in on the dev sandbox'}">Switch to dev</button>
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
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not add that address.', { passwordFlow: true })); }
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
    const t = document.querySelector('.adm-side-title'); if (t) t.textContent = currentEmail();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not change your primary address.', { passwordFlow: true })); }
}

async function removeAlias(aliasId) {
  showError('acctProfileError', '');
  try { await apiFetch(REQUEST_CODE_URL, { method: 'POST', body: JSON.stringify({ email: currentEmail(), purpose: 'alias-remove' }) }); } catch { /* uniform */ }
  const su = await stepUp({ title: 'Remove this email', note: `We emailed a code to your primary (${currentEmail()}). Enter it to confirm removal.`, needCode: true });
  if (!su) return;
  try {
    await apiFetch(`${ALIASES_URL}/remove`, { method: 'POST', body: JSON.stringify({ aliasId, password: su.password, code: su.code }) });
    await loadAliases();
  } catch (ex) { showError('acctProfileError', friendlyError(ex, 'Could not remove that address.', { passwordFlow: true })); }
}

/* ---------- my products (registered warranties) ---------- */

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
          it.redemptionCount ? ` · ${escapeHtml(String(it.redemptionCount))} redemption${Number(it.redemptionCount) === 1 ? '' : 's'}` : ''}</span>
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

/* ---------- subscription: the native billing manager ----------
   Everything Stripe knows about this account, managed here: plan, cadence,
   add-ons, the card on file, invoices, cancel and resume. The wizard is only
   the FIRST-run path (address + first card); after that, billing lives on
   this section and never leaves the site. */

let subData = null;      // last GET /billing/subscription payload
let subPricing = null;   // mounted plan selector (change-plan card)
let subPmCtx = null;     // { stripe, elements } while a card update is open

// fmtDate lives with the products section above; reused here for billing.
function usdCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return `$${(n / 100).toFixed(2)}`;
}

// Two-step confirm for money buttons: first click arms, second fires.
function armConfirm(btn, armedText, onConfirm) {
  if (btn.dataset.armed) { delete btn.dataset.armed; return void onConfirm(); }
  btn.dataset.armed = '1';
  const orig = btn.textContent;
  btn.textContent = armedText;
  setTimeout(() => {
    if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; }
  }, 5000);
}

function keysOfCurrent(data) {
  return new Set((data?.subscription?.items || []).map(i => i.lookupKey).filter(Boolean));
}
function sameKeySets(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

function invoicePill(status) {
  const s = String(status || '').toLowerCase();
  const cls = s === 'paid' ? 'is-verified' : (s === 'open' ? 'is-pending' : '');
  return `<span class="acct-tag ${cls}">${escapeHtml(s || '')}</span>`;
}

function subNotSubscribedHtml(data) {
  const tier = cachedPing()?.user?.tier || 'free';
  const status = String(data?.status || '').toUpperCase();
  const midCheckout = ['PAYMENT_PENDING', 'CHECKOUT_IN_PROGRESS', 'PENDING_SUBSCRIPTION'].includes(status)
    && status !== 'PENDING_SUBSCRIPTION';
  return `
    <section class="acct-card">
      <div class="acct-plan">
        <div>
          <span class="acct-plan-tier">${escapeHtml(tier)}</span>
          <span class="acct-tag is-pending">${escapeHtml(status === 'NONE' || !status ? 'Not subscribed' : status)}</span>
        </div>
        <p class="acct-card-note">${status === 'PAYMENT_PENDING'
          ? 'Your payment is processing. This settles within a minute; check back shortly.'
          : midCheckout
            ? 'You have a subscription checkout in progress. Pick up where you left off.'
            : 'You are on the free tier. Subscribe to publish builds, sync to the cloud, and use the API.'}</p>
      </div>
      <div class="acct-actions-row">
        ${status === 'PAYMENT_PENDING' ? '' : `<button class="cta" type="button" data-acct-action="subscribe">${midCheckout ? 'Resume checkout' : 'Subscribe'}</button>`}
      </div>
    </section>
  `;
}

function subManagerHtml(data) {
  const sub = data.subscription;
  const tier = data.tier || cachedPing()?.user?.tier || '';
  const status = String(data.status || '').toUpperCase();
  const req = data.requestedSubscription || {};
  const cadence = req.cadence === 'annual' ? 'annual' : 'monthly';
  const per = cadence === 'annual' ? '/yr' : '/mo';
  const totalCents = (sub.items || []).reduce((n, i) => n + (Number(i.amountCents) || 0) * (i.quantity || 1), 0);
  const pm = data.paymentMethod;
  const openInvoice = (data.invoices || []).find(i => String(i.status).toLowerCase() === 'open' && i.hostedInvoiceUrl);

  return `
    ${data.paymentActionRequired && openInvoice ? `
      <section class="acct-card acct-card-warn">
        <h3 class="acct-card-h">Action needed</h3>
        <p class="acct-card-note">Your bank asked for extra authentication on the latest charge.
        Finish it and the subscription continues untouched.</p>
        <div class="acct-actions-row">
          <a class="cta" href="${escapeHtml(safeUrl(openInvoice.hostedInvoiceUrl))}" target="_blank" rel="noopener">Finish authentication</a>
        </div>
      </section>
    ` : ''}
    ${status === 'PAST_DUE' ? `
      <section class="acct-card acct-card-warn">
        <h3 class="acct-card-h">Payment past due</h3>
        <p class="acct-card-note">The last charge did not go through. Update the card below;
        the retry happens automatically.</p>
      </section>
    ` : ''}

    <section class="acct-card">
      <div class="acct-plan">
        <div>
          <span class="acct-plan-tier">${escapeHtml(tier)}</span>
          <span class="acct-tag ${status === 'ACTIVE' ? 'is-verified' : 'is-pending'}">${escapeHtml(status)}</span>
          ${sub.cancelAtPeriodEnd ? `<span class="acct-tag is-pending">Ends ${escapeHtml(fmtDate(sub.currentPeriodEnd))}</span>` : ''}
        </div>
        <p class="acct-card-note">
          ${escapeHtml(usdCents(totalCents))}${per} ·
          ${sub.cancelAtPeriodEnd
            ? `runs until ${escapeHtml(fmtDate(sub.currentPeriodEnd))}, then ends`
            : `renews ${escapeHtml(fmtDate(sub.currentPeriodEnd))}`}${
          data.upcomingInvoice?.amountDueCents != null && !sub.cancelAtPeriodEnd
            ? ` · next charge ${escapeHtml(usdCents(data.upcomingInvoice.amountDueCents))}` : ''}
        </p>
      </div>
    </section>

    <section class="acct-card">
      <h3 class="acct-card-h">Plan and add-ons</h3>
      <div id="acctPricing"></div>
      <div class="acct-actions-row">
        <button class="cta" type="button" id="acctPlanApply" data-acct-action="sub-apply" disabled
          title="Changes charge or credit the difference today; your tier follows the paid invoice">Apply changes</button>
      </div>
      <p class="acct-error" id="acctPlanError" hidden></p>
      <p class="muted" id="acctPlanMsg" hidden></p>
    </section>

    <section class="acct-card">
      <h3 class="acct-card-h">Payment method</h3>
      ${pm ? `
        <p class="acct-card-note">${escapeHtml((pm.brand || 'card').toUpperCase())} ending in ${escapeHtml(pm.last4 || '????')}
        ${pm.expMonth ? `· expires ${escapeHtml(String(pm.expMonth))}/${escapeHtml(String(pm.expYear))}` : ''}</p>
      ` : `<p class="acct-card-note">No card on file yet.</p>`}
      <div class="acct-actions-row" id="acctPmActions">
        <button class="btn" type="button" data-acct-action="pm-update">Update card</button>
      </div>
      <div id="acctPmHost" hidden>
        <div id="acctPmElement"></div>
        <div class="acct-actions-row">
          <button class="cta" type="button" data-acct-action="pm-save">Save card</button>
          <button class="btn" type="button" data-acct-action="pm-cancel">Never mind</button>
        </div>
      </div>
      <p class="acct-error" id="acctPmError" hidden></p>
      <p class="muted" id="acctPmMsg" hidden></p>
    </section>

    <section class="acct-card">
      <h3 class="acct-card-h">Invoices</h3>
      ${(data.invoices || []).length ? `
        <div class="adm-table-scroll">
          <table class="adm-table">
            <thead><tr><th>Date</th><th>Number</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${data.invoices.map(i => `
                <tr>
                  <td class="adm-muted">${escapeHtml(fmtDate(i.createdAt))}</td>
                  <td><code>${escapeHtml(i.number || i.id)}</code></td>
                  <td>${escapeHtml(usdCents(i.totalCents))}</td>
                  <td>${invoicePill(i.status)}</td>
                  <td>${safeUrl(i.hostedInvoiceUrl) ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(i.hostedInvoiceUrl))}" target="_blank" rel="noopener">View</a>` : ''}
                      ${safeUrl(i.pdfUrl) ? ` <a class="acct-inline-link" href="${escapeHtml(safeUrl(i.pdfUrl))}" target="_blank" rel="noopener">PDF</a>` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<p class="acct-card-note">No invoices yet.</p>`}
    </section>

    <section class="acct-card">
      <h3 class="acct-card-h">${sub.cancelAtPeriodEnd ? 'Resume subscription' : 'Cancel subscription'}</h3>
      <p class="acct-card-note">${sub.cancelAtPeriodEnd
        ? `The plan is set to end on ${escapeHtml(fmtDate(sub.currentPeriodEnd))}. Resume to keep it running.`
        : 'Canceling keeps everything running until the end of the paid period, then the plan ends. No partial refunds, no surprises.'}</p>
      <div class="acct-actions-row">
        ${sub.cancelAtPeriodEnd
          ? `<button class="cta" type="button" data-acct-action="sub-resume">Resume</button>`
          : `<button class="btn" type="button" data-acct-action="sub-cancel">Cancel at period end</button>`}
      </div>
      <p class="acct-error" id="acctCancelError" hidden></p>
    </section>
  `;
}

async function renderSubscription(main) {
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Billing</h2></header>
    <p class="acct-error" id="acctSubError" hidden></p>
    <div id="acctSubBody"><p class="acct-loading">Loading your subscription…</p></div>
  `;
  const host = document.getElementById('acctSubBody');
  subPricing = null;
  subPmCtx = null;
  try {
    subData = await apiFetch(SUB_URL);
  } catch (ex) {
    host.innerHTML = '';
    showError('acctSubError', friendlyError(ex, 'Could not load billing.'));
    return;
  }

  if (!subData?.subscription) {
    host.innerHTML = subNotSubscribedHtml(subData);
    return;
  }

  host.innerHTML = subManagerHtml(subData);

  // Change-plan surface: the same catalog-driven cards as the wizard,
  // preloaded with what is billing today. Apply arms only on a real change.
  const pricingHost = document.getElementById('acctPricing');
  const applyBtn = document.getElementById('acctPlanApply');
  const currentKeys = keysOfCurrent(subData);
  const req = subData.requestedSubscription || {};
  if (pricingHost) {
    subPricing = mountPricingSelect(pricingHost, {
      catalog: cachedPing()?.productCatalog || [],
      initial: { subType: req.subType || null, cadence: req.cadence || 'monthly', addons: req.addons || {} },
      onChange: (sel) => {
        if (!applyBtn) return;
        const dirty = sel.subType && !sameKeySets(new Set(sel.lookupKeys), currentKeys);
        applyBtn.disabled = !dirty;
      }
    });
    const sel = subPricing.get();
    if (applyBtn) applyBtn.disabled = !sel.subType || sameKeySets(new Set(sel.lookupKeys), currentKeys);
  }
}

async function applyPlanChange(btn) {
  const sel = subPricing?.get();
  if (!sel?.subType) return;
  armConfirm(btn, `Confirm: ${usdCents(sel.totalCents)}${sel.cadence === 'annual' ? '/yr' : '/mo'} from today`, async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Applying…';
    showError('acctPlanError', '');
    try {
      await apiFetch(SUB_UPDATE_URL, {
        method: 'POST',
        body: JSON.stringify({ subType: sel.subType, cadence: sel.cadence, addons: sel.addons })
      });
      const msg = document.getElementById('acctPlanMsg');
      if (msg) { msg.textContent = 'Plan updated. The difference settles today; your tier follows the paid invoice.'; msg.hidden = false; }
      setTimeout(() => { const m = document.getElementById('acctMain'); if (m && activeSection === 'subscription') renderSubscription(m); }, 1800);
    } catch (ex) {
      showError('acctPlanError', friendlyError(ex, 'Could not update the plan.'));
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

async function startPmUpdate(btn) {
  // In-flight guard: every extra click would mint another SetupIntent.
  if (btn?.disabled || subPmCtx) return;
  if (btn) btn.disabled = true;
  showError('acctPmError', '');
  const hostWrap = document.getElementById('acctPmHost');
  const actions = document.getElementById('acctPmActions');
  try {
    const res = await apiFetch(PM_URL, { method: 'POST', body: '{}' });
    const stripe = window.Stripe?.(window.STRIPE_PUBLISHABLE_KEY);
    if (!stripe) throw new Error('Stripe is not available.');
    const elements = stripe.elements({ clientSecret: res.clientSecret, appearance: { theme: 'night' } });
    const el = elements.create('payment');
    const mountAt = document.getElementById('acctPmElement');
    mountAt.innerHTML = '';
    el.mount(mountAt);
    subPmCtx = { stripe, elements };
    if (hostWrap) hostWrap.hidden = false;
    if (actions) actions.hidden = true;
  } catch (ex) {
    showError('acctPmError', friendlyError(ex, 'Could not start the card update.'));
    if (btn) btn.disabled = false;
  }
}

async function savePmUpdate(btn) {
  if (!subPmCtx) return;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  showError('acctPmError', '');
  try {
    const { error } = await subPmCtx.stripe.confirmSetup({
      elements: subPmCtx.elements,
      confirmParams: { return_url: `${location.origin}${location.pathname}?post=pm` },
      redirect: 'if_required'
    });
    if (error) throw new Error(error.message || 'Card setup failed.');
    const msg = document.getElementById('acctPmMsg');
    if (msg) { msg.textContent = 'Card saved. It becomes the default within a few seconds.'; msg.hidden = false; }
    subPmCtx = null;
    setTimeout(() => { const m = document.getElementById('acctMain'); if (m && activeSection === 'subscription') renderSubscription(m); }, 2500);
  } catch (ex) {
    showError('acctPmError', ex?.message || 'Card setup failed.');
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function cancelPmUpdate() {
  subPmCtx = null;
  const hostWrap = document.getElementById('acctPmHost');
  const actions = document.getElementById('acctPmActions');
  if (hostWrap) hostWrap.hidden = true;
  if (actions) {
    actions.hidden = false;
    const btn = actions.querySelector('[data-acct-action="pm-update"]');
    if (btn) btn.disabled = false;
  }
}

async function setCancelState(btn, action) {
  const go = async () => {
    btn.disabled = true;
    showError('acctCancelError', '');
    try {
      await apiFetch(SUB_CANCEL_URL, { method: 'POST', body: JSON.stringify({ action }) });
      const m = document.getElementById('acctMain');
      if (m && activeSection === 'subscription') renderSubscription(m);
    } catch (ex) {
      showError('acctCancelError', friendlyError(ex, 'Could not update the subscription.'));
      btn.disabled = false;
    }
  };
  if (action === 'cancel') armConfirm(btn, 'Confirm: end at period close', go);
  else go();
}

/* ---------- orders (the customer's own) ---------- */

function orderStatusPill(status) {
  const s = String(status || '').toUpperCase();
  const good = ['PAID', 'LABEL_PURCHASED', 'SHIPPED', 'DELIVERED'].includes(s);
  return `<span class="acct-tag ${good ? 'is-verified' : 'is-pending'}">${escapeHtml(s.replaceAll('_', ' ').toLowerCase() || 'pending')}</span>`;
}

function orderLinesLabel(lines) {
  return (lines || []).map(l => `${l.label || l.productId}${(l.qty || 1) > 1 ? ` ×${l.qty}` : ''}`).join(', ');
}

async function renderOrders(main) {
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Orders</h2></header>
    <section class="acct-card">
      <p class="acct-card-note">Orders placed while signed in. Guest orders live on their receipt email.</p>
      <p class="acct-error" id="acctOrdersError" hidden></p>
      <div id="acctOrdersBody"><p class="acct-loading">Loading…</p></div>
    </section>
  `;
  const host = document.getElementById('acctOrdersBody');
  try {
    const data = await apiFetch(ORDERS_MINE_URL);
    const orders = data.orders || [];
    if (!orders.length) {
      host.innerHTML = `<p class="acct-empty">No orders on this account yet.</p>`;
      return;
    }
    host.innerHTML = `
      <div class="adm-table-scroll">
        <table class="adm-table">
          <thead><tr><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Tracking</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td class="adm-muted">${escapeHtml(fmtDate(o.createdAt))}</td>
                <td>${escapeHtml(orderLinesLabel(o.lines))}</td>
                <td>${escapeHtml(usdCents(o.totalCents))}</td>
                <td>${orderStatusPill(o.status)}</td>
                <td>${o.trackingNumber
                  ? (safeUrl(o.trackingUrl)
                      ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(o.trackingUrl))}" target="_blank" rel="noopener">${escapeHtml(o.trackingNumber)}</a>`
                      : `<code>${escapeHtml(o.trackingNumber)}</code>`)
                  : '<span class="adm-muted">—</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (ex) {
    host.innerHTML = '';
    showError('acctOrdersError', friendlyError(ex, 'Could not load your orders.'));
  }
}

/* ---------- placeholder sections ---------- */

function renderSoon(main, title, line) {
  // Honest empty state: the copy says what will appear here and what gates
  // it. No badge theater.
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">${escapeHtml(title)}</h2></header>
    <div class="acct-soon"><p>${escapeHtml(line)}</p></div>
  `;
}

/* ================================================================
   INTERNAL SECTIONS (administrators only; server re-checks every call)
   ================================================================ */

/* ---------- overview ---------- */

function statCard(n, label, hint) {
  return `<div class="adm-stat-card">
      <span class="adm-stat-n">${escapeHtml(String(n))}</span>
      <span class="adm-stat-l">${escapeHtml(label)}</span>
      ${hint ? `<span class="adm-stat-h">${escapeHtml(hint)}</span>` : ''}
    </div>`;
}

async function renderOverview(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Overview</h2></header>
    <div class="adm-stat-grid" id="admOverviewGrid">
      ${statCard('…', 'Users')}${statCard('…', 'Active')}
      ${statCard('…', 'Codes available')}${statCard('…', 'Codes claimed')}
    </div>
    <div class="adm-card">
      <h3 class="adm-card-h">Integrations</h3>
      <p class="adm-note">Each sync converges the provider to the exact event list this backend
      dispatches: nothing hand-maintained in a dashboard, nothing silently missing.</p>
      <div class="adm-actions-row">
        <button class="btn" type="button" data-adm-action="wh-stripe"
          title="Creates or updates this lane's Stripe webhook endpoint to the canonical event list">Sync Stripe webhooks</button>
        <button class="btn" type="button" data-adm-action="wh-shippo"
          title="Registers this lane's Shippo webhooks (labels, transactions, tracking)">Sync Shippo webhooks</button>
      </div>
      <p class="muted" id="admIntegrationsResult" hidden></p>
    </div>
  `;
  const grid = main.querySelector('#admOverviewGrid');
  try {
    const [users, avail, claimed] = await Promise.all([
      apiFetch(`${USERS_URL}?limit=1000`).catch(() => ({ users: [] })),
      apiFetch(`${LIST_URL}?status=AVAILABLE&limit=1000`).catch(() => ({ codes: [] })),
      apiFetch(`${LIST_URL}?status=CLAIMED&limit=1000`).catch(() => ({ codes: [] }))
    ]);
    const all = users.users || [];
    cache.users = all;
    const active = all.filter(u => String(u.status).toUpperCase() === 'ACTIVE').length;
    const subscribed = all.filter(u => !['free', '', 'none'].includes(String(u.tier).toLowerCase())).length;
    grid.innerHTML =
      statCard(all.length, 'Users', `${active} active`) +
      statCard(subscribed, 'Subscribed', 'paid tiers') +
      statCard((avail.codes || []).length + (avail.truncated ? '+' : ''), 'Codes available',
        avail.truncated ? 'capped at first 1000' : '') +
      statCard((claimed.codes || []).length + (claimed.truncated ? '+' : ''), 'Codes claimed',
        claimed.truncated ? 'capped at first 1000' : '');
  } catch (ex) {
    grid.innerHTML = `<p class="adm-empty">${escapeHtml(friendlyError(ex, 'Could not load overview.'))}</p>`;
  }
}

/* ---------- users ---------- */

function tierPill(tier) {
  const t = String(tier || 'free').toLowerCase();
  return `<span class="adm-pill adm-tier adm-tier-${escapeHtml(t)}">${escapeHtml(t)}</span>`;
}
function statusPill(status) {
  const s = String(status || '').toUpperCase();
  const ok = s === 'ACTIVE';
  return `<span class="adm-pill ${ok ? 'is-available' : 'is-claimed'}">${escapeHtml(s || '—')}</span>`;
}

function usersTableHtml(users) {
  if (!users.length) return `<p class="adm-empty">No users match this view.</p>`;
  return `
    <div class="adm-table-scroll">
      <table class="adm-table adm-users-table">
        <thead>
          <tr><th>Email</th><th>Tier</th><th>Status</th><th>Role</th><th>Flags</th><th>Joined</th></tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td class="adm-cell-email">${escapeHtml(u.email || '—')}</td>
              <td>${tierPill(u.tier)}</td>
              <td>${statusPill(u.status)}</td>
              <td class="adm-muted">${escapeHtml(u.role || '—')}</td>
              <td>
                ${u.isAdmin ? '<span class="adm-pill adm-flag-admin">admin</span>' : ''}
                ${u.isDev ? '<span class="adm-pill adm-flag-dev">dev</span>' : ''}
                ${!u.isAdmin && !u.isDev ? '<span class="adm-muted">—</span>' : ''}
              </td>
              <td class="adm-muted">${escapeHtml((u.createdAt || '').slice(0, 10) || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function applyUserFilters(users) {
  const q = (document.getElementById('admUserSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('admUserStatus')?.value || '';
  const tier = document.getElementById('admUserTier')?.value || '';
  return users.filter(u => {
    if (q && !String(u.email || '').toLowerCase().includes(q)) return false;
    if (status && String(u.status || '').toUpperCase() !== status) return false;
    if (tier && String(u.tier || '').toLowerCase() !== tier) return false;
    return true;
  });
}

function renderUserRows() {
  const host = document.getElementById('admUsersBody');
  if (!host || !cache.users) return;
  host.innerHTML = usersTableHtml(applyUserFilters(cache.users));
}

async function renderUsers(main) {
  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Users</h2>
      <div class="adm-toolbar">
        <input class="adm-search" id="admUserSearch" type="search" placeholder="Search email…" aria-label="Search users by email">
        <select class="adm-select" id="admUserStatus" aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="LOCKED">Locked</option>
        </select>
        <select class="adm-select" id="admUserTier" aria-label="Filter by tier">
          <option value="">Any tier</option>
          <option value="free">Free</option>
          <option value="user">User</option>
          <option value="partner">Partner</option>
          <option value="super">Super</option>
        </select>
      </div>
    </header>
    <p class="adm-error" id="admUsersError" hidden></p>
    <div id="admUsersBody"><p class="adm-note">Loading…</p></div>
  `;
  try {
    if (!cache.users) {
      const data = await apiFetch(`${USERS_URL}?limit=1000`);
      cache.users = data.users || [];
    }
    renderUserRows();
  } catch (ex) {
    document.getElementById('admUsersBody').innerHTML = '';
    showError('admUsersError', friendlyError(ex, 'Could not load users.'));
  }
}

/* ---------- internal orders: the fulfillment desk ---------- */

function admOrderRowHtml(o) {
  const paid = String(o.status).toUpperCase() === 'PAID';
  const physical = !!(o.shipCarrier || o.shippingCents);
  return `
    <tr>
      <td class="adm-muted">${escapeHtml(fmtDate(o.createdAt))}</td>
      <td class="adm-cell-email">${escapeHtml(o.email || '')}</td>
      <td>${escapeHtml(orderLinesLabel(o.lines))}</td>
      <td>${escapeHtml(usdCents(o.totalCents))}</td>
      <td>${orderStatusPill(o.status)}${o.labelError ? `<div class="adm-muted" title="${escapeHtml(o.labelError)}">label error</div>` : ''}</td>
      <td>${o.trackingNumber
        ? (safeUrl(o.trackingUrl)
            ? `<a class="acct-inline-link" href="${escapeHtml(safeUrl(o.trackingUrl))}" target="_blank" rel="noopener">${escapeHtml(o.trackingNumber)}</a>`
            : `<code>${escapeHtml(o.trackingNumber)}</code>`)
        : '<span class="adm-muted">—</span>'}</td>
      <td>
        ${safeUrl(o.labelUrl)
          ? `<a class="btn adm-copy" href="${escapeHtml(safeUrl(o.labelUrl))}" target="_blank" rel="noopener" title="Opens the 4x6 label PDF for printing">Print label</a>`
          : (paid && physical
              ? `<button class="btn adm-copy" type="button" data-adm-action="order-label" data-order="${escapeHtml(o.orderId)}" title="Buys the shipping label from Shippo with the rate the customer paid for">Buy label</button>`
              : '<span class="adm-muted">—</span>')}
      </td>
    </tr>
  `;
}

async function renderAdminOrders(main) {
  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Orders</h2>
      <div class="adm-tabs" role="tablist">
        <button class="adm-tab is-active" type="button" role="tab" aria-selected="true" data-adm-orders="">All</button>
        <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-orders="PAID">Paid</button>
        <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-orders="LABEL_PURCHASED">Labeled</button>
        <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-orders="SHIPPED">Shipped</button>
      </div>
    </header>
    <p class="adm-error" id="admOrdersError" hidden></p>
    <div id="admOrdersBody"><p class="adm-note">Loading…</p></div>
  `;
  loadAdminOrders('');
}

async function loadAdminOrders(status) {
  const host = document.getElementById('admOrdersBody');
  if (!host) return;
  showError('admOrdersError', '');
  host.innerHTML = `<p class="adm-note">Loading…</p>`;
  try {
    const q = status ? `?status=${encodeURIComponent(status)}&limit=200` : '?limit=200';
    const data = await apiFetch(`${ADMIN_ORDERS_URL}${q}`);
    const orders = data.orders || [];
    if (!orders.length) { host.innerHTML = `<p class="adm-empty">No orders in this view.</p>`; return; }
    host.innerHTML = `
      <div class="adm-table-scroll">
        <table class="adm-table">
          <thead><tr><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Tracking</th><th>Label</th></tr></thead>
          <tbody>${orders.map(admOrderRowHtml).join('')}</tbody>
        </table>
      </div>
    `;
  } catch (ex) {
    host.innerHTML = '';
    showError('admOrdersError', friendlyError(ex, 'Could not load orders.'));
  }
}

async function buyOrderLabel(btn) {
  const orderId = btn.dataset.order;
  if (!orderId) return;
  armConfirm(btn, 'Confirm: buy label', async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Buying…';
    showError('admOrdersError', '');
    try {
      const res = await apiFetch(ADMIN_ORDER_LABEL_URL, { method: 'POST', body: JSON.stringify({ orderId }) });
      const lu = safeUrl(res.labelUrl); if (lu) window.open(lu, '_blank', 'noopener');
      const active = document.querySelector('[data-adm-orders].is-active')?.dataset.admOrders || '';
      loadAdminOrders(active);
    } catch (ex) {
      showError('admOrdersError', friendlyError(ex, 'Label purchase failed.'));
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

async function runWebhookSync(btn, url, label) {
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Syncing…';
  const out = document.getElementById('admIntegrationsResult');
  try {
    const res = await apiFetch(url, { method: 'POST', body: '{}' });
    let text = `${label}: ${res.action || 'ok'}`;
    if (res.action === 'created' && res.secret) {
      text += `. NEW SIGNING SECRET (shown once, set it as the app setting now): ${res.secret}`;
    }
    if (Array.isArray(res.created) && res.created.length) text += `. Registered: ${res.created.join(', ')}`;
    if (Array.isArray(res.missingBefore) && res.missingBefore.length) text += `. Added events: ${res.missingBefore.join(', ')}`;
    if (out) { out.textContent = text; out.hidden = false; }
  } catch (ex) {
    if (out) { out.textContent = `${label}: ${friendlyError(ex, 'sync failed')}`; out.hidden = false; }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

/* ---------- warranty (mint + inventory) ---------- */

function mintResultHtml(result) {
  const codes = result.codes || [];
  return `
    <div class="adm-result">
      <div class="adm-result-head">
        <strong>${codes.length} code${codes.length === 1 ? '' : 's'} minted</strong>
        <button class="btn adm-copy" type="button" data-adm-action="copy" title="Copy every minted code to the clipboard">Copy all</button>
      </div>
      <p class="adm-note">Batch ${escapeHtml(result.batchId || '')}</p>
      <ul class="adm-codes" id="admCodeList">
        ${codes.map(c => `<li><code>${escapeHtml(c)}</code></li>`).join('')}
      </ul>
    </div>
  `;
}

function inventoryHtml(data) {
  const rows = data.codes || [];
  if (!rows.length) return `<p class="adm-empty">No codes in this view.</p>`;
  return `
    <div class="adm-table-scroll">
      <table class="adm-table">
        <thead>
          <tr><th>Code</th><th>Status</th><th>Product</th><th>Issued</th><th>Claimed by</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><code>${escapeHtml(r.code)}</code></td>
              <td><span class="adm-pill ${r.status === 'CLAIMED' ? 'is-claimed' : 'is-available'}">${escapeHtml(r.status)}</span></td>
              <td>${escapeHtml(r.productId || 'Any')}</td>
              <td class="adm-muted">${escapeHtml((r.issuedAt || '').slice(0, 10))}</td>
              <td class="adm-muted">${escapeHtml(r.claimedByEmail || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderWarranty(main) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Warranty codes</h2></header>
    <div class="adm-grid">
      <section class="adm-card" aria-labelledby="admMintTitle">
        <h3 class="adm-h2" id="admMintTitle">Mint codes</h3>
        <p class="adm-note">
          Codes are minted unclaimed. Write one on a card, ship it, and the
          customer redeems it at <code>/#warranty</code>. Leave the product
          blank for a code any product can use.
        </p>
        <div class="adm-fields">
          <label class="adm-label" for="admCount">How many</label>
          <input class="adm-input" id="admCount" type="number" min="1" max="500" value="10" inputmode="numeric" title="1 to 500 codes per batch">
          <label class="adm-label" for="admProduct">Product</label>
          <select class="adm-input" id="admProduct">
            <option value="">Any product</option>
            <option value="omnisource">OmniSource</option>
            <option value="omnibus">OmniBus</option>
          </select>
          <label class="adm-label" for="admNote">Note</label>
          <input class="adm-input" id="admNote" type="text" maxlength="80" placeholder="e.g. October build">
        </div>
        <div class="adm-actions"><button class="cta" type="button" data-adm-action="mint">Mint codes</button></div>
        <p class="adm-error" id="admMintError" hidden></p>
        <div id="admMintResult"></div>
      </section>

      <section class="adm-card" aria-labelledby="admInvTitle">
        <div class="adm-inv-head">
          <h3 class="adm-h2" id="admInvTitle">Inventory</h3>
          <div class="adm-tabs" role="tablist">
            <button class="adm-tab is-active" type="button" role="tab" aria-selected="true" data-adm-filter="AVAILABLE">Available</button>
            <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-filter="CLAIMED">Claimed</button>
            <button class="adm-tab" type="button" role="tab" aria-selected="false" data-adm-filter="ALL">All</button>
          </div>
        </div>
        <p class="adm-error" id="admInvError" hidden></p>
        <div id="admInvBody"><p class="adm-note">Loading…</p></div>
      </section>
    </div>
  `;
  loadInventory('AVAILABLE');
}

async function loadInventory(status) {
  const host = document.getElementById('admInvBody');
  if (!host) return;
  showError('admInvError', '');
  host.innerHTML = `<p class="adm-note">Loading…</p>`;
  try {
    const data = await apiFetch(`${LIST_URL}?status=${encodeURIComponent(status)}&limit=500`);
    host.innerHTML = inventoryHtml(data);
  } catch (ex) {
    host.innerHTML = '';
    showError('admInvError', friendlyError(ex, 'Could not load inventory.'));
  }
}

async function mint(btn) {
  const count = Number(document.getElementById('admCount')?.value || 0);
  const productId = document.getElementById('admProduct')?.value || '';
  const note = document.getElementById('admNote')?.value || '';
  showError('admMintError', '');
  if (!Number.isFinite(count) || count < 1) { showError('admMintError', 'Enter how many codes to mint.'); return; }
  // The input sits outside any form, so its max attribute never runs; the
  // backend refuses over-cap batches, but say so BEFORE the round trip.
  if (count > 500) { showError('admMintError', 'You can mint at most 500 codes per batch.'); return; }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Minting…';
  try {
    const result = await apiFetch(ISSUE_URL, { method: 'POST', body: JSON.stringify({ count, productId, note }) });
    const out = document.getElementById('admMintResult');
    if (out) out.innerHTML = mintResultHtml(result);
    const active = document.querySelector('.adm-tab.is-active')?.dataset.admFilter || 'AVAILABLE';
    loadInventory(active);
  } catch (ex) {
    showError('admMintError', friendlyError(ex, 'Mint failed.'));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function copyCodes(btn) {
  const codes = [...document.querySelectorAll('#admCodeList code')].map(c => c.textContent).join('\n');
  if (!codes) return;
  navigator.clipboard?.writeText(codes).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = original; }, 1200);
  }).catch(() => { /* clipboard blocked; codes are on screen anyway */ });
}

/* ---------- catalog (lane mirror) ---------- */

function readSnapshot() {
  // Shape-validate: localStorage is user-writable, and the renderer reads
  // .items.length / .sourceLane / .takenAt straight off this object.
  try {
    const s = JSON.parse(localStorage.getItem(CATALOG_SNAPSHOT_KEY) || 'null');
    return (s && Array.isArray(s.items) && typeof s.sourceLane === 'string' && typeof s.takenAt === 'string')
      ? s : null;
  } catch { return null; }
}

function renderCatalog(main) {
  const ping = cachedPing();
  const rows = Array.isArray(ping?.productCatalog) ? ping.productCatalog : [];
  const snap = readSnapshot();

  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Catalog</h2>
      <span class="adm-pill">lane: ${escapeHtml(LANE)}</span>
    </header>

    <div class="adm-card">
      <h3 class="adm-card-h">Lane</h3>
      <p class="muted">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane
      (${escapeHtml(PRAG_API_BASE)}). Each lane is its own platform: its own accounts, keys, and
      Stripe mode. When your accounts are linked the switch is seamless (no password); otherwise
      it opens sign-in on the other lane. Either way the session and every cached response come
      back fresh. The deployed site never changes; only where this browser routes.</p>
      <div class="adm-actions-row">
        <button class="btn" type="button" data-adm-action="lane-live" ${LANE === 'live' ? 'disabled' : ''}
          title="${LANE === 'live' ? 'You are already on the live lane' : 'Signs you out here and signs you in on the live lane'}">Switch to live</button>
        <button class="btn" type="button" data-adm-action="lane-dev" ${LANE === 'dev' ? 'disabled' : ''}
          title="${LANE === 'dev' ? 'You are already on the dev lane' : 'Signs you out here and signs you in on the dev sandbox'}">Switch to dev</button>
      </div>
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">This lane's catalog</h3>
      ${rows.length ? `
        <div class="adm-table-scroll">
          <table class="adm-table">
            <thead><tr><th>Lookup key</th><th>Interval</th><th>Amount</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td><code>${escapeHtml(r.lookupKey)}</code></td>
                <td>${escapeHtml(r.interval || '')}</td>
                <td>${r.amount !== '' && r.amount != null ? '$' + (Number(r.amount) / 100).toFixed(2) : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="adm-actions-row">
          <button class="cta" type="button" data-adm-action="catalog-snapshot"
            title="Saves this lane's catalog in this browser so you can import it after flipping lanes">Snapshot ${rows.length} row${rows.length === 1 ? '' : 's'} from ${escapeHtml(LANE)}</button>
        </div>
      ` : `
        <p class="muted">No catalog rows on this lane yet. Sign out and back in if you subscribed
        recently; the catalog rides on the ping.</p>
      `}
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">Stored snapshot</h3>
      ${snap ? `
        <p class="muted"><strong>${snap.items.length}</strong> rows from the
        <strong>${escapeHtml(snap.sourceLane)}</strong> lane, taken ${escapeHtml(new Date(snap.takenAt).toLocaleString())}.</p>
        ${snap.sourceLane === LANE
          ? `<p class="muted">You are on the lane this snapshot came from. Flip to the other lane to import it.</p>`
          : `<p class="muted">Importing creates the missing products and prices in the
             <strong>${escapeHtml(LANE)}</strong> lane's Stripe account (by lookup key, idempotent),
             then syncs its ProductCatalog table.</p>
             <div class="adm-actions-row">
               <button class="cta" type="button" data-adm-action="catalog-import"
                 title="Creates the missing products and prices in this lane's Stripe account, then syncs its catalog table">Import into ${escapeHtml(LANE)}</button>
             </div>`}
      ` : `
        <p class="muted">No snapshot stored. Take one on the lane that has the catalog (live), then
        flip lanes and import it here.</p>
      `}
      <p class="adm-error" id="admCatalogError" hidden></p>
      <p class="muted" id="admCatalogResult" hidden></p>
    </div>
  `;
}

function catalogSnapshot() {
  const rows = cachedPing()?.productCatalog || [];
  if (!rows.length) return;
  try {
    localStorage.setItem(CATALOG_SNAPSHOT_KEY, JSON.stringify({
      sourceLane: LANE,
      takenAt: new Date().toISOString(),
      items: rows.map(r => ({
        lookupKey: r.lookupKey,
        amount: Number(r.amount),
        currency: r.currency || 'USD',
        interval: r.interval,
        productName: String(r.lookupKey || '').replace(/\.(monthly|annual)$/, '')
      }))
    }));
  } catch { /* storage blocked */ }
  showSection('catalog');
}

async function catalogImport(btn) {
  const snap = readSnapshot();
  if (!snap || snap.sourceLane === LANE) return;
  // Importing into live rewrites the account real customers bill against. The
  // backend refuses without the confirm token; the operator types the word.
  let confirm;
  if (LANE === 'live') {
    confirm = window.prompt('This imports into the LIVE Stripe account. Type "live" to confirm.') || '';
    if (confirm.trim().toLowerCase() !== 'live') return;
    confirm = 'live';
  }
  btn.disabled = true;
  btn.textContent = 'Importing…';
  try {
    const data = await apiFetch(CATALOG_IMPORT_URL, {
      method: 'POST',
      body: JSON.stringify({ items: snap.items, ...(confirm ? { confirm } : {}) })
    });
    const out = document.getElementById('admCatalogResult');
    if (out) {
      out.textContent = `Done: ${data.created} created, ${data.skipped} already present, ${data.synced} table rows synced` +
        (data.errors?.length ? `. Rejected: ${data.errors.join('; ')}` : '.');
      out.hidden = false;
    }
    showError('admCatalogError', '');
  } catch (ex) {
    showError('admCatalogError', friendlyError(ex, 'Import failed.'));
    btn.disabled = false;
    btn.textContent = `Import into ${LANE}`;
  }
}

/* ================================================================
   ROUTING / BEHAVIOUR
   ================================================================ */

function showSection(id) {
  // A customer must never land on an internal section id (stale deep link).
  if (!isAdmin() && INTERNAL_SECTIONS.some(s => s.id === id)) id = 'profile';
  activeSection = id;
  document.querySelectorAll('.adm-nav-item').forEach(b => {
    const on = b.dataset.acctSection === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const main = document.getElementById('acctMain');
  if (!main) return;
  if (id === 'profile')      return void renderProfile(main);
  if (id === 'products')     return void renderProducts(main);
  if (id === 'subscription') return void renderSubscription(main);
  if (id === 'orders')       return void renderOrders(main);
  if (id === 'builds')       return renderSoon(main, 'My Builds', 'Builds you publish to the board will be managed here: your listings and your credit.');
  if (id === 'overview')     return void renderOverview(main);
  if (id === 'users')        return void renderUsers(main);
  if (id === 'shiporders')   return void renderAdminOrders(main);
  if (id === 'warranty')     return void renderWarranty(main);
  if (id === 'inventory')    return renderSoon(main, 'Inventory', 'Physical stock levels for hardware, cases, and screwdrivers will live here.');
  if (id === 'catalog')      return void renderCatalog(main);
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
    if (act) {
      e.preventDefault();
      const a = act.dataset.acctAction;
      if (a === 'logout') return void window.logout?.();
      if (a === 'subscribe') return void (window.openWizardFromMenu?.() || window.setAppMode?.('wizard'));
      if (a === 'sub-apply') return void applyPlanChange(act);
      if (a === 'sub-cancel') return void setCancelState(act, 'cancel');
      if (a === 'sub-resume') return void setCancelState(act, 'resume');
      if (a === 'pm-update') return void startPmUpdate(act);
      if (a === 'pm-save') return void savePmUpdate(act);
      if (a === 'pm-cancel') return void cancelPmUpdate();
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
      return;
    }

    const admAct = e.target.closest('[data-adm-action]');
    if (admAct) {
      e.preventDefault();
      if (admAct.dataset.admAction === 'mint') mint(admAct);
      if (admAct.dataset.admAction === 'copy') copyCodes(admAct);
      if (admAct.dataset.admAction === 'catalog-snapshot') catalogSnapshot();
      if (admAct.dataset.admAction === 'catalog-import') catalogImport(admAct);
      if (admAct.dataset.admAction === 'lane-live') switchLane('live');
      if (admAct.dataset.admAction === 'lane-dev') switchLane('dev');
      if (admAct.dataset.admAction === 'order-label') buyOrderLabel(admAct);
      if (admAct.dataset.admAction === 'wh-stripe') runWebhookSync(admAct, STRIPE_WH_SYNC_URL, 'Stripe');
      if (admAct.dataset.admAction === 'wh-shippo') runWebhookSync(admAct, SHIPPO_WH_SYNC_URL, 'Shippo');
      return;
    }

    const ordersTab = e.target.closest('[data-adm-orders]');
    if (ordersTab) {
      e.preventDefault();
      document.querySelectorAll('[data-adm-orders]').forEach(t => {
        const on = t === ordersTab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      loadAdminOrders(ordersTab.dataset.admOrders || '');
      return;
    }

    const tab = e.target.closest('[data-adm-filter]');
    if (tab) {
      e.preventDefault();
      document.querySelectorAll('.adm-tab').forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      loadInventory(tab.dataset.admFilter);
    }
  });

  // Live user filtering, delegated so it survives section re-renders.
  document.addEventListener('input', (e) => {
    if (e.target.id === 'admUserSearch') renderUserRows();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'admUserStatus' || e.target.id === 'admUserTier') renderUserRows();
  });
}

/** Deep-link target for the next panel entry (e.g. the old admin route lands
 *  on Overview; the warranty success screen lands on My Products). */
export function presetAccountSection(id) {
  const all = [...ACCOUNT_SECTIONS, ...INTERNAL_SECTIONS];
  if (!all.some(s => s.id === id)) return;
  // Render immediately only when the panel is actually on screen. When the
  // caller is about to setAppMode('account'), onAccountEnter renders once;
  // rendering here too double-fetched every section that loads data.
  const visible = mounted && !document.getElementById('accountView')?.classList?.contains('hidden');
  if (visible) showSection(id); else activeSection = id;
}

export function initAccountView() {
  $body = document.getElementById('accountBody');
  if (!$body) return;
  bindOnce();
  // Deep link from the warranty success screen: jump to a named section.
  window.addEventListener('pragoptics:account-section', (e) => {
    presetAccountSection(e?.detail);
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
  // Remount when admin-ness changed (a different user signed in): the sidebar
  // groups must never leak between identities.
  const admin = isAdmin();
  if (mounted && mountedAsAdmin !== admin) { mounted = false; cache.users = null; }
  if (!mounted) {
    if (!allSections().some(s => s.id === activeSection)) activeSection = 'profile';
    $body.innerHTML = shellHtml();
    mounted = true;
    mountedAsAdmin = admin;
  }
  showSection(activeSection);
}
