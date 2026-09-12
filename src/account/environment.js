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
import { stripeAppearance } from '../api/stripeAppearance.js';
import { ensureStripeJs } from '../runtime/stripeLoader.js';

const TENANT_URL = `${PRAG_API_BASE}/tenant`;
const ENV_URL = `${PRAG_API_BASE}/environment`;
const ORDERS_CHECKOUT_URL = `${PRAG_API_BASE}/orders/checkout`;
const TEAM_KEY = 'pragoptics_team_id';   // written by team.js; read here so both sections mean the same team
const SEAT_ROLES = new Set(['owner', 'admin', 'developer', 'member']);
const DOMAIN_ROLES = new Set(['owner', 'admin', 'developer']);   // who connects, verifies and removes a domain

const ev = { teamId: '', view: null, files: null, filesTruncated: false, keys: null, madeKey: null, filesNote: '', uploading: false, domains: null, domainLimit: 0, cnameTarget: null, serving: null, binding: '', domainNote: '', checking: '', registrations: [], reg: null };
let D = null;

// The registration flow's own state (round 3b-2): a quote, the registrant
// contact, an order with its payment element, then the wait for the registry.
function freshReg() { return { host: '', quote: null, step: 'idle', error: '', busy: false, contact: {}, order: null, stripe: null, elements: null, polls: 0 }; }
ev.reg = freshReg();

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
function paused() { return phaseOf(ev.view?.tenant) === 'SUSPENDED'; }
function canWrite() { return SEAT_ROLES.has(myRole()) && !paused(); }
function canManageKeys() { return myRole() === 'owner' || myRole() === 'admin'; }
function canManageDomains() { return DOMAIN_ROLES.has(myRole()) && !paused(); }

/* ================================================================
   render
   ================================================================ */

