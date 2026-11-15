// src/components/contactForm.js
//
// CONTACT, FOR ANYONE (2026-11-15). Four places on pragoptics.com reached support@ only through the visitor's own mail app
// (the footer's Support link, the order page's questions line, the lost-second-factor hint). A message from this form lands
// on the platform's Support desk beside the signed-in requests (POST v1/support/contact, functions/supportAnomaly.js, behind
// the platform's own captcha: api/intakeDoor.js), the operators are mailed with Reply answering the writer, and the writer
// gets a receipt with a CM- reference. Signed in or not. No account needed.
import { PRAG_API_BASE } from '../runtime/config.js';
import { postWithProof, warmProof } from '../api/intakeDoor.js';
import { openModal, busy } from '../account/cards.js';
import { esc as escapeHtml } from '../ui/words.js';

export const CONTACT = Object.freeze({ url: `${PRAG_API_BASE}/support/contact`, challenge: `${PRAG_API_BASE}/support/contact/challenge` });

/** Whether an address looks like an email, the loose check the forms share. */
export function looksLikeEmail(v) { return /^\S+@\S+\.\S+$/.test(String(v || '').trim()); }

/** The words of a refusal, the platform's own sentence first. */
export function failureWords(err) {
  if (err && err.platform && err.message) return String(err.message);
  return 'That did not go through. Check your connection and try again.';
}

/** The message fields, trimmed and capped; pure. */
export function contactFields({ name = '', email = '', message = '', page = '' } = {}) {
  const out = { email: String(email || '').trim().slice(0, 200), message: String(message || '').trim().slice(0, 4000) };
  const nm = String(name || '').trim().slice(0, 120); if (nm) out.name = nm;
  const pg = String(page || '').trim().slice(0, 200); if (pg) out.page = pg;
  return out;
}

function formHtml({ email, name, about }) {
  return `
    <div class="acct-modal acct-report" role="dialog" aria-modal="true" aria-label="Write to us">
      <header class="acct-modal-head"><h2 class="acct-modal-title">Write to us</h2><button class="acct-modal-x" type="button" data-cf-close aria-label="Close">×</button></header>
      <p class="acct-card-note">A person reads it and answers by email. ${about ? `About: <b>${escapeHtml(about)}</b>.` : 'No account needed.'}</p>
      <div class="acct-field"><label for="cfName">Name <span class="muted">(optional)</span></label><input class="acct-input" id="cfName" type="text" autocomplete="name" value="${escapeHtml(name || '')}" /></div>
      <div class="acct-field"><label for="cfEmail">Email</label><input class="acct-input" id="cfEmail" type="email" autocomplete="email" required value="${escapeHtml(email || '')}" placeholder="you@company.com" /></div>
      <div class="acct-field"><label for="cfMessage">Your message</label><textarea class="acct-input" id="cfMessage" rows="5" required>${about ? escapeHtml(about + ': ') : ''}</textarea></div>
      <div class="co-pot" aria-hidden="true"><label for="cfWebsite">Leave this field empty</label><input id="cfWebsite" type="text" tabindex="-1" autocomplete="off" /></div>
      <p class="acct-error" id="cfError" hidden></p>
      <div class="acct-actions-row"><button class="btn btn-primary" type="button" data-cf-send>Send</button><button class="btn" type="button" data-cf-close>Cancel</button></div>
    </div>`;
}
function doneHtml(ref, email) {
  return `
    <div class="acct-modal acct-report" role="dialog" aria-modal="true" aria-label="Sent">
      <header class="acct-modal-head"><h2 class="acct-modal-title">Sent</h2><button class="acct-modal-x" type="button" data-cf-close aria-label="Close">×</button></header>
      <p>Thanks. Your reference is <code>${escapeHtml(ref)}</code>. A person answers at <b>${escapeHtml(email)}</b>; a receipt is on its way there now.</p>
      <div class="acct-actions-row"><button class="btn btn-primary" type="button" data-cf-close>Done</button></div>
    </div>`;
}

function fallbackHtml(about) {
  const subject = encodeURIComponent(about ? `PragOptics: ${about}` : 'PragOptics');
  return `
    <div class="acct-modal acct-report" role="dialog" aria-modal="true" aria-label="Write to us">
      <header class="acct-modal-head"><h2 class="acct-modal-title">Write to us</h2><button class="acct-modal-x" type="button" data-cf-close aria-label="Close">×</button></header>
      <p>This form is not open yet. Email <a class="acct-inline-link" href="mailto:support@bridgesindust.com?subject=${subject}">support@bridgesindust.com</a> and a person answers.</p>
      <div class="acct-actions-row"><button class="btn" type="button" data-cf-close>Close</button></div>
    </div>`;
}

/**
 * The form in a modal. `about` prefixes the message (an order number, "lost second factor"); `email` and `name` prefill.
 * Resolves { ref } when sent, null when closed.
 */
export function openContact({ email = '', name = '', about = '' } = {}) {
  warmProof(CONTACT.challenge);
  return new Promise(resolve => {
    let sending = false, result = null;
    const m = openModal('contactForm', formHtml({ email, name, about }), { onClick, onKey, focus: email ? '#cfMessage' : '#cfEmail' });
    const say = (msg) => { const el = m.$('#cfError'); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; };
    async function send(btn) {
      if (sending) return;
      const fields = contactFields({ name: m.$('#cfName')?.value, email: m.$('#cfEmail')?.value, message: m.$('#cfMessage')?.value, page: location.hash || location.pathname });
      say('');
      if (!looksLikeEmail(fields.email)) { say('Enter a valid email so we can answer you.'); m.$('#cfEmail')?.focus(); return; }
      if (fields.message.length < 4) { say('Say what you need in a few words.'); m.$('#cfMessage')?.focus(); return; }
      sending = true;
      const done = busy(btn, 'Sending…', { hold: [...m.host.querySelectorAll('[data-cf-close]')], why: 'Wait: sending your message' });
      try {
        const d = await postWithProof(CONTACT.url, fields, { challengeUrl: CONTACT.challenge, hp: m.$('#cfWebsite')?.value || '' });
        result = { ref: d?.ref || '' }; sending = false; done();
        m.host.innerHTML = doneHtml(result.ref, fields.email);
      } catch (ex) {
        sending = false; done();
        // The door is not on this lane yet (a 404 from the challenge or the post): the plain way, never a dead end.
        if (ex && (ex.status === 404 || ex.status === 405)) { m.host.innerHTML = fallbackHtml(about); return; }
        say(failureWords(ex));
      }
    }
    function onClick(e) { if (e.target.closest('[data-cf-close]')) { if (!sending) close(); return; } const b = e.target.closest('[data-cf-send]'); if (b && !b.disabled) send(b); }
    function onKey(e) { if (e.key === 'Escape' && !sending) close(); }
    function close() { m.close(); resolve(result); }
  });
}
