// src/builds/builds.js
// The builds board: the moderated feed of builds published from the Studio
// (modules, templates, plugins, automations, tools), each with who published
// it. A MODULE is the kind a site installs: it goes into the person's own
// environment from the Studio, with its settings, and drops onto a page as an
// element. The rest download. Nothing on this page publishes, drafts, or
// uploads: publishing happens from the Studio (Export, Publish as a module).
//
// THE GATE (Cameron's decision 34, 2026-09-24): two separate calls.
//   GET v1/builds (public): what an operator approved, one build per module,
//   newest first, as catalog rows only (name, summary, kind, version, who
//   published it, when, installs, Assistant-ready). No code, no files, no
//   manifest. Anyone sees the rows; it is read without the session.
//   GET v1/builds/{id} (signed in): the build's detail, read when a signed-in
//   person clicks its row, and only then; its files' text through
//   v1/builds/{id}/raw with the session too.
// Signed out, a row is plain text: nothing on it opens or is clickable and
// nothing more is fetched; the board offers Sign in, and the sign-in comes
// back to the board.
//
// Signed in, a row opens the build's card: what it does, what it asks the
// installer, what it offers the assistant, its doors and files, who built it
// and when, and the one button that gets it: Open in the Studio for a module
// (through the handoff), Download for the rest.

import { PRAG_API_BASE } from '../runtime/config.js';
import { ico, busy, isBusy, copyButton } from '../account/cards.js';
import { accessToken } from '../runtime/session.js';
import { fetchJson, fetchText, authHeaders } from '../api/client.js';
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

/* The session: runtime/session.js accessToken(), read at every use and never kept, so a sign-out or a new sign-in is seen at once. */

/* A build id is what the platform mints: letters and digits. Nothing else reaches a URL.
   Assistant-ready: the list's own yes or no (a row carries no manifest, decision 34), or the detail's manifest on the card. */
function assistantReady(b) { return b?.assistantReady === true || !!(b?.manifest && Array.isArray(b.manifest.actions) && b.manifest.actions.length); }
function buildIdOf(b) { return /^[A-Za-z0-9]{6,40}$/.test(String(b?.buildId || '')) ? String(b.buildId) : ''; }
function filesOf(b) { return Array.isArray(b.files) ? b.files.filter(f => f && typeof f === 'object') : []; }
/** The text files of a build, the ones a person can read on the card, the element and its manifest first. */
const TEXT_FILE = /\.(?:js|mjs|css|json|html?|svg|md|txt)$/i;
const FILE_ORDER = ['element.js', 'manifest.json', 'element.css', 'project.json'];
function textFilesOf(b) {
  const names = filesOf(b).map(f => String(f.name || f.path || '')).filter(n => n && TEXT_FILE.test(n));
  return [...new Set(names)].sort((a, c) => { const ia = FILE_ORDER.indexOf(a), ic = FILE_ORDER.indexOf(c); return (ia < 0 ? 99 : ia) - (ic < 0 ? 99 : ic) || a.localeCompare(c); });
}
function sizeOf(b) { return filesOf(b).reduce((n, f) => n + (Number(f.size) || 0), 0) || Number(b.size) || 0; }

/** What the board shows: approved builds with a name and an id the detail can be read by. A draft or a pending build never lists here. */
function isListable(b) {
  return !!(b && typeof b === 'object'
    && String(b.status || 'published') === 'published'
    && typeof b.name === 'string' && b.name.trim()
    && buildIdOf(b));
}

/* ---------- badges: SVG in a ring, a column of them, each with its tooltip ---------- */

function badge(name, label, kind = '') {
  return `<span class="bd-badge${kind ? ` bd-badge--${kind}` : ''}" data-tip="${e(label)}" aria-label="${e(label)}" role="img">${ico(name, 15)}</span>`;
}
/** A row's marks: Verified, and Assistant-ready when the list says so. The settings it asks are on the card (the detail). */
function badgesOf(b) {
  const out = [badge('badge', 'Verified: reviewed and approved by PragOptics', 'ok')];
  if (assistantReady(b)) out.push(badge('sparkles', 'Assistant-ready: the assistant module can act through it', 'gold'));
  return out.join('');
}

