// src/account/cards.js
//
// The account panel's card language (2026-09-17): a card is one line until
// opened (an icon, a title, a summary, a chevron), the explainer link sits on
// that line, and every action is an icon with a tooltip and a label for
// screen readers. Words stay only on a decision ("Remove for sure?"). Which
// cards a person left open is remembered for the tab (sessionStorage), so a
// re-render or a section switch does not fold what they were looking at.
//
// Used by environment.js, team.js and account.js; every section's cards look
// and behave the same.

const OPEN_KEY = 'pragoptics_acct_open';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'
};

export function ico(name, size = 16) {
  return `<svg class="ev-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

/** An icon-only action. `action` is the data-* attribute the section listens on: { env: 'download' } or { acct: 'add-alias' } or { team: 'remove' }. */
export function iconBtn(action, name, label, attrs = '', cls = '') {
  const [attr, value] = typeof action === 'string' ? ['data-env-action', action] : Object.entries(action).map(([k, v]) => [`data-${k}-action`, v])[0];
  return `<button class="btn btn-sm btn-ico ${cls}" type="button" ${attr}="${esc(value)}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${ico(name)}</button>`;
}

function state() { try { return JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}') || {}; } catch { return {}; } }
export function isOpen(key, fallback = false) { const s = state(); return key in s ? !!s[key] : !!fallback; }
export function setOpen(key, on) { const s = state(); s[key] = !!on; try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(s)); } catch { /* fine */ } }
function apply(sec, open) {
  sec.classList.toggle('is-open', open);
  const body = sec.querySelector(':scope > .ev-card-body'); if (body) body.hidden = !open;
  const t = sec.querySelector(':scope > .ev-card-head .ev-card-toggle'); if (t) t.setAttribute('aria-expanded', String(open));
}
export function toggleCard(key) {
  const sec = document.querySelector(`.ev-card[data-card="${CSS.escape(key)}"]`);
  const open = !isOpen(key, sec ? sec.dataset.open === '1' : false);
  setOpen(key, open);
  if (sec) apply(sec, open);
}
/** Open the card an element sits in (a link that lands on a row inside a folded card). */
export function openCardOf(el) {
  const sec = el?.closest?.('.ev-card');
  if (!sec || sec.classList.contains('is-open')) return;
  setOpen(sec.dataset.card, true);
  apply(sec, true);
}
/** The summary on a card's line, updated once the card's data has loaded. */
export function setCardSummary(key, html) {
  const el = document.querySelector(`.ev-card[data-card="${CSS.escape(key)}"] .ev-card-sum`);
  if (el) el.innerHTML = html;
}

/**
 * A card. `summary` is HTML (escape what needs escaping); `body` is HTML.
 * `open` is the default when the person has not chosen; `danger` colors the
 * frame; `explain` is the explainer link for the card's line.
 */
export function cardHtml({ key, icon, title, summary = '', explain = '', body = '', open = false, danger = false, cls = '' }) {
  const on = isOpen(key, open);
  return `
    <section class="acct-card ev-card ${on ? 'is-open' : ''} ${danger ? 'acct-card-danger' : ''} ${cls}" data-card="${esc(key)}" data-open="${open ? '1' : '0'}">
      <div class="ev-card-head">
        <button class="ev-card-toggle" type="button" data-card-toggle="${esc(key)}" aria-expanded="${on}" aria-controls="card-${esc(key).replace(/[^a-z0-9_-]/gi, '-')}">
          <span class="ev-card-ico ${danger ? 'is-danger' : ''}">${ico(icon)}</span>
          <span class="ev-card-title">${esc(title)}</span>
          <span class="ev-card-sum">${summary}</span>
          <span class="ev-card-chev">${ico('chevron')}</span>
        </button>
        ${explain ? `<span class="ev-card-explain">${explain}</span>` : ''}
      </div>
      <div class="ev-card-body" id="card-${esc(key).replace(/[^a-z0-9_-]/gi, '-')}" ${on ? '' : 'hidden'}>${body}</div>
    </section>`;
}

let bound = false;
/** One listener for every card's toggle, on the document, once. */
export function initCards() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-card-toggle]');
    if (!t) return;
    e.preventDefault();
    toggleCard(t.dataset.cardToggle || '');
  });
}
