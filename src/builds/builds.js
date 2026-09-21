// src/builds/builds.js
// The builds board: the moderated feed of builds published from the Studio
// (modules, templates, plugins, automations, tools), each with who published
// it. A MODULE is the kind a site installs: it goes into the person's own
// environment from the Studio, with its settings, and drops onto a page as an
// element. The rest download. Nothing on this page publishes, drafts, or
// uploads: publishing happens from the Studio (Export, Publish as a module).
//
// The feed: GET v1/builds (public): what an operator approved, one build per
// module, newest first. A signed-in caller's own drafts ride in the same answer
// for My Builds; the board itself shows only what is on it (2026-09-21).
//
// A row is a summary; clicking it opens the build's card: what it does, what
// it asks the installer, what it offers the assistant, its doors and files,
// who built it and when, and the one button that gets it: Open in the Studio
// for a module (signed in, through the handoff; signed out, the Studio asks
// for the sign-in first), Download for the rest.

import { PRAG_API_BASE } from '../runtime/config.js';
import { ico } from '../account/cards.js';

const BUILDS_API_LIVE = true;   // the moderated feed is on the platform (2026-09-21)
const BUILDS_URL = `${PRAG_API_BASE}/builds`;

const BUILD_TYPES = [
  { id: 'module',     label: 'Module',     icon: 'puzzle',   hint: 'An element a site installs; it runs on the installer\'s environment' },
  { id: 'template',   label: 'Template',   icon: 'layers',   hint: 'A full site or app, ready to open in the Studio' },
  { id: 'plugin',     label: 'Plugin',     icon: 'plug',     hint: 'Front-end pieces that extend the Studio' },
  { id: 'automation', label: 'Automation', icon: 'activity', hint: 'A rule the Studio runs: when, if, do' },
  { id: 'tool',       label: 'Tool',       icon: 'code',     hint: 'Anything else useful, from scripts to fixtures' },
];
const BUILD_TARGETS = [
  { id: 'site',       label: 'A published site' },
  { id: 'studio',     label: 'PragOptics Studio' },
  { id: 'software',   label: 'PragOptics Studio' },
  { id: 'device-api', label: 'Device APIs' },
  { id: 'standalone', label: 'Standalone' },
];
const DOOR_WORDS = {
  submissions: 'writes messages into the installer\'s own submissions table, on the lane the page is published on, and mails the installer',
  assistant:   'answers visitors through the installer\'s AI, from the knowledge files in their environment, on their own allowance or their own connected model'
};
const SETTING_WORDS = { text: 'text', textarea: 'long text', number: 'a number', boolean: 'on or off', select: 'a choice', list: 'a list', email: 'an email address', url: 'a web address' };

let $board = null;
let builds = [];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const e = escapeHtml;

function typeOf(id) { return BUILD_TYPES.find(t => t.id === id) || BUILD_TYPES[4]; }
function targetOf(id) { return BUILD_TARGETS.find(t => t.id === id) || null; }

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
function fmtDate(iso) { try { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } }

/* A download link is only ever an absolute https URL. Anything else (http,
   javascript:, data:, a relative path, garbage) returns '' and no link renders. */
function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

/* A build id is what the platform mints: letters and digits. Nothing else reaches a URL. */
function assistantReady(b) { return !!(b?.manifest && Array.isArray(b.manifest.actions) && b.manifest.actions.length); }
function buildIdOf(b) { return /^[A-Za-z0-9]{6,40}$/.test(String(b?.buildId || '')) ? String(b.buildId) : ''; }
function filesOf(b) { return Array.isArray(b.files) ? b.files.filter(f => f && typeof f === 'object') : []; }
function sizeOf(b) { return filesOf(b).reduce((n, f) => n + (Number(f.size) || 0), 0) || Number(b.size) || 0; }

/** What the board shows: approved builds with a name and a way to get them. A draft or a pending build never lists here. */
function isListable(b) {
  return !!(b && typeof b === 'object'
    && String(b.status || 'published') === 'published'
    && typeof b.name === 'string' && b.name.trim()
    && (httpsUrl(b.downloadUrl) || (b.type === 'module' && buildIdOf(b))));
}

/* ---------- badges: SVG in a ring, a column of them, each with its tooltip ---------- */

function badge(name, label, kind = '') {
  return `<span class="bd-badge${kind ? ` bd-badge--${kind}` : ''}" data-tip="${e(label)}" aria-label="${e(label)}" role="img">${ico(name, 15)}</span>`;
}
function badgesOf(b) {
  const out = [badge('badge', 'Verified: reviewed and approved by PragOptics', 'ok')];
  if (assistantReady(b)) out.push(badge('sparkles', 'Assistant-ready: the assistant module can act through it', 'gold'));
  const settings = b.manifest && Array.isArray(b.manifest.settings) ? b.manifest.settings.length : 0;
  if (settings) out.push(badge('tag2', `${settings} setting${settings === 1 ? '' : 's'} the installer can change`));
  return out.join('');
}

