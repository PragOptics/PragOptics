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
//   GET  v1/environment/connections    list + the provider catalog; POST connects one, POST connections/test, POST connections/remove
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

const LANE_KEY = 'pragoptics_env_lane';   // the lane the person was looking at; survives a section re-render
function laneChoice() { try { return sessionStorage.getItem(LANE_KEY) === 'sandbox' ? 'sandbox' : 'live'; } catch { return 'live'; } }
const ev = { lane: laneChoice(), teamId: '', view: null, files: null, filesTruncated: false, keys: null, madeKey: null, filesNote: '', uploading: false, domains: null, domainLimit: 0, cnameTarget: null, serving: null, binding: '', domainNote: '', checking: '', registrations: [], reg: null,
  // Connected accounts (the connection broker): the list, the provider
  // catalog the form renders from, the picked provider, and the last outcome.
  connections: null, connProviders: [], connLimit: 0, connNote: '', connPick: '', connBusy: false, connResult: '', connTesting: '',
  // What survives a failed Connect: the name and the NON-secret identifiers
  // (an Account SID, a tenant id), so a typo in the token does not mean
  // re-typing everything. Secret fields are never kept.
  connDraft: {}, connArm: '' };
let D = null;

// The registration flow's own state (round 3b-2): a quote, the registrant
// contact, an order with its payment element, then the wait for the registry.
function freshReg() { return { host: '', quote: null, step: 'idle', error: '', busy: false, contact: {}, order: null, stripe: null, elements: null, polls: 0, retryOrderId: '' }; }
ev.reg = freshReg();

