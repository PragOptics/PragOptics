// src/account/environment.js
//
// The Environment section of the account panel (round 3a-4): the team's
// storage, its files and its API keys. Three cards on one page, all drawn
// from the tenant spine and the environment routes:
//
//   GET  v1/tenant                     phase, name, limits, storage used
//   POST v1/environment/provision      the owner finishes a setup that stalled
//   GET  v1/environment/files          list; upload-url, commit, download-url, delete
//   GET  v1/environment/keys           list; POST makes one, POST keys/revoke
//
// The section follows the Team section's choice of team (the same
// sessionStorage key), so a person on two teams sees the environment of the
// team they are looking at. Tenant DATA never renders here: files are named
// and sized, keys are prefixed, values are never fetched.
//
// An upload goes straight from the browser to the tenant's private container
// through a ten-minute link the API mints; the API never sees the bytes. The
// storage account must carry a CORS rule for this origin and the page's
// Content Security Policy must list the blob host, or the PUT is refused
// before it leaves the browser (both found on dev, 2026-09-11).
//
// Shared helpers (the fetch that carries the session, escaping, the error
// wording, dates) arrive through `deps` from account.js.

import { PRAG_API_BASE } from '../runtime/config.js';
import { tierName } from '../components/tierCopy.js';
import { explainLink } from '../components/explainer.js';

const TENANT_URL = `${PRAG_API_BASE}/tenant`;
const ENV_URL = `${PRAG_API_BASE}/environment`;
const TEAM_KEY = 'pragoptics_team_id';   // written by team.js; read here so both sections mean the same team
const SEAT_ROLES = new Set(['owner', 'admin', 'developer', 'member']);

const ev = { teamId: '', view: null, files: null, filesTruncated: false, keys: null, madeKey: null, filesNote: '', uploading: false };
let D = null;

