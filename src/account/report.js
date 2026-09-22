// src/account/report.js
//
// Report Anomaly and Support: the signed-in customer's bug report and the
// signed-in customer's ask for help, one modal in two kinds, opened from the
// card above the sign-out divider in the account panel (Support since
// 2026-09-22: the same shape across the whole platform, every lane, mailing
// the operator through the platform notifications).
//
// An authenticated flow like every other account action: the bearer token
// rides in the header, the request runs under the DNA veil (fetchWithDna), and
// the modal wears the site's glass surface (.acct-modal). What makes a report
// useful to the person reading it is context the reporter would never think
// to type, so the page's own diagnostics ride along: route, theme, viewport,
// browser, lane, and the last few console errors this module has been
// collecting since the panel loaded. The reporter sees the list before sending
// and can leave it out.
//
// The server files the report first, notifies the routed team, and emails the
// reporter a reference (AR-XXXXXX). That reference is what the success view
// shows, so a follow-up email can quote it.

import { PRAG_API_BASE, LANE } from '../runtime/config.js';
import { fetchWithDna } from '../api/fetchWithDna.js';

/** The two kinds: where they post, what they say, what they ask. */
const KINDS = {
  anomaly: {
    url: `${PRAG_API_BASE}/support/anomaly`,
    aria: 'Report an anomaly', title: 'Report an anomaly',
    note: 'Something broke, looked wrong, or did not do what it said. Tell us what you saw. A person reads every report.',
    categories: [
      ['bug',      'Something broke'],
      ['data',     'Wrong information'],
      ['order',    'Order or payment'],
      ['warranty', 'Warranty'],
      ['signin',   'Sign-in or security'],
      ['display',  'Display or theme'],
      ['other',    'Other']
    ],
    summaryPlaceholder: 'The label button did nothing after I paid',
    detailsLabel: 'What happened, step by step',
    detailsPlaceholder: 'What you did, what you expected, what you got instead.',
    send: 'Send report', sending: 'Sending…', word: 'report',
    doneTitle: 'Thank you. We have it.', doneNote: 'We reply when there is something to tell you.'
  },
  support: {
    url: `${PRAG_API_BASE}/support/request`,
    aria: 'Ask for support', title: 'Ask for support',
    note: 'A question, or something you need done on your account, plan, licenses, domains or environment. A person reads every request and answers by email.',
    categories: [
      ['question',    'A question'],
      ['account',     'My account or team'],
      ['billing',     'Billing or my plan'],
      ['licensing',   'Licenses or mail'],
      ['domains',     'Domains or DNS'],
      ['environment', 'My environment or site'],
      ['other',       'Other']
    ],
    summaryPlaceholder: 'Move my mailbox onto my new domain',
    detailsLabel: 'Tell us more',
    detailsPlaceholder: 'What you need, and anything that helps us do it right the first time.',
    send: 'Send request', sending: 'Sending…', word: 'request',
    doneTitle: 'Thank you. We have your request.', doneNote: 'A member of the team has been notified and will be in touch after reviewing it.'
  }
};

/* ---------------- error capture ---------------- */

const MAX_ERRORS = 10;
const errors = [];
let installed = false;

function remember(kind, message) {
  const line = `${new Date().toISOString().slice(11, 19)} ${kind}: ${String(message || '').slice(0, 240)}`;
  errors.push(line);
  if (errors.length > MAX_ERRORS) errors.shift();
}

