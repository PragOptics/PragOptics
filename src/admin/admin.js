// src/admin/admin.js
//
// Internal admin dashboard: warranty code inventory.
//
// Gating: mounts only when the cached ping says user.isAdmin === true. That
// check is a strict boolean, matching resolveUserContext.js:28 on the backend,
// so the string "true" does not pass on either side.
//
// This gate is COSMETIC and deliberately so. Every route it calls is
// admin-gated server-side; a customer who forges isAdmin in their own
// sessionStorage gets a dashboard where every button returns 403. Tier is
// never consulted here - a super-tier customer is still a customer.

const PRAG_API_BASE = 'https://api.pragoptics.com/api/v1';
const ISSUE_URL = `${PRAG_API_BASE}/warranty/codes/issue`;
const LIST_URL = `${PRAG_API_BASE}/warranty/codes`;

let $body = null;
let mounted = false;

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

/** Strict boolean, same test the backend applies. Tier is irrelevant. */
export function isAdminUser() {
  return cachedPing()?.user?.isAdmin === true;
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

/* ---------- markup ---------- */

function shellHtml() {
  return `
    <div class="adm-grid">

      <section class="adm-card" aria-labelledby="admMintTitle">
        <h2 class="adm-h2" id="admMintTitle">Mint codes</h2>
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

        <div class="adm-actions">
          <button class="cta" type="button" data-adm-action="mint">Mint codes</button>
        </div>

        <p class="adm-error" id="admMintError" hidden></p>
        <div id="admMintResult"></div>
      </section>

      <section class="adm-card" aria-labelledby="admInvTitle">
        <div class="adm-inv-head">
          <h2 class="adm-h2" id="admInvTitle">Inventory</h2>
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
}

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
  if (!rows.length) {
    return `<p class="adm-note">Nothing here yet.</p>`;
  }
  return `
    <p class="adm-note">${rows.length}${data.truncated ? '+' : ''} shown</p>
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
              <td>${escapeHtml((r.issuedAt || '').slice(0, 10))}</td>
              <td>${escapeHtml(r.claimedByEmail || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------- behaviour ---------- */

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (message) { el.textContent = message; el.hidden = false; }
  else { el.textContent = ''; el.hidden = true; }
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
  if (!Number.isFinite(count) || count < 1) {
    showError('admMintError', 'Enter how many codes to mint.');
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Minting…';

  try {
    const result = await apiFetch(ISSUE_URL, {
      method: 'POST',
      body: JSON.stringify({ count, productId, note })
    });
    const out = document.getElementById('admMintResult');
    if (out) out.innerHTML = mintResultHtml(result);
    // New codes change what is available, so refresh whichever tab is showing.
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

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;

  document.addEventListener('click', (e) => {
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
}

/** Show or hide the Internal nav section. Called on every ping resolution,
 *  so a different user signing in cannot inherit the previous one's menu. */
export function refreshAdminNav() {
  const on = isAdminUser();
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !on; });
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
    window.setAppMode?.('landing');
    return;
  }

  if (!mounted) {
    $body.innerHTML = shellHtml();
    mounted = true;
  }
  loadInventory('AVAILABLE');
}
