// src/builds/builds.js
// The builds board — a marketplace surface of user-published builds: templates,
// plugins, automations, and tools that run with the PragOptics software or
// against a device API. Rows are downloadable files; builders keep the credit.
//
// Backend seam: BUILDS_API_LIVE gates the real feed + multipart upload. Until
// the endpoint is deployed, submissions queue their METADATA locally under
// pragoptics_builds_queue_v2 (files stay on the builder's machine; there is
// nowhere to put them yet) so the whole flow is testable today and flips live
// with one flag — same pattern as the warranty registration.

const BUILDS_API_LIVE = false; // ← flip when POST /builds (multipart) is deployed
import { PRAG_API_BASE } from '../runtime/config.js';
const BUILDS_UPLOAD_URL = `${PRAG_API_BASE}/builds`;

const INTENT_KEY = 'pragoptics_build_intent_v1'; // consumed by the account path
const QUEUE_KEY  = 'pragoptics_builds_queue_v2'; // local metadata queue until live
                                                 // (v2: board shape — v1 held the
                                                 //  old photo-wall entries)

const MAX_FILES = 4;
const MAX_MB_PER_FILE = 50;

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

const CHECK_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M9.5 13h5"/><path d="M9.5 16.5h5"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

let $body = null;
let $board = null;
let files = []; // [{ file }]

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

/* ---------- templates ---------- */

function formHtml() {
  const typeOpts = BUILD_TYPES.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}: ${escapeHtml(t.hint)}</option>`).join('');
  const targetOpts = BUILD_TARGETS.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`).join('');
  return `
    <div class="bd-form" data-bd-step="form">
      <div class="bd-fields">
        <div class="form-field">
          <label for="bdName">Build name</label>
          <input id="bdName" type="text" maxlength="60" placeholder="e.g. Storefront starter">
        </div>
        <div class="form-field">
          <label for="bdType">What kind of build is it?</label>
          <div class="wr-select-wrap">
            <select id="bdType" class="wr-select">
              <option value="" selected disabled>Select the type…</option>
              ${typeOpts}
            </select>
            <span class="wr-select-caret" aria-hidden="true">▾</span>
          </div>
        </div>
        <div class="form-field">
          <label for="bdTarget">Works with</label>
          <div class="wr-select-wrap">
            <select id="bdTarget" class="wr-select">
              ${targetOpts}
            </select>
            <span class="wr-select-caret" aria-hidden="true">▾</span>
          </div>
        </div>
        <div class="form-field">
          <label for="bdVersion">Version <span class="bd-optional">optional</span></label>
          <input id="bdVersion" type="text" maxlength="20" placeholder="0.1.0" autocomplete="off">
        </div>
      </div>

      <div class="form-field">
        <label for="bdDesc">What does it do?</label>
        <textarea id="bdDesc" rows="3" maxlength="500" placeholder="One or two sentences. This is the line people read on the board."></textarea>
      </div>

      <div class="form-field">
        <label for="bdHandle">Builder credit <span class="bd-optional">optional: blank posts as Anonymous</span></label>
        <input id="bdHandle" type="text" maxlength="40" autocomplete="nickname" placeholder="e.g. LoopTech_Hank">
      </div>

      <div class="bd-drop" id="bdDrop" role="button" tabindex="0" aria-label="Attach the build files">
        <span class="bd-drop-ico">${FILE_ICON}</span>
        <span class="bd-drop-t">Attach the build</span>
        <span class="bd-drop-s">The main file plus anything it needs. Up to ${MAX_FILES} files, ${MAX_MB_PER_FILE} MB each. Drag them here or click to browse.</span>
        <input id="bdFiles" type="file" multiple hidden>
      </div>
      <div class="bd-file-list" id="bdFileList" hidden></div>

      <p class="wr-error" id="bdError" hidden></p>

      <div class="bd-paths">
        <button class="btn bd-path" type="button" data-bd-action="share-anon">
          <span class="bd-path-t">Publish anonymously</span>
          <span class="bd-path-s">No account, no sign-in. Credit goes to your display name.</span>
        </button>
        <button class="cta bd-path" type="button" data-bd-action="share-account">
          <span class="bd-path-t">Publish with my account</span>
          <span class="bd-path-s">Your builds live on your profile, under your name.</span>
        </button>
      </div>
    </div>
  `;
}

