// src/builds/builds.js
// The builds board: the moderated feed of builds published from the Studio
// (modules, templates, plugins, automations, tools), each with who published
// it. A MODULE is the kind a site installs: it goes into the person's own
// environment from the Studio, with its settings, and drops onto a page as an
// element. The rest download. Nothing on this page publishes, drafts, or
// uploads: publishing happens from the Studio (Export, Publish as a module).
//
// The feed: GET v1/builds (public; a signed-in caller also sees their own
// pending builds). Rows list only with a name; a download shows only with an
// https address; a module shows "Get it in the Studio", which opens the
// Studio on that build (signed in, through the handoff; signed out, the
// Studio asks for the sign-in first).

import { PRAG_API_BASE } from '../runtime/config.js';

const BUILDS_API_LIVE = true;   // the moderated feed is on the platform (2026-09-21)
const BUILDS_URL = `${PRAG_API_BASE}/builds`;

const BUILD_TYPES = [
  { id: 'module',     label: 'Module',     hint: 'An element a site installs; it runs on the installer\'s environment' },
  { id: 'template',   label: 'Template',   hint: 'A full site or app, ready to open in the Studio' },
  { id: 'plugin',     label: 'Plugin',     hint: 'Front-end pieces that extend the Studio' },
  { id: 'automation', label: 'Automation', hint: 'A rule the Studio runs: when, if, do' },
  { id: 'tool',       label: 'Tool',       hint: 'Anything else useful, from scripts to fixtures' },
];
const BUILD_TARGETS = [
  { id: 'site',       label: 'A published site' },
  { id: 'studio',     label: 'PragOptics Studio' },
  { id: 'software',   label: 'PragOptics Studio' },
  { id: 'device-api', label: 'Device APIs' },
  { id: 'standalone', label: 'Standalone' },
];

const FILE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>';

let $board = null;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function typeOf(id) { return BUILD_TYPES.find(t => t.id === id) || null; }
function targetOf(id) { return BUILD_TARGETS.find(t => t.id === id) || null; }

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/* A download link is only ever an absolute https URL. Anything else (http,
   javascript:, data:, a relative path, garbage) returns '' and no link renders. */
function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

/* A build id is what the platform mints: letters and digits. Nothing else reaches a URL. */
function buildIdOf(b) { return /^[A-Za-z0-9]{6,40}$/.test(String(b?.buildId || '')) ? String(b.buildId) : ''; }

function isListable(b) {
  return !!(b && typeof b === 'object'
    && typeof b.name === 'string' && b.name.trim()
    && (httpsUrl(b.downloadUrl) || (b.type === 'module' && buildIdOf(b))));
}

/* ---------- the board ---------- */

function rowHtml(b) {
  const t = typeOf(b.type);
  const target = targetOf(b.target);
  const who = b.handle || 'Anonymous';
  const when = b.publishedAt ? new Date(b.publishedAt).toLocaleDateString() : '';
  const fileList = Array.isArray(b.files) ? b.files.filter(f => f && typeof f === 'object') : [];
  const size = fileList.reduce((n, f) => n + (Number(f.size) || 0), 0) || Number(b.size) || 0;
  const fileMeta = fileList.length
    ? `${fileList.length} file${fileList.length === 1 ? '' : 's'} · ${escapeHtml(fmtSize(size))}${b.installs ? ` · installed ${b.installs} time${b.installs === 1 ? '' : 's'}` : ''}`
    : '';
  const href = httpsUrl(b.downloadUrl);
  const id = buildIdOf(b);
  const pending = b.status && b.status !== 'published' ? `<span class="bd-r-pending">${escapeHtml(b.status)}</span>` : '';
  const get = (b.type === 'module' && id)
    ? `<button type="button" class="bd-dl bd-get-studio" data-install="${escapeHtml(id)}" title="Get ${escapeHtml(b.name)} in the Studio">Studio</button>`
    : '';
  const dl = href ? `<a class="bd-dl" href="${escapeHtml(href)}" download title="Download ${escapeHtml(b.name)}">${DL_ICON}</a>` : '';
  return `
    <article class="bd-row">
      <div class="bd-r-main">
        <span class="bd-r-name">${escapeHtml(b.name)}${b.version ? ` <span class="bd-r-ver">v${escapeHtml(b.version)}</span>` : ''}${pending}</span>
        ${b.summary || b.description ? `<span class="bd-r-desc">${escapeHtml(b.summary || b.description)}</span>` : ''}
        ${fileMeta ? `<span class="bd-r-file">${fileMeta}</span>` : ''}
      </div>
      <span class="bd-badge bd-badge--${escapeHtml(t?.id || 'tool')}">${escapeHtml(t?.label || 'Build')}</span>
      <span class="bd-r-target">${escapeHtml(target?.label || '')}</span>
      <div class="bd-r-who">
        <span class="bd-r-handle">${escapeHtml(who)}</span>
        ${when ? `<span class="bd-r-when">${escapeHtml(when)}</span>` : ''}
      </div>
      <div class="bd-r-get">${get}${dl}</div>
    </article>
  `;
}

function emptyHtml(note) {
  return `
    <div class="bd-empty">
      <span class="bd-empty-glyph" aria-hidden="true">${FILE_ICON}</span>
      <p class="bd-empty-t">${escapeHtml(note || 'Nothing on the board yet.')}</p>
      <p class="bd-empty-s muted">Builds published from the Studio appear here once verified.</p>
    </div>
  `;
}

function renderBoard(builds = [], note = '') {
  if (!$board) return;
  const rows = BUILDS_API_LIVE && Array.isArray(builds) ? builds.filter(isListable) : [];
  if (!rows.length) { $board.innerHTML = emptyHtml(note); return; }
  $board.innerHTML = `
    <div class="bd-cols" aria-hidden="true">
      <span>Build</span><span>Type</span><span>Works with</span><span>Builder</span><span>Get</span>
    </div>
    ${rows.map(rowHtml).join('')}
  `;
  $board.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.install;
    if (!/^[A-Za-z0-9]{6,40}$/.test(id)) return;
    // signed in: the handoff carries the session and the build into the Studio; signed out: the Studio asks for the sign-in
    if (typeof window.pragOpenStudio === 'function') window.pragOpenStudio(`install=${id}`);
  }));
}

/* The feed, as the platform lists it. A signed-in person's token rides along so their own pending builds show. */
async function loadBoard() {
  if (!BUILDS_API_LIVE) { renderBoard([]); return; }
  let token = '';
  try { token = JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || ''; } catch { token = ''; }
  try {
    const res = await fetch(BUILDS_URL, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
  // a sign-in or sign-out changes what the person may see (their own pending builds)
  window.addEventListener('pragoptics:session', () => loadBoard());
}
