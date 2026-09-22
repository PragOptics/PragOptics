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
import { codeHtml, langOf, readProject, logicHtml, manifestRead } from './code.js';

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
/** The text files of a build, the ones a person can read on the card, the element and its manifest first. */
const TEXT_FILE = /\.(?:js|mjs|css|json|html?|svg|md|txt)$/i;
const FILE_ORDER = ['element.js', 'manifest.json', 'element.css', 'project.json'];
function textFilesOf(b) {
  const names = filesOf(b).map(f => String(f.name || f.path || '')).filter(n => n && TEXT_FILE.test(n));
  return [...new Set(names)].sort((a, c) => { const ia = FILE_ORDER.indexOf(a), ic = FILE_ORDER.indexOf(c); return (ia < 0 ? 99 : ia) - (ic < 0 ? 99 : ic) || a.localeCompare(c); });
}
/** One line on a row about what the build is made of, from its manifest: the fields its form asks and whether it talks. */
function madeOf(b) {
  const m = b.manifest || {};
  const send = (Array.isArray(m.actions) ? m.actions : []).find(a => a && a.name === 'send_message');
  const n = send && Array.isArray(send.params) ? send.params.length : 0;
  const parts = [];
  if (n) parts.push(`a form with ${n} field${n === 1 ? '' : 's'}`);
  if (Array.isArray(m.doors) && m.doors.includes('assistant')) parts.push('an assistant');
  return parts.join(' and ');
}
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
  const meta = [who, when, madeOf(b), b.installs ? `installed ${b.installs} time${b.installs === 1 ? '' : 's'}` : '', files.length ? `${files.length} file${files.length === 1 ? '' : 's'}, ${fmtSize(sizeOf(b))}` : ''].filter(Boolean);
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
  const textFiles = id ? textFilesOf(b) : [];
  const dflt = (s) => s.default == null || s.default === '' ? '' : Array.isArray(s.default) ? s.default.join(', ') : typeof s.default === 'boolean' ? (s.default ? 'on' : 'off') : String(s.default);
  const fact = (k, v) => v ? `<div class="bd-fact"><dt>${e(k)}</dt><dd>${v}</dd></div>` : '';
  const get = b.type === 'module' && id
    ? `<button type="button" class="bd-btn is-primary is-wide" data-install="${e(id)}">${ico('external', 16)} Open in the Studio</button>`
    : href ? `<a class="bd-btn is-primary is-wide" href="${e(href)}" download>${ico('download', 16)} Download</a>` : '';
  return `
    <dialog class="bd-modal" aria-labelledby="bdCardTitle">
      <article class="bd-card">
        <button type="button" class="bd-close" data-close aria-label="Close" data-tip="Close">${ico('x', 18)}</button>

        <div class="bd-card-main">
          <span class="bd-kicker">${e(t.label)}${b.version ? ` · v${e(b.version)}` : ''}${b.revision > 1 ? ` · revision ${e(String(b.revision))}` : ''}</span>
          <h2 class="bd-card-title" id="bdCardTitle">${e(b.name)}</h2>
          <p class="bd-card-by">by <b>${e(b.handle || 'Anonymous')}</b>${b.publishedAt ? ` · on the board since ${e(fmtDate(b.publishedAt))}` : ''}</p>
          ${b.summary || b.description ? `<p class="bd-card-sum">${e(b.summary || b.description)}</p>` : ''}
          <p class="bd-card-p">${e(t.hint)}.${b.type === 'module' ? ' Installed from the Studio into your own environment, it runs against your storage and your settings, never the builder\u2019s, and takes your site\u2019s theme where the site was built in the Studio.' : ''}</p>

          ${settings.length ? `
          <section class="bd-sec">
            <h3 class="bd-h">What you set</h3>
            <dl class="bd-defs">${settings.map(s => `
              <div class="bd-def"><dt>${e(s.label || s.key)}${s.required ? '<span class="bd-req" title="Needed">*</span>' : ''}</dt><dd>${e(SETTING_WORDS[s.type] || s.type || 'text')}${dflt(s) ? `<span class="bd-dflt">default \u201c${e(dflt(s))}\u201d</span>` : ''}${s.help ? `<span class="bd-help">${e(s.help)}</span>` : ''}</dd></div>`).join('')}
            </dl>
          </section>` : ''}

          ${actions.length ? `
          <section class="bd-sec">
            <h3 class="bd-h">${ico('sparkles', 14)} What the assistant can do with it</h3>
            ${actions.map(a => `<p class="bd-act-p"><b>${e(a.label || a.name)}.</b> ${e(a.description || '')}${Array.isArray(a.params) && a.params.length ? ` <span class="bd-help">It fills ${a.params.map(p => `${e(p.label || p.key)}${p.required ? '*' : ''}`).join(', ')}.</span>` : ''}</p>`).join('')}
          </section>` : ''}

          ${doors.length ? `
          <section class="bd-sec">
            <h3 class="bd-h">Where it reaches</h3>
            ${doors.map(d => `<p class="bd-act-p"><b>${e(d.charAt(0).toUpperCase() + d.slice(1))}.</b> It ${e(DOOR_WORDS[d] || 'reaches a door of the platform')}.</p>`).join('')}
          </section>` : ''}

          <section class="bd-sec">
            <h3 class="bd-h">${ico('puzzle', 14)} What it is made of</h3>
            <div class="bd-logic" data-logic>${logicHtml(manifestRead(m), { manifest: m })}</div>
          </section>

          ${textFiles.length ? `
          <section class="bd-sec">
            <h3 class="bd-h">${ico('code', 14)} The code</h3>
            <p class="bd-help bd-code-lead">The files exactly as published, read from the platform. Nothing here runs on this page.</p>
            <div class="bd-tabs" role="tablist">${textFiles.map((f, i) => `<button type="button" class="bd-tab${i === 0 ? ' is-on' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" data-file="${e(f)}">${e(f)}</button>`).join('')}</div>
            <div class="bd-code" data-code tabindex="0"><p class="bd-code-note">Opening ${e(textFiles[0])}…</p></div>
            <div class="bd-code-foot"><span class="bd-code-meta" data-code-meta></span><button type="button" class="bd-btn is-ghost is-sm" data-copy hidden>${ico('copy', 14)} Copy</button></div>
          </section>` : ''}
        </div>

        <aside class="bd-card-aside">
          <div class="bd-kind">
            <span class="bd-r-glyph bd-r-glyph--${e(t.id)} is-big" aria-hidden="true">${ico(t.icon, 24)}</span>
            <div><span class="bd-kind-label">${e(t.label)}</span><span class="bd-kind-hint">${target ? e(target.label) : ''}</span></div>
          </div>
          <ul class="bd-marks">
            <li class="bd-mark"><span class="bd-badge bd-badge--ok">${ico('badge', 15)}</span><span>Verified<small>reviewed and approved by PragOptics</small></span></li>
            ${assistantReady(b) ? `<li class="bd-mark"><span class="bd-badge bd-badge--gold">${ico('sparkles', 15)}</span><span>Assistant-ready<small>the assistant module can act through it</small></span></li>` : ''}
            ${settings.length ? `<li class="bd-mark"><span class="bd-badge">${ico('tag2', 15)}</span><span>${settings.length} setting${settings.length === 1 ? '' : 's'}<small>yours to change when you install it</small></span></li>` : ''}
          </ul>
          <dl class="bd-facts">
            ${fact('Version', b.version ? `v${e(b.version)}` : '')}
            ${fact('Revision', b.revision ? e(String(b.revision)) : '')}
            ${fact('Installed', b.installs ? `${e(String(b.installs))} time${b.installs === 1 ? '' : 's'}` : '')}
            ${fact('Files', files.length ? `${files.length}, ${e(fmtSize(sizeOf(b)))}` : '')}
          </dl>
          ${files.length ? `<details class="bd-filelist"><summary>The files</summary><ul>${files.map(f => `<li><code>${e(f.name || f.path || '')}</code><span>${e(fmtSize(f.size))}</span></li>`).join('')}</ul></details>` : ''}
          <div class="bd-card-actions">${get}<button type="button" class="bd-btn is-ghost is-wide" data-close>Close</button></div>
        </aside>
      </article>
    </dialog>`;
}