export async function renderEnvironment(main, deps) {
  D = deps;
  ev.madeKey = null; ev.filesNote = ''; ev.files = null; ev.keys = null; ev.domains = null; ev.domainNote = ''; ev.checking = ''; ev.registrations = []; ev.reg = freshReg();
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
    if (['READY', 'SUSPENDED'].includes(phaseOf(ev.view.tenant))) await Promise.all([loadFiles(), loadDomains(), loadKeys()]);
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

async function loadDomains() {
  try {
    const d = await D.apiFetch(url(`${ENV_URL}/domains`));
    ev.domains = d.domains || [];
    ev.domainLimit = Number(d.limit || 0);
    ev.cnameTarget = d.cnameTarget || null;
    ev.serving = d.serving || null;
    ev.registrations = d.registrations || [];
  } catch (ex) {
    ev.domains = [];
    if (ex?.status === 404) ev.domainNote = 'The domain routes are not on this lane yet.';
    else ev.domainNote = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Could not list the domains.'));
  }
  paintDomains();
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
  const phase = phaseOf(ev.view.tenant);
  const ready = phase === 'READY' || phase === 'SUSPENDED';   // paused: the cards show, reads work, writes are refused by the routes
  host.innerHTML = `
    ${summaryHtml(ev.view)}
    ${ready ? `<div id="evFiles">${filesHtml()}</div><div id="evDomains">${domainsHtml()}</div><div id="evKeys">${keysHtml()}</div>` : ''}
  `;
}
function paintFiles() { const h = document.getElementById('evFiles'); if (h) h.innerHTML = filesHtml(); }
function paintDomains() { const h = document.getElementById('evDomains'); if (h) h.innerHTML = domainsHtml(); }
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
          ${phase === 'READY' && t.software?.url ? `<a class="btn btn-sm" href="${e(t.software.url)}" target="_blank" rel="noopener" title="The software, in a new tab, signed in with this account">Open the software</a>` : ''}
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
      <p class="acct-card-note ev-note">${s.unknown ? 'The bar reads what the plan carries; the figure refreshes with the next read.' : `Every value and every file counts. A write past the allowance plus ${e(gb(s.graceBytes || Math.ceil(limit * 0.1)))} of grace is refused, and nothing is ever deleted to make room.`}</p>
      ${phase === 'SUSPENDED' ? `<p class="acct-error ev-note">This environment is paused${t.suspendReason === 'closed' ? ' because the account was closed' : ' because the subscription ended'}. Everything in it can still be read and downloaded, nothing new can be written.${t.keepUntil ? ` It is kept until ${e(D.fmtDate(t.keepUntil))}, then removed.` : ''}${t.suspendReason === 'closed' ? '' : ' Restore a paid plan on Billing and it resumes exactly as it was.'}</p>` : ''}
      ${(me.role === 'owner' || me.role === 'admin') ? `<div class="acct-actions-row ev-export-row"><button class="btn btn-sm" type="button" data-env-action="export" title="Everything in this environment as one file: data, file links, domains, keys, members">Download everything</button><span class="ev-status" id="evExportStatus" aria-live="polite"></span></div><p class="acct-error" id="evExportError" hidden></p>` : ''}` : ''}
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

/* ---------- domains ---------- */

function domainTag(d) {
  const status = typeof d === 'string' ? d : d.status;
  const bs = typeof d === 'string' ? '' : (d.binding?.status || '');
  if (status === 'VERIFIED' && bs === 'BOUND') return '<span class="acct-tag is-verified">serving</span>';
  if (status === 'VERIFIED' && bs === 'BINDING') return '<span class="acct-tag is-verified">verified</span><span class="acct-tag is-pending">certificate pending</span>';
  if (status === 'VERIFIED' && bs === 'BIND_FAILED') return '<span class="acct-tag is-verified">verified</span><span class="acct-tag is-bad">not serving</span>';
  if (status === 'VERIFIED') return '<span class="acct-tag is-verified">verified</span>';
  if (status === 'FAILED') return '<span class="acct-tag is-bad">record missing</span>';
  return '<span class="acct-tag is-pending">waiting for the record</span>';
}

function recordHtml(label, rec) {
  const e = D.escapeHtml;
  return `
    <dl class="ev-record" aria-label="${e(label)}">
      <dt>Type</dt><dd><code>${e(rec.type)}</code></dd><dd></dd>
      <dt>Name</dt><dd><code>${e(rec.name)}</code></dd><dd><button class="btn btn-sm" type="button" data-env-action="domain-copy" data-text="${e(rec.name)}">Copy</button></dd>
      <dt>${rec.type === 'CNAME' ? 'Target' : 'Value'}</dt><dd><code>${e(rec.value || rec.target || '')}</code></dd><dd><button class="btn btn-sm" type="button" data-env-action="domain-copy" data-text="${e(rec.value || rec.target || '')}">Copy</button></dd>
    </dl>`;
}

function domainHtml(d) {
  const e = D.escapeHtml;
  const manage = canManageDomains();
  const verified = d.status === 'VERIFIED';
  const checking = ev.checking === d.host;
  const hosted = !!ev.serving?.hosted;
  const b = d.binding || {};
  const bs = b.status || 'UNBOUND';
  const busy = ev.binding === d.host;
  let body = '';
  if (!verified) {
    body = `
      <p class="acct-card-note ev-dom-note">Add this record where you manage the domain's DNS, then press Verify.${d.status === 'FAILED' ? ' The record was found before and is missing now; put it back to keep the domain.' : ''}</p>
      ${recordHtml('The verification record', d.verifyRecord)}
      ${d.lastCheckedAt ? `<p class="acct-card-note ev-dom-note"><span class="adm-muted">Last checked ${e(D.fmtDate(d.lastCheckedAt))}.</span> ${e(d.lastCheckError || '')}</p>` : ''}`;
  } else if (hosted) {
    const recs = (d.records || []).map(r => recordHtml(r.purpose === 'ownership' ? 'The ownership record for the software' : 'The serving record', r)).join('');
    if (bs === 'BOUND') {
      body = `<p class="acct-card-note ev-dom-note">Serving at <a href="${e(b.url || `https://${d.host}`)}" target="_blank" rel="noopener">${e(b.url || `https://${d.host}`)}</a> since ${e(D.fmtDate(b.boundAt))}, with a certificate Azure issues and renews. Keep the two records in place.</p>`;
    } else if (bs === 'BINDING') {
      body = `<p class="acct-card-note ev-dom-note">Proven ${e(D.fmtDate(d.verifiedAt))}. The certificate for this name is being issued; that usually takes a few minutes, sometimes longer. ${manage ? 'Press Check to see whether it is done; the platform also checks nightly.' : 'The platform checks nightly.'}</p>`;
    } else if (bs === 'BIND_FAILED') {
      body = `
      <p class="acct-error ev-dom-note">Binding did not complete: ${e(b.error || 'Azure did not say why.')}</p>
      <p class="acct-card-note ev-dom-note">${d.registrar ? 'The platform holds this name’s DNS and has written the records; DNS can take up to an hour to show. It tries again nightly, or now with Try again.' : 'Check the two records below, give DNS a few minutes, then press Try again.'}</p>
      ${recs}`;
    } else {
      body = `
      <p class="acct-card-note ev-dom-note">Proven ${e(D.fmtDate(d.verifiedAt))}. ${d.registrar ? 'The platform holds this name’s DNS and points it at the software on its own: binding starts within a day, or now with Bind.' : 'Create these two records where you manage the domain’s DNS, then press Bind. The software then serves your site at this name, with a certificate Azure issues and renews.'}</p>
      ${recs}`;
    }
  } else if (d.cname) {
    body = `
      <p class="acct-card-note ev-dom-note">Proven ${e(D.fmtDate(d.verifiedAt))}. Point the name at the software with this record, and it serves your site.</p>
      ${recordHtml('The serving record', d.cname)}`;
  } else {
    body = `<p class="acct-card-note ev-dom-note">Proven ${e(D.fmtDate(d.verifiedAt))}. Serving arrives when the software is hosted; there is nothing more to do for now, and the platform re-checks the record daily.</p>`;
  }
  // A name registered through PragOptics: its term and the renewal choice
  // (the owner's). The row is the truth the yearly renewal reads.
  if (d.registrar) {
    const r = d.registrar;
    const owner = myRole() === 'owner';
    body += `
      <p class="acct-card-note ev-dom-note">Registered through PragOptics${r.expiresAt ? `, current term ends ${e(D.fmtDate(r.expiresAt))}` : ''}. ${r.autoRenew ? 'Renews yearly at Azure’s price that day, charged to your account a month ahead.' : 'Renewal is off: the name expires at the end of its term unless you turn renewal back on.'}</p>
      ${owner ? `
      <label class="ev-agree ev-renew"><input type="checkbox" data-env-toggle="domain-renew" data-host="${e(d.host)}" ${r.autoRenew ? 'checked' : ''} /> <span>Renew automatically each year</span></label>` : ''}`;
  }
  return `
    <div class="ev-dom">
      <div class="ev-dom-head">
        <span class="ev-dom-host">${e(d.host)}</span>
        ${domainTag(d)}
        ${d.addedBy ? `<span class="ev-dom-when">connected by ${e(d.addedBy)} ${e(D.fmtDate(d.addedAt))}</span>` : ''}
      </div>
      ${body}
      ${manage ? `
      <div class="ev-dom-actions">
        ${verified ? '' : `<button class="btn btn-sm" type="button" data-env-action="domain-verify" data-host="${e(d.host)}" ${checking ? 'disabled' : ''}>${checking ? 'Checking…' : 'Verify'}</button>`}
        ${verified && hosted ? (bs === 'BOUND'
          ? `<button class="btn btn-sm" type="button" data-env-action="domain-unbind" data-host="${e(d.host)}">Unbind</button>`
          : `<button class="btn btn-sm" type="button" data-env-action="domain-bind" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : bs === 'BINDING' ? 'Check' : bs === 'BIND_FAILED' ? 'Try again' : 'Bind'}</button>`) : ''}
        <button class="btn btn-sm" type="button" data-env-action="domain-remove" data-host="${e(d.host)}">Remove</button>
      </div>` : ''}
    </div>`;
}

function domainsHtml() {
  const e = D.escapeHtml;
  const manage = canManageDomains();
  const rows = ev.domains;
  const limit = ev.domainLimit;
  const full = rows && limit && rows.length >= limit;
  const list = rows == null ? '<p class="acct-loading">Loading domains…</p>'
    : !rows.length ? `<p class="acct-empty">No domain connected yet.</p>`
    : `<div class="ev-domains">${rows.map(domainHtml).join('')}</div>`;
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Domains</h3>
      <p class="acct-card-note">Connect a domain you own. One TXT record at your registrar proves it is yours; the platform never needs your registrar login. ${explainLink('domains', 'How domains work')}</p>
      ${manage ? `
      <div class="ev-dom-row">
        <input class="acct-input" type="text" id="evDomainHost" maxlength="253" placeholder="www.example.com" autocomplete="off" spellcheck="false" autocapitalize="off" ${full ? 'disabled' : ''} />
        <button class="btn" type="button" data-env-action="domain-add" ${full ? 'disabled' : ''}>Connect</button>
      </div>
      ${limit ? `<p class="acct-card-note ev-count">${e(String((rows || []).length))} of ${e(String(limit))} on this plan.${full ? ' Remove one to connect another, or move up a plan.' : ''}</p>` : ''}` : `<p class="acct-card-note">The owner, an admin or a developer connects domains; everyone on the team sees them here.</p>`}
      <p class="acct-error" id="evDomainError" hidden></p>
      ${ev.domainNote ? `<p class="acct-card-note">${e(ev.domainNote)}</p>` : ''}
      ${registrationsHtml()}
      ${list}
      ${myRole() === 'owner' && !ev.domainNote ? registerHtml() : ''}
    </section>`;
}