/* ---------- the rows ---------- */

/**
 * One catalog row. Signed in (`open`), it is a button that opens the build's card, and a module carries Open in the
 * Studio. Signed out, it is plain text: no role, no focus stop, no action, nothing that opens (decision 34).
 */
function rowHtml(b, open) {
  const t = typeOf(b.type);
  const who = b.handle || 'Anonymous';
  const when = fmtDate(b.publishedAt);
  const id = buildIdOf(b);
  const meta = [who, when, b.installs ? `installed ${b.installs} time${b.installs === 1 ? '' : 's'}` : ''].filter(Boolean);
  const get = open && b.type === 'module' && id
    ? `<button type="button" class="btn btn-sm btn-ico" data-install="${e(id)}" data-tip="Open ${e(b.name)} in the Studio" aria-label="Open ${e(b.name)} in the Studio">${ico('external')}</button>`
    : '';
  const shell = open
    ? `<article class="bd-row" role="button" tabindex="0" data-open="${e(id)}" aria-label="${e(b.name)}: open the card">`
    : `<article class="bd-row is-locked" aria-label="${e(b.name)}">`;
  return `
    ${shell}
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
  // the platform's buttons (decision 40): the one primary action filled, an icon with its word, the one control height
  const get = b.type === 'module' && id
    ? `<button type="button" class="btn btn-sm btn-lead btn-primary" data-install="${e(id)}">${ico('external')}<span>Open in the Studio</span></button>`
    : href ? `<a class="btn btn-sm btn-lead btn-primary" href="${e(href)}" download>${ico('download')}<span>Download</span></a>` : '';
  return `
    <dialog class="bd-modal" aria-labelledby="bdCardTitle">
      <article class="bd-card">
        <button type="button" class="btn btn-sm btn-ico bd-close" data-close aria-label="Close" data-tip="Close">${ico('x')}</button>

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
            <div class="bd-tabs" role="tablist" aria-label="The files">${textFiles.map((f, i) => `<button type="button" class="btn btn-sm bd-tab${i === 0 ? ' is-on' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" data-file="${e(f)}">${e(f)}</button>`).join('')}</div>
            <div class="bd-code" data-code tabindex="0" role="region" aria-label="${e(textFiles[0])}"><p class="bd-code-note">Opening ${e(textFiles[0])}…</p></div>
            <div class="bd-code-foot"><span class="bd-code-meta" data-code-meta></span><span class="act-row"><button type="button" class="btn btn-sm" data-wrap aria-pressed="false" data-tip="Keep each line on one line and scroll sideways">No wrap</button><button type="button" class="btn btn-sm btn-lead" data-copy hidden>${ico('copy')}<span>Copy</span></button></span></div>
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
          <div class="bd-card-actions">${get}<button type="button" class="btn btn-sm" data-close>Close</button></div>
        </aside>
      </article>
    </dialog>`;
}

let $modal = null;
function closeCard() { if ($modal) { try { $modal.close(); } catch { /* already closed */ } $modal.remove(); $modal = null; } }

/**
 * A row's click, signed in: the detail is read now (GET v1/builds/{id} with the session), and the card opens on its
 * answer. While the read is out the row says Opening… and every row takes no click (cards.js busy, the others held and
 * saying why), so one read is out at a time and the card that opens is the one chosen. No session any more: the rows
 * lock again and nothing is read. The platform's refusal of the session locks them too, with Sign in.
 */
let opening = '';
async function openCard(id, row) {
  const token = accessToken();
  if (!canOpen()) { renderBoard(); return; }
  if (opening || !buildIdOf({ buildId: id }) || !builds.some(x => buildIdOf(x) === id) || (row && (isBusy(row) || row.dataset.held === '1'))) return;
  showBoardError('');
  opening = id;
  const others = row ? [...document.querySelectorAll('.bd-row[data-open]')].filter(r => r !== row) : [];
  const done = busy(row, 'Opening…', { hold: others, why: 'Wait: another build is opening' });
  let d = null;
  try {
    d = await fetchJson(`${BUILDS_URL}/${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  } catch (ex) {
    done(); opening = '';
    // the platform refused the session: the rows lock, with Sign in
    if (ex?.status === 401) { refusedToken = token; renderBoard(); return; }
    showBoardError(ex?.status ? (ex.data?.error || `That build could not be opened (the platform answered ${ex.status}).`) : 'The platform could not be reached. Try again in a moment.');
    return;
  }
  done(); opening = '';
  if (!d?.build) { showBoardError('That build could not be opened: the platform sent no build.'); return; }
  showCard(d.build);
}

