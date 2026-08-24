// src/warranty/warranty.js
// Warranty registration flow — the page behind the URL printed on every
// warranty card (/#mode=warranty&device=<id>).
//
// Flow:  1) pick device  →  2) thank-you + code entry (arrow button)
//        →  3) contact info (email required, phone optional)
//        →  4a) register only            → POST warranty/register (no account)
//           4b) register + create account → stash intent, run the normal
//               sign-in/account flow; the backend consumes the intent and the
//               warranty-flavored ping response branches the post-login UI.
//
// Backend seam: WARRANTY_API_LIVE gates the real call. Until the endpoint is
// deployed (and tested — see memory: don't hammer the backend during dev),
// registrations queue locally under pragoptics_warranty_queue_v1 so the whole
// front-end flow is testable end-to-end today and flips live with one flag.

import { HARDWARE, getProduct } from '../shop/products.js';
import { renderTransfer, cancelTransfer } from './transfer.js';

const WARRANTY_API_LIVE = false; // ← flip when POST /warranty/register is deployed
const PRAG_API_BASE = 'https://api.pragoptics.com/api/v1';
const WARRANTY_REGISTER_URL = `${PRAG_API_BASE}/warranty/register`;

const INTENT_KEY = 'pragoptics_warranty_intent_v1'; // consumed by the account-creation path
const QUEUE_KEY  = 'pragoptics_warranty_queue_v1';  // local queue until the API is live

// Right-arrow "enter" glyph — the action twin of the download button's
// down-arrow (DL_ICON in product-modal.js): same stroke, same 36px glass tile.
const GO_ICON = '<svg class="wr-go-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h14"/><path d="M12 6l6 6-6 6"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';

let $body = null;
const state = { deviceId: null, code: '', email: '', phone: '' };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

/* ---------- step templates ---------- */

function deviceStepHtml() {
  const opts = HARDWARE.map(p =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.tagline)}</option>`
  ).join('');
  return `
    <div class="wr-step" data-wr-step="device">
      <label class="wr-label" for="wrDevice">Your device</label>
      <div class="wr-select-wrap">
        <select id="wrDevice" class="wr-select" aria-label="Select your device">
          <option value="" selected disabled>Select your device…</option>
          ${opts}
        </select>
        <span class="wr-select-caret" aria-hidden="true">▾</span>
      </div>
    </div>
  `;
}

function codeStepHtml(p) {
  return `
    <div class="wr-step wr-step-code" data-wr-step="code">
      <div class="wr-thanks">
        <span class="wr-thanks-big">Thank you.</span>
        <p class="wr-thanks-sub">Your <strong>${escapeHtml(p.name)}</strong> was built, tested, and
        voltage-set by hand — and it's yours to open, probe, and repair for as long as you run it.
        Register it and the printed case is covered for life.</p>
      </div>
      <label class="wr-label wr-label-center" for="wrCode">Warranty code — on the card in your case</label>
      <div class="wr-code-row">
        <input id="wrCode" class="wr-code-input" type="text" inputmode="text" autocomplete="off"
               spellcheck="false" placeholder="XXXX-XXXX-XXXX" aria-label="Warranty code">
        <button id="wrCodeGo" class="wr-go" type="button" aria-label="Continue">${GO_ICON}</button>
      </div>
      <p class="wr-error" id="wrCodeError" hidden>Enter the code exactly as printed on your card.</p>
    </div>
  `;
}

function contactStepHtml(p) {
  return `
    <div class="wr-step wr-step-contact" data-wr-step="contact">
      <div class="wr-code-chip">
        <span class="wr-chip-device">${escapeHtml(p.name)}</span>
        <code class="wr-chip-code">${escapeHtml(state.code)}</code>
      </div>
      <p class="wr-contact-lede">Last step — where do we reach you if this unit ever needs anything?</p>
      <div class="wr-fields">
        <div class="form-field">
          <label for="wrEmail">Email</label>
          <input id="wrEmail" type="email" autocomplete="email" placeholder="you@company.com">
        </div>
        <div class="form-field">
          <label for="wrPhone">Phone <span class="wr-optional">optional</span></label>
          <input id="wrPhone" type="tel" autocomplete="tel" placeholder="(555) 555-0123">
        </div>
      </div>
      <p class="wr-error" id="wrContactError" hidden>A valid email is required — it's how your warranty is tied to you.</p>

      <div class="wr-paths">
        <button class="cta wr-path" type="button" data-wr-action="register-only">
          <span class="wr-path-t">Register my product</span>
          <span class="wr-path-s">Just the warranty — no account, no sign-in.</span>
        </button>
        <button class="btn wr-path" type="button" data-wr-action="register-account">
          <span class="wr-path-t">Register &amp; create an account</span>
          <span class="wr-path-s">Adds the platform: cloud sync, API access, optional subscription.</span>
        </button>
      </div>
    </div>
  `;
}

function successHtml(p, withAccount) {
  return `
    <div class="wr-step wr-step-done" data-wr-step="done">
      <span class="wr-done-badge">${CHECK_ICON}</span>
      <span class="wr-thanks-big">Registered.</span>
      <p class="wr-thanks-sub">Your <strong>${escapeHtml(p.name)}</strong> is on record — code
      <code class="wr-chip-code">${escapeHtml(state.code)}</code> is now tied to you.
      The printed case is covered for life, the unit for one year against manufacturing defects.</p>
      ${withAccount
        ? `<p class="wr-thanks-sub">Finishing up: we're taking you to sign-in to create your account.</p>`
        : `<p class="wr-done-hint">That's it. No account, no follow-up needed — keep the card with the unit.</p>`}
      <p class="wr-done-hint">Passing it on someday? Ownership — warranty included — transfers
      anytime from this page: <strong>My Products → Transfer</strong>. The email you registered
      with is the key.</p>
      <div class="wr-done-actions">
        <button class="btn" type="button" data-wr-action="register-another">Register another device</button>
        <button class="btn" type="button" data-wr-action="back-home">Back to PragOptics</button>
      </div>
    </div>
  `;
}

/* ---------- submission ---------- */

async function submitRegistration({ wantsAccount }) {
  const payload = {
    productId: state.deviceId,
    code: state.code,
    email: state.email,
    phone: state.phone || null,
    wantsAccount: !!wantsAccount,
    submittedAt: new Date().toISOString(),
    source: 'web-v1'
  };

  if (WARRANTY_API_LIVE) {
    // Real call — shape mirrors the platform's other POSTs; the backend
    // validates the code against the device-code table and records the
    // registration (see warranty backend notes).
    const res = await fetch(WARRANTY_REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Registration failed (${res.status})`);
    return res.json().catch(() => ({}));
  }

  // Local queue until the endpoint ships — keeps the flow fully testable
  // without touching the backend.
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* storage full/blocked — still show success locally */ }
  await new Promise(r => setTimeout(r, 550)); // small beat so the UI reads as "sent"
  return { queued: true };
}

