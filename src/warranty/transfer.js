// src/warranty/transfer.js
// Product ownership transfer — the second mode of the My Products page.
// Human-to-human: the warranty follows the product to the new owner's email.
//
// Flow:  1) lookup — current owner enters the email their products were
//           registered under (phone optional, SMS is a notification extra)
//        2) claim code — the backend emails a code ONLY if that email exists
//           in the registration log (anti-enumeration: the front end behaves
//           identically either way and simply waits on a code)
//        3) verify code → the owner's registered products come back; they
//           select what to transfer and enter the transferee's email
//        4) transferee confirmation code (same code UX as signup/reset)
//        5) complete — registrations move to the new email; if that email has
//           no account we offer provisioning and route to Get Started
//
// Staleness: codes only ever arrive for emails on file, so the UI could wait
// forever on a code that was never sent. A 90-second cooldown gates every
// re-request; "Request another code" always behaves as if it fired (live: it
// re-calls the backend; the response is identical whether or not the email is
// on file). Changing the email is the real reset — it returns to lookup and
// the next submit is a fresh request.
//
// Backend seam: TRANSFER_API_LIVE gates real calls. The endpoints are
// intentionally NOT named yet — the owner is actively building the backend
// and will name the routes; the seam functions below get URLs when they land.
// Until then everything simulates locally: the registration queue
// (pragoptics_warranty_queue_v1) stands in for the registration log, any
// 6+ character code verifies, and completed transfers are queued under
// pragoptics_transfer_queue_v1 while also re-assigning the local
// registrations, so the whole flow is testable end to end today.

import { getProduct } from '../shop/products.js';

const TRANSFER_API_LIVE = false;      // ← flip when the transfer endpoints are deployed and named
const RESEND_COOLDOWN_S = 90;         // stale-code timeout between (re)requests
const REG_QUEUE_KEY      = 'pragoptics_warranty_queue_v1';
const TRANSFER_QUEUE_KEY = 'pragoptics_transfer_queue_v1';

const GO_ICON = '<svg class="wr-go-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h14"/><path d="M12 6l6 6-6 6"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';

let $host = null;
let timerId = null;
// Generation token: every (re)mount or cancel bumps it, and every async
// continuation checks it before touching the DOM — a mid-flight tab switch
// must never render a stale step over the other mode's UI.
let run = 0;

const state = {
  step: 'lookup',          // lookup | claim-code | select | transferee-code | done
  email: '', phone: '',
  products: [],            // registrations found for state.email
  selected: new Set(),     // indexes into state.products
  toEmail: '',
  transfereeHasAccount: null,
  resendLeft: 0            // seconds remaining on the resend cooldown
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

function normCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
}

/* ---------- backend seams (simulated until TRANSFER_API_LIVE) ---------- */

function readRegQueue() {
  try { return JSON.parse(localStorage.getItem(REG_QUEUE_KEY) || '[]'); }
  catch { return []; }
}

async function apiRequestClaimCode(email, phone) {
  if (TRANSFER_API_LIVE) {
    // Endpoint TBD — named with the backend. Sends a claim code to `email`
    // (and optionally notifies `phone`) ONLY if the email is on file; the
    // response is identical either way so nothing is enumerable.
    throw new Error('Transfer endpoints not wired yet.');
  }
  await new Promise(r => setTimeout(r, 600));
  return { sent: true };
}

async function apiVerifyClaimCode(email, code) {
  if (TRANSFER_API_LIVE) {
    // Endpoint TBD — verifies the claim code and returns the registrations
    // tied to `email`.
    throw new Error('Transfer endpoints not wired yet.');
  }
  await new Promise(r => setTimeout(r, 500));
  if (normCode(code).length < 6) return { ok: false };
  const mine = readRegQueue().filter(q => String(q.email || '').toLowerCase() === email.toLowerCase());
  return { ok: true, products: mine };
}

async function apiRequestTransfereeCode(toEmail) {
  if (TRANSFER_API_LIVE) {
    // Endpoint TBD — sends a confirmation code to the transferee.
    throw new Error('Transfer endpoints not wired yet.');
  }
  await new Promise(r => setTimeout(r, 600));
  return { sent: true };
}