/** The card over the page, drawn from the build's detail. */
function showCard(b) {
  closeCard();
  const host = document.createElement('div');
  host.innerHTML = cardHtml(b);
  $modal = host.firstElementChild;
  document.body.appendChild($modal);
  $modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeCard));
  $modal.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', () => openInStudio(btn.dataset.install, btn)));
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

/* ---------- the card's reads: the project's logic and the files' text, fetched from the platform's raw route with the session (signed in only, decision 34) ---------- */

async function rawText(id, path) {
  const token = accessToken();
  if (!token) throw new Error('Sign in to read the code.');
  try { return await fetchText(`${BUILDS_URL}/${encodeURIComponent(id)}/raw?path=${encodeURIComponent(path)}`, { headers: authHeaders(token) }); }
  catch (ex) { throw new Error(ex?.status ? (ex.data?.error || `the platform answered ${ex.status}.`) : 'the platform could not be reached. Try again in a moment.'); }
}
/** The card's reads and controls, each its own piece: the logic, the reading (wrap), the files' tabs, Copy. */
function hydrateCard(modal, b) {
  const id = buildIdOf(b);
  if (!id) return;
  const files = fileReader(id);
  bindLogic(modal, b, files);
  const box = modal.querySelector('[data-code]');
  if (!box) return;
  bindWrap(modal, box);
  const code = bindTabs(modal, box, files);
  bindCopy(modal, code.text);
  const first = textFilesOf(b)[0];
  if (first) code.show(first);
}
/** Each file read once through the raw route; a read that failed is forgotten, so a later click on its tab asks again (never on its own). */
function fileReader(id) {
  const cache = new Map(), settled = new Set();
  const get = (path) => {
    if (!cache.has(path)) cache.set(path, rawText(id, path).then(t => { settled.add(path); return t; }, err => { cache.delete(path); throw err; }));
    return cache.get(path);
  };
  return { get, has: (path) => settled.has(path) };
}
/** The logic: the project file, read into sentences; the manifest's read stays when the build carries none. */
function bindLogic(modal, b, files) {
  const logic = modal.querySelector('[data-logic]');
  if (!logic || !textFilesOf(b).includes('project.json')) return;
  files.get('project.json').then(text => { const read = readProject(JSON.parse(text)); if (modal.isConnected) logic.innerHTML = logicHtml(read, { manifest: b.manifest || {} }); }).catch(() => { /* the manifest's read stands */ });
}
/**
 * THE READING (decision 40): long lines wrap under their own number by default; No wrap keeps each line on one line, the
 * numbers pinned at the left and the box's own sideways scrollbar at its foot (builds.css). Switching keeps the line that
 * was at the top of the box at the top. The choice is kept in this browser; without storage, wrap stands.
 * The line keeps how far into it the reader was only while that still fits inside the line as it is drawn now: a line
 * that wrapped to many rows may have been read far down, and drawn on one row the same offset would land many lines
 * further on (or at the end of the file), so the line's own top goes to the top of the box instead.
 */
function bindWrap(modal, box) {
  const wrapBtn = modal.querySelector('[data-wrap]');
  const setNowrap = (on) => {
    const at = topLine(box);
    box.classList.toggle('is-nowrap', on);
    if (wrapBtn) { wrapBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); wrapBtn.setAttribute('data-tip', on ? 'Wrap long lines under their number again' : 'Keep each line on one line and scroll sideways'); }
    if (!on) box.scrollLeft = 0;
    if (at) { const off = -at.off < at.ln.offsetHeight ? at.off : 0; box.scrollTop = at.ln.offsetTop - off; }
  };
  setNowrap(nowrapKept());
  wrapBtn?.addEventListener('click', () => { const on = !box.classList.contains('is-nowrap'); setNowrap(on); keepNowrap(on); });
}
/**
 * The files: one at a time, colored and numbered. A file not read yet is a request: its tab says so and the other tabs
 * wait until the answer (cards.js busy). Answers { show(path), text() }, text() being the file on screen.
 */