/* ---------- rendering + wiring ---------- */

function render(stepHtml) {
  if (!$body) return;
  $body.innerHTML = stepHtml;
}

function showCodeStep(p) {
  render(deviceStepHtml() + codeStepHtml(p));
  const sel = $body.querySelector('#wrDevice');
  if (sel) sel.value = p.id;
  const input = $body.querySelector('#wrCode');
  input?.focus();
}

function showContactStep(p) {
  render(contactStepHtml(p));
  $body.querySelector('#wrEmail')?.focus();
}

function bindOnce() {
  if (bindOnce._bound || !$body) return;
  bindOnce._bound = true;

  $body.addEventListener('change', (e) => {
    const sel = e.target.closest('#wrDevice');
    if (!sel || !sel.value) return;
    state.deviceId = sel.value;
    const p = getProduct(state.deviceId);
    if (p) showCodeStep(p);
  });

  $body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('#wrCode')) {
      e.preventDefault();
      $body.querySelector('#wrCodeGo')?.click();
    }
  });

  $body.addEventListener('click', async (e) => {
    const go = e.target.closest('#wrCodeGo');
    if (go) {
      const input = $body.querySelector('#wrCode');
      const err = $body.querySelector('#wrCodeError');
      const code = normalizeCode(input?.value);
      if (!code || code.length < 4) { if (err) err.hidden = false; input?.focus(); return; }
      state.code = code;
      if (err) err.hidden = true;
      showContactStep(getProduct(state.deviceId));
      return;
    }

    const path = e.target.closest('[data-wr-action="register-only"], [data-wr-action="register-account"]');
    if (path) {
      const email = $body.querySelector('#wrEmail')?.value?.trim() || '';
      const phone = $body.querySelector('#wrPhone')?.value?.trim() || '';
      const err = $body.querySelector('#wrContactError');
      if (!isEmail(email)) { if (err) err.hidden = false; $body.querySelector('#wrEmail')?.focus(); return; }
      if (err) err.hidden = true;
      state.email = email;
      state.phone = phone;

      const wantsAccount = path.dataset.wrAction === 'register-account';
      // Disable BOTH paths — a second click on the other button mid-flight
      // would double-register the same code (and could hijack the account choice).
      const paths = [...$body.querySelectorAll('.wr-path')];
      paths.forEach(b => { b.disabled = true; });

      try {
        await submitRegistration({ wantsAccount });
      } catch (ex) {
        if (mode !== 'register') return; // user left mid-flight
        paths.forEach(b => { b.disabled = false; });
        if (err) { err.textContent = ex?.message || 'Registration failed — please try again.'; err.hidden = false; }
        return;
      }

      // A tab/mode switch during the request must not clobber the other flow.
      if (mode !== 'register') return;

      const p = getProduct(state.deviceId);
      render(successHtml(p, wantsAccount));

      if (wantsAccount) {
        // Stash the intent for the account flow: after sign-in/creation the
        // backend consumes it (ties the device code to the new account and
        // retires it from the open-codes table) and the warranty-flavored
        // ping response routes the post-login UI accordingly.
        try { localStorage.setItem(INTENT_KEY, JSON.stringify({ deviceId: state.deviceId, code: state.code, email: state.email, phone: state.phone })); } catch {}
        setTimeout(() => {
          // Only yank to sign-in if the user is still sitting on the register
          // success screen — not if they've tabbed or navigated away.
          const view = document.getElementById('warrantyView');
          if (mode === 'register' && view && !view.classList.contains('hidden')) {
            window.startPragOpticsLogin?.();
          }
        }, 1600);
      }
      return;
    }

    if (e.target.closest('[data-wr-action="register-another"]')) {
      state.deviceId = null;
      state.code = '';
      render(deviceStepHtml());
      return;
    }

    if (e.target.closest('[data-wr-action="back-home"]')) {
      window.setAppMode?.('landing');
    }
  });
}