/* ---------- registration through PragOptics ---------- */

function money(cents) { return `$${(Number(cents || 0) / 100).toFixed(2)}`; }

/** Names bought and not on the list yet: the registry is still working, or it failed. */
function registrationsHtml() {
  const e = D.escapeHtml;
  const rows = ev.registrations || [];
  if (!rows.length) return '';
  return `
    <div class="ev-domains">
      ${rows.map(r => `
        <div class="ev-dom">
          <div class="ev-dom-head">
            <span class="ev-dom-host">${e(r.host)}</span>
            ${r.status === 'FAILED' ? '<span class="acct-tag is-bad">registration failed</span>' : '<span class="acct-tag is-pending">registering</span>'}
          </div>
          <p class="acct-card-note ev-dom-note">${r.status === 'FAILED'
            ? `The registry did not complete it${r.error ? `: ${e(r.error)}` : ''}. Nothing was registered; support refunds order ${e(String(r.orderId).slice(0, 8))} in full.`
            : `Paid on order ${e(String(r.orderId).slice(0, 8))}. The registry usually finishes within a few minutes; this card updates on its own.`}</p>
        </div>`).join('')}
    </div>`;
}

function registerHtml() {
  const e = D.escapeHtml;
  const r = ev.reg;
  const q = r.quote;
  const c = r.contact || {};
  const head = `<h4 class="tm-sub-h">Register a new domain</h4>`;
  if (r.step === 'idle' || r.step === 'checking') {
    return `
      ${head}
      <p class="acct-card-note">Do not have one yet? Type the name you want. The price is the registrar's, passed through with no markup, and the domain is yours.</p>
      <div class="ev-dom-row">
        <input class="acct-input" type="text" id="evRegHost" maxlength="253" placeholder="yourname.com" autocomplete="off" spellcheck="false" autocapitalize="off" value="${e(r.host)}" ${r.busy ? 'disabled' : ''} />
        <button class="btn" type="button" data-env-action="domain-reg-check" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Checking…' : 'Check'}</button>
      </div>
      <p class="acct-error" id="evRegError" ${r.error ? '' : 'hidden'}>${e(r.error)}</p>`;
  }
  if (r.step === 'quoted') {
    if (!q.offered) {
      return `${head}<p class="acct-card-note"><b>${e(q.host)}</b>: ${e(q.reason || 'not offered here.')}</p><div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button></div>`;
    }
    if (!q.available) {
      return `${head}<p class="acct-card-note"><b>${e(q.host)}</b> is taken. If it is yours, connect it above instead.</p><div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button></div>`;
    }
    return `
      ${head}
      <p class="acct-card-note"><b>${e(q.host)}</b> is available: <b>${e(money(q.priceCents))}</b> for the first year${q.priceSource === 'azure-live' ? ', Azure’s current price read just now' : ''}, passed through with no markup. ${e(q.note || '')}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-continue">Continue</button>
        <button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button>
      </div>`;
  }
  if (r.step === 'contact') {
    const f = (id, label, val, extra = '') => `<label class="acct-label" for="${id}">${label}</label><input class="acct-input" type="text" id="${id}" value="${e(val || '')}" ${extra} />`;
    return `
      ${head}
      <p class="acct-card-note"><b>${e(q.host)}</b>, ${e(money(q.priceCents))} for the first year, plus any sales tax due at your address. The registry records a contact for every domain; privacy protection is on, so the public record shows the registrar's proxy, not you.</p>
      <div class="ev-reg-form">
        ${f('evRegFirst', 'First name', c.nameFirst, 'autocomplete="given-name"')}
        ${f('evRegLast', 'Last name', c.nameLast, 'autocomplete="family-name"')}
        ${f('evRegOrg', 'Organization (optional)', c.organization, 'autocomplete="organization"')}
        ${f('evRegEmail', 'Email', c.email || q.contact?.email, 'autocomplete="email" inputmode="email"')}
        ${f('evRegPhone', 'Phone', c.phone, 'autocomplete="tel" inputmode="tel" placeholder="+1 555 123 4567"')}
        ${f('evRegAddr1', 'Street', c.address1, 'autocomplete="address-line1"')}
        ${f('evRegAddr2', 'Street, line 2 (optional)', c.address2, 'autocomplete="address-line2"')}
        ${f('evRegCity', 'City', c.city, 'autocomplete="address-level2"')}
        ${f('evRegState', 'State', c.state, 'autocomplete="address-level1"')}
        ${f('evRegZip', 'Postal code', c.postalCode, 'autocomplete="postal-code"')}
        ${f('evRegCountry', 'Country (two letters)', c.country || 'US', 'autocomplete="country" maxlength="2"')}
      </div>
      <label class="ev-agree"><input type="checkbox" id="evRegAgree" ${r.agree ? 'checked' : ''} /> <span>I accept the registrar agreements: ${(q.agreements || []).map(a => a.url ? `<a class="acct-inline-link" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">${e(a.title || a.key)}</a>` : e(a.title || a.key)).join(', ')}.</span></label>
      <p class="acct-error" id="evRegError" ${r.error ? '' : 'hidden'}>${e(r.error)}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-pay" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Starting…' : `Pay ${e(money(q.priceCents))} and register`}</button>
        <button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Cancel</button>
      </div>`;
  }
  if (r.step === 'paying') {
    return `
      ${head}
      <p class="acct-card-note"><b>${e(q.host)}</b>, ${e(money(r.order?.breakdown?.totalCents ?? q.priceCents))}${r.order?.breakdown?.taxCents ? ` including ${e(money(r.order.breakdown.taxCents))} tax` : ''}. Order ${e(String(r.order?.orderId || '').slice(0, 8))}.</p>
      <div id="evRegPayEl" class="ev-pay"></div>
      <p class="acct-error" id="evRegError" ${r.error ? '' : 'hidden'}>${e(r.error)}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-confirm" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Paying…' : 'Confirm payment'}</button>
        <button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel" ${r.busy ? 'disabled' : ''}>Cancel</button>
      </div>`;
  }
  if (r.step === 'paid') {
    return `${head}<p class="acct-card-note"><b>${e(q.host)}</b> is paid. The registry is working; it usually takes a few minutes and this card updates on its own.</p>`;
  }
  if (r.step === 'done') {
    return `${head}<p class="acct-card-note"><b>${e(q.host)}</b> is registered and on the list above.</p><div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Register another</button></div>`;
  }
  return '';
}

function readContact() {
  const v = (id) => (document.getElementById(id)?.value || '').trim();
  return {
    nameFirst: v('evRegFirst'), nameLast: v('evRegLast'), organization: v('evRegOrg'), email: v('evRegEmail'), phone: v('evRegPhone'),
    address1: v('evRegAddr1'), address2: v('evRegAddr2'), city: v('evRegCity'), state: v('evRegState'), postalCode: v('evRegZip'), country: v('evRegCountry').toUpperCase()
  };
}

async function regCheck() {
  const r = ev.reg;
  r.host = (document.getElementById('evRegHost')?.value || '').trim();
  r.error = '';
  if (!r.host) { r.error = 'Type the name you want, e.g. yourname.com.'; paintDomains(); return; }
  r.busy = true; paintDomains();
  try {
    r.quote = await post(`${ENV_URL}/domains/register/check`, { host: r.host });
    r.step = 'quoted';
  } catch (ex) {
    r.error = errText(ex, 'Could not check that name.');
    if (ex?.data?.suggest) r.host = ex.data.suggest;
  }
  r.busy = false; paintDomains();
}

async function regPay() {
  const r = ev.reg;
  r.contact = readContact();
  r.agree = !!document.getElementById('evRegAgree')?.checked;
  r.error = '';
  if (!r.agree) { r.error = 'Accept the registrar agreements to continue.'; paintDomains(); return; }
  r.busy = true; paintDomains();
  try {
    const me = D.cachedPing?.()?.user || {};
    const data = await D.apiFetch(ORDERS_CHECKOUT_URL, {
      method: 'POST',
      body: JSON.stringify({
        email: r.contact.email || me.email || '',
        name: `${r.contact.nameFirst} ${r.contact.nameLast}`.trim(),
        lines: [{ productId: r.quote.sku, qty: 1, domain: { host: r.quote.host, environmentId: ev.view?.tenant?.environmentId, contact: r.contact, agreementKeys: (r.quote.agreements || []).map(a => a.key) } }]
      })
    });
    r.order = data;
    r.step = 'paying'; r.busy = false; paintDomains();
    await ensureStripeJs().catch(() => null);
    const stripe = window.Stripe?.(window.STRIPE_PUBLISHABLE_KEY);
    if (!stripe) throw new Error('Stripe is not available right now.');
    const elements = stripe.elements({ clientSecret: data.clientSecret, appearance: stripeAppearance() });
    const el = elements.create('payment');
    el.mount('#evRegPayEl');
    r.stripe = stripe; r.elements = elements;
  } catch (ex) {
    r.busy = false;
    r.error = errText(ex, 'Could not start the order.');
    if (r.step === 'paying') r.step = 'contact';
    paintDomains();
  }
}

async function regConfirm() {
  const r = ev.reg;
  if (!r.stripe || !r.elements) return;
  r.error = ''; r.busy = true;
  const btn = document.querySelector('[data-env-action="domain-reg-confirm"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Paying…'; }
  try {
    const { error, paymentIntent } = await r.stripe.confirmPayment({
      elements: r.elements,
      confirmParams: { return_url: `${location.origin}${location.pathname}?post=domain` },
      redirect: 'if_required'
    });
    if (error) throw new Error(error.message || 'Payment failed.');
    if (paymentIntent && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') throw new Error(`Payment ${paymentIntent.status}.`);
    r.step = 'paid'; r.busy = false; r.stripe = null; r.elements = null;
    paintDomains();
    pollRegistration(r.quote.host);
  } catch (ex) {
    r.busy = false; r.error = ex?.message || 'Payment failed.';
    paintDomains();
    // The element was unmounted by the repaint; mount it again for another try.
    if (r.elements) { try { r.elements.create('payment').mount('#evRegPayEl'); } catch { /* fine */ } }
  }
}

async function pollRegistration(host) {
  const r = ev.reg;
  for (let i = 0; i < 40 && ev.reg === r && r.step === 'paid'; i++) {
    await new Promise(res => setTimeout(res, 6000));
    if (ev.reg !== r || r.step !== 'paid') return;
    await loadDomains();
    if ((ev.domains || []).some(d => d.host === host)) { r.step = 'done'; paintDomains(); return; }
    if ((ev.registrations || []).some(x => x.host === host && x.status === 'FAILED')) { r.step = 'idle'; r.host = ''; paintDomains(); return; }
  }
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

async function addDomain(btn) {
  D.showError('evDomainError', '');
  const host = (document.getElementById('evDomainHost')?.value || '').trim();
  if (!host) { D.showError('evDomainError', 'Enter the domain to connect, e.g. www.example.com.'); return; }
  btn.disabled = true;
  try {
    await post(`${ENV_URL}/domains`, { host });
    ev.domainNote = '';
    await loadDomains();
  } catch (ex) {
    btn.disabled = false;
    D.showError('evDomainError', errText(ex, 'That domain could not be connected.'));
  }
}

async function verifyDomain(host) {
  D.showError('evDomainError', '');
  ev.checking = host; paintDomains();
  try {
    const r = await post(`${ENV_URL}/domains/verify`, { host });
    ev.checking = '';
    await loadDomains();
    if (!r.verified) D.showError('evDomainError', r.error || 'The record was not found yet.');
  } catch (ex) {
    ev.checking = ''; paintDomains();
    D.showError('evDomainError', errText(ex, 'The check did not run.'));
  }
}

async function bindDomain(host) {
  D.showError('evDomainError', '');
  ev.binding = host; paintDomains();
  try {
    const r = await post(`${ENV_URL}/domains/bind`, { host });
    ev.binding = '';
    await loadDomains();
    if (r.outcome === 'failed') D.showError('evDomainError', r.domain?.binding?.error || 'Binding did not complete.');
  } catch (ex) {
    ev.binding = ''; paintDomains();
    D.showError('evDomainError', errText(ex, 'Binding did not run.'));
  }
}

async function unbindDomain(host) {
  if (!window.confirm(`Stop serving at ${host}? The name stays connected and verified; Bind puts it back.`)) return;
  D.showError('evDomainError', '');
  try { await post(`${ENV_URL}/domains/unbind`, { host }); await loadDomains(); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not unbind that domain.')); }
}

async function removeDomain(host) {
  if (!window.confirm(`Remove ${host}? It stops serving anything from here and can be connected again later.`)) return;
  D.showError('evDomainError', '');
  try { await post(`${ENV_URL}/domains/remove`, { host }); await loadDomains(); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not remove that domain.')); }
}

// The export: one JSON file with everything, fetched with the session and
// handed to the browser as a download. Big environments take a moment.
async function exportEnvironment(btn) {
  D.showError('evExportError', '');
  const status = document.getElementById('evExportStatus');
  btn.disabled = true;
  if (status) status.textContent = 'Gathering everything…';
  try {
    const token = JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || '';
    const res = await fetch(url(`${ENV_URL}/export`), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { let d = null; try { d = await res.json(); } catch { /* fine */ } throw Object.assign(new Error(d?.error || `Export failed (${res.status})`), { status: res.status, data: d }); }
    const blob = await res.blob();
    // The filename header is not readable across origins, so the name is
    // composed here the way the API composes it: environment id and date.
    let name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || '';
    if (!name) {
      const id = String(ev.view?.tenant?.environmentId || '').slice(0, 8) || 'export';
      name = `pragoptics-environment-${id}-${new Date().toISOString().slice(0, 10)}.json`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    if (status) status.textContent = `Saved ${name} (${bytesFmt(blob.size)}). The file links inside live ten minutes.`;
  } catch (ex) {
    if (status) status.textContent = '';
    D.showError('evExportError', errText(ex, 'The export did not finish.'));
  } finally { btn.disabled = false; }
}

async function setRenewal(host, autoRenew, input) {
  D.showError('evDomainError', '');
  input.disabled = true;
  try { await post(`${ENV_URL}/domains/renewal`, { host, autoRenew }); await loadDomains(); }
  catch (ex) { input.disabled = false; input.checked = !autoRenew; D.showError('evDomainError', errText(ex, 'Could not change the renewal choice.')); }
}

async function copyText(text, btn) {
  const orig = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Select the text'; }
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
    if (a === 'export') return void exportEnvironment(btn);
    if (a === 'provision') return void provision();
    if (a === 'upload') { document.getElementById('evFile')?.click(); return; }
    if (a === 'download') return void download(btn.dataset.name || '', btn);
    if (a === 'delete') return void del(btn.dataset.name || '');
    if (a === 'key-make') return void makeKey(btn);
    if (a === 'key-copy') return void copyKey(btn);
    if (a === 'key-revoke') return void revokeKey(btn.dataset.key || '', btn.dataset.label || 'this key');
    if (a === 'domain-add') return void addDomain(btn);
    if (a === 'domain-verify') return void verifyDomain(btn.dataset.host || '');
    if (a === 'domain-remove') return void removeDomain(btn.dataset.host || '');
    if (a === 'domain-bind') return void bindDomain(btn.dataset.host || '');
    if (a === 'domain-unbind') return void unbindDomain(btn.dataset.host || '');
    if (a === 'domain-copy') return void copyText(btn.dataset.text || '', btn);
    if (a === 'domain-reg-check') return void regCheck();
    if (a === 'domain-reg-continue') { ev.reg.step = 'contact'; ev.reg.error = ''; paintDomains(); document.getElementById('evRegFirst')?.focus(); return; }
    if (a === 'domain-reg-pay') return void regPay();
    if (a === 'domain-reg-confirm') return void regConfirm();
    if (a === 'domain-reg-cancel') { ev.reg = freshReg(); paintDomains(); return; }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'evFile') uploadFiles(e.target.files);
    const t = e.target.closest?.('[data-env-toggle="domain-renew"]');
    if (t) setRenewal(t.dataset.host || '', !!t.checked, t);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'evKeyLabel') { e.preventDefault(); document.querySelector('[data-env-action="key-make"]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'evDomainHost') { e.preventDefault(); document.querySelector('[data-env-action="domain-add"]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'evRegHost') { e.preventDefault(); document.querySelector('[data-env-action="domain-reg-check"]')?.click(); }
  });
}