function bindTabs(modal, box, files) {
  const meta = modal.querySelector('[data-code-meta]'), copy = modal.querySelector('[data-copy]');
  const tabs = [...modal.querySelectorAll('.bd-tab')];
  let current = '', currentText = '';
  const show = async (path) => {
    current = path;
    tabs.forEach(t => { const on = t.dataset.file === path; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    box.setAttribute('aria-label', path);
    box.innerHTML = `<p class="bd-code-note">Opening ${e(path)}…</p>`; if (meta) meta.textContent = ''; if (copy) copy.hidden = true;
    const tab = tabs.find(t => t.dataset.file === path);
    const done = files.has(path) ? () => {} : busy(tab, 'Opening…', { hold: tabs.filter(t => t !== tab), why: `Wait for ${path} to open` });
    try {
      const text = await files.get(path);
      done();
      if (current !== path || !modal.isConnected) return;
      currentText = text;
      box.innerHTML = codeHtml(text, langOf(path));
      box.scrollTop = 0; box.scrollLeft = 0;
      if (meta) meta.textContent = `${text.split('\n').length} lines · ${fmtSize(new Blob([text]).size)}`;
      if (copy) copy.hidden = false;
    } catch (err) {
      done();
      if (current !== path) return;
      box.innerHTML = `<p class="bd-code-note">Could not read ${e(path)}: ${e(err?.message || 'something went wrong')}</p>`;
    }
  };
  tabs.forEach(t => t.addEventListener('click', () => { if (!t.disabled) show(t.dataset.file); }));
  return { show, text: () => currentText };
}
/** Copy: the site's one copy button (cards.js copyButton), the file on screen to the clipboard from inside the card's dialog. */
function bindCopy(modal, text) {
  const copy = modal.querySelector('[data-copy]');
  copy?.addEventListener('click', () => { copyButton(copy, text()); });
}

/**
 * The first numbered line showing at the top of a code box, and how far below the box's top it sits (less than 0 when
 * part of it has scrolled past). Measured in layout offsets inside the box (builds.css makes the box the numbers'
 * offset parent), so the card's opening animation, a transform, cannot skew it. The rows run in order: found by halving.
 */
function topLine(box) {
  const lns = box.querySelectorAll('.bd-ln');
  if (!lns.length || lns[0].offsetParent !== box) return null;
  const top = box.scrollTop;
  let lo = 0, hi = lns.length - 1, hit = lns.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lns[mid].offsetTop + lns[mid].offsetHeight > top) { hit = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return { ln: lns[hit], off: lns[hit].offsetTop - top };
}
/* No wrap, kept for this browser only (a reading convenience, never a setting the platform keeps). */
const NOWRAP_KEY = 'pragoptics_code_nowrap';
function nowrapKept() { try { return localStorage.getItem(NOWRAP_KEY) === '1'; } catch { return false; } }
function keepNowrap(on) { try { if (on) localStorage.setItem(NOWRAP_KEY, '1'); else localStorage.removeItem(NOWRAP_KEY); } catch { /* no storage here: wrap stays the default */ } }

/**
 * Open in the Studio: the handoff is a request (bootstrap.js goToSoftware posts it, then the page leaves for the Studio),
 * so the button says so and takes no second press. The page normally leaves; if it has not after ten seconds, the
 * button comes back.
 */
function openInStudio(id, btn = null) {
  if (!/^[A-Za-z0-9]{6,40}$/.test(String(id || ''))) return;
  if (btn && (btn.disabled || isBusy(btn))) return;
  if (typeof window.pragOpenStudio !== 'function') return;
  const done = btn ? busy(btn, 'Opening the Studio…') : () => {};
  setTimeout(done, 10000);
  window.pragOpenStudio(`install=${id}`);
}

/* ---------- the board: who can open what (decision 34) ---------- */

let lastList = null;       // the list's last answer, so a change of session redraws without reading it again
let lastNote = 'Reading the board…';
let drawnOpen = null;      // whether the rows on screen open (signed in) or not
let refusedToken = '';     // a session the platform refused on a detail read: the rows lock until a new sign-in

/** The rows open only with a session the platform has not refused. */
function canOpen() { const t = accessToken(); return !!t && t !== refusedToken; }

function showBoardError(msg) {
  const el = $board?.querySelector('[data-board-error]');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
}

/** Sign in from the board: the sign-in comes back here (bootstrap.js applyPostLoginResolution, 'builds-board'). */
function signInToOpen() {
  try { sessionStorage.setItem('pragoptics_return_to', 'builds-board'); } catch { /* the sign-in lands where it always does */ }
  if (typeof window.openLoginModal === 'function') window.openLoginModal('login');
}

function renderBoard(list = lastList, note = lastNote) {
  if (!$board) return;
  lastList = Array.isArray(list) ? list : null; lastNote = note;
  builds = BUILDS_API_LIVE && Array.isArray(list) ? list.filter(isListable) : [];
  const open = canOpen();
  drawnOpen = open;
  if (!builds.length) { $board.innerHTML = emptyHtml(note); return; }
  const n = `${builds.length} build${builds.length === 1 ? '' : 's'} on the board.`;
  const head = open
    ? `<p class="bd-count muted">${n} Click one for its card.</p>`
    : `<div class="bd-gate">
        <p class="bd-count muted">${n} ${refusedToken ? 'Your session has ended. Sign in again to open a build and read its code.' : 'Sign in to open a build and read its code.'}</p>
        <button type="button" class="btn btn-sm btn-lead btn-primary" data-signin>${ico('user')}<span>Sign in</span></button>
      </div>`;
  $board.innerHTML = `${head}<p class="bd-error" data-board-error role="alert" hidden></p>${builds.map(b => rowHtml(b, open)).join('')}`;
  $board.querySelector('[data-signin]')?.addEventListener('click', signInToOpen);
  if (!open) return;   // signed out: nothing on a row answers a click, and nothing more is read
  $board.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openInStudio(btn.dataset.install, btn); }));
  $board.querySelectorAll('.bd-row[data-open]').forEach(row => {
    const go = () => openCard(row.dataset.open, row);
    row.addEventListener('click', go);
    row.addEventListener('keydown', (ev) => { if (ev.target === row && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); go(); } });
  });
}