async function apiCompleteTransfer({ fromEmail, toEmail, code, items }) {
  if (TRANSFER_API_LIVE) {
    // Endpoint TBD — verifies the transferee code, re-assigns the selected
    // registrations, reports whether `toEmail` already has an account.
    throw new Error('Transfer endpoints not wired yet.');
  }
  await new Promise(r => setTimeout(r, 550));
  if (normCode(code).length < 6) return { ok: false };
  // Simulation: move the local registrations and queue the transfer record.
  try {
    const q = readRegQueue();
    const moving = new Set(items.map(i => `${i.productId}|${i.code}`));
    q.forEach(r => {
      if (String(r.email || '').toLowerCase() === fromEmail.toLowerCase() && moving.has(`${r.productId}|${r.code}`)) {
        r.email = toEmail;
        r.transferredAt = new Date().toISOString();
      }
    });
    localStorage.setItem(REG_QUEUE_KEY, JSON.stringify(q));
    const tq = JSON.parse(localStorage.getItem(TRANSFER_QUEUE_KEY) || '[]');
    tq.push({ fromEmail, toEmail, items, at: new Date().toISOString(), source: 'web-v1' });
    localStorage.setItem(TRANSFER_QUEUE_KEY, JSON.stringify(tq));
  } catch { /* storage blocked — still confirm locally */ }
  return { ok: true, transfereeHasAccount: false };
}

/* ---------- resend cooldown (the 90s staleness gate) ---------- */

function startCooldown() {
  stopCooldown();
  state.resendLeft = RESEND_COOLDOWN_S;
  timerId = setInterval(() => {
    state.resendLeft = Math.max(0, state.resendLeft - 1);
    const btn = $host?.querySelector('[data-tr-resend]');
    if (btn) {
      btn.disabled = state.resendLeft > 0;
      btn.textContent = state.resendLeft > 0
        ? `Request another code (${state.resendLeft}s)`
        : 'Request another code';
    }
    if (state.resendLeft <= 0) stopCooldown();
  }, 1000);
}

function stopCooldown() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

/* ---------- step templates ---------- */

function lookupHtml() {
  return `
    <div class="wr-step tr-step" data-tr-step="lookup">
      <p class="wr-contact-lede">Transfer ownership to someone else. The warranty moves with the
      product. Start with the email your products were <strong>registered under</strong>.</p>
      <div class="wr-fields">
        <div class="form-field">
          <label for="trEmail">Registration email</label>
          <input id="trEmail" type="email" autocomplete="email" placeholder="you@company.com" value="${escapeHtml(state.email)}">
        </div>
        <div class="form-field">
          <label for="trPhone">Phone <span class="wr-optional">optional: SMS notice</span></label>
          <input id="trPhone" type="tel" autocomplete="tel" placeholder="(555) 555-0123" value="${escapeHtml(state.phone)}">
        </div>
      </div>
      <p class="wr-error" id="trLookupError" hidden>Enter the email your products were registered under.</p>
      <div class="wr-done-actions">
        <button class="cta" type="button" data-tr-action="request-code">Email me a claim code</button>
      </div>
      <p class="tr-fine muted">If registrations exist under this email, a code is on its way.
      Codes only go to the address on file.</p>
    </div>
  `;
}

function claimCodeHtml() {
  return `
    <div class="wr-step wr-step-code tr-step" data-tr-step="claim-code">
      <div class="wr-code-chip">
        <span class="wr-chip-device">Claim code sent</span>
        <code class="wr-chip-code">${escapeHtml(state.email)}</code>
        <button class="tr-change" type="button" data-tr-action="change-email">Different email?</button>
      </div>
      <label class="wr-label wr-label-center" for="trCode">Enter the claim code from your email</label>
      <div class="wr-code-row">
        <input id="trCode" class="wr-code-input" type="text" inputmode="text" autocomplete="one-time-code"
               spellcheck="false" placeholder="XXXXXX" aria-label="Claim code">
        <button id="trCodeGo" class="wr-go" type="button" aria-label="Verify code">${GO_ICON}</button>
      </div>
      <p class="wr-error" id="trCodeError" hidden>That code didn't verify. Check it and try again.</p>
      <div class="wr-done-actions">
        <button class="btn tr-resend" type="button" data-tr-resend disabled>Request another code (${RESEND_COOLDOWN_S}s)</button>
      </div>
    </div>
  `;
}

