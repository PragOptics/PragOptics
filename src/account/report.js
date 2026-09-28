// src/account/report.js
//
// Report Anomaly and Support: the signed-in customer's bug report and the
// signed-in customer's ask for help, one modal in two kinds, opened from the
// card above the sign-out divider in the account panel (Support since
// 2026-09-22: the same shape across the whole platform, every lane, mailing
// the operator through the platform notifications).
//
// An authenticated flow like every other account action: the bearer token
// rides in the header, the request runs under the DNA veil (fetchJsonWithDna), and
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
import { fetchJsonWithDna } from '../api/apiWithDna.js';
import { fetchJson, authHeaders } from '../api/client.js';
import { solveChallenge } from '../api/proofOfWork.js';
import { busy, openModal } from './cards.js';
import { categoryOptionsHtml } from './conductWords.js';

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

import { esc } from '../ui/words.js';   // the site's one HTML escape

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
    const diag = diagnostics();
    let sending = false;
    let result = null;
    const m = openModal('acctReport', formHtml(diag, K, kind), { onClick, onKey, focus: '#rpSummary' });
    const say = (msg) => { const el = m.$('#rpError'); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; };

    async function send(btn) {
      if (sending) return;
      const category = m.$('#rpCategory')?.value || 'other';
      const summary = (m.$('#rpSummary')?.value || '').trim();
      const details = (m.$('#rpDetails')?.value || '').trim();
      const includeDiag = m.$('#rpDiag')?.checked !== false;
      say('');
      if (summary.length < 4) { say(kind === 'support' ? 'Say what you need in a few words first.' : 'Say what happened in a few words first.'); m.$('#rpSummary')?.focus(); return; }
      sending = true;
      const done = busy(btn, K.sending, { hold: [...m.host.querySelectorAll('button[data-rp-close]')], why: `Wait: sending the ${K.word}` });
      try {
        const data = await fetchJsonWithDna(K.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({
            category, summary, details,
            page: diag.route,
            context: includeDiag ? diag : { route: diag.route, lane: diag.lane, at: diag.at, errors: [] }
          })
        });
        result = { ref: data?.ref || '' };
        sending = false; done();
        m.host.innerHTML = doneHtml({ ref: result.ref, email, K });
      } catch (ex) {
        sending = false; done();
        const fallback = `Could not send the ${K.word}. Try again.`;
        say(typeof friendlyError === 'function' ? friendlyError(ex, fallback) : (ex?.message || fallback));
      }
    }

    function onClick(e) {
      if (e.target.closest('[data-rp-close]')) { if (!sending) close(); return; }
      const sendBtn = e.target.closest('[data-rp-send]');
      if (sendBtn && !sendBtn.disabled) send(sendBtn);
    }
    function onKey(e) { if (e.key === 'Escape' && !sending) close(); }
    function close() { m.close(); resolve(result); }
  });
}

/** The bug report. */
export function openReportAnomaly(opts = {}) { return openReport({ ...opts, kind: 'anomaly' }); }
/** The ask for help (2026-09-22). */
export function openSupportRequest(opts = {}) { return openReport({ ...opts, kind: 'support' }); }

/* ---------------- report a site or an account (2026-09-24, decision 27) ----------------
 *
 * The third kind, and the only one that works signed out: anyone can report a published site or an account that
 * breaks the community standards, from the footer's "Report a site" or the address /#report. No bearer token is
 * needed (one is sent when the visitor is signed in, so the report records who sent it). The platform's own captcha
 * rides along: a hidden field a person never sees, and the challenge (GET v1/report/challenge) solved in the page
 * while the visitor types (src/api/proofOfWork.js). The server's own sentences are shown on a refusal; the reference
 * (CR-XXXXXX) on success. */

const CONDUCT_URL = `${PRAG_API_BASE}/report`;
const CHALLENGE_URL = `${PRAG_API_BASE}/report/challenge`;

function conductFormHtml() {
  return `
    <div class="acct-modal-mask" data-rp-close></div>
    <div class="acct-modal is-wide acct-report rp-conduct" role="dialog" aria-modal="true" aria-label="Report a site or an account">
      <h3 class="acct-modal-h">Report a site or an account</h3>
      <p class="acct-modal-note">Tell us about a published site or an account that breaks the community standards. PragOptics does not review sites before they are published. We read every report and act when a site or an account breaks the standards.</p>
      <fieldset class="rp-what">
        <legend class="acct-label">What are you reporting?</legend>
        <label class="um-check"><input type="radio" name="rpWhat" value="site" checked> A published site</label>
        <label class="um-check"><input type="radio" name="rpWhat" value="account"> An account</label>
      </fieldset>
      <div data-rp-site>
        <label class="acct-label" for="rpAddress">The site's address</label>
        <input class="acct-input" id="rpAddress" type="url" inputmode="url" maxlength="500" placeholder="https://" autocomplete="off" spellcheck="false" aria-describedby="rpAddressHint">
        <p class="acct-modal-note acct-modal-hint" id="rpAddressHint">Copy it from your browser's address bar.</p>
      </div>
      <div data-rp-account hidden>
        <label class="acct-label" for="rpAccount">The account's email address, or the business name</label>
        <input class="acct-input" id="rpAccount" type="text" maxlength="254" autocomplete="off" spellcheck="false">
      </div>
      <label class="acct-label" for="rpBreaks">What it breaks</label>
      <select class="acct-input acct-select" id="rpBreaks">${categoryOptionsHtml(esc, '', { placeholder: 'Choose one' })}</select>
      <label class="acct-label" for="rpSaw">What you saw</label>
      <textarea class="acct-input acct-textarea" id="rpSaw" rows="5" maxlength="4000" aria-describedby="rpSawHint"></textarea>
      <p class="acct-modal-note acct-modal-hint" id="rpSawHint">At least a sentence. Say where on the site it is.</p>
      <label class="acct-label" for="rpEmail">Your email <span class="muted">(optional)</span></label>
      <input class="acct-input" id="rpEmail" type="email" maxlength="254" autocomplete="email" aria-describedby="rpEmailHint">
      <p class="acct-modal-note acct-modal-hint" id="rpEmailHint">Only to send you a receipt, and to ask you about the report if we need to.</p>
      <div class="rp-hp" aria-hidden="true"><label>Leave this empty <input type="text" id="rpHp" tabindex="-1" autocomplete="off"></label></div>
      <p class="acct-error" id="rpError" role="alert" hidden></p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-rp-close>Cancel</button>
        <button class="btn btn-lead btn-primary" type="button" data-rp-send><span>Send report</span></button>
      </div>
    </div>`;
}
function conductDoneHtml(ref) {
  return `
    <div class="acct-modal-mask" data-rp-close></div>
    <div class="acct-modal acct-report" role="dialog" aria-modal="true" aria-label="Report sent">
      <h3 class="acct-modal-h">Thank you. We have your report.</h3>
      <p class="acct-modal-note">Your reference: <strong>${esc(ref)}</strong>.</p>
      <p class="acct-modal-note">We read every report and act when a site or an account breaks the standards.</p>
      <div class="acct-modal-actions">
        <button class="cta" type="button" data-rp-close>Done</button>
      </div>
    </div>`;
}