/** Start collecting uncaught errors and rejections. Idempotent. */
export function installErrorCapture() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    const src = e?.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno || 0})` : '';
    remember('error', (e?.message || 'Script error') + src);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    remember('rejection', r?.message || (typeof r === 'string' ? r : JSON.stringify(r)?.slice(0, 200)) || 'unhandled rejection');
  });
}

export function recentErrors() { return errors.slice(); }

/* ---------------- diagnostics ---------------- */

function diagnostics() {
  let theme = 'dark';
  try { theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; } catch { /* default */ }
  return {
    url: location.href,
    route: location.hash || '#',
    theme,
    viewport: `${window.innerWidth || document.documentElement.clientWidth}x${window.innerHeight || document.documentElement.clientHeight}@${Math.round((window.devicePixelRatio || 1) * 100) / 100}`,
    ua: navigator.userAgent,
    lane: LANE,
    lang: navigator.language || '',
    tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })(),
    at: new Date().toISOString(),
    errors: recentErrors()
  };
}

/* ---------------- the modal ---------------- */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formHtml(diag, K, kind) {
  const errCount = diag.errors.length;
  return `
    <div class="acct-modal-mask" data-rp-close></div>
    <div class="acct-modal is-wide acct-report ${kind === 'support' ? 'is-support' : ''}" role="dialog" aria-modal="true" aria-label="${esc(K.aria)}">
      <div class="acct-report-head">
        <span class="acct-report-img" aria-hidden="true"></span>
        <div>
          <h3 class="acct-modal-h">${esc(K.title)}</h3>
          <p class="acct-modal-note">${esc(K.note)}</p>
        </div>
      </div>
      <label class="acct-label" for="rpCategory">What it is about</label>
      <select class="acct-input acct-select" id="rpCategory">
        ${K.categories.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
      </select>
      <label class="acct-label" for="rpSummary">In a few words</label>
      <input class="acct-input" id="rpSummary" type="text" maxlength="140" placeholder="${esc(K.summaryPlaceholder)}" autocomplete="off">
      <label class="acct-label" for="rpDetails">${esc(K.detailsLabel)} <span class="muted">(optional)</span></label>
      <textarea class="acct-input acct-textarea" id="rpDetails" rows="5" maxlength="4000" placeholder="${esc(K.detailsPlaceholder)}"></textarea>
      <label class="um-check acct-report-diag" title="Route, theme, window size, browser, lane, and the last console errors on this page. No passwords, no card details, nothing typed into forms.">
        <input type="checkbox" id="rpDiag" checked> Include page details
        <span class="muted">(${esc(diag.route)}, ${esc(diag.theme)} theme, ${esc(diag.viewport)}, ${errCount ? `${errCount} recent error${errCount === 1 ? '' : 's'}` : 'no recent errors'})</span>
      </label>
      <p class="acct-error" id="rpError" hidden></p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-rp-close>Cancel</button>
        <button class="cta" type="button" data-rp-send>${esc(K.send)}</button>
      </div>
    </div>
  `;
}

function doneHtml({ ref, email, K }) {
  return `
    <div class="acct-modal-mask" data-rp-close></div>
    <div class="acct-modal acct-report" role="dialog" aria-modal="true" aria-label="${esc(K.word)} sent">
      <h3 class="acct-modal-h">${esc(K.doneTitle)}</h3>
      <p class="acct-modal-note">Your reference, for any follow-up${email ? `. A copy went to <strong>${esc(email)}</strong>` : ''}.</p>
      <div class="acct-report-ref"><code class="acct-product-code">${esc(ref)}</code></div>
      <p class="acct-modal-note">${esc(K.doneNote)} Need to add a detail? Email support@bridgesindust.com and quote the reference.</p>
      <div class="acct-modal-actions">
        <button class="cta" type="button" data-rp-close>Done</button>
      </div>
    </div>
  `;
}

/**
 * Open the modal in one of its kinds. Resolves with { ref } after a successful
 * send, or null if the reporter cancelled.
 * @param {{ kind?: 'anomaly'|'support', token: string, email?: string, friendlyError?: (ex: Error, fallback: string) => string }} opts
 */
export function openReport({ kind = 'anomaly', token, email = '', friendlyError } = {}) {
  const K = KINDS[kind] || KINDS.anomaly;
  return new Promise(resolve => {
    let host = document.getElementById('acctReport');
    if (!host) { host = document.createElement('div'); host.id = 'acctReport'; host.className = 'acct-modal-host'; document.body.appendChild(host); }
    const diag = diagnostics();
    host.innerHTML = formHtml(diag, K, kind);
    host.hidden = false;

    let busy = false;
    let result = null;
    const say = (msg) => { const el = host.querySelector('#rpError'); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; };

    async function send(btn) {
      if (busy) return;
      const category = host.querySelector('#rpCategory')?.value || 'other';
      const summary = (host.querySelector('#rpSummary')?.value || '').trim();
      const details = (host.querySelector('#rpDetails')?.value || '').trim();
      const includeDiag = host.querySelector('#rpDiag')?.checked !== false;
      say('');
      if (summary.length < 4) { say(kind === 'support' ? 'Say what you need in a few words first.' : 'Say what happened in a few words first.'); host.querySelector('#rpSummary')?.focus(); return; }
      busy = true;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = K.sending;
      try {
        const res = await fetchWithDna(K.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            category, summary, details,
            page: diag.route,
            context: includeDiag ? diag : { route: diag.route, lane: diag.lane, at: diag.at, errors: [] }
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(data?.error || `Request failed (${res.status})`);
          err.status = res.status; err.data = data;
          throw err;
        }
        result = { ref: data.ref || '' };
        host.innerHTML = doneHtml({ ref: result.ref, email, K });
      } catch (ex) {
        const fallback = `Could not send the ${K.word}. Try again.`;
        say(typeof friendlyError === 'function' ? friendlyError(ex, fallback) : (ex?.message || fallback));
        btn.disabled = false;
        btn.textContent = orig;
      } finally {
        busy = false;
      }
    }

    function onClick(e) {
      if (e.target.closest('[data-rp-close]')) { if (!busy) close(); return; }
      const sendBtn = e.target.closest('[data-rp-send]');
      if (sendBtn) return void send(sendBtn);
    }
    function onKey(e) {
      if (e.key === 'Escape' && !busy) close();
    }
    const close = () => {
      host.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      host.hidden = true; host.innerHTML = '';
      resolve(result);
    };
    host.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    host.querySelector('#rpSummary')?.focus();
  });
}

/** The bug report. */
export function openReportAnomaly(opts = {}) { return openReport({ ...opts, kind: 'anomaly' }); }
/** The ask for help (2026-09-22). */
export function openSupportRequest(opts = {}) { return openReport({ ...opts, kind: 'support' }); }