function selectHtml() {
  const items = state.products.map((r, i) => {
    const p = getProduct(r.productId);
    const name = p?.name || r.productId;
    const when = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '';
    return `
      <label class="tr-item">
        <input type="checkbox" data-tr-pick value="${i}" ${state.selected.has(i) ? 'checked' : ''}>
        <span class="tr-item-body">
          <span class="tr-item-name">${escapeHtml(name)}</span>
          <span class="tr-item-meta"><code class="wr-chip-code">${escapeHtml(r.code || '')}</code>${when ? ` · registered ${escapeHtml(when)}` : ''}</span>
        </span>
      </label>
    `;
  }).join('');
  if (!state.products.length) {
    return `
      <div class="wr-step tr-step" data-tr-step="select">
        <p class="wr-contact-lede">No registrations found under <strong>${escapeHtml(state.email)}</strong>.</p>
        <p class="tr-fine muted">Products are looked up by the email used at registration. If you
        registered with a different address, start over with that one.</p>
        <div class="wr-done-actions">
          <button class="btn" type="button" data-tr-action="change-email">Try a different email</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="wr-step tr-step" data-tr-step="select">
      <p class="wr-contact-lede"><strong>${state.products.length}</strong> ${state.products.length === 1 ? 'product is' : 'products are'} registered
      to <strong>${escapeHtml(state.email)}</strong>. Select what you're transferring, then tell us where it's going.</p>
      <div class="tr-items">${items}</div>
      <div class="wr-fields">
        <div class="form-field">
          <label for="trToEmail">New owner's email</label>
          <input id="trToEmail" type="email" autocomplete="off" placeholder="them@company.com" value="${escapeHtml(state.toEmail)}">
        </div>
      </div>
      <p class="wr-error" id="trSelectError" hidden>Select at least one product and enter the new owner's email.</p>
      <div class="wr-done-actions">
        <button class="cta" type="button" data-tr-action="send-transferee-code">Send them a confirmation code</button>
      </div>
      <p class="tr-fine muted">The new owner confirms with a code sent to their email. That's what
      makes the hand-off theirs.</p>
    </div>
  `;
}

function transfereeCodeHtml() {
  return `
    <div class="wr-step wr-step-code tr-step" data-tr-step="transferee-code">
      <div class="wr-code-chip">
        <span class="wr-chip-device">Confirmation sent</span>
        <code class="wr-chip-code">${escapeHtml(state.toEmail)}</code>
        <button class="tr-change" type="button" data-tr-action="change-to-email">Different email?</button>
      </div>
      <label class="wr-label wr-label-center" for="trToCode">Enter the new owner's confirmation code</label>
      <div class="wr-code-row">
        <input id="trToCode" class="wr-code-input" type="text" inputmode="text" autocomplete="one-time-code"
               spellcheck="false" placeholder="XXXXXX" aria-label="Confirmation code">
        <button id="trToCodeGo" class="wr-go" type="button" aria-label="Complete transfer">${GO_ICON}</button>
      </div>
      <p class="wr-error" id="trToCodeError" hidden>That code didn't verify. Check it and try again.</p>
      <div class="wr-done-actions">
        <button class="btn tr-resend" type="button" data-tr-resend disabled>Request another code (${RESEND_COOLDOWN_S}s)</button>
      </div>
    </div>
  `;
}

function doneHtml() {
  const n = state.selected.size;
  const offerAccount = state.transfereeHasAccount === false;
  return `
    <div class="wr-step wr-step-done tr-step" data-tr-step="done">
      <span class="wr-done-badge">${CHECK_ICON}</span>
      <span class="wr-thanks-big">Transferred.</span>
      <p class="wr-thanks-sub"><strong>${n}</strong> ${n === 1 ? 'product' : 'products'} now belong${n === 1 ? 's' : ''} to
      <code class="wr-chip-code">${escapeHtml(state.toEmail)}</code>, warranty included.
      Their email is now the key to these registrations.</p>
      ${offerAccount ? `
        <p class="wr-done-hint">That email doesn't have a PragOptics account yet. One click sets it up,
        the products are waiting there either way.</p>
        <div class="wr-done-actions">
          <button class="cta" type="button" data-tr-action="get-started">Get them started →</button>
          <button class="btn" type="button" data-tr-action="back-home">Done</button>
        </div>
      ` : `
        <div class="wr-done-actions">
          <button class="btn" type="button" data-tr-action="back-home">Done</button>
        </div>
      `}
    </div>
  `;
}

/* ---------- rendering + wiring ---------- */

function render() {
  if (!$host) return;
  const html = {
    'lookup': lookupHtml,
    'claim-code': claimCodeHtml,
    'select': selectHtml,
    'transferee-code': transfereeCodeHtml,
    'done': doneHtml
  }[state.step]();
  $host.innerHTML = html;
  if (state.step === 'claim-code') $host.querySelector('#trCode')?.focus();
  if (state.step === 'transferee-code') $host.querySelector('#trToCode')?.focus();
  if (state.step === 'lookup') $host.querySelector('#trEmail')?.focus();
}

function fail(sel, msg) {
  const err = $host?.querySelector(sel);
  if (err) { if (msg) err.textContent = msg; err.hidden = false; }
}

function bindOnce() {
  if (bindOnce._bound || !$host) return;
  bindOnce._bound = true;

  $host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.closest('#trCode'))   { e.preventDefault(); $host.querySelector('#trCodeGo')?.click(); }
    if (e.target.closest('#trToCode')) { e.preventDefault(); $host.querySelector('#trToCodeGo')?.click(); }
    if (e.target.closest('#trEmail, #trPhone')) { e.preventDefault(); $host.querySelector('[data-tr-action="request-code"]')?.click(); }
    if (e.target.closest('#trToEmail')) { e.preventDefault(); $host.querySelector('[data-tr-action="send-transferee-code"]')?.click(); }
  });

  $host.addEventListener('change', (e) => {
    const pick = e.target.closest('[data-tr-pick]');
    if (pick) {
      const i = Number(pick.value);
      if (pick.checked) state.selected.add(i); else state.selected.delete(i);
    }
  });

  $host.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-tr-action]')?.dataset.trAction;

    if (act === 'request-code') {
      const email = $host.querySelector('#trEmail')?.value?.trim() || '';
      const phone = $host.querySelector('#trPhone')?.value?.trim() || '';
      if (!isEmail(email)) { fail('#trLookupError'); $host.querySelector('#trEmail')?.focus(); return; }
      state.email = email;
      state.phone = phone;
      const btn = e.target.closest('[data-tr-action]');
      btn.disabled = true;
      const r = run;
      try { await apiRequestClaimCode(email, phone); }
      catch (ex) { if (r !== run) return; btn.disabled = false; fail('#trLookupError', ex?.message || 'Could not send the code. Try again.'); return; }
      if (r !== run) return; // mode/flow changed while in flight
      state.step = 'claim-code';
      render();
      startCooldown();
      return;
    }

    if (e.target.closest('[data-tr-resend]')) {
      // The 90s gate just expired. Fire (or appear to fire) another request —
      // the UX is identical whether or not the email is on file. Only a
      // changed email actually restarts the flow.
      const btn = e.target.closest('[data-tr-resend]');
      btn.disabled = true;
      const onTransferee = state.step === 'transferee-code';
      const r = run;
      try { await (onTransferee ? apiRequestTransfereeCode(state.toEmail) : apiRequestClaimCode(state.email, state.phone)); }
      catch { /* identical UX regardless */ }
      // The step may have advanced (code verified) or the mode switched while
      // the request was in flight — don't resurrect a cooldown for a step
      // that's gone.
      if (r !== run || (state.step !== 'claim-code' && state.step !== 'transferee-code')) return;
      startCooldown();
      const b = $host.querySelector('[data-tr-resend]');
      if (b) b.textContent = `Sent. Request again in ${RESEND_COOLDOWN_S}s`;
      return;
    }

    if (act === 'change-email') {
      stopCooldown();
      state.step = 'lookup';
      state.selected = new Set();
      render();
      return;
    }

    if (act === 'change-to-email') {
      stopCooldown();
      state.step = 'select';
      render();
      return;
    }

    if (e.target.closest('#trCodeGo')) {
      const code = normCode($host.querySelector('#trCode')?.value);
      if (code.length < 6) { fail('#trCodeError'); return; }
      const go = $host.querySelector('#trCodeGo');
      go.disabled = true;
      const r = run;
      let resp;
      try { resp = await apiVerifyClaimCode(state.email, code); }
      catch (ex) { if (r !== run) return; go.disabled = false; fail('#trCodeError', ex?.message); return; }
      if (r !== run) return;
      if (!resp?.ok) { go.disabled = false; fail('#trCodeError'); return; }
      stopCooldown();
      state.products = resp.products || [];
      state.selected = new Set();
      state.step = 'select';
      render();
      return;
    }

    if (act === 'send-transferee-code') {
      const toEmail = $host.querySelector('#trToEmail')?.value?.trim() || '';
      if (!state.selected.size || !isEmail(toEmail)) { fail('#trSelectError'); return; }
      if (toEmail.toLowerCase() === state.email.toLowerCase()) {
        fail('#trSelectError', 'The new owner\'s email must be different from the current one.');
        return;
      }
      state.toEmail = toEmail;
      const btn = e.target.closest('[data-tr-action]');
      btn.disabled = true;
      const r = run;
      try { await apiRequestTransfereeCode(toEmail); }
      catch (ex) { if (r !== run) return; btn.disabled = false; fail('#trSelectError', ex?.message || 'Could not send the code. Try again.'); return; }
      if (r !== run) return;
      state.step = 'transferee-code';
      render();
      startCooldown();
      return;
    }

    if (e.target.closest('#trToCodeGo')) {
      const code = normCode($host.querySelector('#trToCode')?.value);
      if (code.length < 6) { fail('#trToCodeError'); return; }
      const go = $host.querySelector('#trToCodeGo');
      go.disabled = true;
      const r = run;
      const items = [...state.selected].map(i => ({
        productId: state.products[i]?.productId,
        code: state.products[i]?.code
      }));
      let resp;
      try { resp = await apiCompleteTransfer({ fromEmail: state.email, toEmail: state.toEmail, code, items }); }
      catch (ex) { if (r !== run) return; go.disabled = false; fail('#trToCodeError', ex?.message); return; }
      if (r !== run) return;
      if (!resp?.ok) { go.disabled = false; fail('#trToCodeError'); return; }
      stopCooldown();
      state.transfereeHasAccount = resp.transfereeHasAccount === true;
      state.step = 'done';
      render();
      return;
    }

    if (act === 'get-started') {
      // Provisioning offer for the transferee: run the normal Get Started
      // (agreement → account creation) path on the landing.
      window.setAppMode?.('landing');
      setTimeout(() => { window.openAgreementModal?.(); }, 250);
      return;
    }

    if (act === 'back-home') {
      window.setAppMode?.('landing');
    }
  });
}

/** Mount the transfer flow into the given host element (the shared wr-body). */
export function renderTransfer(host) {
  $host = host;
  run++;
  state.step = 'lookup';
  state.products = [];
  state.selected = new Set();
  state.toEmail = '';            // never carry a previous transferee across runs
  state.transfereeHasAccount = null;
  stopCooldown();
  render();
  bindOnce();
}

/** Called when the page leaves transfer mode: kill the cooldown and invalidate
    any in-flight async continuations so they can't render over register mode. */
export function cancelTransfer() {
  run++;
  stopCooldown();
}