/* ---------- the rows ---------- */

function rowHtml(b) {
  const t = typeOf(b.type);
  const who = b.handle || 'Anonymous';
  const when = fmtDate(b.publishedAt);
  const files = filesOf(b);
  const id = buildIdOf(b);
  const href = httpsUrl(b.downloadUrl);
  const meta = [who, when, b.installs ? `installed ${b.installs} time${b.installs === 1 ? '' : 's'}` : '', files.length ? `${files.length} file${files.length === 1 ? '' : 's'}, ${fmtSize(sizeOf(b))}` : ''].filter(Boolean);
  const get = (b.type === 'module' && id)
    ? `<button type="button" class="bd-act" data-install="${e(id)}" data-tip="Open ${e(b.name)} in the Studio" aria-label="Open ${e(b.name)} in the Studio">${ico('external', 17)}</button>`
    : href ? `<a class="bd-act" href="${e(href)}" download data-tip="Download ${e(b.name)}" aria-label="Download ${e(b.name)}">${ico('download', 17)}</a>` : '';
  return `
    <article class="bd-row" role="button" tabindex="0" data-open="${e(id || '')}" aria-label="${e(b.name)}: open the card">
      <span class="bd-r-glyph bd-r-glyph--${e(t.id)}" data-tip="${e(t.label)}: ${e(t.hint)}" aria-label="${e(t.label)}">${ico(t.icon, 20)}</span>
      <div class="bd-r-main">
        <span class="bd-r-name">${e(b.name)}${b.version ? ` <span class="bd-r-ver">v${e(b.version)}</span>` : ''}</span>
        ${b.summary || b.description ? `<span class="bd-r-desc">${e(b.summary || b.description)}</span>` : ''}
        <span class="bd-r-meta">${meta.map(m => `<span>${e(m)}</span>`).join('<span class="bd-dot" aria-hidden="true">·</span>')}</span>
      </div>
      <div class="bd-r-badges">${badgesOf(b)}</div>
      <div class="bd-r-get">${get}</div>
    </article>`;
}

function emptyHtml(note) {
  return `
    <div class="bd-empty">
      <span class="bd-empty-glyph" aria-hidden="true">${ico('file', 24)}</span>
      <p class="bd-empty-t">${e(note || 'Nothing on the board yet.')}</p>
      <p class="bd-empty-s muted">Builds published from the Studio appear here once an operator approves them.</p>
    </div>`;
}

/* ---------- the card: everything about one build ---------- */

function cardHtml(b) {
  const t = typeOf(b.type);
  const target = targetOf(b.target);
  const m = b.manifest || {};
  const id = buildIdOf(b);
  const href = httpsUrl(b.downloadUrl);
  const settings = Array.isArray(m.settings) ? m.settings : [];
  const actions = Array.isArray(m.actions) ? m.actions : [];
  const doors = Array.isArray(m.doors) ? m.doors : [];
  const files = filesOf(b);
  const dflt = (s) => s.default == null || s.default === '' ? '' : Array.isArray(s.default) ? s.default.join(', ') : typeof s.default === 'boolean' ? (s.default ? 'on' : 'off') : String(s.default);
  return `
    <div class="bd-modal" role="dialog" aria-modal="true" aria-labelledby="bdCardTitle">
      <div class="bd-scrim" data-close></div>
      <div class="bd-card">
        <header class="bd-card-head">
          <span class="bd-r-glyph bd-r-glyph--${e(t.id)} is-big" aria-hidden="true">${ico(t.icon, 24)}</span>
          <div class="bd-card-text">
            <span class="bd-kicker">${e(t.label)}${b.version ? ` · v${e(b.version)}` : ''}${b.revision > 1 ? ` · revision ${e(String(b.revision))}` : ''}${target ? ` · ${e(target.label)}` : ''}</span>
            <h2 class="bd-card-title" id="bdCardTitle">${e(b.name)}</h2>
            <span class="bd-card-by">by <b>${e(b.handle || 'Anonymous')}</b>${b.publishedAt ? `, on the board since ${e(fmtDate(b.publishedAt))}` : ''}${b.installs ? `, installed ${e(String(b.installs))} time${b.installs === 1 ? '' : 's'}` : ''}</span>
          </div>
          <div class="bd-r-badges is-row">${badgesOf(b)}</div>
          <button type="button" class="bd-close" data-close aria-label="Close" data-tip="Close">${ico('x', 18)}</button>
        </header>
        <div class="bd-card-body">
          ${b.summary || b.description ? `<p class="bd-card-sum">${e(b.summary || b.description)}</p>` : ''}
          <p class="bd-card-p muted">${e(t.hint)}. ${b.type === 'module' ? 'Installed from the Studio into your own environment, it runs against your storage and your settings, never the builder\'s; it takes your site\'s theme where the site was built in the Studio.' : ''}</p>
          ${settings.length ? `
          <h3 class="bd-h">What it asks the installer</h3>
          <ul class="bd-list">${settings.map(s => `<li><b>${e(s.label || s.key)}</b> <span class="muted">${e(SETTING_WORDS[s.type] || s.type || 'text')}${dflt(s) ? `, default "${e(dflt(s))}"` : ''}${s.required ? ', needed' : ''}</span>${s.help ? `<div class="muted bd-help">${e(s.help)}</div>` : ''}</li>`).join('')}</ul>` : ''}
          ${actions.length ? `
          <h3 class="bd-h">${ico('sparkles', 14)} What the assistant can do with it</h3>
          <ul class="bd-list">${actions.map(a => `<li><b>${e(a.label || a.name)}</b>${a.description ? ` <span class="muted">${e(a.description)}</span>` : ''}${Array.isArray(a.params) && a.params.length ? `<div class="muted bd-help">Fields: ${a.params.map(p => `${e(p.label || p.key)}${p.required ? '*' : ''}`).join(', ')}</div>` : ''}</li>`).join('')}</ul>` : ''}
          ${doors.length ? `
          <h3 class="bd-h">Where it reaches</h3>
          <ul class="bd-list">${doors.map(d => `<li><b>${e(d)}</b> <span class="muted">${e(DOOR_WORDS[d] || 'a door of the platform')}</span></li>`).join('')}</ul>` : ''}
          ${files.length ? `
          <h3 class="bd-h">Files</h3>
          <ul class="bd-list bd-files">${files.map(f => `<li><code>${e(f.name || f.path || '')}</code> <span class="muted">${e(fmtSize(f.size))}</span></li>`).join('')}</ul>` : ''}
        </div>
        <footer class="bd-card-foot">
          <button type="button" class="bd-btn is-ghost" data-close>Close</button>
          ${b.type === 'module' && id ? `<button type="button" class="bd-btn is-primary" data-install="${e(id)}">${ico('external', 16)} Open in the Studio</button>` : href ? `<a class="bd-btn is-primary" href="${e(href)}" download>${ico('download', 16)} Download</a>` : ''}
        </footer>
      </div>
    </div>`;
}

