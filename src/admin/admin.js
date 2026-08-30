// src/admin/admin.js
//
// Internal operator console: a sectioned admin panel (Overview, Users,
// Warranty, and placeholders for what is not built yet).
//
// Gating is COSMETIC and deliberately so. The panel mounts only when the cached
// ping says user.isAdmin === true, but every route it calls is admin-gated
// server-side in resolveUserContext, so a customer who forges isAdmin in their
// own sessionStorage gets a console where every request returns 403. Tier is
// never consulted here: a super-tier customer is still a customer.

const PRAG_API_BASE = 'https://api.pragoptics.com/api/v1';
const ISSUE_URL = `${PRAG_API_BASE}/warranty/codes/issue`;
const LIST_URL  = `${PRAG_API_BASE}/warranty/codes`;
const USERS_URL = `${PRAG_API_BASE}/admin/users`;

let $body = null;
let mounted = false;
let activeSection = 'overview';
// Small cache so switching sections does not re-hit the API every click.
const cache = { users: null };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- identity ---------- */

function cachedPing() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); }
  catch { return null; }
}

function hasLiveSession() {
  // invalidateSession() removes the token but deliberately leaves the cached
  // ping in place, so the ping alone is not evidence of a live session.
  try {
    if (typeof window.isAccessTokenValid === 'function') return window.isAccessTokenValid();
    return !!JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token;
  } catch { return false; }
}

/** Strict boolean, same test the backend applies. Tier is irrelevant, and an
 *  expired session is not an admin session however stale the ping says. */
export function isAdminUser() {
  return hasLiveSession() && cachedPing()?.user?.isAdmin === true;
}

function adminEmail() {
  return cachedPing()?.user?.email || '';
}

function accessToken() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || ''; }
  catch { return ''; }
}

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
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}

/** 403 and a dead network are the two failures worth naming; everything else
 *  carries the backend's own sentence. */
function friendlyError(ex, fallback) {
  if (ex?.status === 403) return 'This account is not an administrator.';
  if (ex instanceof TypeError) return 'Could not reach the API. Check that you are online.';
  return ex?.message || fallback;
}

/* ---------- shell ---------- */

const ICONS = {
  overview:  '<path d="M4 13h6V4H4z"/><path d="M14 20h6v-9h-6z"/><path d="M14 8h6V4h-6z"/><path d="M4 20h6v-4H4z"/>',
  users:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  warranty:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  orders:    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  inventory: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>'
};

const SECTIONS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'users',     label: 'Users' },
  { id: 'warranty',  label: 'Warranty' },
  { id: 'orders',    label: 'Orders' },
  { id: 'inventory', label: 'Inventory' }
];

function icon(id) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;
}

function shellHtml() {
  return `
    <div class="adm-shell">
      <nav class="adm-side" aria-label="Admin sections">
        <div class="adm-side-brand">
          <span class="adm-side-kicker">Internal</span>
          <span class="adm-side-title">Operator</span>
        </div>
        <ul class="adm-nav">
          ${SECTIONS.map(s => `
            <li>
              <button class="adm-nav-item ${s.id === activeSection ? 'is-active' : ''}"
                      type="button" data-adm-section="${s.id}" aria-current="${s.id === activeSection ? 'page' : 'false'}">
                <span class="adm-nav-ico">${icon(s.id)}</span>
                <span>${escapeHtml(s.label)}</span>
              </button>
            </li>
          `).join('')}
        </ul>
        <div class="adm-side-foot">
          <span class="adm-side-who">${escapeHtml(adminEmail())}</span>
          <span class="adm-side-role">Administrator</span>
        </div>
      </nav>
      <main class="adm-main" id="admMain"><!-- section --></main>
    </div>
  `;
}

/* ---------- section: overview ---------- */

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
      statCard((avail.codes || []).length + (avail.truncated ? '+' : ''), 'Codes available') +
      statCard((claimed.codes || []).length + (claimed.truncated ? '+' : ''), 'Codes claimed');
  } catch (ex) {
    grid.innerHTML = `<p class="adm-empty">${escapeHtml(friendlyError(ex, 'Could not load overview.'))}</p>`;
  }
}