function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
function forgetTeam() { try { sessionStorage.removeItem(TEAM_KEY); } catch { /* fine */ } }
function url(path, extra = {}) {
  const u = new URL(path);
  if (ev.teamId) u.searchParams.set('tenant', ev.teamId);
  if (ev.lane === 'sandbox') u.searchParams.set('lane', 'sandbox');
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
function body(obj) { return JSON.stringify({ ...(ev.teamId ? { tenant: ev.teamId } : {}), ...(ev.lane === 'sandbox' ? { lane: 'sandbox' } : {}), ...obj }); }
/** Both lanes off the tenant view (older builds carry none: then live is all there is). */
function lanesOf(t) { return t?.lanes || null; }
function sandboxState(t) { const l = lanesOf(t); return l ? { phase: String(l.sandbox?.phase || 'NONE').toUpperCase(), available: !!l.sandbox?.available, note: String(l.sandbox?.note || ''), account: String(l.sandbox?.storage?.account || '') } : null; }
function laneReady(t) { return ev.lane === 'sandbox' ? sandboxState(t)?.phase === 'READY' : true; }
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
// A file's type from its NAME. The browser's File.type is empty for .md, .csv,
// .json, .log and most others, and Azure serves a blob with whatever type it
// was stored under, so "open" used to download instead of show. Extension is
// the honest signal for both the upload and the viewer.
const MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', log: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', xml: 'text/xml', yaml: 'text/yaml', yml: 'text/yaml',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', ts: 'text/plain', py: 'text/plain', ps1: 'text/plain', sh: 'text/plain',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
  zip: 'application/zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
function mimeFor(name, fallback = '') { return MIME_BY_EXT[extOf(name)] || fallback || 'application/octet-stream'; }
// What the browser can show on its own in a tab. HTML is shown as TEXT on
// purpose: a stranger's upload must not run as a page from here.
function viewTypeFor(name) {
  const t = mimeFor(name, '');
  if (t === 'application/pdf' || t.startsWith('image/') || t.startsWith('audio/') || t.startsWith('video/')) return t;
  if (t === 'text/html' || t === 'text/css' || t === 'text/javascript') return 'text/plain';
  if (t.startsWith('text/') || t === 'application/json') return 'text/plain';
  return '';   // not viewable: download it
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
function canManageConnections() { return (myRole() === 'owner' || myRole() === 'admin') && !paused(); }   // credentials are settings: owner and admin

/* ================================================================
   render
   ================================================================ */

export async function renderEnvironment(main, deps) {
  D = deps;
  ev.madeKey = null; ev.filesNote = ''; ev.files = null; ev.keys = null; ev.domains = null; ev.domainNote = ''; ev.linkNote = ''; ev.domArm = ''; ev.keyArm = ''; ev.checking = ''; ev.registrations = []; ev.reg = freshReg();
  ev.connections = null; ev.connProviders = []; ev.connNote = ''; ev.connPick = ''; ev.connBusy = false; ev.connResult = ''; ev.connTesting = ''; ev.connDraft = {}; ev.connArm = '';
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
    if (['READY', 'SUSPENDED'].includes(phaseOf(ev.view.tenant))) {
      if (ev.lane === 'sandbox' && !laneReady(ev.view.tenant)) return;   // the setup card is all there is
      await Promise.all([loadFiles(), ...(ev.lane === 'live' ? [loadDomains()] : []), loadKeys(), loadConnections()]);
    }
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

async function loadConnections() {
  try {
    const d = await D.apiFetch(url(`${ENV_URL}/connections`));
    ev.connections = d.connections || [];
    ev.connProviders = d.providers || [];
    ev.connLimit = Number(d.limit || 0);
    ev.connNote = '';
  } catch (ex) {
    ev.connections = [];
    if (ex?.status === 404) ev.connNote = 'The connection routes are not on this lane yet.';
    else if (ex?.data?.code === 'UPGRADE_REQUIRED') ev.connNote = ex.data.error;
    else if (ex?.data?.code === 'CONNECTIONS_NOT_CONFIGURED') ev.connNote = 'Connected accounts are not switched on for this lane yet.';
    else ev.connNote = errText(ex, 'Could not list the connected accounts.');
  }
  paintConnections();
  paintDomains();
}

function paint() {
  const host = document.getElementById('evBody');
  if (!host || !ev.view?.tenant) return;
  const phase = phaseOf(ev.view.tenant);
  const ready = phase === 'READY' || phase === 'SUSPENDED';   // paused: the cards show, reads work, writes are refused by the routes
  // On the sandbox lane the cards appear only once the sandbox is READY;
  // until then the section explains and (for the owner) offers to set it up.
  const cards = ev.lane === 'sandbox'
    ? (laneReady(ev.view.tenant) ? `<div id="evFiles">${filesHtml()}</div><div id="evConnections">${connectionsHtml()}</div><div id="evKeys">${keysHtml()}</div>` : sandboxSetupHtml(ev.view))
    : `<div id="evFiles">${filesHtml()}</div><div id="evConnections">${connectionsHtml()}</div><div id="evDomains">${domainsHtml()}</div><div id="evKeys">${keysHtml()}</div>`;
  host.innerHTML = `
    ${summaryHtml(ev.view)}
    ${ready ? cards : ''}
  `;
}

/* ---------- lanes ---------- */

function laneSwitchHtml(t) {
  const l = lanesOf(t);
  if (!l) return '';
  const sb = sandboxState(t);
  const tag = sb.phase === 'READY' ? '' : sb.phase === 'PROVISIONING' ? ' <span class="acct-tag is-pending">setting up</span>' : ' <span class="acct-tag">not set up</span>';
  return `
    <div class="ev-lanes" role="tablist" aria-label="Which lane of this environment">
      <button class="ev-lane ${ev.lane === 'live' ? 'is-on' : ''}" type="button" role="tab" aria-selected="${ev.lane === 'live'}" data-env-action="lane-live">Live</button>
      <button class="ev-lane ${ev.lane === 'sandbox' ? 'is-on' : ''}" type="button" role="tab" aria-selected="${ev.lane === 'sandbox'}" data-env-action="lane-sandbox">Sandbox${tag}</button>
      <span class="ev-lane-hint">${ev.lane === 'sandbox' ? 'Build and test here. Nothing touches live.' : 'What your programs and your customers use.'}</span>
    </div>`;
}

function sandboxSetupHtml(v) {
  const e = D.escapeHtml;
  const t = v.tenant, me = v.membership || {};
  const sb = sandboxState(t) || { phase: 'NONE', available: false, note: '' };
  const isOwner = me.role === 'owner';
  if (!sb.available) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Sandbox</h3>
        <p class="acct-card-note">A sandbox is not available on this lane yet. ${explainLink('environment', 'How your environment works')}</p>
      </section>`;
  }
  if (sb.phase === 'PROVISIONING') {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Your sandbox is being set up</h3>
        <p class="acct-card-note">${e(sb.note || 'Its own storage account is being created. This takes a moment and finishes on its own.')}</p>
        <div class="acct-actions-row"><button class="btn btn-sm" type="button" data-env-action="refresh">Check again</button></div>
      </section>`;
  }
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">A place to build and test</h3>
      <p class="acct-card-note">A sandbox is a second environment of your own: its own storage account, its own vault, its own connected accounts. Build and test here with test keys, and nothing touches what your customers use. When you are ready, the software pushes your work live. ${explainLink('environment', 'How your environment works')}</p>
      ${isOwner
        ? `<div class="acct-actions-row"><button class="btn" type="button" data-env-action="sandbox-setup" ${ev.sandboxBusy ? 'disabled' : ''}>${ev.sandboxBusy ? 'Setting up…' : 'Set up a sandbox'}</button></div>`
        : `<p class="acct-card-note ev-note">The owner sets up the sandbox. Once it exists, it shows here for everyone on the team.</p>`}
      <p class="acct-error" id="evSandboxError" hidden></p>
    </section>`;
}

async function setLane(lane) {
  ev.lane = lane === 'sandbox' ? 'sandbox' : 'live';
  try { sessionStorage.setItem(LANE_KEY, ev.lane); } catch { /* fine */ }
  ev.files = null; ev.keys = null; ev.domains = null; ev.connections = null; ev.connPick = ''; ev.connResult = ''; ev.madeKey = null; ev.filesNote = '';
  paint();
  if (ev.lane === 'live' || laneReady(ev.view?.tenant)) await Promise.all([loadFiles(), ...(ev.lane === 'live' ? [loadDomains()] : []), loadKeys(), loadConnections()]);
}

async function setupSandbox(btn) {
  if (ev.sandboxBusy) return;
  ev.sandboxBusy = true; paint();
  try {
    const d = await post(`${ENV_URL}/sandbox`, {});
    ev.filesNote = '';
    try { ev.view = await fetchView(); } catch { /* keep */ }
    ev.sandboxBusy = false;
    paint();
    if (d.phase === 'READY') await Promise.all([loadFiles(), loadKeys(), loadConnections()]);
    const host = document.getElementById('evSandboxError'); if (host && d.note && d.phase !== 'READY') { host.textContent = d.note; host.hidden = false; host.classList.remove('acct-error'); host.classList.add('acct-card-note'); }
  } catch (ex) {
    ev.sandboxBusy = false; paint();
    D.showError('evSandboxError', errText(ex, 'Could not set up the sandbox.'));
  }
}
function paintFiles() { const h = document.getElementById('evFiles'); if (h) h.innerHTML = filesHtml(); }
function paintDomains() {
  const h = document.getElementById('evDomains');
  if (!h) return;
  h.innerHTML = domainsHtml();
  // At the paying step the Stripe payment box lives in this card; a repaint
  // replaces its container, so the one payment element is mounted again
  // (Stripe allows a single payment element per group, never a second create).
  const r = ev.reg;
  if (r?.step === 'paying' && r.elements) {
    try {
      const pe = r.elements.getElement('payment');
      if (pe) { try { pe.unmount(); } catch { /* not mounted */ } pe.mount('#evRegPayEl'); }
    } catch { /* the box comes back on the next repaint */ }
  }
}
function paintKeys() { const h = document.getElementById('evKeys'); if (h) h.innerHTML = keysHtml(); }
function paintConnections() { const h = document.getElementById('evConnections'); if (h) h.innerHTML = connectionsHtml(); }

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
      ${laneSwitchHtml(t)}
      <div class="use-row ev-meter">
        <div class="use-head">
          <span class="use-name">Storage</span>
          <span class="use-val">${e(used > 0 && used < 0.05 * 1024 ** 3 ? bytesFmt(used) : gb(used))} / ${e(gb(limit))}</span>
        </div>
        <div class="use-track"><div class="use-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <p class="acct-card-note ev-note">${s.unknown ? 'The bar reads what the plan carries; the figure refreshes with the next read.' : `Every value and every file counts. A write past the allowance plus ${e(gb(s.graceBytes || Math.ceil(limit * 0.1)))} of grace is refused, and nothing is ever deleted to make room.`}</p>
      ${(() => { const l = lanesOf(t); const w = (l && l[ev.lane] && l[ev.lane].storage) || { kind: s.kind, account: s.account }; const laneWord = ev.lane === 'sandbox' ? 'Your sandbox' : 'This environment';
        if (ev.lane === 'sandbox' && (sandboxState(t)?.phase !== 'READY')) return '';
        return w.kind ? `<p class="acct-card-note ev-note ev-where">${w.kind === 'dedicated'
          ? `<span class="acct-tag is-verified">your own storage</span> ${laneWord} lives in its own Azure storage account${w.account ? `, <code class="ev-prefix">${e(w.account)}</code>` : ''}: nothing shared with any other customer${ev.lane === 'sandbox' ? ', and nothing shared with your live lane' : ''}.`
          : `<span class="acct-tag">shared storage</span> ${laneWord} lives in a private partition of the platform's storage account.`}</p>` : ''; })()}
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
    : !rows.length ? `<p class="acct-empty">No files yet. Builds, images and exports the software and your programs store will land here.</p>`
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
                  ${viewTypeFor(f.name) ? `<button class="btn btn-sm" type="button" data-env-action="open" data-name="${e(f.name)}" title="Show it in a new tab">Open</button>` : ''}
                  <button class="btn btn-sm" type="button" data-env-action="download" data-name="${e(f.name)}">Download</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${ev.filesTruncated ? `<p class="acct-card-note">Showing the first ${rows.length}. The API lists the rest by prefix.</p>` : ''}`;
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Files</h3>
      <p class="acct-card-note">What is in this environment's file store, by name and size. Files get here through the software: its galleries, builds and exports. Open shows one in a new tab; Download saves it. Adding and removing files is done in the software, not here.</p>
      ${ev.filesNote ? `<p class="acct-error">${e(ev.filesNote)}</p>` : ''}
      <span class="ev-status" id="evUpStatus" aria-live="polite"></span>
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

/** Connected accounts that can manage DNS (the catalog says which providers can). */
function dnsConnections() {
  const ids = new Set((ev.connProviders || []).filter(p => (p.capabilities || []).includes('dns')).map(p => p.id));
  return (ev.connections || []).filter(c => ids.has(c.provider));
}
function providerLabel(id) { return (ev.connProviders || []).find(p => p.id === id)?.label || (id === 'spaceship' ? 'Spaceship' : id === 'azure' ? 'Azure' : String(id || 'the registrar')); }

function domainHtml(d) {
  const e = D.escapeHtml;
  const manage = canManageDomains();
  const verified = d.status === 'VERIFIED';
  const checking = ev.checking === d.host;
  const hosted = !!ev.serving?.hosted;
  const b = d.binding || {};
  const bs = b.status || 'UNBOUND';
  const busy = ev.binding === d.host;
  // Who manages this name's DNS: the customer (connect), a linked registrar
  // account (link), or the platform's own account (register).
  const dnsm = d.dns?.managed || (d.registrar ? 'platform' : 'self');
  const linked = dnsm === 'connection';
  const platformWrites = dnsm !== 'self';
  const conn = linked ? (ev.connections || []).find(c => c.id === d.dns.connectionId) : null;
  const prov = providerLabel(d.dns?.provider || d.registrar?.provider || '');
  const via = linked ? (conn ? `your ${e(prov)} account ${e(conn.label)}` : 'a registrar account that has since been removed') : '';
  const writesLine = linked ? `The platform writes this name’s records at ${e(prov)} through ${via}` : 'The platform holds this name’s DNS';
  let body = '';
  if (!verified) {
    body = linked ? `
      <p class="acct-card-note ev-dom-note">${conn ? `The platform wrote the proof record at ${e(prov)} through ${via}. DNS needs a moment to show it; press Verify, or leave it, the platform checks daily.` : 'The registrar account this name was linked through was removed. Link the name again, or add the record below yourself and press Verify.'}${d.status === 'FAILED' ? ' The record was found before and is missing now.' : ''}</p>
      ${conn ? '' : recordHtml('The verification record', d.verifyRecord)}
      ${d.lastCheckedAt ? `<p class="acct-card-note ev-dom-note"><span class="adm-muted">Last checked ${e(D.fmtDate(d.lastCheckedAt))}.</span> ${e(d.lastCheckError || '')}</p>` : ''}` : `
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
      <p class="acct-card-note ev-dom-note">${platformWrites ? `${writesLine} and has written the records; DNS can take up to an hour to show. It tries again nightly, or now with Try again.` : 'Check the two records below, give DNS a few minutes, then press Try again.'}</p>
      ${recs}`;
    } else {
      body = `
      <p class="acct-card-note ev-dom-note">Proven ${e(D.fmtDate(d.verifiedAt))}. ${platformWrites ? `${writesLine} and points it at the software on its own: binding starts within a day, or now with Bind.` : 'Create these two records where you manage the domain’s DNS, then press Bind. The software then serves your site at this name, with a certificate Azure issues and renews.'}</p>
      ${platformWrites ? '' : recs}`;
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
      <p class="acct-card-note ev-dom-note">Registered through PragOptics${r.expiresAt ? `, current term ends ${e(D.fmtDate(r.expiresAt))}` : ''}. ${r.autoRenew ? (Number.isInteger(r.renewalCents) ? `Renews yearly at ${e(money(r.renewalCents))}, the registrar’s renewal price passed through, charged to your account a month ahead.` : 'Renews yearly at the registrar’s price that day, charged to your account a month ahead.') : 'Renewal is off: the name expires at the end of its term unless you turn renewal back on.'}</p>
      ${owner ? `
      <label class="ev-agree ev-renew"><input type="checkbox" data-env-toggle="domain-renew" data-host="${e(d.host)}" ${r.autoRenew ? 'checked' : ''} /> <span>Renew automatically each year</span></label>` : ''}`;
  }
  // A linked name says so, and a link whose account is gone says that.
  if (linked) {
    body += conn
      ? `<p class="acct-card-note ev-dom-note ev-dom-dns">DNS managed by the platform through ${via}. Unlink to manage the records yourself again; nothing at the registrar changes.</p>`
      : `<p class="acct-error ev-dom-note">The registrar account this name was linked through was removed. Link it again under a connected account, or Unlink and manage its records yourself.</p>`;
  }
  const armed = (k) => ev.domArm === `${k}:${d.host}`;
  const twoStep = (k, label, sure) => armed(k)
    ? `<button class="btn btn-sm is-danger" type="button" data-env-action="domain-${k}" data-host="${e(d.host)}">${sure}</button><button class="btn btn-sm" type="button" data-env-action="domain-arm-cancel">Cancel</button>`
    : `<button class="btn btn-sm" type="button" data-env-action="domain-${k}" data-host="${e(d.host)}">${label}</button>`;
  return `
    <div class="ev-dom">
      <div class="ev-dom-head">
        <span class="ev-dom-host">${e(d.host)}</span>
        ${domainTag(d)}
        ${linked ? '<span class="acct-tag">linked</span>' : d.registrar ? '<span class="acct-tag">registered here</span>' : ''}
        ${d.addedBy ? `<span class="ev-dom-when">connected by ${e(d.addedBy)} ${e(D.fmtDate(d.addedAt))}</span>` : ''}
      </div>
      ${body}
      ${manage ? `
      <div class="ev-dom-actions">
        ${verified ? '' : `<button class="btn btn-sm" type="button" data-env-action="domain-verify" data-host="${e(d.host)}" ${checking ? 'disabled' : ''}>${checking ? 'Checking…' : 'Verify'}</button>`}
        ${verified && hosted ? (bs === 'BOUND'
          ? twoStep('unbind', 'Unbind', 'Stop serving here?')
          : `<button class="btn btn-sm" type="button" data-env-action="domain-bind" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : bs === 'BINDING' ? 'Check' : bs === 'BIND_FAILED' ? 'Try again' : 'Bind'}</button>`) : ''}
        ${linked ? `<button class="btn btn-sm" type="button" data-env-action="domain-unlink" data-host="${e(d.host)}">Unlink</button>` : ''}
        ${twoStep('remove', 'Remove', 'Remove for sure?')}
      </div>` : ''}
    </div>`;
}

/** The link door: a name held at a registrar account connected under Connected accounts. */
function linkDoorHtml(full) {
  const e = D.escapeHtml;
  const conns = dnsConnections();
  if (!conns.length) {
    return `<p class="acct-card-note ev-dom-door">Hold the name at Spaceship? Connect that account under Connected accounts, then link the name here: the platform writes the proof and serving records itself. Nothing to paste.</p>`;
  }
  return `
    <div class="ev-dom-row ev-dom-link">
      <select class="acct-input acct-select" id="evLinkConn" aria-label="Registrar account">${conns.map(c => `<option value="${e(c.id)}">${e(c.label)} (${e(providerLabel(c.provider))})</option>`).join('')}</select>
      <input class="acct-input" type="text" id="evLinkHost" maxlength="253" placeholder="www.example.com" autocomplete="off" spellcheck="false" autocapitalize="off" ${full ? 'disabled' : ''} />
      <button class="btn" type="button" data-env-action="domain-link" ${full ? 'disabled' : ''}>Link</button>
    </div>
    <p class="acct-card-note ev-dom-door">A name you hold in that account. The platform checks it is there, writes the proof record itself and manages the name’s records from then on. Nothing to paste.</p>
    ${ev.linkNote ? `<p class="acct-card-note">${e(ev.linkNote)}</p>` : ''}`;
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
      <p class="acct-card-note">Bring a domain in by the door that fits. Connect one you own anywhere: one TXT record proves it is yours, and the platform never needs your registrar login. Link the registrar account that holds it, and the platform writes the records for you. Or register a new name here. ${explainLink('domains', 'How domains work')}</p>
      ${manage ? `
      <div class="ev-dom-row">
        <input class="acct-input" type="text" id="evDomainHost" maxlength="253" placeholder="www.example.com" autocomplete="off" spellcheck="false" autocapitalize="off" ${full ? 'disabled' : ''} />
        <button class="btn" type="button" data-env-action="domain-add" ${full ? 'disabled' : ''}>Connect</button>
      </div>
      ${limit ? `<p class="acct-card-note ev-count">${e(String((rows || []).length))} of ${e(String(limit))} on this plan.${full ? ' Remove one to connect another, or move up a plan.' : ''}</p>` : ''}
      ${linkDoorHtml(full)}` : `<p class="acct-card-note">The owner, an admin or a developer connects domains; everyone on the team sees them here.</p>`}
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
            ? `The registry did not complete it${r.error ? `: ${e(String(r.error).replace(/\.$/, ''))}` : ''}. Nothing was registered and nothing was charged by the registrar. Try again once the cause is fixed, or support refunds order ${e(String(r.orderId).slice(0, 8))} in full.`
            : `Paid on order ${e(String(r.orderId).slice(0, 8))}. The registry usually finishes within a few minutes; this card updates on its own.`}</p>
          ${r.status === 'FAILED' && myRole() === 'owner' ? `
          <div class="ev-dom-actions">
            <button class="btn btn-sm" type="button" data-env-action="domain-reg-retry" data-order="${e(r.orderId)}" data-host="${e(r.host)}" ${ev.regRetrying === r.orderId ? 'disabled' : ''}>${ev.regRetrying === r.orderId ? 'Trying…' : 'Try again'}</button>
            ${r.contact ? `<button class="btn btn-sm" type="button" data-env-action="domain-reg-fix" data-order="${e(r.orderId)}" data-host="${e(r.host)}">Fix the contact</button>` : ''}
          </div>` : ''}
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
      <p class="acct-card-note"><b>${e(q.host)}</b> is available: <b>${e(money(q.priceCents))}</b> for the first year${q.priceSource === 'azure-live' ? ', Azure’s current price read just now' : q.priceSource === 'godaddy-quote' ? ', GoDaddy’s price right now' : ''}. ${e(q.note || '')}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-continue">Continue</button>
        <button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button>
      </div>`;
  }
  if (r.step === 'contact') {
    const f = (id, label, val, extra = '') => `<label class="acct-label" for="${id}">${label}</label><input class="acct-input" type="text" id="${id}" value="${e(val || '')}" ${extra} />`;
    return `
      ${head}
      ${r.retryOrderId
        ? `<p class="acct-card-note"><b>${e(q.host)}</b> is paid on order ${e(String(r.retryOrderId).slice(0, 8))} and the registry refused the contact. Correct it below and try again; nothing is charged again.</p>`
        : `<p class="acct-card-note"><b>${e(q.host)}</b>, ${e(money(q.priceCents))} for the first year, plus any sales tax due at your address. The registry records a contact for every domain; privacy protection is on, so the public record shows the registrar's proxy, not you.</p>`}
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
      ${r.retryOrderId ? '' : `<label class="ev-agree"><input type="checkbox" id="evRegAgree" ${r.agree ? 'checked' : ''} /> <span>I accept the registrar agreements: ${(q.agreements || []).map(a => a.url ? `<a class="acct-inline-link" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">${e(a.title || a.key)}</a>` : e(a.title || a.key)).join(', ')}.</span></label>`}
      <p class="acct-error" id="evRegError" ${r.error ? '' : 'hidden'}>${e(r.error)}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-pay" ${r.busy ? 'disabled' : ''}>${r.busy ? (r.retryOrderId ? 'Trying…' : 'Starting…') : r.retryOrderId ? 'Save and try again' : `Pay ${e(money(q.priceCents))} and register`}</button>
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
  if (r.retryOrderId) {
    // The paid order is retried with the corrected contact; the agreements were accepted at checkout.
    r.error = ''; r.busy = true; paintDomains();
    const orderId = r.retryOrderId, host = r.quote?.host || 'the name';
    try {
      const res = await post(`${ENV_URL}/domains/register/retry`, { orderId, contact: r.contact });
      ev.domainNote = res.outcome === 'registered' ? `${host} is registered and on the list.`
        : res.outcome === 'registering' ? `${host} is being registered; the card updates on its own.`
        : res.outcome === 'failed' ? `${host} failed again: ${res.error || 'the registry did not say why'}.`
        : '';
      ev.reg = freshReg();
      await loadDomains();
    } catch (ex) {
      r.busy = false; r.error = errText(ex, 'The retry did not run.');
      paintDomains();
    }
    return;
  }
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

// A failed registration tried again: the order goes back to ORDERED and is
// fulfilled now; the card reads the outcome from the list.
async function retryRegistration(orderId, host) {
  if (!orderId) return;
  D.showError('evDomainError', '');
  ev.regRetrying = orderId; paintDomains();
  try {
    const r = await post(`${ENV_URL}/domains/register/retry`, { orderId });
    ev.regRetrying = '';
    ev.domainNote = r.outcome === 'registered' ? `${host} is registered and on the list.`
      : r.outcome === 'registering' ? `${host} is being registered; the card updates on its own.`
      : r.outcome === 'failed' ? `${host} failed again: ${r.error || 'the registry did not say why'}.`
      : '';
    await loadDomains();
  } catch (ex) {
    ev.regRetrying = ''; paintDomains();
    D.showError('evDomainError', errText(ex, 'The retry did not run.'));
  }
}

// Fix the contact: the registrant form again, prefilled from the contact the
// registry refused, on the same paid order.
function fixRegistrationContact(orderId, host) {
  const reg = (ev.registrations || []).find(x => x.orderId === orderId);
  if (!reg) return;
  const c = reg.contact || {};
  const a = c.addressMailing || {};
  ev.reg = {
    ...freshReg(), step: 'contact', retryOrderId: orderId,
    quote: { host: host || reg.host, priceCents: null, agreements: [], contact: { email: c.email || '' } },
    contact: {
      nameFirst: c.nameFirst || '', nameLast: c.nameLast || '', organization: c.organization || '', email: c.email || '', phone: c.phone || '',
      address1: c.address1 || a.address1 || '', address2: c.address2 || a.address2 || '', city: c.city || a.city || '', state: c.state || a.state || '',
      postalCode: c.postalCode || a.postalCode || '', country: c.country || a.country || 'US'
    }
  };
  ev.domainNote = '';
  paintDomains();
  document.getElementById('evRegFirst')?.scrollIntoView({ block: 'center' });
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
    // A declined card: the error shows, the box stays mounted (paintDomains
    // re-mounts it), and Confirm payment works again with another card.
    r.busy = false; r.error = ex?.message || 'Payment failed.';
    paintDomains();
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

/* ---------- connected accounts ---------- */

const PROVIDER_ICON = { twilio: 'SMS', shippo: 'Ship', stripe: 'Pay', github: 'Git', microsoft: '365' };

function providerOf(id) { return (ev.connProviders || []).find(p => p.id === id) || null; }

/** The non-secret identity of a connection for the row: the provider says
 *  which field or detail names the account (never a secret). */
function connIdentity(c) {
  const e = D.escapeHtml;
  const d = c.detail || {}, f = c.fields || {};
  if (c.provider === 'twilio') return e(d.friendlyName || f.accountSid || '');
  if (c.provider === 'stripe') return e([d.accountId, d.mode].filter(Boolean).join(' · '));
  if (c.provider === 'shippo') return e(d.mode ? `${d.mode} token` : '');
  if (c.provider === 'github') return e(d.login ? `@${d.login}` : '');
  if (c.provider === 'microsoft') return e(d.org || f.tenantId || '');
  return e(Object.values(f)[0] || '');
}

function connStatusTag(c) {
  if (c.status === 'REJECTED') return `<span class="acct-tag is-bad" title="${D.escapeHtml(c.lastError || '')}">rejected</span>`;
  return '<span class="acct-tag is-verified">verified</span>';
}

function connFieldsHtml(p) {
  const e = D.escapeHtml;
  if (!p) return '';
  return `
    <div class="ev-conn-fields">
      ${p.fields.map(f => `
        <label class="ev-conn-field">
          <span class="ev-conn-field-label">${e(f.label)}</span>
          <input class="acct-input" type="${f.secret ? 'password' : 'text'}" data-conn-field="${e(f.key)}" ${f.secret ? 'autocomplete="new-password"' : 'autocomplete="off"'} spellcheck="false" placeholder="${e(f.hint || '')}" value="${f.secret ? '' : e(ev.connDraft[f.key] || '')}" />
        </label>`).join('')}
      <label class="ev-conn-field">
        <span class="ev-conn-field-label">Name this connection</span>
        <input class="acct-input" type="text" id="evConnLabel" maxlength="60" placeholder="e.g. Shop SMS" autocomplete="off" spellcheck="false" value="${e(ev.connDraft.label || '')}" />
      </label>
    </div>
    <p class="acct-card-note ev-note">${e(p.what)} The credential is checked with ${e(p.label)} before it is stored, then kept in your environment's own vault and never shown again.</p>`;
}

function connectionsHtml() {
  const e = D.escapeHtml;
  const manage = canManageConnections();
  const rows = ev.connections;
  const list = rows == null ? '<p class="acct-loading">Loading connected accounts…</p>'
    : ev.connNote ? ''   // the note above already says why there is nothing to list
    : !rows.length ? `<p class="acct-empty">${manage ? 'Nothing connected yet.' : 'Nothing connected yet. The owner or an admin connects accounts.'}</p>`
    : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Account</th><th>Name</th><th>Identity</th><th>Credential</th><th>Status</th><th>Checked</th><th></th></tr></thead>
          <tbody>
            ${rows.map(c => {
              const p = providerOf(c.provider);
              const testing = ev.connTesting === c.id;
              return `
              <tr class="${c.status === 'REJECTED' ? 'ev-muted-row' : ''}">
                <td class="cell-tight"><span class="acct-tag is-primary" title="${e(p?.label || c.provider)}">${e(PROVIDER_ICON[c.provider] || c.provider)}</span> ${e(p?.label || cap(c.provider))}</td>
                <td class="cell-ellip" title="${e(c.label)}">${e(c.label)}</td>
                <td class="cell-ellip adm-muted">${connIdentity(c)}</td>
                <td class="cell-tight"><code class="ev-prefix">••••${e(c.hint || '')}</code></td>
                <td class="cell-tight">${connStatusTag(c)}</td>
                <td class="cell-tight adm-muted">${c.verifiedAt ? e(D.fmtDate(c.verifiedAt)) : 'never'}</td>
                <td class="cell-tight ev-actions-cell">${manage ? (ev.connArm === c.id ? `
                  <button class="btn btn-sm is-danger" type="button" data-env-action="conn-remove" data-id="${e(c.id)}" data-label="${e(c.label)}" title="The credential is deleted from the vault and anything using it stops on its next call">Remove for sure?</button>
                  <button class="btn btn-sm" type="button" data-env-action="conn-remove-cancel">Cancel</button>` : `
                  <button class="btn btn-sm" type="button" data-env-action="conn-test" data-id="${e(c.id)}" ${testing ? 'disabled' : ''}>${testing ? 'Checking…' : 'Test'}</button>
                  <button class="btn btn-sm" type="button" data-env-action="conn-remove" data-id="${e(c.id)}" data-label="${e(c.label)}">Remove</button>`) : ''}</td>
              </tr>`; }).join('')}
          </tbody>
        </table>
      </div>`;

  const picked = providerOf(ev.connPick);
  const atLimit = ev.connLimit > 0 && (rows || []).length >= ev.connLimit;
  const form = !manage ? '' : ev.connNote ? '' : `
      <div class="ev-conn-add">
        <div class="ev-key-row">
          <select class="acct-input acct-select" id="evConnProvider" aria-label="Which account to connect" ${atLimit ? 'disabled' : ''}>
            <option value="">Connect an account…</option>
            ${(ev.connProviders || []).map(p => `<option value="${e(p.id)}" ${ev.connPick === p.id ? 'selected' : ''}>${e(p.label)}</option>`).join('')}
          </select>
          ${picked ? `<button class="btn" type="button" data-env-action="conn-add" ${ev.connBusy ? 'disabled' : ''}>${ev.connBusy ? 'Checking with ' + e(picked.label) + '…' : 'Connect'}</button>` : ''}
        </div>
        ${picked ? connFieldsHtml(picked) : ''}
        ${atLimit ? `<p class="acct-card-note ev-note">This environment holds ${ev.connLimit} connections, the most it can carry. Remove one to connect another.</p>` : ''}
      </div>`;

  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Connected accounts</h3>
      <p class="acct-card-note">The accounts your environment acts through: text messages, shipping labels, payments, code, mail. You hand over a credential once; the platform proves it with the provider, locks it in a vault that belongs to this environment alone, and uses it on your behalf from then on. It is never shown again.${ev.lane === 'sandbox' ? ' <b>This is your sandbox: test keys live here, in its own vault. Live has its own connections.</b>' : ''} ${explainLink('connections', 'How connected accounts work')}</p>
      ${ev.connNote ? `<p class="acct-card-note ev-note">${e(ev.connNote)}</p>` : ''}
      ${form}
      <p class="acct-error" id="evConnError" hidden></p>
      ${ev.connResult ? `<p class="acct-card-note ev-note ev-conn-result" aria-live="polite">${e(ev.connResult)}</p>` : ''}
      ${rows && rows.length ? `<p class="acct-card-note ev-count">${rows.length} connected${ev.connLimit ? ` of ${ev.connLimit}` : ''}.</p>` : ''}
      ${list}
    </section>`;
}

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
                <td class="cell-tight ev-actions-cell">${revocable ? `${ev.keyArm === k.keyId ? `<button class="btn btn-sm is-danger" type="button" data-env-action="key-revoke" data-key="${e(k.keyId)}" data-label="${e(k.label || k.prefix)}" title="Every call with it stops on the next request">Revoke for sure?</button><button class="btn btn-sm" type="button" data-env-action="key-arm-cancel">Cancel</button>` : `<button class="btn btn-sm" type="button" data-env-action="key-revoke" data-key="${e(k.keyId)}" data-label="${e(k.label || k.prefix)}">Revoke</button>`}` : ''}</td>
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

// Open shows the file; Download saves it. Both fetch the bytes through the
// ten-minute link the API mints (the page's CSP and the account's CORS allow
// the tenant's own blob host), then hand the browser a blob typed by the
// file's NAME, so a .md or .csv shows as text and a PDF opens in the viewer
// no matter what type Azure stored it under. A kind the browser cannot show
// is downloaded instead, with its real filename.
async function openFile(name, btn, mode = 'open') {
  D.showError('evFileError', '');
  const orig = btn.textContent; btn.disabled = true; btn.textContent = mode === 'open' ? 'Opening…' : 'Fetching…';
  let objectUrl = '';
  try {
    const d = await post(`${ENV_URL}/files/download-url`, { name });
    const res = await fetch(d.url);
    if (!res.ok) throw Object.assign(new Error(`The file could not be read (${res.status}).`), { status: res.status });
    const bytes = await res.blob();
    const viewType = mode === 'open' ? viewTypeFor(name) : '';
    const blob = new Blob([bytes], { type: viewType || mimeFor(name, bytes.type) });
    objectUrl = URL.createObjectURL(blob);
    if (viewType) {
      const w = window.open(objectUrl, '_blank', 'noopener');
      if (!w) {
        const host = document.getElementById('evFileError');
        if (host) { host.innerHTML = `The browser blocked the new tab. <a class="acct-inline-link" href="${D.escapeHtml(objectUrl)}" target="_blank" rel="noopener noreferrer">Open ${D.escapeHtml(name)}</a>`; host.hidden = false; }
      }
    } else {
      const a = document.createElement('a');
      a.href = objectUrl; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      if (mode === 'open') { const s = document.getElementById('evUpStatus'); if (s) s.textContent = `${name} is not a kind the browser can show, so it was downloaded.`; }
    }
  } catch (ex) { D.showError('evFileError', errText(ex, mode === 'open' ? 'Could not open that file.' : 'Could not download that file.')); }
  finally {
    btn.disabled = false; btn.textContent = orig;
    // The blob lives long enough for the tab or the save to take it.
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  }
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

let keyArmTimer = null;
async function revokeKey(keyId, label) {
  // First click arms the row, the second within six seconds revokes; no native dialog.
  if (ev.keyArm !== keyId) {
    ev.keyArm = keyId; paintKeys();
    clearTimeout(keyArmTimer);
    keyArmTimer = setTimeout(() => { if (ev.keyArm === keyId) { ev.keyArm = ''; paintKeys(); } }, 6000);
    return;
  }
  clearTimeout(keyArmTimer); ev.keyArm = '';
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

// No native confirm() on the domain card either: embedded browsers swallow
// those and the click looked dead. First click arms the button, the second
// within six seconds acts; it disarms itself otherwise.
let domArmTimer = null;
function armDomain(key) {
  ev.domArm = key; paintDomains();
  clearTimeout(domArmTimer);
  domArmTimer = setTimeout(() => { if (ev.domArm === key) { ev.domArm = ''; paintDomains(); } }, 6000);
}
function disarmDomain() { clearTimeout(domArmTimer); ev.domArm = ''; }

async function unbindDomain(host) {
  if (ev.domArm !== `unbind:${host}`) return armDomain(`unbind:${host}`);
  disarmDomain();
  D.showError('evDomainError', '');
  try { await post(`${ENV_URL}/domains/unbind`, { host }); await loadDomains(); }
  catch (ex) { paintDomains(); D.showError('evDomainError', errText(ex, 'Could not unbind that domain.')); }
}

async function removeDomain(host) {
  if (ev.domArm !== `remove:${host}`) return armDomain(`remove:${host}`);
  disarmDomain();
  D.showError('evDomainError', '');
  try { await post(`${ENV_URL}/domains/remove`, { host }); await loadDomains(); }
  catch (ex) { paintDomains(); D.showError('evDomainError', errText(ex, 'Could not remove that domain.')); }
}

// The link door: the name is checked in the linked account, the proof record
// planted there by the platform and read back; the note says how far it got.
async function linkDomain(btn) {
  D.showError('evDomainError', '');
  const host = (document.getElementById('evLinkHost')?.value || '').trim();
  const connectionId = document.getElementById('evLinkConn')?.value || '';
  if (!host) { D.showError('evDomainError', 'Enter the domain to link, e.g. www.example.com.'); return; }
  if (!connectionId) { D.showError('evDomainError', 'Pick the registrar account that holds the name.'); return; }
  btn.disabled = true;
  try {
    const r = await post(`${ENV_URL}/domains/link`, { host, connectionId });
    ev.linkNote = r.note || '';
    await loadDomains();
  } catch (ex) {
    btn.disabled = false;
    D.showError('evDomainError', errText(ex, 'That domain could not be linked.'));
  }
}

async function unlinkDomain(host) {
  D.showError('evDomainError', '');
  try { const r = await post(`${ENV_URL}/domains/unlink`, { host }); ev.linkNote = r.note || ''; await loadDomains(); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not unlink that domain.')); }
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

/* ---------- connected accounts ---------- */

// The credential leaves this form once, over the session, to the API, which
// proves it with the provider and vaults it. The inputs are cleared on every
// outcome so a rejected paste is not left sitting in the page.
async function addConnection(btn) {
  const p = providerOf(ev.connPick);
  if (!p || ev.connBusy) return;
  D.showError('evConnError', '');
  const fields = {};
  for (const f of p.fields) fields[f.key] = document.querySelector(`[data-conn-field="${f.key}"]`)?.value?.trim() || '';
  const label = document.getElementById('evConnLabel')?.value?.trim() || '';
  // Keep the name and the non-secret identifiers through a failed attempt;
  // secrets are never held in state.
  ev.connDraft = { label };
  for (const f of p.fields) if (!f.secret) ev.connDraft[f.key] = fields[f.key];
  const missing = p.fields.find(f => !fields[f.key]);
  if (missing) { D.showError('evConnError', `${missing.label} is required.`); document.querySelector(`[data-conn-field="${missing.key}"]`)?.focus(); return; }
  ev.connBusy = true; ev.connResult = ''; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections`, { provider: p.id, label, fields });
    ev.connPick = ''; ev.connDraft = {}; ev.connResult = d.note || `${d.connection?.label || p.label} is connected and verified.`;
    await loadConnections();
  } catch (ex) {
    ev.connBusy = false; paintConnections();
    // The provider's own sentence when it rejected the credential; the field
    // that was malformed gets focus.
    D.showError('evConnError', errText(ex, `Could not connect ${p.label}.`));
    if (ex?.data?.field) document.querySelector(`[data-conn-field="${ex.data.field}"]`)?.focus();
    return;
  }
  ev.connBusy = false; paintConnections();
}

async function testConnection(id) {
  if (!id || ev.connTesting) return;
  D.showError('evConnError', '');
  ev.connTesting = id; ev.connResult = ''; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/test`, { id });
    ev.connResult = d.connection?.message || (d.connection?.checked ? 'The provider accepted the credential.' : 'The provider rejected the credential.');
  } catch (ex) { D.showError('evConnError', errText(ex, 'Could not check that connection.')); }
  ev.connTesting = '';
  await loadConnections();
}

let connArmTimer = null;
async function removeConnection(id, label) {
  if (!id) return;
  // First click arms the row (no native dialog: embedded browsers swallow
  // those and the click looked dead). Second click within six seconds removes.
  if (ev.connArm !== id) {
    ev.connArm = id; ev.connResult = ''; paintConnections();
    clearTimeout(connArmTimer);
    connArmTimer = setTimeout(() => { if (ev.connArm === id) { ev.connArm = ''; paintConnections(); } }, 6000);
    return;
  }
  clearTimeout(connArmTimer); ev.connArm = '';
  D.showError('evConnError', '');
  try { await post(`${ENV_URL}/connections/remove`, { id }); ev.connResult = `${label} removed.`; await loadConnections(); }
  catch (ex) { D.showError('evConnError', errText(ex, 'Could not remove that connection.')); }
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
    if (a === 'lane-live') return void setLane('live');
    if (a === 'lane-sandbox') return void setLane('sandbox');
    if (a === 'sandbox-setup') return void setupSandbox(btn);
    if (a === 'export') return void exportEnvironment(btn);
    if (a === 'provision') return void provision();
    if (a === 'open') return void openFile(btn.dataset.name || '', btn, 'open');
    if (a === 'download') return void openFile(btn.dataset.name || '', btn, 'download');
    if (a === 'key-make') return void makeKey(btn);
    if (a === 'key-copy') return void copyKey(btn);
    if (a === 'key-revoke') return void revokeKey(btn.dataset.key || '', btn.dataset.label || 'this key');
    if (a === 'key-arm-cancel') { clearTimeout(keyArmTimer); ev.keyArm = ''; paintKeys(); return; }
    if (a === 'domain-add') return void addDomain(btn);
    if (a === 'domain-verify') return void verifyDomain(btn.dataset.host || '');
    if (a === 'domain-remove') return void removeDomain(btn.dataset.host || '');
    if (a === 'domain-bind') return void bindDomain(btn.dataset.host || '');
    if (a === 'domain-unbind') return void unbindDomain(btn.dataset.host || '');
    if (a === 'domain-copy') return void copyText(btn.dataset.text || '', btn);
    if (a === 'domain-link') return void linkDomain(btn);
    if (a === 'domain-unlink') return void unlinkDomain(btn.dataset.host || '');
    if (a === 'domain-arm-cancel') { disarmDomain(); paintDomains(); return; }
    if (a === 'domain-reg-check') return void regCheck();
    if (a === 'domain-reg-continue') { ev.reg.step = 'contact'; ev.reg.error = ''; paintDomains(); document.getElementById('evRegFirst')?.focus(); return; }
    if (a === 'domain-reg-pay') return void regPay();
    if (a === 'domain-reg-confirm') return void regConfirm();
    if (a === 'domain-reg-retry') return void retryRegistration(btn.dataset.order || '', btn.dataset.host || 'the name');
    if (a === 'domain-reg-fix') return void fixRegistrationContact(btn.dataset.order || '', btn.dataset.host || '');
    if (a === 'domain-reg-cancel') { ev.reg = freshReg(); paintDomains(); return; }
    if (a === 'conn-add') return void addConnection(btn);
    if (a === 'conn-test') return void testConnection(btn.dataset.id || '');
    if (a === 'conn-remove') return void removeConnection(btn.dataset.id || '', btn.dataset.label || 'this connection');
    if (a === 'conn-remove-cancel') { clearTimeout(connArmTimer); ev.connArm = ''; paintConnections(); return; }
  });

  document.addEventListener('change', (e) => {
    const t = e.target.closest?.('[data-env-toggle="domain-renew"]');
    if (t) setRenewal(t.dataset.host || '', !!t.checked, t);
    // Picking a provider redraws the form with that provider's own fields.
    if (e.target.id === 'evConnProvider') { ev.connPick = e.target.value || ''; ev.connResult = ''; paintConnections(); document.querySelector('[data-conn-field]')?.focus(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'evKeyLabel') { e.preventDefault(); document.querySelector('[data-env-action="key-make"]')?.click(); }
    if (e.key === 'Enter' && (e.target.id === 'evConnLabel' || e.target.matches?.('[data-conn-field]'))) { e.preventDefault(); document.querySelector('[data-env-action="conn-add"]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'evDomainHost') { e.preventDefault(); document.querySelector('[data-env-action="domain-add"]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'evRegHost') { e.preventDefault(); document.querySelector('[data-env-action="domain-reg-check"]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'evLinkHost') { e.preventDefault(); document.querySelector('[data-env-action="domain-link"]')?.click(); }
  });
}