let $modal = null;
function closeCard() { if ($modal) { $modal.remove(); $modal = null; document.removeEventListener('keydown', onKey); } }
function onKey(ev) { if (ev.key === 'Escape') closeCard(); }
function openCard(id) {
  const b = builds.find(x => buildIdOf(x) === id);
  if (!b) return;
  closeCard();
  const host = document.createElement('div');
  host.innerHTML = cardHtml(b);
  $modal = host.firstElementChild;
  document.body.appendChild($modal);
  $modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeCard));
  $modal.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', () => openInStudio(btn.dataset.install)));
  document.addEventListener('keydown', onKey);
  $modal.querySelector('.bd-close')?.focus();
}

function openInStudio(id) {
  if (!/^[A-Za-z0-9]{6,40}$/.test(String(id || ''))) return;
  // signed in: the handoff carries the session and the build into the Studio; signed out: the Studio asks for the sign-in
  if (typeof window.pragOpenStudio === 'function') window.pragOpenStudio(`install=${id}`);
}

function renderBoard(list = [], note = '') {
  if (!$board) return;
  builds = BUILDS_API_LIVE && Array.isArray(list) ? list.filter(isListable) : [];
  if (!builds.length) { $board.innerHTML = emptyHtml(note); return; }
  $board.innerHTML = `<p class="bd-count muted">${builds.length} build${builds.length === 1 ? '' : 's'} on the board. Click one for its card.</p>${builds.map(rowHtml).join('')}`;
  $board.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openInStudio(btn.dataset.install); }));
  $board.querySelectorAll('.bd-act[download]').forEach(a => a.addEventListener('click', (ev) => ev.stopPropagation()));
  $board.querySelectorAll('.bd-row').forEach(row => {
    const open = () => openCard(row.dataset.open);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  });
}

/* The feed, as the platform lists it. A signed-in person's token rides along so the answer matches what My Builds reads; the board still shows only what is on it. */
async function loadBoard() {
  if (!BUILDS_API_LIVE) { renderBoard([]); return; }
  let token = '';
  try { token = JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || ''; } catch { token = ''; }
  try {
    const res = await fetch(`${BUILDS_URL}?type=module`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { renderBoard([], d.error || `The board answered ${res.status}.`); return; }
    renderBoard(Array.isArray(d.builds) ? d.builds : []);
  } catch {
    renderBoard([], 'The board could not be reached. Try again in a moment.');
  }
}

export function initBuildsView() {
  $board = document.getElementById('buildsBoard');
  // Earlier versions of this page queued publish drafts under this key. The
  // page no longer publishes, so clear it once; nothing reads it any more.
  try { localStorage.removeItem('pragoptics_builds_queue_v2'); } catch { /* storage blocked */ }
  renderBoard([], 'Reading the board…');
  loadBoard();
  window.addEventListener('pragoptics:session', () => loadBoard());
}
