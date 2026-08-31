// src/admin/admin.js
//
// Internal operator console. Three working sections, nothing speculative:
// Users (the account roster), Warranty codes (mint + inventory), and
// Catalog & lane (the lane switch and the Stripe catalog mirror).
//
// Gating is COSMETIC and deliberately so. The panel mounts only when the cached
// ping says user.isAdmin === true, but every route it calls is admin-gated
// server-side in resolveUserContext, so a customer who forges isAdmin in their
// own sessionStorage gets a console where every request returns 403. Tier is
// never consulted here: a super-tier customer is still a customer.

import { PRAG_API_BASE, LANE } from '../runtime/config.js';
import { switchLane, isPlatformOperator } from '../runtime/lane.js';
const ISSUE_URL = `${PRAG_API_BASE}/warranty/codes/issue`;
const LIST_URL  = `${PRAG_API_BASE}/warranty/codes`;
const USERS_URL = `${PRAG_API_BASE}/admin/users`;
const CATALOG_IMPORT_URL = `${PRAG_API_BASE}/admin/catalog/import`;

// Catalog snapshots survive lane flips (localStorage is per-origin, and the
// lane toggle reloads the same origin), which is the whole trick: snapshot on
// one lane, import on the other.
const CATALOG_SNAPSHOT_KEY = 'pragoptics_catalog_snapshot_v1';

let $body = null;
let mounted = false;
let activeSection = 'users';
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

const SECTIONS = [
  { id: 'users',    label: 'Users' },
  { id: 'warranty', label: 'Warranty codes' },
  { id: 'catalog',  label: 'Catalog & lane' }
];