function successHtml(withAccount, queuedLocally) {
  // Honest split: a local draft stores metadata only (the files stay on the
  // builder's machine), so it will need a fresh publish once uploads open.
  const sub = queuedLocally
    ? `Saved as a draft on this device. Marketplace uploads are still being built; publish it again when they open to put it on the live board.`
    : `Thanks for publishing. Builds like yours are what the platform is for.`;
  return `
    <div class="bd-done" data-bd-step="done">
      <span class="wr-done-badge">${CHECK_ICON}</span>
      <span class="wr-thanks-big">${queuedLocally ? `That's a solid build.` : `It's on the board.`}</span>
      <p class="wr-thanks-sub">${sub}</p>
      ${withAccount ? `<p class="wr-thanks-sub">Finishing up: we're taking you to sign-in so it posts under your account.</p>` : ''}
      <div class="wr-done-actions">
        <button class="btn" type="button" data-bd-action="share-another">Publish another</button>
        <button class="btn" type="button" data-bd-action="back-home">Back to PragOptics</button>
      </div>
    </div>
  `;
}

/* ---------- the board ---------- */

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q.filter(b => b && typeof b === 'object' && b.name) : [];
  } catch { return []; }
}

function rowHtml(b) {
  const t = typeOf(b.type);
  const target = targetOf(b.target);
  const who = b.handle || 'Anonymous';
  const when = b.submittedAt ? new Date(b.submittedAt).toLocaleDateString() : '';
  const mainFile = b.files?.[0] || null;
  const size = (b.files || []).reduce((n, f) => n + (Number(f.size) || 0), 0);
  const fileMeta = mainFile
    ? `${escapeHtml(mainFile.name)}${b.files.length > 1 ? ` +${b.files.length - 1}` : ''} · ${escapeHtml(fmtSize(size))}`
    : '';
  // A local draft has no hosted file — the button says so instead of lying.
  const get = b.queued
    ? `<button class="bd-dl" type="button" disabled title="A draft on this device only. Nothing is hosted yet; publish it again once marketplace uploads open.">${DL_ICON}</button>`
    : `<a class="bd-dl" href="${escapeHtml(b.downloadUrl || '#')}" download title="Download ${escapeHtml(b.name)}">${DL_ICON}</a>`;
  return `
    <article class="bd-row">
      <div class="bd-r-main">
        <span class="bd-r-name">${escapeHtml(b.name)}${b.version ? ` <span class="bd-r-ver">v${escapeHtml(b.version)}</span>` : ''}</span>
        ${b.description ? `<span class="bd-r-desc">${escapeHtml(b.description)}</span>` : ''}
        ${fileMeta ? `<span class="bd-r-file">${fileMeta}</span>` : ''}
      </div>
      <span class="bd-badge bd-badge--${escapeHtml(b.type || 'tool')}">${escapeHtml(t?.label || 'Build')}</span>
      <span class="bd-r-target">${escapeHtml(target?.label || '')}</span>
      <div class="bd-r-who">
        <span class="bd-r-handle">${escapeHtml(who)}</span>
        ${when ? `<span class="bd-r-when">${escapeHtml(when)}</span>` : ''}
        ${b.queued ? `<span class="bd-r-queued">Draft on this device</span>` : ''}
      </div>
      <div class="bd-r-get">${get}</div>
    </article>
  `;
}

function renderBoard() {
  if (!$board) return;
  // Seam: when BUILDS_API_LIVE flips, this reads the moderated live feed
  // (endpoint named with the backend) and local queued rows render after it.
  const builds = readQueue().slice().reverse().map(b => ({ ...b, queued: true }));
  if (!builds.length) {
    $board.innerHTML = `
      <div class="bd-empty">
        <span class="bd-empty-glyph" aria-hidden="true">${FILE_ICON}</span>
        <p class="bd-empty-t">Nothing on the board yet.</p>
        <p class="bd-empty-s muted">The first build published here starts it. Yours is welcome below.</p>
      </div>
    `;
    return;
  }
  $board.innerHTML = `
    <div class="bd-cols" aria-hidden="true">
      <span>Build</span><span>Type</span><span>Works with</span><span>Builder</span><span>Get</span>
    </div>
    ${builds.map(rowHtml).join('')}
  `;
}

/* ---------- files ---------- */

function renderFileList() {
  const host = $body.querySelector('#bdFileList');
  if (!host) return;
  host.hidden = files.length === 0;
  host.innerHTML = files.map((f, i) => `
    <div class="bd-file">
      <span class="bd-file-ico" aria-hidden="true">${FILE_ICON}</span>
      <span class="bd-file-name">${escapeHtml(f.file.name)}</span>
      <span class="bd-file-size">${escapeHtml(fmtSize(f.file.size))}</span>
      <button type="button" class="bd-file-x" data-bd-remove="${i}" aria-label="Remove ${escapeHtml(f.file.name)}">✕</button>
    </div>
  `).join('');
}

function addFiles(fileList) {
  const err = $body.querySelector('#bdError');
  if (err) err.hidden = true;
  let dropped = 0;
  for (const file of fileList) {
    if (files.length >= MAX_FILES) { dropped++; continue; }
    if (file.size > MAX_MB_PER_FILE * 1024 * 1024) {
      if (err) { err.textContent = `"${file.name}" is over ${MAX_MB_PER_FILE} MB. Trim it and try again.`; err.hidden = false; }
      continue;
    }
    files.push({ file });
  }
  if (dropped && err && err.hidden) {
    err.textContent = `A build takes up to ${MAX_FILES} files; ${dropped} ${dropped === 1 ? 'was' : 'were'} not attached.`;
    err.hidden = false;
  }
  renderFileList();
}

/* ---------- submission ---------- */

async function submitBuild({ anonymous }) {
  const meta = {
    name: ($body.querySelector('#bdName')?.value || '').trim(),
    type: $body.querySelector('#bdType')?.value || null,
    target: $body.querySelector('#bdTarget')?.value || null,
    version: ($body.querySelector('#bdVersion')?.value || '').trim() || null,
    description: ($body.querySelector('#bdDesc')?.value || '').trim(),
    handle: ($body.querySelector('#bdHandle')?.value || '').trim() || null,
    files: files.map(f => ({ name: f.file.name, size: f.file.size, type: f.file.type })),
    anonymous: !!anonymous,
    submittedAt: new Date().toISOString(),
    source: 'web-v2'
  };

  if (BUILDS_API_LIVE) {
    // Real call — multipart: the build files + a metadata part. The backend
    // stores the files and writes the build entity (moderated before listing).
    const fd = new FormData();
    files.forEach((f, i) => fd.append(`file${i}`, f.file, f.file.name));
    fd.append('meta', JSON.stringify(meta));
    const res = await fetch(BUILDS_UPLOAD_URL, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return res.json().catch(() => ({}));
  }

  // Metadata queue until the endpoint ships (files can't be persisted locally).
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push(meta);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* storage blocked — still complete locally */ }
  await new Promise(r => setTimeout(r, 600));
  return { queued: true };
}

/* ---------- wiring ---------- */

function validate() {
  const err = $body.querySelector('#bdError');
  const fail = (msg) => { if (err) { err.textContent = msg; err.hidden = false; } return false; };
  if (!($body.querySelector('#bdName')?.value || '').trim()) return fail('Give the build a name.');
  if (!$body.querySelector('#bdType')?.value) return fail('Pick what kind of build it is.');
  if (!($body.querySelector('#bdDesc')?.value || '').trim()) return fail('Say what it does. That line is the board listing.');
  if (files.length === 0) return fail('Attach the build file. The build is the point.');
  if (err) err.hidden = true;
  return true;
}

function bindOnce() {
  if (bindOnce._bound || !$body) return;
  bindOnce._bound = true;

  $body.addEventListener('click', async (e) => {
    const drop = e.target.closest('#bdDrop');
    if (drop) { $body.querySelector('#bdFiles')?.click(); return; }

    const rm = e.target.closest('[data-bd-remove]');
    if (rm) {
      files.splice(Number(rm.dataset.bdRemove), 1);
      renderFileList();
      return;
    }

    const path = e.target.closest('[data-bd-action="share-anon"], [data-bd-action="share-account"]');
    if (path) {
      if (!validate()) return;
      const withAccount = path.dataset.bdAction === 'share-account';
      path.disabled = true;
      let intent = null;
      if (withAccount) {
        intent = {
          name: ($body.querySelector('#bdName')?.value || '').trim(),
          type: $body.querySelector('#bdType')?.value || null,
          handle: ($body.querySelector('#bdHandle')?.value || '').trim() || null,
          fileCount: files.length
        };
      }
      let res = null;
      try {
        res = await submitBuild({ anonymous: !withAccount });
      } catch (ex) {
        path.disabled = false;
        const err = $body.querySelector('#bdError');
        if (err) { err.textContent = ex?.message || 'Upload failed. Please try again.'; err.hidden = false; }
        return;
      }
      files = [];
      renderBoard(); // the new draft appears on the board immediately
      $body.innerHTML = successHtml(withAccount, !!res?.queued);
      if (withAccount) {
        // Same handoff as warranty: stash the intent, run the normal sign-in /
        // account-creation flow; the backend ties the build to the account.
        try { localStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch {}
        setTimeout(() => {
          window.setAppMode?.('landing');
          setTimeout(() => { window.openAgreementModal?.(); }, 250);
        }, 1600);
      }
      return;
    }

    if (e.target.closest('[data-bd-action="share-another"]')) {
      $body.innerHTML = formHtml();
      renderFileList();
      return;
    }
    if (e.target.closest('[data-bd-action="back-home"]')) {
      window.setAppMode?.('landing');
    }
  });

  $body.addEventListener('change', (e) => {
    if (e.target.closest('#bdFiles')) {
      addFiles(e.target.files || []);
      e.target.value = ''; // allow re-picking the same file
    }
  });

  $body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('#bdDrop')) {
      e.preventDefault();
      $body.querySelector('#bdFiles')?.click();
    }
  });

  // drag & drop
  $body.addEventListener('dragover', (e) => {
    const drop = e.target.closest('#bdDrop');
    if (!drop) return;
    e.preventDefault();
    drop.classList.add('is-over');
  });
  $body.addEventListener('dragleave', (e) => {
    e.target.closest('#bdDrop')?.classList.remove('is-over');
  });
  $body.addEventListener('drop', (e) => {
    const drop = e.target.closest('#bdDrop');
    if (!drop) return;
    e.preventDefault();
    drop.classList.remove('is-over');
    addFiles(e.dataTransfer?.files || []);
  });
}

export function initBuildsView() {
  $body = document.getElementById('buildsBody');
  $board = document.getElementById('buildsBoard');
  if (!$body) return;
  $body.innerHTML = formHtml();
  renderBoard();
  bindOnce();
}