/* ---------- section: users ---------- */

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

/* ---------- section: warranty (mint + inventory) ---------- */

function mintResultHtml(result) {
  const codes = result.codes || [];
  return `
    <div class="adm-result">
      <div class="adm-result-head">
        <strong>${codes.length} code${codes.length === 1 ? '' : 's'} minted</strong>
        <button class="btn adm-copy" type="button" data-adm-action="copy">Copy all</button>
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
          <input class="adm-input" id="admCount" type="number" min="1" max="500" value="10" inputmode="numeric">
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

/* ---------- section: placeholders ---------- */

function renderSoon(main, title, line) {
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">${escapeHtml(title)}</h2></header>
    <div class="adm-soon">
      <div class="adm-soon-badge">Coming soon</div>
      <p>${escapeHtml(line)}</p>
    </div>
  `;
}

/* ---------- routing between sections ---------- */

function showSection(id) {
  activeSection = id;
  document.querySelectorAll('.adm-nav-item').forEach(b => {
    const on = b.dataset.admSection === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const main = document.getElementById('admMain');
  if (!main) return;
  if (id === 'overview')  return void renderOverview(main);
  if (id === 'users')     return void renderUsers(main);
  if (id === 'warranty')  return void renderWarranty(main);
  if (id === 'orders')    return renderSoon(main, 'Orders', 'Order history and fulfillment land here once checkout is wired.');
  if (id === 'inventory') return renderSoon(main, 'Inventory', 'Physical stock levels for hardware, cases, and screwdrivers will live here.');
}

/* ---------- behaviour ---------- */

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (message) { el.textContent = message; el.hidden = false; }
  else { el.textContent = ''; el.hidden = true; }
}

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-adm-section]');
    if (nav) { e.preventDefault(); showSection(nav.dataset.admSection); return; }

    const act = e.target.closest('[data-adm-action]');
    if (act) {
      e.preventDefault();
      if (act.dataset.admAction === 'mint') mint(act);
      if (act.dataset.admAction === 'copy') copyCodes(act);
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

/** Show or hide the Internal nav section. Called on every ping resolution,
 *  so a different user signing in cannot inherit the previous one's menu. */
export function refreshAdminNav() {
  const on = isAdminUser();
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !on; });

  // The Internal section only exists for admins, so the mega-menu needs one
  // more column then. The CSS keys the extra column off this class rather than
  // guessing a count, so the columns always match the visible sections.
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.classList.toggle('has-internal', on);
  });

  // Login and Logout are two states of one thing, so only one shows at a time:
  // Login when signed out, Logout when signed in. Driven by the live session
  // (token), the same signal the rest of the app trusts - a stale ping alone
  // is not a session. Folded in here because this runs at exactly the moments
  // that matter: boot, post-login resolution, and session expiry.
  const signedIn = hasLiveSession();
  document.querySelectorAll('[data-guest-only]').forEach(el => { el.hidden = signedIn; });
  document.querySelectorAll('[data-auth-only]').forEach(el => { el.hidden = !signedIn; });
}

export function initAdminView() {
  $body = document.getElementById('adminBody');
  if (!$body) return;
  bindOnce();
  refreshAdminNav();
}

/** Hook: called by appRouter when switching to admin mode. */
export function onAdminEnter() {
  if (!$body) return;

  // Re-checked on every entry, not just at boot: a sign-out followed by a
  // different sign-in must not leave the previous user's dashboard mounted.
  if (!isAdminUser()) {
    $body.innerHTML = '';
    mounted = false;
    cache.users = null;
    window.setAppMode?.('landing');
    return;
  }

  if (!mounted) {
    activeSection = 'overview';
    $body.innerHTML = shellHtml();
    mounted = true;
  }
  showSection(activeSection);
}