function shellHtml() {
  return `
    <div class="adm-shell">
      <header class="adm-head">
        <div class="adm-head-id">
          <span class="adm-kicker">Internal</span>
          <h1 class="adm-title">Operator console</h1>
        </div>
        <span class="adm-who" title="Signed in as">${escapeHtml(adminEmail())}</span>
      </header>
      <nav class="adm-tabs" role="tablist" aria-label="Console sections">
        ${SECTIONS.map(s => `
          <button class="adm-tab ${s.id === activeSection ? 'is-active' : ''}" type="button"
                  role="tab" aria-selected="${s.id === activeSection ? 'true' : 'false'}"
                  data-adm-section="${s.id}">${escapeHtml(s.label)}</button>
        `).join('')}
      </nav>
      <main class="adm-main" id="admMain"><!-- section --></main>
    </div>
  `;
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
  if (!users.length) return `<p class="adm-empty">No accounts yet.</p>`;
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

function usersSummary(users) {
  const active = users.filter(u => String(u.status).toUpperCase() === 'ACTIVE').length;
  const subscribed = users.filter(u => !['free', '', 'none'].includes(String(u.tier).toLowerCase())).length;
  return `${users.length} account${users.length === 1 ? '' : 's'} · ${active} active · ${subscribed} subscribed`;
}

async function renderUsers(main) {
  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Users</h2>
      <span class="adm-sec-sub" id="admUsersSummary"></span>
    </header>
    <p class="adm-error" id="admUsersError" hidden></p>
    <div id="admUsersBody"><p class="adm-note">Loading…</p></div>
  `;
  try {
    if (!cache.users) {
      const data = await apiFetch(`${USERS_URL}?limit=1000`);
      cache.users = data.users || [];
    }
    const summary = document.getElementById('admUsersSummary');
    if (summary) summary.textContent = usersSummary(cache.users);
    const host = document.getElementById('admUsersBody');
    if (host) host.innerHTML = usersTableHtml(cache.users);
  } catch (ex) {
    const host = document.getElementById('admUsersBody');
    if (host) host.innerHTML = '';
    showError('admUsersError', friendlyError(ex, 'Could not load users.'));
  }
}

/* ---------- section: warranty codes (mint + inventory) ---------- */

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
        <h3 class="adm-card-h" id="admMintTitle">Mint codes</h3>
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
          <h3 class="adm-card-h" id="admInvTitle">Inventory</h3>
          <div class="adm-seg" role="tablist">
            <button class="adm-seg-btn is-active" type="button" role="tab" aria-selected="true" data-adm-filter="AVAILABLE">Available</button>
            <button class="adm-seg-btn" type="button" role="tab" aria-selected="false" data-adm-filter="CLAIMED">Claimed</button>
            <button class="adm-seg-btn" type="button" role="tab" aria-selected="false" data-adm-filter="ALL">All</button>
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
    const active = document.querySelector('.adm-seg-btn.is-active')?.dataset.admFilter || 'AVAILABLE';
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

/* ---------- routing between sections ---------- */

function showSection(id) {
  activeSection = id;
  document.querySelectorAll('.adm-tab').forEach(b => {
    const on = b.dataset.admSection === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const main = document.getElementById('admMain');
  if (!main) return;
  if (id === 'users')    return void renderUsers(main);
  if (id === 'warranty') return void renderWarranty(main);
  if (id === 'catalog')  return void renderCatalog(main);
}

/* ---------- section: catalog & lane ---------- */

function readSnapshot() {
  try { return JSON.parse(localStorage.getItem(CATALOG_SNAPSHOT_KEY) || 'null'); }
  catch { return null; }
}

function renderCatalog(main) {
  const ping = cachedPing();
  const rows = Array.isArray(ping?.productCatalog) ? ping.productCatalog : [];
  const snap = readSnapshot();

  main.innerHTML = `
    <header class="adm-sec-head">
      <h2 class="adm-sec-title">Catalog &amp; lane</h2>
      <span class="adm-pill">lane: ${escapeHtml(LANE)}</span>
    </header>

    <div class="adm-card">
      <h3 class="adm-card-h">Lane</h3>
      <p class="adm-note">This browser is routing API calls to the <strong>${escapeHtml(LANE)}</strong> lane
      (${escapeHtml(PRAG_API_BASE)}). Each lane is its own platform: its own accounts, keys, and
      Stripe mode. When your accounts are linked the switch is seamless (no password); otherwise
      it opens sign-in on the other lane. Either way the session and every cached response come
      back fresh. The deployed site never changes; only where this browser routes.</p>
      <div class="adm-actions-row">
        <button class="btn" type="button" data-adm-action="lane-live" ${LANE === 'live' ? 'disabled' : ''}>Switch to live</button>
        <button class="btn" type="button" data-adm-action="lane-dev" ${LANE === 'dev' ? 'disabled' : ''}>Switch to dev</button>
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
          <button class="cta" type="button" data-adm-action="catalog-snapshot">Snapshot ${rows.length} rows from ${escapeHtml(LANE)}</button>
        </div>
      ` : `
        <p class="adm-note">No catalog rows on this lane yet. Sign out and back in if you subscribed
        recently; the catalog rides on the ping.</p>
      `}
    </div>

    <div class="adm-card">
      <h3 class="adm-card-h">Stored snapshot</h3>
      ${snap ? `
        <p class="adm-note"><strong>${snap.items.length}</strong> rows from the
        <strong>${escapeHtml(snap.sourceLane)}</strong> lane, taken ${escapeHtml(new Date(snap.takenAt).toLocaleString())}.</p>
        ${snap.sourceLane === LANE
          ? `<p class="adm-note">You are on the lane this snapshot came from. Flip to the other lane to import it.</p>`
          : `<p class="adm-note">Importing creates the missing products and prices in the
             <strong>${escapeHtml(LANE)}</strong> lane's Stripe account (by lookup key, idempotent),
             then syncs its ProductCatalog table.</p>
             <div class="adm-actions-row">
               <button class="cta" type="button" data-adm-action="catalog-import">Import into ${escapeHtml(LANE)}</button>
             </div>`}
      ` : `
        <p class="adm-note">No snapshot stored. Take one on the lane that has the catalog (live), then
        flip lanes and import it here.</p>
      `}
      <p class="adm-error" id="admCatalogError" hidden></p>
      <p class="adm-note" id="admCatalogResult" hidden></p>
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

// A lane switch is a sign-out + fresh sign-in on the target lane; see
// src/runtime/lane.js for why nothing survives the crossing.
function setLane(lane) {
  switchLane(lane);
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
      if (act.dataset.admAction === 'catalog-snapshot') catalogSnapshot();
      if (act.dataset.admAction === 'catalog-import') catalogImport(act);
      if (act.dataset.admAction === 'lane-live') setLane('live');
      if (act.dataset.admAction === 'lane-dev') setLane('dev');
      return;
    }

    const tab = e.target.closest('[data-adm-filter]');
    if (tab) {
      e.preventDefault();
      document.querySelectorAll('.adm-seg-btn').forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      loadInventory(tab.dataset.admFilter);
    }
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

  // Lane switch in the menu: platform operators only (isAdmin OR isDev on this
  // lane's ping), and only with a live session. The label always names the
  // lane the click would land on.
  const operator = signedIn && isPlatformOperator();
  document.querySelectorAll('[data-operator-only]').forEach(el => { el.hidden = !operator; });
  const laneBtn = document.getElementById('navLaneSwitch');
  if (laneBtn) laneBtn.textContent = LANE === 'dev' ? 'Switch to live lane' : 'Switch to dev lane';
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
    activeSection = 'users';
    $body.innerHTML = shellHtml();
    mounted = true;
  }
  showSection(activeSection);
}