function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
function forgetTeam() { try { sessionStorage.removeItem(TEAM_KEY); } catch { /* fine */ } }
function url(path, extra = {}) {
  const u = new URL(path);
  if (ev.teamId) u.searchParams.set('tenant', ev.teamId);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
function body(obj) { return JSON.stringify(ev.teamId ? { tenant: ev.teamId, ...obj } : obj); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function gb(bytes) {
  const v = Number(bytes || 0) / (1024 ** 3);
  return v >= 100 ? `${Math.round(v)} GB` : `${v.toFixed(1)} GB`;
}
function bytesFmt(n) {
  const v = Number(n || 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}
function phaseOf(t) { return String(t?.phase || (t?.provisioned ? 'READY' : 'NONE')).toUpperCase(); }
function phaseTag(phase) {
  if (phase === 'READY') return '<span class="acct-tag is-verified">provisioned</span>';
  if (phase === 'PROVISIONING') return '<span class="acct-tag is-pending">provisioning</span>';
  if (phase === 'SUSPENDED') return '<span class="acct-tag is-bad">suspended</span>';
  return '<span class="acct-tag">no storage yet</span>';
}
function myRole() { return String(ev.view?.membership?.role || 'viewer').toLowerCase(); }
function canWrite() { return SEAT_ROLES.has(myRole()); }
function canManageKeys() { return myRole() === 'owner' || myRole() === 'admin'; }

/* ================================================================
   render
   ================================================================ */

export async function renderEnvironment(main, deps) {
  D = deps;
  ev.madeKey = null; ev.filesNote = ''; ev.files = null; ev.keys = null;
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Environment</h2>${explainLink('environment', 'How your environment works')}</header>
    <p class="acct-error" id="evError" hidden></p>
    <div id="evBody"><p class="acct-loading">Loading…</p></div>
  `;
  await load();
}

async function fetchView() {
  ev.teamId = teamId();
  try { return await D.apiFetch(url(TENANT_URL)); }
  catch (ex) {
    // A remembered team this account can no longer open: forget it, fall back.
    if (ev.teamId && (ex?.status === 403 || ex?.status === 404)) { ev.teamId = ''; forgetTeam(); return D.apiFetch(url(TENANT_URL)); }
    throw ex;
  }
}

async function load() {
  const host = document.getElementById('evBody');
  if (!host) return;
  D.showError('evError', '');
  try {
    ev.view = await fetchView();
    if (!ev.view.tenant) { host.innerHTML = emptyHtml(ev.view); return; }
    paint();
    if (phaseOf(ev.view.tenant) === 'READY') await Promise.all([loadFiles(), loadKeys()]);
  } catch (ex) {
    host.innerHTML = '';
    if (ex?.status === 404 && !ex?.data?.needsTenant) {
      host.innerHTML = `<p class="acct-empty">The environment routes are not on this lane yet. Deploy the backend that carries them, then reload.</p>`;
      return;
    }
    D.showError('evError', D.friendlyError(ex, 'Could not load your environment.'));
  }
}

async function loadFiles() {
  try {
    const d = await D.apiFetch(url(`${ENV_URL}/files`, { limit: 200 }));
    ev.files = d.items || [];
    ev.filesTruncated = !!d.truncated;
  } catch (ex) {
    ev.files = [];
    ev.filesNote = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Could not list the files.'));
  }
  paintFiles();
}

async function loadKeys() {
  if (!canWrite()) { ev.keys = []; paintKeys(); return; }
  try {
    const d = await D.apiFetch(url(`${ENV_URL}/keys`));
    ev.keys = d.keys || [];
  } catch (ex) {
    ev.keys = [];
    D.showError('evKeyError', ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Could not list the keys.')));
  }
  paintKeys();
}

function paint() {
  const host = document.getElementById('evBody');
  if (!host || !ev.view?.tenant) return;
  const ready = phaseOf(ev.view.tenant) === 'READY';
  host.innerHTML = `
    ${summaryHtml(ev.view)}
    ${ready ? `<div id="evFiles">${filesHtml()}</div><div id="evKeys">${keysHtml()}</div>` : ''}
  `;
}
function paintFiles() { const h = document.getElementById('evFiles'); if (h) h.innerHTML = filesHtml(); }
function paintKeys() { const h = document.getElementById('evKeys'); if (h) h.innerHTML = keysHtml(); }

function emptyHtml(view) {
  if (view.needsSubscription) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Storage comes with a plan.</h3>
        <p class="acct-card-note">Free has the console and the software. A paid plan sets up a private environment for your account the moment the first invoice settles: tables for your data, a container for your files, keys for your programs, and the allowance the plan carries.</p>
        <div class="acct-actions-row"><button class="btn" type="button" data-acct-action="subscribe">See plans</button></div>
      </section>`;
  }
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">No environment yet.</h3>
      <p class="acct-card-note">${(view.teams || []).length ? 'Pick a team on the Team section; its environment shows here.' : 'When a team owner invites you, their environment shows here. Your own comes with a plan.'}</p>
    </section>`;
}

/** Storage figures: the tenant view carries them; the ping is the fallback for your own environment. */
function storageOf(v) {
  const t = v.tenant || {};
  if (t.storage && Number(t.storage.limitBytes) > 0) return t.storage;
  const p = D.cachedPing?.();
  if (p?.environment?.storage && p.environment.id === t.environmentId) return p.environment.storage;
  const limit = Number(t.limits?.storageBytes || 0);
  return { usedBytes: 0, limitBytes: limit, graceBytes: Math.ceil(limit * 0.1), unknown: true };
}

function summaryHtml(v) {
  const e = D.escapeHtml;
  const t = v.tenant, me = v.membership || {};
  const phase = phaseOf(t);
  const s = storageOf(v);
  const used = Number(s.usedBytes || 0), limit = Number(s.limitBytes || 0);
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const cls = pct >= 95 ? 'is-hot' : pct >= 70 ? 'is-warn' : '';
  const isOwner = me.role === 'owner';
  const name = t.organizationName || '';
  const stalled = phase !== 'READY' && phase !== 'SUSPENDED';
  return `
    <section class="acct-card ev-summary">
      <div class="ev-head">
        <div class="ev-id">
          <div class="ev-tags"><span class="acct-tag is-primary">${e(tierName(t.tier))}</span>${phaseTag(phase)}<span class="acct-tag">${e(cap(me.role || 'viewer'))}</span></div>
          <h3 class="acct-card-h ev-name">${e(name || (isOwner ? 'Your environment' : 'Team environment'))}</h3>
          <p class="acct-card-note ev-owner">Owner ${e(t.ownerEmail || '')}. The private space where the software, your programs and your team keep data and files.</p>
        </div>
        <div class="ev-actions">
          <button class="btn btn-sm" type="button" data-env-action="refresh" title="Read the figures again">Refresh</button>
          ${isOwner ? `<button class="btn btn-sm" type="button" data-acct-section="subscription" title="Storage grows with the plan, and with the storage add-on on the User plan">More storage</button>` : ''}
        </div>
      </div>
      ${phase === 'READY' || phase === 'SUSPENDED' ? `
      <div class="use-row ev-meter">
        <div class="use-head">
          <span class="use-name">Storage</span>
          <span class="use-val">${e(used > 0 && used < 0.05 * 1024 ** 3 ? bytesFmt(used) : gb(used))} / ${e(gb(limit))}</span>
        </div>
        <div class="use-track"><div class="use-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <p class="acct-card-note ev-note">${s.unknown ? 'The bar reads what the plan carries; the figure refreshes with the next read.' : `Every value and every file counts. A write past the allowance plus ${e(gb(s.graceBytes || Math.ceil(limit * 0.1)))} of grace is refused, and nothing is ever deleted to make room.`}${phase === 'SUSPENDED' ? ' <span class="acct-tag is-bad">suspended</span> Reads and exports work; writes are refused until the subscription is active again.' : ''}</p>` : ''}
      ${stalled ? `
      <p class="acct-card-note ev-note">${phase === 'PROVISIONING'
        ? `Setup started and did not finish${t.provisionNote ? `: ${e(t.provisionNote)}` : ''}. It completes on its own within minutes; ${isOwner ? 'you can also finish it now.' : 'the owner can also finish it now.'}`
        : `No storage has been set up for this team yet. ${isOwner ? 'It happens on its own when a paid invoice settles; you can also start it now.' : 'The owner starts it, or it happens when their invoice settles.'}`}</p>
      ${isOwner ? `<div class="acct-actions-row"><button class="btn" type="button" data-env-action="provision">${phase === 'PROVISIONING' ? 'Finish setup' : 'Set up storage'}</button></div>` : ''}
      <p class="acct-error" id="evProvError" hidden></p>` : ''}
    </section>`;
}

/* ---------- files ---------- */

function filesHtml() {
  const e = D.escapeHtml;
  const write = canWrite();
  const rows = ev.files;
  const list = rows == null ? '<p class="acct-loading">Loading files…</p>'
    : !rows.length ? `<p class="acct-empty">No files yet. Builds, images and exports the software and your programs store land here, and anything you upload.</p>`
    : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Name</th><th class="adm-num">Size</th><th>Type</th><th>Modified</th><th></th></tr></thead>
          <tbody>
            ${rows.map(f => `
              <tr>
                <td class="cell-ellip ev-name-cell" title="${e(f.name)}">${e(f.name)}${f.committed ? '' : ' <span class="acct-tag is-pending" title="Uploaded but never confirmed. The nightly check settles it; uploading it again also does.">unconfirmed</span>'}</td>
                <td class="adm-num cell-tight">${e(bytesFmt(f.size))}</td>
                <td class="cell-tight adm-muted">${e(f.contentType || '')}</td>
                <td class="cell-tight adm-muted">${e(D.fmtDate(f.lastModified))}</td>
                <td class="cell-tight ev-actions-cell">
                  <button class="btn btn-sm" type="button" data-env-action="download" data-name="${e(f.name)}">Download</button>
                  ${write ? `<button class="btn btn-sm" type="button" data-env-action="delete" data-name="${e(f.name)}">Delete</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${ev.filesTruncated ? `<p class="acct-card-note">Showing the first ${rows.length}. The API lists the rest by prefix.</p>` : ''}`;
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Files</h3>
      <p class="acct-card-note">${write
        ? 'Uploads go straight from your browser to your container through a link that lives ten minutes; the platform never holds the bytes in between. One file at a time up to 5 GB.'
        : 'You are a viewer on this team: download what is here. Seat members upload and delete.'}</p>
      ${write ? `
      <div class="ev-upload-row">
        <input class="ev-file" type="file" id="evFile" multiple aria-label="Choose files to upload" />
        <button class="btn" type="button" data-env-action="upload" ${ev.uploading ? 'disabled' : ''}>${ev.uploading ? 'Uploading…' : 'Upload files'}</button>
        <span class="ev-status" id="evUpStatus" aria-live="polite">${e(ev.filesNote)}</span>
      </div>` : (ev.filesNote ? `<p class="acct-error">${e(ev.filesNote)}</p>` : '')}
      <p class="acct-error" id="evFileError" hidden></p>
      ${list}
    </section>`;
}

/* ---------- keys ---------- */

function keysHtml() {
  const e = D.escapeHtml;
  const me = ev.view?.membership || {};
  if (!canWrite()) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">API keys</h3>
        <p class="acct-card-note">Keys are made by seat members for the programs they run. As a viewer you use what the team publishes. ${explainLink('keys', 'How keys work')}</p>
      </section>`;
  }
  const rows = ev.keys;
  const active = (rows || []).filter(k => k.status === 'ACTIVE');
  const list = rows == null ? '<p class="acct-loading">Loading keys…</p>'
    : !rows.length ? `<p class="acct-empty">No keys yet.</p>`
    : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Label</th><th>Key</th><th>Scopes</th><th>Made by</th><th>Last used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${rows.map(k => {
              const mine = k.createdBy && k.createdBy === me.userId;
              const revocable = k.status === 'ACTIVE' && (mine || canManageKeys());
              return `
              <tr class="${k.status === 'ACTIVE' ? '' : 'ev-muted-row'}">
                <td class="cell-ellip" title="${e(k.label)}">${e(k.label || 'Unlabelled')}</td>
                <td class="cell-tight"><code class="ev-prefix">${e(k.prefix)}_…</code></td>
                <td class="cell-tight">${(k.scopes || []).map(s => `<span class="acct-tag">${e(s)}</span>`).join(' ')}</td>
                <td class="cell-ellip adm-cell-email" title="${e(k.createdByEmail)}">${e(k.createdByEmail || '')}${mine ? ' <span class="adm-muted">(you)</span>' : ''}</td>
                <td class="cell-tight adm-muted">${k.lastUsedAt ? e(D.fmtDate(k.lastUsedAt)) : 'never'}</td>
                <td class="cell-tight"><span class="acct-tag ${k.status === 'ACTIVE' ? 'is-verified' : ''}">${e(String(k.status).toLowerCase())}</span></td>
                <td class="cell-tight ev-actions-cell">${revocable ? `<button class="btn btn-sm" type="button" data-env-action="key-revoke" data-key="${e(k.keyId)}" data-label="${e(k.label || k.prefix)}">Revoke</button>` : ''}</td>
              </tr>`; }).join('')}
          </tbody>
        </table>
      </div>`;
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">API keys</h3>
      <p class="acct-card-note">A key lets a program use this environment as you, without a person signing in: your scripts, a build server, a device, your own site. It reads and writes data and files, nothing else, and it stops the moment you revoke it or leave the team. ${explainLink('keys', 'How keys work')}</p>
      <div class="ev-key-row">
        <input class="acct-input" type="text" id="evKeyLabel" maxlength="60" placeholder="What will hold it, e.g. build server" autocomplete="off" spellcheck="false" />
        <div class="ev-scopes" role="group" aria-label="What the key may do">
          <label><input type="checkbox" id="evScopeRead" checked /> read</label>
          <label><input type="checkbox" id="evScopeWrite" checked /> write</label>
        </div>
        <button class="btn" type="button" data-env-action="key-make">Make a key</button>
      </div>
      <p class="acct-error" id="evKeyError" hidden></p>
      ${ev.madeKey ? madeKeyHtml(ev.madeKey) : ''}
      <p class="acct-card-note ev-count">${active.length} active key${active.length === 1 ? '' : 's'}. Each member holds up to ten.</p>
      ${list}
    </section>`;
}

function madeKeyHtml(k) {
  const e = D.escapeHtml;
  return `
    <div class="ev-key-result">
      <p><b>Your new key${k.label ? ` for ${e(k.label)}` : ''}.</b> Copy it now: it is shown once and kept only as a fingerprint. Send it as the <code>x-api-key</code> header.</p>
      <div class="acct-add-row">
        <input class="acct-input ev-key" type="text" id="evMadeKey" readonly value="${e(k.key || '')}" aria-label="The new API key" />
        <button class="btn btn-sm" type="button" data-env-action="key-copy">Copy</button>
      </div>
    </div>`;
}

/* ================================================================
   actions
   ================================================================ */

async function post(path, payload) { return D.apiFetch(url(path), { method: 'POST', body: body(payload) }); }
function errText(ex, fallback) { return ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)); }