/** The challenge, fetched when the form opens and solved while the visitor types; a fresh one if it has gone stale. */
function makeProof() {
  let job = null;
  const start = () => {
    job = (async () => {
      const data = await fetchJson(CHALLENGE_URL);
      if (!data?.nonce) throw Object.assign(new Error('The challenge came back without its nonce.'), { data });
      const at = Date.now();
      const counter = await solveChallenge({ nonce: data.nonce, difficulty: data.difficulty });
      return { nonce: data.nonce, counter, at, minAgeMs: Number(data.minAgeMs) || 2000, expiresAt: Date.parse(data.expiresAt || '') || at + 15 * 60 * 1000 };
    })();
    job.catch(() => {});
    return job;
  };
  start();
  return {
    /** A solved, old-enough, unexpired challenge; each is used once. */
    async take() {
      let p = await (job || start()).catch(() => null);
      if (!p || !p.counter || Date.now() > p.expiresAt - 30000) p = await start();
      const wait = p.at + p.minAgeMs + 150 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      start();   // the next send gets its own
      return { nonce: p.nonce, counter: p.counter };
    }
  };
}

/**
 * Report a site or an account. Works signed out; `token` (optional) records the signed-in reporter. Resolves with
 * { ref } after a report was filed, or null when the visitor closed the form.
 */
export function openConductReport({ token = '' } = {}) {
  return new Promise((resolve) => {
    const m = openModal('acctReport', conductFormHtml(), { onClick, onChange, onKey, focus: '#rpAddress' });
    const $ = m.$;
    const proof = makeProof();
    let sending = false, result = null;
    const say = (msg) => { const el = $('#rpError'); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; };
    const what = () => m.host.querySelector('input[name="rpWhat"]:checked')?.value === 'account' ? 'account' : 'site';

    async function send(btn) {
      if (sending) return;
      say('');
      const w = what();
      const address = ($('#rpAddress')?.value || '').trim();
      const account = ($('#rpAccount')?.value || '').trim();
      const category = $('#rpBreaks')?.value || '';
      const details = ($('#rpSaw')?.value || '').trim();
      const email = ($('#rpEmail')?.value || '').trim();
      if (w === 'site' && !address) { say("Give the site's address."); $('#rpAddress')?.focus(); return; }
      if (w === 'account' && !account) { say("Give the account's email address, or the business name."); $('#rpAccount')?.focus(); return; }
      if (!category) { say('Choose what it breaks.'); $('#rpBreaks')?.focus(); return; }
      if (details.length < 10) { say('Say what you saw, in at least a sentence.'); $('#rpSaw')?.focus(); return; }
      sending = true;
      const fields = [...m.host.querySelectorAll('input, select, textarea, button[data-rp-close]')];
      const done = busy(btn, 'Sending…', { hold: fields, why: 'Wait: sending the report' });
      try {
        const pow = await proof.take();
        const data = await fetchJsonWithDna(CONDUCT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ what: w, ...(w === 'site' ? { address } : { account }), category, details, ...(email ? { email } : {}), pow, hp: $('#rpHp')?.value || '' })
        });
        result = { ref: String(data?.ref || '') };
        sending = false; done();
        m.host.innerHTML = conductDoneHtml(result.ref);
      } catch (ex) {
        sending = false; done();
        say(ex?.data?.error || (ex?.status === 404 ? 'Reports are not taken on this lane yet.' : 'Could not send the report. Check your connection and try again.'));
      }
    }
    function onClick(e) {
      if (e.target.closest('[data-rp-close]')) { if (!sending) close(); return; }
      const sendBtn = e.target.closest('[data-rp-send]');
      if (sendBtn && !sendBtn.disabled) send(sendBtn);
    }
    function onChange(e) {
      if (e.target?.name !== 'rpWhat') return;
      const acct = what() === 'account';
      const site = $('[data-rp-site]'), a = $('[data-rp-account]');
      if (site) site.hidden = acct;
      if (a) a.hidden = !acct;
      (acct ? $('#rpAccount') : $('#rpAddress'))?.focus();
    }
    function onKey(e) { if (e.key === 'Escape' && !sending) close(); }
    function close() { m.close(); resolve(result); }
  });
}
