// src/builds/builds.js
// The builds board: a read-only list of verified builds (templates, plugins,
// automations, and tools) that run with the PragOptics software or against a
// device API. Rows are downloadable files; builders keep the credit.
//
// Nothing on this page publishes, drafts, or uploads. Publishing happens from
// the PragOptics software; verified builds land on the board through the
// backend's moderated feed.
//
// Backend seam: BUILDS_API_LIVE gates the live feed. The backend has no builds
// route yet, so the flag stays off and the board renders the empty state. When
// the feed ships, its loader is named against the deployed route and hands its
// rows to renderBoard(), which lists only entries with an https download URL.

const BUILDS_API_LIVE = false; // flip when the moderated builds feed is deployed

// Grounded in what the software actually distributes today: signed template
// files (.potemplate.json), project packages (.wbdraft.json / .zip), and the
// Automations rule JSON from its spec. Plugins are the surface being built.
const BUILD_TYPES = [
  { id: 'template',   label: 'Template',   hint: 'A full site or app, ready to open in the software' },
  { id: 'plugin',     label: 'Plugin',     hint: 'Front-end pieces that extend the software' },
  { id: 'automation', label: 'Automation', hint: 'A rule the software runs: when, if, do' },
  { id: 'tool',       label: 'Tool',       hint: 'Anything else useful, from scripts to fixtures' },
];
const BUILD_TARGETS = [
  { id: 'software',   label: 'PragOptics software' },
  { id: 'device-api', label: 'Device APIs' },
  { id: 'standalone', label: 'Standalone' },
];

const FILE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M9.5 13h5"/><path d="M9.5 16.5h5"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

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
   javascript:, data:, a relative path, garbage) returns '' and the row is
   dropped rather than rendered with a link that could not be trusted. */
function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function isListable(b) {
  return !!(b && typeof b === 'object'
    && typeof b.name === 'string' && b.name.trim()
    && httpsUrl(b.downloadUrl));
}

/* ---------- the board ---------- */

function rowHtml(b) {
  const t = typeOf(b.type);
  const target = targetOf(b.target);
  const who = b.handle || 'Anonymous';
  const when = b.publishedAt ? new Date(b.publishedAt).toLocaleDateString() : '';
  const fileList = Array.isArray(b.files) ? b.files.filter(f => f && typeof f === 'object') : [];
  const mainFile = fileList[0] || null;
  const size = fileList.reduce((n, f) => n + (Number(f.size) || 0), 0);
  const fileMeta = mainFile
    ? `${escapeHtml(mainFile.name)}${fileList.length > 1 ? ` +${fileList.length - 1}` : ''} · ${escapeHtml(fmtSize(size))}`
    : '';
  const href = httpsUrl(b.downloadUrl);
  return `
    <article class="bd-row">
      <div class="bd-r-main">
        <span class="bd-r-name">${escapeHtml(b.name)}${b.version ? ` <span class="bd-r-ver">v${escapeHtml(b.version)}</span>` : ''}</span>
        ${b.description ? `<span class="bd-r-desc">${escapeHtml(b.description)}</span>` : ''}
        ${fileMeta ? `<span class="bd-r-file">${fileMeta}</span>` : ''}
      </div>
      <span class="bd-badge bd-badge--${escapeHtml(t?.id || 'tool')}">${escapeHtml(t?.label || 'Build')}</span>
      <span class="bd-r-target">${escapeHtml(target?.label || '')}</span>
      <div class="bd-r-who">
        <span class="bd-r-handle">${escapeHtml(who)}</span>
        ${when ? `<span class="bd-r-when">${escapeHtml(when)}</span>` : ''}
      </div>
      <div class="bd-r-get">
        <a class="bd-dl" href="${escapeHtml(href)}" download title="Download ${escapeHtml(b.name)}">${DL_ICON}</a>
      </div>
    </article>
  `;
}

function renderBoard(builds = []) {
  if (!$board) return;
  // Seam: when BUILDS_API_LIVE flips, the moderated live feed's rows come in
  // here. Until then nothing lists, whatever is passed: the board is the empty
  // state and there is no other source of rows.
  const rows = BUILDS_API_LIVE && Array.isArray(builds) ? builds.filter(isListable) : [];
  if (!rows.length) {
    $board.innerHTML = `
      <div class="bd-empty">
        <span class="bd-empty-glyph" aria-hidden="true">${FILE_ICON}</span>
        <p class="bd-empty-t">Nothing on the board yet.</p>
        <p class="bd-empty-s muted">Verified builds published from the PragOptics software will appear here.</p>
      </div>
    `;
    return;
  }
  $board.innerHTML = `
    <div class="bd-cols" aria-hidden="true">
      <span>Build</span><span>Type</span><span>Works with</span><span>Builder</span><span>Get</span>
    </div>
    ${rows.map(rowHtml).join('')}
  `;
}

export function initBuildsView() {
  $board = document.getElementById('buildsBoard');
  // Earlier versions of this page queued publish drafts under this key. The
  // page no longer publishes, so clear it once; nothing reads it any more.
  try { localStorage.removeItem('pragoptics_builds_queue_v2'); } catch { /* storage blocked */ }
  renderBoard();
}