let $modal = null;
function closeCard() { if ($modal) { try { $modal.close(); } catch { /* already closed */ } $modal.remove(); $modal = null; } }
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
  // Escape closes (the dialog's own cancel); a click on the backdrop, outside the card, closes too
  $modal.addEventListener('cancel', (ev) => { ev.preventDefault(); closeCard(); });
  $modal.addEventListener('click', (ev) => { if (ev.target === $modal) closeCard(); });
  try { $modal.showModal(); } catch { $modal.setAttribute('open', ''); }
  // Not in the top layer (an old browser, or showModal refused): the card is pinned over the page by hand, above every z-index the site uses.
  let modal = false; try { modal = $modal.matches(':modal'); } catch { modal = false; }
  if (!modal) { $modal.classList.add('is-fallback'); $modal.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:20px;background:rgba(4,6,12,.62)'; }
  $modal.querySelector('.bd-close')?.focus();
  hydrateCard($modal, b);
}

/* ---------- the card's reads: the project's logic and the files' text, fetched from the platform's public raw route ---------- */

async function rawText(id, path) {
  const res = await fetch(`${BUILDS_URL}/${encodeURIComponent(id)}/raw?path=${encodeURIComponent(path)}`);
  if (!res.ok) { let why = ''; try { why = (await res.json()).error || ''; } catch { why = ''; } throw new Error(why || `The platform answered ${res.status}.`); }
  return res.text();
}
function hydrateCard(modal, b) {
  const id = buildIdOf(b);
  if (!id) return;
  const textFiles = textFilesOf(b);
  const cache = new Map();
  const get = async (path) => { if (!cache.has(path)) cache.set(path, rawText(id, path)); return cache.get(path); };
  // the logic: the project file, read into sentences; the manifest's read stays when the build carries none
  const logic = modal.querySelector('[data-logic]');
  if (logic && textFiles.includes('project.json')) {
    get('project.json').then(text => { const read = readProject(JSON.parse(text)); if (modal.isConnected) logic.innerHTML = logicHtml(read, { manifest: b.manifest || {} }); }).catch(() => { /* the manifest's read stands */ });
  }
  // the code: one file at a time, colored, numbered, copyable
  const box = modal.querySelector('[data-code]'), meta = modal.querySelector('[data-code-meta]'), copy = modal.querySelector('[data-copy]');
  if (!box) return;
  let current = '', currentText = '';
  const show = async (path) => {
    current = path;
    modal.querySelectorAll('.bd-tab').forEach(t => { const on = t.dataset.file === path; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    box.innerHTML = `<p class="bd-code-note">Opening ${e(path)}…</p>`; if (meta) meta.textContent = ''; if (copy) copy.hidden = true;
    try {
      const text = await get(path);
      if (current !== path || !modal.isConnected) return;
      currentText = text;
      box.innerHTML = codeHtml(text, langOf(path));
      box.scrollTop = 0;
      if (meta) meta.textContent = `${text.split('\n').length} lines · ${fmtSize(new Blob([text]).size)}`;
      if (copy) copy.hidden = false;
    } catch (err) {
      if (current !== path) return;
      box.innerHTML = `<p class="bd-code-note">Could not read ${e(path)}: ${e(err?.message || 'something went wrong')}</p>`;
    }
  };
  modal.querySelectorAll('.bd-tab').forEach(t => t.addEventListener('click', () => show(t.dataset.file)));
  copy?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentText); copy.innerHTML = `${ico('check', 14)} Copied`; setTimeout(() => { if (modal.isConnected) copy.innerHTML = `${ico('copy', 14)} Copy`; }, 1400); }
    catch { copy.textContent = 'Select the text to copy it'; }
  });
  if (textFiles.length) show(textFiles[0]);
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