/* ---------- modes: register / transfer ---------- */

const MODE_COPY = {
  register: {
    title: 'Activate your warranty.',
    sub: 'Your warranty card carries a unique code — one code, one device. Pick your device, enter the code, and you’re covered. No account required.'
  },
  transfer: {
    title: 'Transfer ownership.',
    sub: 'Products move; warranties follow. A claim code proves the current owner, a confirmation code accepts the hand-off — human to human, no account required.'
  }
};

let mode = 'register';

function setMode(next) {
  const leavingTransfer = mode === 'transfer' && next !== 'transfer';
  mode = next === 'transfer' ? 'transfer' : 'register';
  // Invalidate the other flow's in-flight work + timers before rendering ours.
  if (leavingTransfer) cancelTransfer();
  document.querySelectorAll('#warrantyView .wr-tab').forEach(t => {
    const on = t.dataset.wrMode === mode;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const copy = MODE_COPY[mode];
  const title = document.getElementById('wrTitle');
  const sub = document.getElementById('wrSub');
  if (title) title.textContent = copy.title;
  if (sub) sub.textContent = copy.sub;
  if (mode === 'transfer') renderTransfer($body);
  else render(deviceStepHtml());
}

/** Read a device preselect from the deep link: /#mode=warranty&device=omnisource */
function deviceFromHash() {
  const m = String(location.hash || '').match(/device=([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Deep-link hashes are one-shot: act on them, then clear them so the next
    entry through the menu doesn't replay a stale route (a lingering
    '#transfer' or 'device=' would otherwise hijack every later visit). */
function consumeHash() {
  if (!location.hash) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
}

export function onWarrantyEnter() {
  if (!$body) return;
  // /#transfer deep link (How To, docs, emails) lands straight in transfer mode.
  if (/^#transfer/i.test(String(location.hash || ''))) {
    consumeHash();
    setMode('transfer');
    return;
  }
  const pre = deviceFromHash();
  const p = pre ? getProduct(pre) : null;
  if (p && p.category === 'hardware') {
    consumeHash();
    if (mode !== 'register') setMode('register');
    state.deviceId = p.id;
    showCodeStep(p);
  } else if (mode === 'transfer') {
    // Re-entering while a transfer is underway (waiting on a code, mid-select):
    // leave it exactly as it was — the tabs are right there for switching.
  } else if (!$body.innerHTML.trim() || $body.querySelector('[data-wr-step="done"]')) {
    // Fresh entry, or a terminal success screen left over from a previous
    // registration — start clean at the device picker (in-progress steps are
    // left alone).
    state.deviceId = null;
    state.code = '';
    render(deviceStepHtml());
  }
}

export function initWarrantyView() {
  $body = document.getElementById('warrantyBody');
  if (!$body) return;
  render(deviceStepHtml());
  bindOnce();
  // Mode tabs live outside the step body — bind them on the view shell.
  document.getElementById('warrantyView')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.wr-tab');
    if (tab && tab.dataset.wrMode !== mode) setMode(tab.dataset.wrMode);
  });
}