async function refreshAll() { await load(); }

async function provision() {
  D.showError('evProvError', '');
  const btn = document.querySelector('[data-env-action="provision"]');
  if (btn) btn.disabled = true;
  try {
    // The door provisions the caller's own environment; an operator's own
    // account must be named explicitly, which is what the membership id is.
    await D.apiFetch(`${ENV_URL}/provision`, { method: 'POST', body: JSON.stringify({ userId: ev.view?.membership?.userId || '' }) });
    await load();
  } catch (ex) {
    if (btn) btn.disabled = false;
    D.showError('evProvError', errText(ex, 'Setup did not finish. Try again in a minute.'));
  }
}

function setStatus(text) { const s = document.getElementById('evUpStatus'); if (s) s.textContent = text; }

async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  ev.uploading = true; ev.filesNote = '';
  D.showError('evFileError', '');
  paintFiles();
  let done = 0;
  try {
    for (const [i, f] of files.entries()) {
      setStatus(`Uploading ${i + 1} of ${files.length}: ${f.name}…`);
      const link = await post(`${ENV_URL}/files/upload-url`, { name: f.name, size: f.size, contentType: f.type || 'application/octet-stream' });
      const put = await fetch(link.url, { method: link.method || 'PUT', headers: link.headers || {}, body: f });
      if (!put.ok) throw Object.assign(new Error(`The storage service refused the upload (${put.status}).`), { status: put.status });
      await post(`${ENV_URL}/files/commit`, { name: link.name || f.name });
      done += 1;
    }
    ev.filesNote = done === 1 ? `Uploaded ${files[0].name} (${bytesFmt(files[0].size)}).` : `Uploaded ${done} files.`;
  } catch (ex) {
    const over = ex?.status === 402;
    ev.filesNote = done ? `Uploaded ${done} of ${files.length}.` : '';
    D.showError('evFileError', over
      ? `${ex?.data?.error || 'That upload does not fit the storage allowance.'} More storage is on the Billing section.`
      : (ex instanceof TypeError ? 'The browser could not reach the storage service. Check that you are online; if it persists, the storage account needs a CORS rule for this site.' : errText(ex, 'The upload did not finish.')));
  } finally {
    ev.uploading = false;
    const input = document.getElementById('evFile');
    if (input) input.value = '';
  }
  // The bar and the list both moved.
  try { ev.view = await fetchView(); } catch { /* keep the old figures */ }
  const summary = document.querySelector('.ev-summary');
  if (summary && ev.view?.tenant) summary.outerHTML = summaryHtml(ev.view);
  await loadFiles();
  if (ev.filesNote) setStatus(ev.filesNote);
}