/* The feed: the public list, read without the session (it is the same for everyone and carries only catalog rows). */
async function loadBoard() {
  if (!BUILDS_API_LIVE) { renderBoard([], ''); return; }
  try {
    const d = await fetchJson(`${BUILDS_URL}?type=module`);
    renderBoard(Array.isArray(d?.builds) ? d.builds : [], '');
  } catch (ex) {
    renderBoard([], ex?.status ? (ex.data?.error || `The board answered ${ex.status}.`) : 'The board could not be reached. Try again in a moment.');
  }
}

export function initBuildsView() {
  $board = document.getElementById('buildsBoard');
  // Earlier versions of this page queued publish drafts under this key. The
  // page no longer publishes, so clear it once; nothing reads it any more.
  try { localStorage.removeItem('pragoptics_builds_queue_v2'); } catch { /* storage blocked */ }
  renderBoard([], 'Reading the board…');
  loadBoard();
}

/**
 * The board shown again (bootstrap.js onEnterMode('builds'), the sign-in's return included): when the session changed
 * since the rows were drawn, they are drawn again from the list already read (locked, or opening), with no new read.
 * A session the platform refused stays locked until the sign-in brings a new one.
 */
export function onBuildsEnter() {
  if (!$board) return;
  if (refusedToken && accessToken() !== refusedToken) refusedToken = '';
  if (drawnOpen !== canOpen()) renderBoard();
}