async function download(name, btn) {
  D.showError('evFileError', '');
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Opening…';
  try {
    const d = await post(`${ENV_URL}/files/download-url`, { name });
    const w = window.open(d.url, '_blank', 'noopener');
    if (!w) {
      // A popup blocker: give the link itself, it lives ten minutes.
      const host = document.getElementById('evFileError');
      if (host) { host.innerHTML = `The browser blocked the new tab. <a class="acct-inline-link" href="${D.escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">Open ${D.escapeHtml(name)}</a> (the link lives ten minutes).`; host.hidden = false; }
    }
  } catch (ex) { D.showError('evFileError', errText(ex, 'Could not open that file.')); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function del(name) {
  if (!window.confirm(`Delete ${name}? Its bytes go back to your allowance. This cannot be undone.`)) return;
  D.showError('evFileError', '');
  try {
    const r = await post(`${ENV_URL}/files/delete`, { name });
    ev.filesNote = r.deleted ? `Deleted ${name}.` : `${name} was already gone.`;
    try { ev.view = await fetchView(); } catch { /* keep */ }
    const summary = document.querySelector('.ev-summary');
    if (summary && ev.view?.tenant) summary.outerHTML = summaryHtml(ev.view);
    await loadFiles();
  } catch (ex) { D.showError('evFileError', errText(ex, 'Could not delete that file.')); }
}

async function makeKey(btn) {
  D.showError('evKeyError', '');
  const label = (document.getElementById('evKeyLabel')?.value || '').trim();
  const scopes = [];
  if (document.getElementById('evScopeRead')?.checked) scopes.push('read');
  if (document.getElementById('evScopeWrite')?.checked) scopes.push('write');
  if (!scopes.length) { D.showError('evKeyError', 'Pick at least one scope.'); return; }
  btn.disabled = true;
  try {
    ev.madeKey = await post(`${ENV_URL}/keys`, { label, scopes });
    await loadKeys();
    const input = document.getElementById('evMadeKey');
    if (input) { input.focus(); input.select(); }
  } catch (ex) {
    btn.disabled = false;
    D.showError('evKeyError', errText(ex, 'The key could not be made.'));
  }
}

async function revokeKey(keyId, label) {
  if (!window.confirm(`Revoke ${label}? Every call with it stops on the next request.`)) return;
  D.showError('evKeyError', '');
  try {
    await post(`${ENV_URL}/keys/revoke`, { keyId });
    if (ev.madeKey?.keyId === keyId) ev.madeKey = null;
    await loadKeys();
  } catch (ex) { D.showError('evKeyError', errText(ex, 'Could not revoke that key.')); }
}

async function copyKey(btn) {
  const text = document.getElementById('evMadeKey')?.value || '';
  const orig = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch {
    const input = document.getElementById('evMadeKey');
    if (input) { input.focus(); input.select(); }
    btn.textContent = 'Select and copy';
  }
  setTimeout(() => { btn.textContent = orig; }, 1600);
}

export function bindEnvironmentActions(deps) {
  if (bindEnvironmentActions._bound) return;
  bindEnvironmentActions._bound = true;
  D = D || deps;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-env-action]');
    if (!btn) return;
    e.preventDefault();
    const a = btn.dataset.envAction;
    if (a === 'refresh') return void refreshAll();
    if (a === 'provision') return void provision();
    if (a === 'upload') { document.getElementById('evFile')?.click(); return; }
    if (a === 'download') return void download(btn.dataset.name || '', btn);
    if (a === 'delete') return void del(btn.dataset.name || '');
    if (a === 'key-make') return void makeKey(btn);
    if (a === 'key-copy') return void copyKey(btn);
    if (a === 'key-revoke') return void revokeKey(btn.dataset.key || '', btn.dataset.label || 'this key');
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'evFile') uploadFiles(e.target.files);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'evKeyLabel') { e.preventDefault(); document.querySelector('[data-env-action="key-make"]')?.click(); }
  });
}
