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

import { PRAG_API_BASE, STUDIO_URL, LANE } from '../runtime/config.js';
import { tierName } from '../components/tierCopy.js';
import { explainLink, writeClipboard } from '../components/explainer.js';
import { stripeAppearance } from '../api/stripeAppearance.js';
import { ensureStripeJs } from '../runtime/stripeLoader.js';
import { ico, iconBtn, cardHtml as sharedCard, isOpen, setOpen, initCards } from './cards.js';

const TENANT_URL = `${PRAG_API_BASE}/tenant`;
const ENV_URL = `${PRAG_API_BASE}/environment`;
const ORDERS_CHECKOUT_URL = `${PRAG_API_BASE}/orders/checkout`;
const TEAM_KEY = 'pragoptics_team_id';   // written by team.js; read here so both sections mean the same team
const SEAT_ROLES = new Set(['owner', 'admin', 'developer', 'member']);
const DOMAIN_ROLES = new Set(['owner', 'admin', 'developer']);   // who connects, verifies and removes a domain

const LANE_KEY = 'pragoptics_env_lane';   // the lane the person was looking at; survives a section re-render
function cardHtml(o) { return sharedCard({ ...o, key: `environment:${o.key}` }); }
function openState() { return {}; }
function countWord(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

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
function freshReg() { return { host: '', quote: null, step: 'idle', error: '', busy: false, contact: {}, order: null, stripe: null, elements: null, polls: 0, retryOrderId: '', editContact: false }; }

/** The registrant from the billing profile the customer already gave at subscription; nothing is asked twice. */
function contactFromBilling() {
  const p = D.cachedPing?.() || {};
  const b = p.billingProfile || {};
  const name = String(b.customerName || '').trim();
  const sp = name.indexOf(' ');
  return {
    nameFirst: sp > 0 ? name.slice(0, sp) : name, nameLast: sp > 0 ? name.slice(sp + 1) : '', organization: '',
    email: String(b.primaryEmail || p.user?.email || ''), phone: String(b.phone || ''),
    address1: String(b.addressLine1 || ''), address2: String(b.addressLine2 || ''), city: String(b.city || ''), state: String(b.state || ''),
    postalCode: String(b.postalCode || ''), country: String(b.country || 'US').toUpperCase()
  };
}
function contactComplete(c) {
  return !!(c.nameFirst && c.nameLast && c.email && c.phone && c.address1 && c.city && c.postalCode && c.country && (c.country !== 'US' || c.state));
}
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
  ev.connections = null; ev.connProviders = []; ev.connNote = ''; ev.connPick = ''; ev.connBusy = false; ev.connResult = ''; ev.connTesting = ''; ev.connDraft = {}; ev.connArm = ''; ev.rowNote = null; ev.shopifyShop = ''; ev.shopifyLink = ''; ev.shopifyLinkId = ''; ev.connSyncing = ''; ev.rowNote = null;
  ev.tables = null; ev.tablesNote = ''; ev.table = ''; ev.rows = null; ev.rowsAfter = ''; ev.rowsNote = ''; ev.openRow = ''; ev.rowsLoading = false;
  ev.ai = null; ev.aiNote = ''; ev.aiBusy = false;
  ev.domTab = ev.domTab || 'connect'; initCards();
  // A link that names a card (/#account?section=environment&card=connections) opens that card; account.js scrolls to it.
  try { const want = JSON.parse(sessionStorage.getItem('pragoptics_open_card') || 'null'); const card = { files: 'files', connections: 'connections', domains: 'domains', keys: 'keys', ai: 'ai', data: 'data' }[String(want?.card || '')]; if (card) setOpen(`environment:${card}`, true); } catch { /* fine */ }
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
      await Promise.all([loadFiles(), loadTables(), ...(ev.lane === 'live' ? [loadDomains(), loadAi()] : []), loadKeys(), loadConnections()]);
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
    setTimeout(() => { handleProviderReturn(); }, 0);
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
    ? (laneReady(ev.view.tenant) ? `<div id="evFiles">${filesHtml()}</div><div id="evData">${dataHtml()}</div><div id="evConnections">${connectionsHtml()}</div><div id="evKeys">${keysHtml()}</div>` : sandboxSetupHtml(ev.view))
    : `<div id="evFiles">${filesHtml()}</div><div id="evData">${dataHtml()}</div><div id="evAi">${aiHtml()}</div><div id="evConnections">${connectionsHtml()}</div><div id="evDomains">${domainsHtml()}</div><div id="evKeys">${keysHtml()}</div>`;
  host.innerHTML = `
    ${summaryHtml(ev.view)}
    ${ready ? `<div class="ev-cards">${cards}</div>` : ''}
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
      <button class="ev-lane ${ev.lane === 'live' ? 'is-on' : ''}" type="button" role="tab" aria-selected="${ev.lane === 'live'}" data-env-action="lane-live" title="What your programs and your customers use">Live</button>
      <button class="ev-lane ${ev.lane === 'sandbox' ? 'is-on' : ''}" type="button" role="tab" aria-selected="${ev.lane === 'sandbox'}" data-env-action="lane-sandbox" title="Build and test here. Nothing touches live.">Sandbox${tag}</button>

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
  // Every owner gets an environment (2026-09-16): pooled storage on Free, the
  // plan's own storage on a paid plan. A missing one is being set up.
  if (view.provisioning || view.needsSubscription) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Your environment is being set up.</h3>
        <p class="acct-card-note">It happens on its own within a moment of signing in: a place for your data, your files and your keys, with the allowance your plan carries. Press Refresh, or set it up now.</p>
        <div class="acct-actions-row"><button class="btn" type="button" data-env-action="provision">Set it up now</button><button class="btn btn-sm" type="button" data-env-action="refresh">Refresh</button></div>
        <p class="acct-error" id="evProvError" hidden></p>
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
  const l = lanesOf(t);
  const w = (l && l[ev.lane] && l[ev.lane].storage) || { kind: s.kind, account: s.account };
  const whereTag = ev.lane === 'sandbox' && sandboxState(t)?.phase !== 'READY' ? '' : w.kind === 'dedicated'
    ? `<span class="acct-tag is-verified" title="This lane lives in its own Azure storage account${w.account ? `, ${e(w.account)}` : ''}: nothing shared with any other customer.">own storage</span>`
    : w.kind ? '<span class="acct-tag" title="This lane lives in a private partition of the platform\'s storage account.">shared storage</span>' : '';
  return `
    <section class="acct-card ev-summary">
      <div class="ev-head">
        <div class="ev-id">
          <div class="ev-tags"><span class="acct-tag is-primary">${e(tierName(t.tier))}</span>${phaseTag(phase)}<span class="acct-tag">${e(cap(me.role || 'viewer'))}</span></div>
          <h3 class="acct-card-h ev-name">${e(name || (isOwner ? 'Your environment' : 'Team environment'))}</h3>
          <p class="ev-owner adm-muted">${e(t.ownerEmail || '')}</p>
        </div>
        <div class="ev-actions">
          ${(me.role === 'owner' || me.role === 'admin') && (phase === 'READY' || phase === 'SUSPENDED') ? iconBtn('export', 'download', 'Download everything in this environment as one file') : ''}
          ${iconBtn('refresh', 'refresh', 'Refresh')}
        </div>
      </div>
      ${phase === 'READY' || phase === 'SUSPENDED' ? `
      ${laneSwitchHtml(t)}
      <div class="use-row ev-meter">
        <div class="use-head">
          <span class="use-name">Storage ${whereTag}</span>
          <span class="use-val">${e(used > 0 && used < 0.05 * 1024 ** 3 ? bytesFmt(used) : gb(used))} / ${e(gb(limit))}</span>${isOwner ? `<button class="ev-more" type="button" data-acct-section="subscription" data-tip="Storage grows with the plan, and with the storage add-on on the User plan">More storage</button>` : ''}
        </div>
        <div class="use-track"><div class="use-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      ${pct >= 70 ? `<p class="acct-card-note ev-note">${pct >= 95 ? 'Almost full.' : 'Filling up.'} A write past the allowance plus ${e(gb(s.graceBytes || Math.ceil(limit * 0.1)))} of grace is refused; nothing is ever deleted to make room.</p>` : ''}
      <span class="ev-status" id="evExportStatus" aria-live="polite"></span><p class="acct-error" id="evExportError" hidden></p>
      ${phase === 'SUSPENDED' ? `<p class="acct-error ev-note">This environment is paused${t.suspendReason === 'closed' ? ' because the account was closed' : ' because the subscription ended'}. Everything in it can still be read and downloaded, nothing new can be written.${t.keepUntil ? ` It is kept until ${e(D.fmtDate(t.keepUntil))}, then removed.` : ''}${t.suspendReason === 'closed' ? '' : ' Restore a paid plan on Billing and it resumes exactly as it was.'}</p>` : ''}` : ''}
      ${stalled ? `
      <p class="acct-card-note ev-note">${phase === 'PROVISIONING'
        ? `Setup started and did not finish${t.provisionNote ? `: ${e(t.provisionNote)}` : ''}. It completes on its own within minutes; ${isOwner ? 'you can also finish it now.' : 'the owner can also finish it now.'}`
        : `No storage has been set up for this team yet. ${isOwner ? 'It happens on its own when a paid invoice settles; you can also start it now.' : 'The owner starts it, or it happens when their invoice settles.'}`}</p>
      ${isOwner ? `<div class="acct-actions-row"><button class="btn" type="button" data-env-action="provision">${phase === 'PROVISIONING' ? 'Finish setup' : 'Set up storage'}</button></div>` : ''}
      <p class="acct-error" id="evProvError" hidden></p>` : ''}
    </section>`;
}

/* ---------- data (2026-09-19: everything the environment holds is readable from its page) ---------- */

function paintData() { const h = document.getElementById('evData'); if (h) h.innerHTML = dataHtml(); }
async function loadTables() {
  try {
    const d = await D.apiFetch(url(`${ENV_URL}/data`));
    ev.tables = d.tables || [];
    ev.tablesNote = '';
  } catch (ex) {
    ev.tables = [];
    ev.tablesNote = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Could not list the tables.'));
  }
  paintData();
}
/** The rows of one table, fifty at a time; `more` continues from the last key. */
async function loadRows(table, more = false) {
  if (!table) return;
  if (!more) { ev.table = table; ev.rows = null; ev.rowsAfter = ''; ev.openRow = ''; }
  ev.rowsLoading = true; ev.rowsNote = ''; paintData();
  try {
    const d = await D.apiFetch(url(`${ENV_URL}/data/${encodeURIComponent(table)}`, { values: 1, limit: 50, after: more ? ev.rowsAfter : '' }));
    const items = d.items || [];
    ev.rows = more ? [...(ev.rows || []), ...items] : items;
    ev.rowsAfter = d.nextAfter || '';
  } catch (ex) {
    if (!more) ev.rows = [];
    ev.rowsNote = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Could not read that table.'));
  }
  ev.rowsLoading = false;
  paintData();
}
function closeTable() { ev.table = ''; ev.rows = null; ev.rowsAfter = ''; ev.openRow = ''; ev.rowsNote = ''; paintData(); }
function valueText(v) { try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { return String(v); } }
/** A field's name as a label: productId -> Product id, image_alt -> Image alt. */
function labelOf(k) { const s = String(k).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function isImageUrl(v, k = '') { return typeof v === 'string' && /^https?:\/\//i.test(v) && (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(v) || /image|photo|thumbnail|picture/i.test(String(k))); }
function isUrl(v) { return typeof v === 'string' && /^https?:\/\/\S+$/i.test(v) && v.length < 2000; }
/**
 * A stored value as a card (2026-09-19, Cameron: not JSON). An object is a
 * list of labeled fields; a nested object indents; an array of objects is a
 * small table (a product's variants); an array of plain values is a row of
 * chips; an image address shows the image; an address is a link. Copy still
 * gives the JSON.
 */
function valueCardHtml(v, depth = 0) {
  const e = D.escapeHtml;
  if (v == null || v === '') return '<span class="adm-muted">empty</span>';
  if (typeof v !== 'object') return isImageUrl(v) ? `<a href="${e(v)}" target="_blank" rel="noopener"><img class="ev-thumb" src="${e(v)}" alt=""></a>` : isUrl(v) ? `<a class="ev-link" href="${e(v)}" target="_blank" rel="noopener">${e(v)}</a>` : `<span class="ev-val-text">${e(String(v))}</span>`;
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="adm-muted">none</span>';
    if (v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys = [...new Set(v.flatMap(x => Object.keys(x)))].filter(k => !/^(id)$/i.test(k) || v.every(x => Object.keys(x).length <= 2)).slice(0, 8);
      return `<div class="adm-table-scroll ev-sub-table"><table class="adm-table adm-table--wrap ev-table"><thead><tr>${keys.map(k => `<th>${e(labelOf(k))}</th>`).join('')}</tr></thead><tbody>${v.slice(0, 50).map(x => `<tr>${keys.map(k => `<td data-th="${e(labelOf(k))}">${typeof x[k] === 'object' && x[k] !== null ? valueCardHtml(x[k], depth + 1) : e(x[k] == null ? '' : typeof x[k] === 'boolean' ? (x[k] ? 'yes' : 'no') : String(x[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${v.length > 50 ? `<p class="adm-muted lic-desc">and ${v.length - 50} more</p>` : ''}`;
    }
    return `<span class="ev-chips">${v.slice(0, 40).map(x => `<span class="acct-tag">${e(typeof x === 'object' ? JSON.stringify(x) : String(x))}</span>`).join('')}</span>`;
  }
  const entries = Object.entries(v);
  if (!entries.length) return '<span class="adm-muted">empty</span>';
  // an image field leads the card
  const imgKey = entries.find(([k, x]) => isImageUrl(x, k))?.[0];
  const rows = entries.filter(([k]) => k !== imgKey).map(([k, x]) => `<div class="ev-kv-row"><dt class="ev-kv-k">${e(labelOf(k))}</dt><dd class="ev-kv-v">${typeof x === 'boolean' ? (x ? 'yes' : 'no') : valueCardHtml(x, depth + 1)}</dd></div>`).join('');
  return `<div class="ev-kv ${depth ? 'is-nested' : ''}">${imgKey ? `<a class="ev-kv-img" href="${e(v[imgKey])}" target="_blank" rel="noopener"><img class="ev-thumb is-lead" src="${e(v[imgKey])}" alt="${e(String(v.imageAlt || v.alt || v.title || ''))}"></a>` : ''}<dl class="ev-kv-list">${rows}</dl></div>`;
}
/** One line of a value for the row: a string as itself, an object by its title, name or first keys. */
function valuePeek(v) {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  const pick = ['title', 'name', 'label', 'email', 'id'].find(k => typeof v[k] === 'string' && v[k]);
  if (pick) return String(v[pick]);
  const keys = Object.keys(v);
  return keys.length ? `{ ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''} }` : '{ }';
}

function dataHtml() {
  const e = D.escapeHtml;
  const tables = ev.tables;
  const summary = tables == null ? 'loading' : !tables.length ? 'no tables yet' : ev.table ? `${e(ev.table)}${ev.rows ? ` · ${countWord(ev.rows.length, 'row', 'rows')}${ev.rowsAfter ? '+' : ''}` : ''}` : countWord(tables.length, 'table', 'tables');
  let body;
  if (tables == null) body = '<p class="acct-loading">Loading tables…</p>';
  else if (!tables.length) body = '<p class="acct-empty">No data yet. The software, your site and your API keys write tables here; a connected supplier\'s products land in supplier_products.</p>';
  else if (!ev.table) body = `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Table</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${tables.map(t => `
              <tr>
                <td class="cell-ellip ev-name-cell" data-th="Table">${e(t.table)}</td>
                <td class="cell-tight adm-muted" data-th="Updated">${t.updatedAt ? e(D.fmtDate(t.updatedAt)) : ''}</td>
                <td class="cell-tight ev-actions-cell">${iconBtn('data-open', 'external', 'Open the table', `data-table="${e(t.table)}"`)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  else {
    const rows = ev.rows;
    body = `
      <div class="ev-data-head">
        <button class="btn btn-sm ev-btn-ico" type="button" data-env-action="data-close">${ico('chevron')}<span>All tables</span></button>
        <span class="ev-name-cell">${e(ev.table)}</span>
        ${iconBtn('data-reload', 'refresh', 'Reload the rows', `data-table="${e(ev.table)}"`)}
      </div>
      ${rows == null ? '<p class="acct-loading">Reading rows…</p>' : !rows.length ? '<p class="acct-empty">This table is empty.</p>' : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Key</th><th>Value</th><th class="adm-num">Size</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="cell-ellip ev-name-cell" data-th="Key" title="${e(r.key)}">${e(r.key)}</td>
                <td class="cell-ellip" data-th="Value" title="${e(valuePeek(r.value))}">${e(valuePeek(r.value))}</td>
                <td class="adm-num cell-tight" data-th="Size">${e(bytesFmt(r.size))}</td>
                <td class="cell-tight adm-muted" data-th="Updated">${r.updatedAt ? e(D.fmtDate(r.updatedAt)) : ''}</td>
                <td class="cell-tight ev-actions-cell">${iconBtn('data-row', ev.openRow === r.key ? 'x' : 'external', ev.openRow === r.key ? 'Close the value' : 'Show the value', `data-key="${e(r.key)}"`)}${iconBtn('domain-copy', 'copy', 'Copy the value', `data-text="${e(valueText(r.value))}"`)}</td>
              </tr>${ev.openRow === r.key ? `
              <tr class="ev-note-row" data-row="value"><td colspan="5" data-th="Value"><div class="ev-value-card">${valueCardHtml(r.value)}</div></td></tr>` : ''}`).join('')}
          </tbody>
        </table>
      </div>
      ${ev.rowsAfter ? `<div class="acct-actions-row ev-note"><button class="btn btn-sm" type="button" data-env-action="data-more" ${ev.rowsLoading ? 'disabled' : ''}>${ev.rowsLoading ? 'Reading…' : 'Next 50 rows'}</button></div>` : ''}`}`;
  }
  return cardHtml({
    key: 'data', icon: 'database', title: 'Data', summary,
    explain: explainLink('environment', 'What the environment holds'),
    body: `${ev.tablesNote ? `<p class="acct-error">${e(ev.tablesNote)}</p>` : ''}${ev.rowsNote ? `<p class="acct-error">${e(ev.rowsNote)}</p>` : ''}${body}`
  });
}

/* ---------- AI (2026-09-19): the switch, the credit, the lanes ---------- */

function paintAi() { const h = document.getElementById('evAi'); if (h) h.innerHTML = aiHtml(); }
async function loadAi() {
  try { ev.ai = await D.apiFetch(url(`${ENV_URL}/ai`)); ev.aiNote = ''; }
  catch (ex) {
    ev.ai = null;
    ev.aiNote = ex?.status === 404 ? 'AI is not on this lane yet.' : (ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Could not read the AI state.')));
  }
  paintAi();
}
function cents(n) { const v = Number(n || 0); return v >= 100 ? `$${(v / 100).toFixed(2)}` : `${v % 1 ? v.toFixed(2) : v}¢`; }
function dollars(n) { const c = Number(n || 0); return c > 0 && c < 1 ? `${c.toFixed(2)}¢` : `$${(c / 100).toFixed(2)}`; }
async function setAi(on) {
  if (ev.aiBusy) return;
  ev.aiBusy = true; paintAi();
  D.showError('evAiError', '');
  try { await post(`${ENV_URL}/ai/${on ? 'enable' : 'disable'}`, {}); ev.aiBusy = false; await loadAi(); }
  catch (ex) { ev.aiBusy = false; paintAi(); D.showError('evAiError', errText(ex, on ? 'Could not turn AI on.' : 'Could not turn AI off.')); }
}

function aiHtml() {
  const e = D.escapeHtml, a = ev.ai;
  const manage = ['owner', 'admin'].includes(ev.view?.membership?.role);
  let summary, inner;
  if (!a) { summary = ev.aiNote ? 'not on this lane' : 'loading'; inner = ev.aiNote ? `<p class="acct-empty">${e(ev.aiNote)}</p>` : '<p class="acct-loading">Loading…</p>'; }
  else {
    const c = a.credit || {}, on = !!a.enabled, ready = !!a.provider?.configured;
    const used = Number(c.usedCents || 0), limit = Number(c.limitCents || 0);
    const pct = limit ? Math.min(100, used / limit * 100) : 0;
    const cls = pct >= 95 ? 'is-hot' : pct >= 70 ? 'is-warn' : '';
    const callLine = c.callLimit ? `${e(String(c.calls || 0))} of ${e(String(c.callLimit))} calls` : `${e(String(c.calls || 0))} calls`;
    summary = !ready ? 'being set up' : !on ? 'off' : `on · ${e(dollars(used))} of ${e(dollars(limit))} this month`;
    inner = `
      ${!ready ? '<p class="acct-card-note">AI is being set up on the platform. Nothing to do on your side; the switch appears here when it is ready.</p>' : `
      <div class="ev-ai-row">
        <label class="ev-switch ${manage ? '' : 'is-locked'}" data-tip="${manage ? (on ? 'Turn AI off for this environment' : 'Turn AI on for this environment') : 'The owner or an admin turns it on or off'}">
          <input type="checkbox" role="switch" data-env-switch="ai" ${on ? 'checked' : ''} ${manage && !ev.aiBusy ? '' : 'disabled'} aria-label="AI for this environment">
          <span class="ev-switch-track" aria-hidden="true"><span class="ev-switch-thumb"></span></span>
          <span class="ev-switch-text">${ev.aiBusy ? 'Saving…' : on ? 'AI is on' : 'AI is off'}</span>
        </label>
      </div>
      <div class="use-row ev-meter">
        <div class="use-head"><span class="use-name">This month's credit</span><span class="use-val">${e(dollars(used))} / ${e(dollars(limit))} · ${callLine}</span></div>
        <div class="use-track"><div class="use-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <p class="acct-card-note ev-note">Every call is priced at the model's rate and paid from this plan's monthly credit, which renews on the first. ${c.callLimit ? `The Free plan carries ${e(String(c.callLimit))} calls a month; AI continues on the User plan.` : 'A higher plan carries more.'}</p>
      ${(a.lanes || []).length ? `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Model</th><th>Runs</th><th class="adm-num">Per exchange</th><th class="adm-num">Spent</th></tr></thead>
          <tbody>
            ${a.lanes.map(l => { const s = (a.byLane || {})[l.lane] || {}; return `
              <tr>
                <td data-th="Model"><span class="lic-name">${e(cap(l.lane))}</span>${l.lane === a.defaultLane ? ' <span class="acct-tag is-primary">default</span>' : ''}<br><span class="adm-muted lic-desc">${e(l.model)}</span></td>
                <td class="cell-tight" data-th="Runs">${e(String(s.calls || 0))}</td>
                <td class="adm-num cell-tight" data-th="Per exchange">${e(cents(l.exchangeCents))}</td>
                <td class="adm-num cell-tight" data-th="Spent">${e(dollars((s.spendMicro || 0) / 10000))}</td>
              </tr>`; }).join('')}
          </tbody>
        </table>
      </div>
      <p class="acct-card-note ev-note">Per exchange is a typical question and answer, about 2,000 words in and 400 out. The software and your API keys pick the model on each call.</p>` : ''}`}`;
  }
  return cardHtml({
    key: 'ai', icon: 'activity', title: 'AI', summary,
    explain: explainLink('ai', 'How the AI credit works'),
    body: `<p class="acct-error" id="evAiError" hidden></p>${inner}`
  });
}

/* ---------- files ---------- */

function filesHtml() {
  const e = D.escapeHtml;
  const rows = ev.files;
  const total = (rows || []).reduce((s, f) => s + Number(f.size || 0), 0);
  const summary = rows == null ? 'loading' : !rows.length ? 'none yet' : `${countWord(rows.length, 'file', 'files')} · ${e(bytesFmt(total))}`;
  const list = rows == null ? '<p class="acct-loading">Loading files…</p>'
    : !rows.length ? `<p class="acct-empty">No files yet. The software puts its builds, images and exports here.</p>`
    : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Name</th><th class="adm-num">Size</th><th>Modified</th><th></th></tr></thead>
          <tbody>
            ${rows.map(f => `
              <tr>
                <td class="cell-ellip ev-name-cell" data-th="Name" title="${e(f.name)}${f.contentType ? ` · ${e(f.contentType)}` : ''}">${e(f.name)}${f.committed ? '' : ' <span class="acct-tag is-pending" title="Uploaded but never confirmed. The nightly check settles it; uploading it again also does.">unconfirmed</span>'}</td>
                <td class="adm-num cell-tight" data-th="Size">${e(bytesFmt(f.size))}</td>
                <td class="cell-tight adm-muted" data-th="Modified">${e(D.fmtDate(f.lastModified))}</td>
                <td class="cell-tight ev-actions-cell">
                  ${viewTypeFor(f.name) ? iconBtn('open', 'external', 'Open in a new tab', `data-name="${e(f.name)}"`) : ''}
                  ${iconBtn('download', 'download', 'Download', `data-name="${e(f.name)}"`)}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${ev.filesTruncated ? `<p class="acct-card-note">Showing the first ${rows.length}. The API lists the rest by prefix.</p>` : ''}`;
  return cardHtml({
    key: 'files', icon: 'folder', title: 'Files', summary,
    body: `
      ${ev.filesNote ? `<p class="acct-error">${e(ev.filesNote)}</p>` : ''}
      <span class="ev-status" id="evUpStatus" aria-live="polite"></span>
      <p class="acct-error" id="evFileError" hidden></p>
      ${list}`
  });
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
      <dt>Name</dt><dd><code>${e(rec.name)}</code></dd><dd><button class="btn btn-sm btn-ico" type="button" data-env-action="domain-copy" data-text="${e(rec.name)}" aria-label="Copy" data-tip="Copy">${ico('copy')}</button></dd>
      <dt>${rec.type === 'CNAME' ? 'Target' : 'Value'}</dt><dd><code>${e(rec.value || rec.target || '')}</code></dd><dd><button class="btn btn-sm btn-ico" type="button" data-env-action="domain-copy" data-text="${e(rec.value || rec.target || '')}" aria-label="Copy" data-tip="Copy">${ico('copy')}</button></dd>
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
  if (d.hosted) {
    body = hostedBodyHtml(d);
  } else if (!verified) {
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
        ${d.hosted ? hostedTag(d.hosted) : domainTag(d)}
        ${linked ? '<span class="acct-tag">linked</span>' : d.registrar ? '<span class="acct-tag">registered here</span>' : ''}
        ${d.addedBy ? `<span class="ev-dom-when">connected by ${e(d.addedBy)} ${e(D.fmtDate(d.addedAt))}</span>` : ''}
      </div>
      ${body}
      ${manage ? `
      <div class="ev-dom-actions">
        ${verified || (d.hosted && d.hosted.phase !== 'MANAGED') ? '' : `<button class="btn btn-sm" type="button" data-env-action="domain-verify" data-host="${e(d.host)}" ${checking ? 'disabled' : ''}>${checking ? 'Checking…' : 'Verify'}</button>`}
        ${verified && hosted ? (bs === 'BOUND'
          ? twoStep('unbind', 'Unbind', 'Stop serving here?')
          : `<button class="btn btn-sm" type="button" data-env-action="domain-bind" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : bs === 'BINDING' ? 'Check' : bs === 'BIND_FAILED' ? 'Try again' : 'Bind'}</button>`) : ''}
        ${d.hosted ? twoStep('dns-cancel', 'Hand DNS back', 'Hand it back for sure?') : ''}
        ${linked ? `<button class="btn btn-sm" type="button" data-env-action="domain-unlink" data-host="${e(d.host)}">Unlink</button>` : ''}
        ${twoStep('remove', 'Remove', 'Remove for sure?')}
      </div>` : ''}
    </div>`;
}

/** The link door: a name held at a registrar account connected under Connected accounts. */
function linkDoorHtml(full) {
  const e = D.escapeHtml;
  const conns = dnsConnections();
  if (!conns.length) return '';
  return `
    <div class="ev-dom-row ev-dom-link">
      <select class="acct-input acct-select" id="evLinkConn" aria-label="Registrar account">${conns.map(c => `<option value="${e(c.id)}">${e(c.label)} (${e(providerLabel(c.provider))})</option>`).join('')}</select>
      <input class="acct-input" type="text" id="evLinkHost" maxlength="253" placeholder="www.example.com" autocomplete="off" spellcheck="false" autocapitalize="off" ${full ? 'disabled' : ''} />
      <button class="btn" type="button" data-env-action="domain-link" ${full ? 'disabled' : ''}>Link</button>
    </div>
    <p class="acct-card-note ev-dom-door">A name held in that registrar account. The platform writes its records itself; nothing to paste.</p>
    ${ev.linkNote ? `<p class="acct-card-note">${e(ev.linkNote)}</p>` : ''}`;
}

/** The DNS door (2026-09-16): a domain from anywhere, its settings managed by the platform from one button. */
function dnsDoorHtml(full) {
  const e = D.escapeHtml;
  const s = ev.dnsDoor || {};
  return `
    <div class="ev-dom-row ev-dom-host-door">
      <input class="acct-input" type="text" id="evDnsHost" maxlength="253" placeholder="example.com" autocomplete="off" spellcheck="false" autocapitalize="off" ${full || s.busy ? 'disabled' : ''} />
      <button class="btn" type="button" data-env-action="domain-dns-start" ${full || s.busy ? 'disabled' : ''}>${s.busy ? 'Looking it up…' : 'Manage its DNS here'}</button>
    </div>
    <p class="acct-card-note ev-dom-door">The domain stays where you bought it. Its settings move here, nothing changes until you say so, and you can hand it back any time.</p>
    ${s.note ? `<p class="acct-card-note">${e(s.note)}</p>` : ''}`;
}
/** The tag on a row the DNS door touched. */
function hostedTag(h) {
  const p = String(h?.phase || '').toUpperCase();
  if (p === 'MANAGED') return '<span class="acct-tag is-verified">DNS managed here</span>';
  if (p === 'SWITCHING') return '<span class="acct-tag is-pending">switching DNS</span>';
  if (p === 'MOVED') return '<span class="acct-tag is-bad">DNS moved away</span>';
  return '<span class="acct-tag is-pending">DNS copied, not switched</span>';
}
/** The records the platform holds for a domain, as plain rows. */
function hostedRecordsHtml(host) {
  const e = D.escapeHtml;
  const r = (ev.dnsRecs || {})[host];
  if (!r) return '';
  const label = { website: 'Website', email: 'Email', verification: 'Verification', other: 'Other' };
  const rows = (r.records || []).map(x => `<tr><td data-th="Row">${e(label[x.kind] || 'Other')}</td><td data-th="Name"><code>${e(x.name)}</code></td><td data-th="Type"><code>${e(x.type)}</code></td><td class="cell-ellip" data-th="Value" title="${e(x.content || '')}"><code>${e(x.type === 'MX' ? `${x.priority ?? ''} ${x.content}` : x.content || '')}</code></td></tr>`).join('');
  return `
    <div class="adm-table-scroll ev-dom-recs">
      <table class="adm-table adm-table--wrap">
        <thead><tr><th>Row</th><th>Name</th><th>Type</th><th>Value</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No records yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}
/** What a row the DNS door touched says, by phase. */
function hostedBodyHtml(d) {
  const e = D.escapeHtml;
  const h = d.hosted || {};
  const phase = String(h.phase || 'REVIEW').toUpperCase();
  const busy = ev.dnsBusy === d.host;
  const shown = !!(ev.dnsRecs || {})[d.host];
  const note = (ev.dnsNote || {})[d.host] || '';
  const ns = (h.nameServers || []).map(n => `<li><code>${e(n)}</code> <button class="btn btn-sm btn-ico" type="button" data-env-action="domain-copy" data-text="${e(n)}" aria-label="Copy" data-tip="Copy">${ico('copy')}</button></li>`).join('');
  const recordsBtn = `<button class="btn btn-sm" type="button" data-env-action="domain-dns-records" data-host="${e(d.host)}">${shown ? 'Hide records' : 'Show records'}</button>`;
  const more = phase === 'REVIEW' || phase === 'SWITCHING' ? `
      <details class="ev-dom-more"><summary>Add records we did not find</summary>
        <p class="acct-card-note ev-dom-note">Paste a zone file exported from where the domain lives today, or type names we should look up, one per line (for example <code>intranet</code>).</p>
        <textarea class="acct-input ev-dom-zonefile" id="evDnsFile-${e(d.host)}" rows="4" placeholder="Zone file (optional)"></textarea>
        <textarea class="acct-input ev-dom-names" id="evDnsNames-${e(d.host)}" rows="2" placeholder="Names, one per line (optional)"></textarea>
        <div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-dns-add" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>Add</button></div>
      </details>` : '';
  let body = '';
  if (phase === 'REVIEW') {
    body = `
      <p class="acct-card-note ev-dom-note">Copied ${e(String(h.recordCount || 0))} record${h.recordCount === 1 ? '' : 's'} from ${e(h.dnsHost || 'the current host')}${h.registrar ? `, a domain bought at ${e(h.registrar)}` : ''}. <b>Nothing has changed for ${e(d.host)} yet.</b> Look the records over, then switch.</p>
      ${h.lastError ? `<p class="acct-error ev-dom-note">${e(h.lastError)}</p>` : ''}
      ${hostedRecordsHtml(d.host)}
      ${more}
      <div class="ev-dom-actions">${recordsBtn}<button class="btn" type="button" data-env-action="domain-dns-switch" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : 'Switch to PragOptics'}</button></div>`;
  } else if (phase === 'SWITCHING') {
    const byPlatform = String(h.switchedBy || '').startsWith('platform:') || String(h.switchedBy || '').startsWith('connection:');
    body = byPlatform ? `
      <p class="acct-card-note ev-dom-note">The nameservers were set at ${e(h.registrar || 'your registrar')}. <b>Checking.</b> This usually takes a few minutes and can take up to a day. Everything keeps working while we wait.</p>
      ${hostedRecordsHtml(d.host)}
      <div class="ev-dom-actions">${recordsBtn}<button class="btn btn-sm" type="button" data-env-action="domain-dns-check" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Check now'}</button></div>` : `
      <p class="acct-card-note ev-dom-note">Sign in at ${e(h.registrar || 'your registrar')} and paste these lines where it says <b>nameservers</b>, replacing what is there. Then press I did it.</p>
      <ul class="ev-dom-ns">${ns}</ul>
      ${h.lastError ? `<p class="acct-error ev-dom-note">${e(h.lastError)}</p>` : ''}
      ${hostedRecordsHtml(d.host)}
      ${more}
      <div class="ev-dom-actions">${recordsBtn}<button class="btn" type="button" data-env-action="domain-dns-check" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'I did it'}</button></div>`;
  } else if (phase === 'MANAGED') {
    body = `
      <p class="acct-card-note ev-dom-note">Managed by PragOptics${h.managedAt ? ` since ${e(D.fmtDate(h.managedAt))}` : ''}. Email, your website and the software's address are set here from now on; the domain itself stays at ${e(h.registrar || 'your registrar')}.</p>
      ${hostedRecordsHtml(d.host)}
      <div class="ev-dom-actions">${recordsBtn}</div>`;
  } else {
    body = `
      <p class="acct-error ev-dom-note">${e(h.lastError || `${d.host} no longer answers from PragOptics.`)}</p>
      <p class="acct-card-note ev-dom-note">Point it back at these nameservers to keep it managed here, or hand it back.</p>
      <ul class="ev-dom-ns">${ns}</ul>
      ${hostedRecordsHtml(d.host)}
      <div class="ev-dom-actions">${recordsBtn}<button class="btn btn-sm" type="button" data-env-action="domain-dns-check" data-host="${e(d.host)}" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Check now'}</button></div>`;
  }
  if (note) body += `<p class="acct-card-note ev-dom-note">${e(note)}</p>`;
  if ((ev.dnsBack || {})[d.host]) body += `<p class="acct-card-note ev-dom-note">To hand it back, first set these nameservers at ${e(h.registrar || 'your registrar')} again, wait for the change to show, then press Hand DNS back once more.</p><ul class="ev-dom-ns">${(ev.dnsBack[d.host] || []).map(n => `<li><code>${e(n)}</code> <button class="btn btn-sm btn-ico" type="button" data-env-action="domain-copy" data-text="${e(n)}" aria-label="Copy" data-tip="Copy">${ico('copy')}</button></li>`).join('')}</ul>`;
  return body;
}

function domainsHtml() {
  const e = D.escapeHtml;
  const manage = canManageDomains();
  const rows = ev.domains;
  const limit = ev.domainLimit;
  const full = rows && limit && rows.length >= limit;
  const regs = ev.registrations || [];
  const summary = rows == null ? 'loading' : !rows.length && !regs.length ? 'none yet' : `${countWord(rows.length, 'domain', 'domains')}${limit ? ` of ${limit}` : ''}${regs.length ? ` · ${countWord(regs.length, 'registering', 'registering')}` : ''}`;
  const list = rows == null ? '<p class="acct-loading">Loading domains…</p>'
    : !rows.length ? (regs.length ? '' : `<p class="acct-empty">No domain yet.</p>`)
    : `<div class="ev-domains">${rows.map(domainHtml).join('')}</div>`;
  const tabs = manage ? [
    ['connect', 'Connect'],
    ...(dnsConnections().length ? [['link', 'Link']] : []),
    ['dns', 'Manage DNS here'],
    ...(myRole() === 'owner' && !ev.domainNote ? [['register', 'Register']] : [])
  ] : [];
  if (manage && !tabs.some(x => x[0] === ev.domTab)) ev.domTab = 'connect';
  const tabBar = tabs.length ? `<div class="ev-tabs" role="tablist" aria-label="How to bring a domain in">${tabs.map(([k, label]) => `<button class="ev-tab ${ev.domTab === k ? 'is-on' : ''}" type="button" role="tab" aria-selected="${ev.domTab === k}" data-env-action="dom-tab" data-tab="${k}">${e(label)}</button>`).join('')}</div>` : '';
  let door = '';
  if (manage) {
    if (ev.domTab === 'connect') door = `
      <div class="ev-dom-row">
        <input class="acct-input" type="text" id="evDomainHost" maxlength="253" placeholder="www.example.com" autocomplete="off" spellcheck="false" autocapitalize="off" ${full ? 'disabled' : ''} />
        <button class="btn" type="button" data-env-action="domain-add" ${full ? 'disabled' : ''}>Connect</button>
      </div>
      <p class="acct-card-note ev-dom-door">A domain you already own. One TXT record proves it is yours; nothing else changes.${full ? ' This plan is full: remove one to connect another, or move up a plan.' : ''}</p>`;
    else if (ev.domTab === 'link') door = linkDoorHtml(full);
    else if (ev.domTab === 'dns') door = dnsDoorHtml(full);
    else if (ev.domTab === 'register') door = registerHtml();
  } else {
    door = `<p class="acct-card-note">The owner, an admin or a developer connects domains; everyone on the team sees them here.</p>`;
  }
  return cardHtml({
    key: 'domains', icon: 'globe', title: 'Domains', summary, explain: explainLink('domains', 'How domains work'),
    body: `
      ${tabBar}
      ${door}
      <p class="acct-error" id="evDomainError" hidden></p>
      ${ev.domainNote ? `<p class="acct-card-note">${e(ev.domainNote)}</p>` : ''}
      ${registrationsHtml()}
      ${list}`
  });
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
  const head = '';
  if (r.step === 'idle' || r.step === 'checking') {
    return `
      ${head}
      <div class="ev-dom-row">
        <input class="acct-input" type="text" id="evRegHost" maxlength="253" placeholder="yourname.com" autocomplete="off" spellcheck="false" autocapitalize="off" value="${e(r.host)}" ${r.busy ? 'disabled' : ''} />
        <button class="btn" type="button" data-env-action="domain-reg-check" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Checking…' : 'Check'}</button>
      </div>
      <p class="acct-card-note ev-dom-door">The registrar's price, passed through with no markup. The name is yours, in your name.</p>
      <p class="acct-error" id="evRegError" ${r.error ? '' : 'hidden'}>${e(r.error)}</p>`;
  }
  if (r.step === 'quoted') {
    if (!q.offered) {
      return `${head}<p class="acct-card-note"><b>${e(q.host)}</b>: ${e(q.reason || 'not offered here.')}</p><div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button></div>`;
    }
    if (!q.available) {
      // Taken: the registrar's own alternatives, available with prices, one click each.
      const sug = Array.isArray(q.suggestions) ? q.suggestions : [];
      const options = sug.length ? `
      <p class="acct-card-note ev-dom-note">Available instead:</p>
      <div class="ev-suggest">
        ${sug.map(x => `<button class="btn btn-sm ev-suggest-btn" type="button" data-env-action="domain-reg-suggest" data-host="${e(x.domain)}"><span class="ev-suggest-name">${e(x.domain)}</span><span class="ev-suggest-price">${Number.isInteger(x.priceCents) ? e(money(x.priceCents)) : ''}</span></button>`).join('')}
      </div>` : '';
      return `${head}<p class="acct-card-note"><b>${e(q.host)}</b> is taken. If it is yours, connect it above instead.</p>${options}<div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button></div>`;
    }
    if (q.quoteError) {
      // The registrar would not price the name: its own words, and nothing to buy at a price it will not honor.
      return `${head}<p class="acct-error"><b>${e(q.host)}</b> is available, but the registrar could not price it right now: ${e(q.quoteError.message || q.quoteError.code || 'no reason given')}</p><div class="ev-dom-actions"><button class="btn btn-sm" type="button" data-env-action="domain-reg-check">Check again</button><button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button></div>`;
    }
    return `
      ${head}
      <p class="acct-card-note"><b>${e(q.host)}</b> is available: <b>${e(money(q.priceCents))}</b> for the first year${q.priceSource === 'azure-live' ? ', Azure’s current price read just now' : /^godaddy-/.test(q.priceSource || '') ? ', GoDaddy’s price right now' : ''}. ${e(q.note || '')}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-continue">Continue</button>
        <button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Try another</button>
      </div>`;
  }
  if (r.step === 'contact') {
    const f = (id, label, val, extra = '') => `<label class="acct-label" for="${id}">${label}</label><input class="acct-input" type="text" id="${id}" value="${e(val || '')}" ${extra} />`;
    // The registrant is what the customer already gave at subscription; the form opens only on Edit or when a field is missing.
    if (!r.contact || !Object.keys(r.contact).some(k => r.contact[k])) r.contact = contactFromBilling();
    const c2 = r.contact;
    const showForm = r.editContact || !contactComplete(c2);
    if (!showForm) {
      const line = [c2.address1, c2.address2, [c2.city, c2.state].filter(Boolean).join(' '), c2.postalCode, c2.country].filter(Boolean).join(', ');
      return `
      ${head}
      ${r.retryOrderId
        ? `<p class="acct-card-note"><b>${e(q.host)}</b> is paid on order ${e(String(r.retryOrderId).slice(0, 8))} and the registry refused the contact. Correct it and try again; nothing is charged again.</p>`
        : `<p class="acct-card-note"><b>${e(q.host)}</b>, ${e(money(q.priceCents))} for the first year, plus any sales tax due at your address. The registry records a contact for every domain; privacy protection is on, so the public record shows the registrar's proxy, not you.</p>`}
      <dl class="ev-record ev-registrant" aria-label="Registrant">
        <dt>Registrant</dt><dd>${e([c2.nameFirst, c2.nameLast].filter(Boolean).join(' '))}${c2.organization ? `, ${e(c2.organization)}` : ''}</dd><dd><button class="btn btn-sm" type="button" data-env-action="domain-reg-edit-contact">Edit</button></dd>
        <dt>Address</dt><dd>${e(line)}</dd><dd></dd>
        <dt>Contact</dt><dd>${e(c2.email)}, ${e(c2.phone)}</dd><dd></dd>
      </dl>
      <p class="acct-card-note ev-dom-note">Taken from your billing details. Edit if the domain should be registered to someone else.</p>
      ${r.retryOrderId ? '' : `<label class="ev-agree"><input type="checkbox" id="evRegAgree" ${r.agree ? 'checked' : ''} /> <span>I accept the registrar agreements: ${(q.agreements || []).map(a => a.url ? `<a class="acct-inline-link" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">${e(a.title || a.key)}</a>` : e(a.title || a.key)).join(', ')}.</span></label>`}
      <p class="acct-error" id="evRegError" ${r.error ? '' : 'hidden'}>${e(r.error)}</p>
      <div class="ev-dom-actions">
        <button class="btn" type="button" data-env-action="domain-reg-pay" ${r.busy ? 'disabled' : ''}>${r.busy ? (r.retryOrderId ? 'Trying…' : 'Starting…') : r.retryOrderId ? 'Save and try again' : `Pay ${e(money(q.priceCents))} and register`}</button>
        <button class="btn btn-sm" type="button" data-env-action="domain-reg-cancel">Cancel</button>
      </div>`;
    }
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
  const c = ev.reg?.contact || {};
  const v = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : String(c[{ evRegFirst: 'nameFirst', evRegLast: 'nameLast', evRegOrg: 'organization', evRegEmail: 'email', evRegPhone: 'phone', evRegAddr1: 'address1', evRegAddr2: 'address2', evRegCity: 'city', evRegState: 'state', evRegZip: 'postalCode', evRegCountry: 'country' }[id]] || '').trim(); };
  return {
    nameFirst: v('evRegFirst'), nameLast: v('evRegLast'), organization: v('evRegOrg'), email: v('evRegEmail'), phone: v('evRegPhone'),
    address1: v('evRegAddr1'), address2: v('evRegAddr2'), city: v('evRegCity'), state: v('evRegState'), postalCode: v('evRegZip'), country: v('evRegCountry').toUpperCase()
  };
}

async function regCheck() {
  const r = ev.reg;
  // Check again from the quoted step has no input on screen: the name it quoted stands.
  const typed = document.getElementById('evRegHost');
  r.host = String(typed ? typed.value : (r.host || '')).trim();
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
    ...freshReg(), step: 'contact', retryOrderId: orderId, editContact: true,
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

const PROVIDER_ICON = { twilio: 'SMS', shippo: 'Ship', stripe: 'Pay', github: 'Git', microsoft: '365', shopify: 'Shop' };

function providerOf(id) { return (ev.connProviders || []).find(p => p.id === id) || null; }

/** The non-secret identity of a connection for the row: the provider says
 *  which field or detail names the account (never a secret). */
function connIdentity(c) {
  const e = D.escapeHtml;
  const d = c.detail || {}, f = c.fields || {};
  if (c.provider === 'twilio') return e(d.friendlyName || f.accountSid || '');
  if (c.provider === 'stripe') return e([d.accountId, d.mode, isManagedStripe(c) ? (d.accountName || d.businessName) : ''].filter(Boolean).join(' · '));
  if (isManagedTwilio(c)) return e([d.friendlyName, d.accountSid, d.type ? `${String(d.type).toLowerCase()} account` : ''].filter(Boolean).join(' · ') || 'not yet authorized');
  if (isManagedShippo(c)) return e(c.status === 'ACTIVE' ? `${d.carrierAccounts || 0} carrier ${d.carrierAccounts === 1 ? 'account' : 'accounts'}${(d.carriers || []).length ? ' · ' + d.carriers.join(', ') : ''}` : 'not yet authorized');
  if (isManagedShopify(c)) return e(c.status === 'ACTIVE' ? [d.name, d.domain || d.shop, d.productCount !== undefined ? `${d.productCount} products` : ''].filter(Boolean).join(' · ') : `${d.shop || ''} · waiting for the supplier`);
  if (c.provider === 'shippo') return e(d.mode ? `${d.mode} token` : '');
  if (c.provider === 'github') return e(d.login ? `@${d.login}` : '');
  if (c.provider === 'microsoft') return e(d.org || f.tenantId || '');
  return e(Object.values(f)[0] || '');
}

function connStatusTag(c) {
  const e = D.escapeHtml;
  if (c.status === 'REJECTED' && c.detail?.disconnected) return `<span class="acct-tag is-bad" title="${e(c.lastError || '')}">disconnected</span>`;
  if (c.status === 'REJECTED') return `<span class="acct-tag is-bad" title="${e(c.lastError || '')}">rejected</span>`;
  if (isManagedShopify(c)) {
    const d = c.detail || {};
    if (c.status === 'ACTIVE') return `<span class="acct-tag is-verified" data-tip="${e(d.name || d.shop || 'The supplier')} approved this environment on their store.">connected</span>`;
    if (d.declined) return `<span class="acct-tag is-pending" data-tip="${e(c.lastError || '')}">declined</span>`;
    return `<span class="acct-tag is-pending" data-tip="Send the supplier their link; the row reads connected once they approve.">waiting for the supplier</span>`;
  }
  if (isManagedShippo(c)) {
    const d = c.detail || {};
    if (c.status === 'ACTIVE') return '<span class="acct-tag is-verified" title="Shippo bills you directly for labels; the platform acts with an access token Shippo issued for PragOptics.">connected</span>';
    if (c.status === 'REJECTED') return `<span class="acct-tag is-bad" title="${e(c.lastError || '')}">disconnected</span>`;
    if (d.declined) return `<span class="acct-tag is-pending" data-tip="${e(c.lastError || '')}">declined</span>`;
    if (d.failed || (c.lastError && /did not hand/i.test(c.lastError))) return `<span class="acct-tag is-bad" data-tip="${e(c.lastError || '')}">failed</span>`;
    return `<span class="acct-tag is-pending" data-tip="${e(c.lastError || 'Waiting for you to sign in or sign up at Shippo and approve PragOptics.')}">not authorized</span>`;
  }
  if (isManagedTwilio(c)) {
    const d = c.detail || {};
    if (c.status === 'ACTIVE') return `<span class="acct-tag is-verified" title="${e(d.type === 'Trial' ? 'A trial account: Twilio limits what it can do until it is upgraded.' : 'Twilio bills you directly; the platform acts on a subaccount inside your account.')}">connected</span>`;
    if (c.status === 'REJECTED') return `<span class="acct-tag is-bad" title="${e(c.lastError || '')}">disconnected</span>`;
    if (d.status === 'suspended') return `<span class="acct-tag is-bad" title="${e(c.lastError || '')}">suspended</span>`;
    if (d.declined) return `<span class="acct-tag is-pending" title="${e(c.lastError || '')}">declined</span>`;
    return `<span class="acct-tag is-pending" title="${e(c.lastError || 'Waiting for you to authorize PragOptics at Twilio.')}">not authorized</span>`;
  }
  if (isManagedStripe(c)) {
    const s = stripeState(c.detail);
    if (s.kind === 'active') return `<span class="acct-tag is-verified" title="${e(s.text)}">active</span>`;
    if (s.kind === 'payments') return `<span class="acct-tag is-verified" title="${e(s.text)}">payments on</span>`;
    if (s.kind === 'action') return `<span class="acct-tag is-bad" title="${e(s.text)}">action needed</span>`;
    if (s.kind === 'review') return `<span class="acct-tag is-pending" title="${e(s.text)}">in review</span>`;
    return `<span class="acct-tag is-pending" title="${e(s.text)}">setup incomplete</span>`;
  }
  return '<span class="acct-tag is-verified">verified</span>';
}
/** A Stripe account the platform opened for this environment (Stripe Connect): no credential on the card, Stripe's own state instead. */
function isManagedStripe(c) { return c?.provider === 'stripe' && c?.detail?.managed === 'stripe-connect'; }
/** A Twilio account the customer authorized through PragOptics (Twilio Connect): no credential on the card, Twilio's own state instead. */
function isManagedTwilio(c) { return c?.provider === 'twilio' && c?.detail?.managed === 'twilio-connect'; }
/** A Shippo account the customer connected through PragOptics (Shippo OAuth): the token sits in the vault, Shippo's own state on the row. */
function isManagedShippo(c) { return c?.provider === 'shippo' && c?.detail?.managed === 'shippo-connect'; }
function isManagedShopify(c) { return c?.provider === 'shopify' && c?.detail?.managed === 'shopify-supplier'; }
function isManaged(c) { return isManagedStripe(c) || isManagedTwilio(c) || isManagedShippo(c) || isManagedShopify(c); }

/** A Stripe requirement key in the customer's words (the same table the API uses). */
function stripeRequirementWords(key) {
  const k = String(key || '');
  const tail = k.replace(/^(person_[A-Za-z0-9]+|individual|representative|company|owners?|directors?|executives?)\./, '');
  if (k === 'external_account') return 'a bank account for payouts';
  if (/^tos_acceptance\./.test(k)) return "acceptance of Stripe's terms";
  if (k === 'business_type') return 'the business type';
  if (k === 'business_profile.url') return 'the business website';
  if (k === 'business_profile.mcc') return 'the business category';
  if (k === 'business_profile.product_description') return 'a description of what you sell';
  if (/^business_profile\.support_/.test(k)) return 'customer support details';
  if (/verification\.additional_document$/.test(tail)) return 'a proof of address document';
  if (/verification\.document$/.test(tail)) return k.startsWith('company.') ? 'a business registration document' : 'an identity document';
  if (/^(id_number|ssn_last_4)$/.test(tail)) return 'a personal ID number';
  if (/^dob\./.test(tail)) return 'a date of birth';
  if (/^address\./.test(tail)) return 'an address';
  if (/^(first_name|last_name)$/.test(tail)) return 'a legal name';
  if (tail === 'tax_id' || tail === 'vat_id') return 'a business tax ID';
  if (tail === 'name') return 'the legal business name';
  if (tail === 'phone') return 'a phone number';
  if (tail === 'email') return 'an email address';
  if (/_provided$/.test(tail)) return 'business owners and executives';
  if (/statement_descriptor/.test(k)) return 'a statement descriptor';
  return k.replace(/[._]/g, ' ');
}
function stripeWords(list) { return [...new Set((list || []).map(stripeRequirementWords))]; }
function joinWords(xs) { return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }

/**
 * Stripe's state of a managed account, from the row's detail (the API's shape of the account object's
 * requirements hash: due, pastDue, pendingVerification, errors, deadline; older rows carry only the count).
 * kind: active | payments | action | review | incomplete; text: one sentence; needs: what Stripe wants, in words.
 */
function stripeState(d = {}) {
  const pastDue = d.pastDue || [], due = d.due || [], pending = d.pendingVerification || [], errors = d.errors || [];
  const needs = stripeWords([...pastDue, ...due]);
  const count = needs.length || Number(d.currentlyDue || 0);
  const failed = errors.map(x => x.reason).filter(Boolean);
  const deadline = d.deadline ? ` by ${D.fmtDate(d.deadline)}` : '';
  if (d.chargesEnabled && d.payoutsEnabled) return { kind: 'active', text: 'This account can take payments and receive payouts.', needs: [] };
  if (d.chargesEnabled) return { kind: 'payments', text: needs.length ? `Payments are on. Payouts wait on ${joinWords(needs)}.` : "Payments are on. Payouts wait on Stripe's review.", needs };
  if (failed.length) return { kind: 'action', text: `Stripe could not verify what was given: ${failed.join(' ')}`, needs: needs.length ? needs : ['what Stripe could not verify'] };
  if (pastDue.length || d.disabledReason === 'requirements.past_due') return { kind: 'action', text: needs.length ? `Stripe disabled the account until it has ${joinWords(needs)}.` : 'Stripe disabled the account until it has what is past due.', needs: needs.length ? needs : ['what Stripe asked for'] };
  if (due.length || count > 0) return { kind: 'action', text: needs.length ? `Stripe needs ${joinWords(needs)}${deadline}.` : `Stripe needs ${count} more ${count === 1 ? 'item' : 'items'}${deadline}.`, needs: needs.length ? needs : [`${count} more ${count === 1 ? 'item' : 'items'}`] };
  if (pending.length) return { kind: 'review', text: `Stripe is verifying ${joinWords(stripeWords(pending))}. Nothing to do until it answers.`, needs: [] };
  if (d.detailsSubmitted) return { kind: 'review', text: 'Stripe has the details and is reviewing them.', needs: [] };
  return { kind: 'incomplete', text: 'Stripe still needs details. Continue the setup.', needs: [] };
}
/** The line under a managed row: what Stripe wants, or what it is doing, in the customer's words. */
function stripeNeedsHtml(c) {
  const e = D.escapeHtml;
  if (isManagedStripe(c) && c.detail?.disconnected) return `<div class="ev-conn-needs">${e(c.lastError || 'PragOptics was disconnected from this Stripe account.')}</div>`;
  if (isManagedTwilio(c)) return c.status === 'ACTIVE' ? '' : `<div class="ev-conn-needs">${e(c.lastError || 'Waiting for you to authorize PragOptics at Twilio.')}</div>`;
  if (isManagedShippo(c)) return c.status === 'ACTIVE' ? '' : `<div class="ev-conn-needs">${e(c.lastError || 'Waiting for you to sign in or sign up at Shippo and approve PragOptics.')}</div>`;
  if (!isManagedStripe(c) || c.status === 'REJECTED') return '';
  const d = c.detail || {}, s = stripeState(d);
  if (s.kind === 'active') return '';
  const test = d.mode === 'test' && s.kind !== 'incomplete' ? ' <span class="adm-muted">Test account: Stripe verifies only its test values here (date of birth 1901-01-01, ID number 000000000, business tax ID 000000000).</span>' : '';
  return `<div class="ev-conn-needs">${e(s.text)}${test}</div>`;
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
    <p class="acct-card-note ev-dom-door">Checked with ${e(p.label)} first, then kept in this environment's vault and never shown again.</p>`;
}

function connectionsHtml() {
  const e = D.escapeHtml;
  const manage = canManageConnections();
  const rows = ev.connections;
  const summary = rows == null ? (ev.connNote ? 'not on this lane' : 'loading') : !rows.length ? 'nothing connected yet' : `${rows.length} connected${ev.connLimit ? ` of ${ev.connLimit}` : ''}`;
  const list = rows == null ? (ev.connNote ? '' : '<p class="acct-loading">Loading connected accounts…</p>')
    : !rows.length ? `<p class="acct-empty">${manage ? 'Nothing connected yet.' : 'Nothing connected yet. The owner or an admin connects accounts.'}</p>`
    : `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap ev-table">
          <thead><tr><th>Account</th><th>Identity</th><th>Status</th><th>Checked</th><th></th></tr></thead>
          <tbody>
            ${rows.map(c => {
              const p = providerOf(c.provider);
              const testing = ev.connTesting === c.id;
              const kind = isManagedShopify(c) ? 'supplier' : isManaged(c) ? 'via PragOptics' : `key ••••${e(c.hint || '')}`;
              const refreshAction = isManagedStripe(c) ? 'conn-stripe-refresh' : isManagedTwilio(c) ? 'conn-twilio-refresh' : isManagedShippo(c) ? 'conn-shippo-refresh' : isManagedShopify(c) ? 'conn-shopify-refresh' : 'conn-test';
              return `
              <tr class="${c.status === 'REJECTED' ? 'ev-muted-row' : ''}" data-row="${e(c.provider)}">
                <td class="cell-ellip" data-th="Account"><span class="ev-conn-name" title="${e(c.label)}"><span class="acct-tag is-primary">${e(PROVIDER_ICON[c.provider] || c.provider)}</span> ${e(c.label)}</span><span class="ev-conn-kind adm-muted">${e(p?.label || cap(c.provider))} · ${kind}</span></td>
                <td class="cell-ellip adm-muted" data-th="Identity">${connIdentity(c)}${stripeNeedsHtml(c)}</td>
                <td class="cell-tight" data-th="Status">${connStatusTag(c)}</td>
                <td class="cell-tight adm-muted" data-th="Checked">${c.verifiedAt ? e(D.fmtDate(c.verifiedAt)) : 'never'}</td>
                <td class="cell-tight ev-actions-cell">${manage ? (ev.connArm === c.id ? `
                  <button class="btn btn-sm is-danger" type="button" data-env-action="conn-remove" data-id="${e(c.id)}" data-label="${e(c.label)}" title="The credential is deleted from the vault and anything using it stops on its next call">Remove for sure?</button>
                  ${iconBtn('conn-remove-cancel', 'x', 'Keep it')}` : `
                  ${isManagedStripe(c) && (() => { const s = stripeState(c.detail); return s.kind === 'action' || s.kind === 'incomplete' || (s.kind === 'payments' && s.needs.length > 0); })() ? `<button class="btn btn-sm" type="button" data-env-action="conn-stripe-continue" data-id="${e(c.id)}" ${ev.connBusy ? 'disabled' : ''} title="Stripe's own pages for what it still needs">Continue setup</button>` : ''}
                  ${isManagedTwilio(c) && c.status !== 'ACTIVE' ? `<button class="btn btn-sm" type="button" data-env-action="conn-twilio-start" data-id="${e(c.id)}" ${ev.connBusy ? 'disabled' : ''} title="Twilio's authorization page for PragOptics, on your own Twilio account">${c.detail?.disconnected || c.detail?.declined ? 'Connect again' : 'Authorize at Twilio'}</button>` : ''}
                  ${isManagedShippo(c) && c.status !== 'ACTIVE' ? `<button class="btn btn-sm" type="button" data-env-action="conn-shippo-start" data-id="${e(c.id)}" ${ev.connBusy ? 'disabled' : ''} title="Shippo's authorization page for PragOptics; sign in or create your Shippo account there">${c.detail?.disconnected || c.detail?.declined ? 'Connect again' : 'Authorize at Shippo'}</button>` : ''}
                  ${isManagedShopify(c) && c.status !== 'ACTIVE' ? `<button class="btn btn-sm ev-btn-ico" type="button" data-env-action="conn-shopify-link" data-id="${e(c.id)}" data-shop="${e(c.detail?.shop || '')}" ${ev.connBusy ? 'disabled' : ''} title="A fresh link for your supplier; the old one stops working">${ico('send')}<span>Supplier link</span></button>` : ''}
                  ${isManagedShopify(c) && c.status === 'ACTIVE' ? `<button class="btn btn-sm ev-btn-ico" type="button" data-env-action="conn-shopify-sync" data-id="${e(c.id)}" ${ev.connSyncing === c.id ? 'disabled' : ''} title="Copy the store's products into this environment's data, table supplier_products">${ico('refresh')}<span>${ev.connSyncing === c.id ? 'Syncing…' : 'Sync products'}</span></button>` : ''}
                  ${iconBtn(refreshAction, testing ? 'refresh' : 'check', isManaged(c) ? 'Check status' : 'Test the credential', `data-id="${e(c.id)}" ${testing ? 'disabled' : ''}`, testing ? 'is-spinning' : '')}
                  ${iconBtn('conn-remove', 'trash', 'Remove', `data-id="${e(c.id)}" data-label="${e(c.label)}"`)}`) : ''}</td>
              </tr>${isManagedShippo(c) && c.status !== 'ACTIVE' && c.lastError && !(ev.rowNote && ev.rowNote.id === c.id) ? `
              <tr class="ev-note-row" data-row="note"><td colspan="5" data-th="Problem"><p class="acct-error ev-row-note">${e(c.lastError)}</p></td></tr>` : ''}${ev.rowNote && ev.rowNote.id === c.id ? `
              <tr class="ev-note-row" data-row="note">
                <td colspan="5" data-th="${ev.rowNote.error ? 'Problem' : 'Result'}"><p class="${ev.rowNote.error ? 'acct-error' : 'acct-card-note'} ev-row-note" aria-live="polite">${e(ev.rowNote.text)}</p></td>
              </tr>` : ''}${isManagedShopify(c) && ev.shopifyLink && ev.shopifyLinkId === c.id ? `
              <tr class="ev-link-row" data-row="shopify-link">
                <td colspan="5" data-th="Supplier link">
                  <div class="ev-link-box"><code class="ev-code">${e(ev.shopifyLink)}</code>${iconBtn('domain-copy', 'copy', 'Copy the link', `data-text="${e(ev.shopifyLink)}"`)}${iconBtn('open-url', 'external', 'Open the link in a new tab', `data-url="${e(ev.shopifyLink)}"`)}</div>
                  <p class="acct-card-note ev-note">Send this to your supplier. They open it on their Shopify store, see what PragOptics asks for, and approve; this row reads connected when they have.</p>
                </td>
              </tr>` : ''}`; }).join('')}
          </tbody>
        </table>
      </div>`;

  const pick = String(ev.connPick || '');
  const picked = providerOf(pick);
  const atLimit = ev.connLimit > 0 && (rows || []).length >= ev.connLimit;
  const has = (fn) => (rows || []).some(fn);
  const doors = [
    ...(has(isManagedStripe) ? [] : [['m:stripe', 'Stripe, set up through PragOptics']]),
    ...(has(isManagedTwilio) ? [] : [['m:twilio', 'Twilio, your account']]),
    ...(has(isManagedShippo) ? [] : [['m:shippo', 'Shippo, your account']]),
    ['m:shopify', 'Shopify supplier']
  ];
  const byo = (ev.connProviders || []).map(p => [p.id, `${p.label}, your own credential`]);
  let form = '';
  if (manage && !ev.connNote) {
    let door = '';
    if (pick === 'm:stripe') door = `
        <div class="ev-key-row">
          <input class="acct-input" type="text" id="evStripeBiz" maxlength="120" placeholder="Your business name (optional)" autocomplete="organization" value="${e(ev.connDraft?.stripeBusiness || '')}" />
          <button class="btn" type="button" data-env-action="conn-stripe-start" ${ev.connBusy ? 'disabled' : ''}>${ev.connBusy ? 'Opening with Stripe…' : 'Set up Stripe'}</button>
        </div>
        <p class="acct-card-note ev-dom-door">The platform opens a Stripe account in your name and Stripe walks you through its setup. Your account, your Dashboard, the platform never in your money.</p>`;
    else if (pick === 'm:twilio') door = `
        <div class="ev-key-row"><button class="btn" type="button" data-env-action="conn-twilio-start" ${ev.connBusy ? 'disabled' : ''}>${ev.connBusy ? 'Opening with Twilio…' : 'Connect your Twilio account'}</button></div>
        <p class="acct-card-note ev-dom-door">Approve PragOptics on your own upgraded Twilio account; Twilio bills you directly.</p>`;
    else if (pick === 'm:shippo') door = `
        <div class="ev-key-row"><button class="btn" type="button" data-env-action="conn-shippo-start" ${ev.connBusy ? 'disabled' : ''}>${ev.connBusy ? 'Opening with Shippo…' : 'Connect your Shippo account'}</button></div>
        <p class="acct-card-note ev-dom-door">Sign in or create your Shippo account there and approve PragOptics; Shippo bills you directly for labels.</p>`;
    else if (pick === 'm:shopify') door = `
        <div class="ev-key-row">
          <input class="acct-input" id="evShopifyShop" type="text" inputmode="url" autocomplete="off" placeholder="supplier-name.myshopify.com" aria-label="Your supplier's Shopify store address" value="${e(ev.shopifyShop || '')}">
          <button class="btn" type="button" data-env-action="conn-shopify-start" ${ev.connBusy ? 'disabled' : ''}>${ev.connBusy ? 'Making the link…' : 'Make the link'}</button>
        </div>
        <p class="acct-card-note ev-dom-door">Your supplier's store address. You send them the link, they approve, and their products land here for your site. They bill you as they always have.</p>`;
    else if (picked) door = `${connFieldsHtml(picked)}<div class="ev-key-row"><button class="btn" type="button" data-env-action="conn-add" ${ev.connBusy ? 'disabled' : ''}>${ev.connBusy ? 'Checking with ' + e(picked.label) + '…' : 'Connect'}</button></div>`;
    form = `
      <div class="ev-conn-add">
        <div class="ev-key-row">
          <select class="acct-input acct-select" id="evConnProvider" aria-label="Which account to connect" ${atLimit ? 'disabled' : ''}>
            <option value="">Connect…</option>
            <optgroup label="Through PragOptics">${doors.map(([v, label]) => `<option value="${e(v)}" ${pick === v ? 'selected' : ''}>${e(label)}</option>`).join('')}</optgroup>
            <optgroup label="With a credential you paste">${byo.map(([v, label]) => `<option value="${e(v)}" ${pick === v ? 'selected' : ''}>${e(label)}</option>`).join('')}</optgroup>
          </select>
        </div>
        ${atLimit ? `<p class="acct-card-note ev-note">This environment holds ${ev.connLimit} connections, the most it can carry. Remove one to connect another.</p>` : door}
      </div>`;
  }
  return cardHtml({
    key: 'connections', icon: 'plug', title: 'Connected accounts', summary, explain: explainLink('connections', 'How connected accounts work'),
    body: `
      ${ev.lane === 'sandbox' ? '<p class="acct-card-note ev-note"><b>Sandbox:</b> test keys live here, in its own vault. Live has its own connections.</p>' : ''}
      ${ev.connNote ? `<p class="acct-card-note ev-note">${e(ev.connNote)}</p>` : ''}
      ${form}
      <p class="acct-error" id="evConnError" hidden></p>
      ${ev.connResult ? `<p class="acct-card-note ev-note ev-conn-result" aria-live="polite">${e(ev.connResult)}</p>` : ''}
      ${ev.shopifyLink && !(ev.connections || []).some(c => c.id === ev.shopifyLinkId) ? `<div class="ev-link-box"><code class="ev-code">${e(ev.shopifyLink)}</code>${iconBtn('domain-copy', 'copy', 'Copy the link', `data-text="${e(ev.shopifyLink)}"`)}${iconBtn('open-url', 'external', 'Open the link in a new tab', `data-url="${e(ev.shopifyLink)}"`)}</div>` : ''}
      ${list}`
  });
}

function keysHtml() {
  const e = D.escapeHtml;
  const me = ev.view?.membership || {};
  if (!canWrite()) {
    return cardHtml({ key: 'keys', icon: 'key', title: 'API keys', summary: 'seat members only', explain: explainLink('keys', 'How keys work'),
      body: `<p class="acct-card-note">Keys are made by seat members for the programs they run. As a viewer you use what the team publishes.</p>` });
  }
  const rows = ev.keys;
  const active = (rows || []).filter(k => k.status === 'ACTIVE');
  const summary = rows == null ? 'loading' : !active.length ? 'none yet' : countWord(active.length, 'active key', 'active keys');
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
                <td class="cell-ellip" data-th="Label" title="${e(k.label)}">${e(k.label || 'Unlabelled')}</td>
                <td class="cell-tight" data-th="Key"><code class="ev-prefix">${e(k.prefix)}_…</code></td>
                <td class="cell-tight" data-th="Scopes">${(k.scopes || []).map(s => `<span class="acct-tag">${e(s)}</span>`).join(' ')}</td>
                <td class="cell-ellip adm-cell-email" data-th="Made by" title="${e(k.createdByEmail)}">${e(k.createdByEmail || '')}${mine ? ' <span class="adm-muted">(you)</span>' : ''}</td>
                <td class="cell-tight adm-muted" data-th="Last used">${k.lastUsedAt ? e(D.fmtDate(k.lastUsedAt)) : 'never'}</td>
                <td class="cell-tight" data-th="Status"><span class="acct-tag ${k.status === 'ACTIVE' ? 'is-verified' : ''}">${e(String(k.status).toLowerCase())}</span></td>
                <td class="cell-tight ev-actions-cell">${revocable ? `${ev.keyArm === k.keyId ? `<button class="btn btn-sm is-danger" type="button" data-env-action="key-revoke" data-key="${e(k.keyId)}" data-label="${e(k.label || k.prefix)}" title="Every call with it stops on the next request">Revoke for sure?</button>${iconBtn('key-arm-cancel', 'x', 'Keep it')}` : iconBtn('key-revoke', 'trash', 'Revoke', `data-key="${e(k.keyId)}" data-label="${e(k.label || k.prefix)}"`)}` : ''}</td>
              </tr>`; }).join('')}
          </tbody>
        </table>
      </div>`;
  return cardHtml({
    key: 'keys', icon: 'key', title: 'API keys', summary, explain: explainLink('keys', 'How keys work'),
    body: `
      <div class="ev-key-row">
        <input class="acct-input" type="text" id="evKeyLabel" maxlength="60" placeholder="What will hold it, e.g. build server" autocomplete="off" spellcheck="false" />
        <div class="ev-scopes" role="group" aria-label="What the key may do">
          <label><input type="checkbox" id="evScopeRead" checked /> read</label>
          <label><input type="checkbox" id="evScopeWrite" checked /> write</label>
        </div>
        <button class="btn" type="button" data-env-action="key-make">Make a key</button>
      </div>
      <p class="acct-card-note ev-dom-door">A key lets a program use this environment as you: data and files, nothing else. Each member holds up to ten.</p>
      <p class="acct-error" id="evKeyError" hidden></p>
      ${ev.madeKey ? madeKeyHtml(ev.madeKey) : ''}
      ${list}`
  });
}

function madeKeyHtml(k) {
  const e = D.escapeHtml;
  return `
    <div class="ev-key-result">
      <p><b>Your new key${k.label ? ` for ${e(k.label)}` : ''}.</b> Copy it now: it is shown once. Send it as the <code>x-api-key</code> header.</p>
      <div class="acct-add-row">
        <input class="acct-input ev-key" type="text" id="evMadeKey" readonly value="${e(k.key || '')}" aria-label="The new API key" />
        ${iconBtn('key-copy', 'copy', 'Copy the key')}
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
  await copyText(text, btn, () => { const input = document.getElementById('evMadeKey'); if (input) { input.focus(); input.select(); } });
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

/* ---------- the DNS door ---------- */

async function startDnsDoor(btn) {
  D.showError('evDomainError', '');
  const host = (document.getElementById('evDnsHost')?.value || '').trim();
  if (!host) { D.showError('evDomainError', 'Enter the domain, e.g. example.com.'); return; }
  ev.dnsDoor = { busy: true, note: '' }; paintDomains();
  try {
    const r = await post(`${ENV_URL}/domains/dns/start`, { host });
    ev.dnsDoor = { busy: false, note: r.note || '' };
    ev.dnsRecs = ev.dnsRecs || {}; ev.dnsRecs[r.domain?.host || host] = { records: r.records || [], counts: r.counts || {} };
    await loadDomains();
  } catch (ex) {
    ev.dnsDoor = { busy: false, note: '' }; paintDomains();
    D.showError('evDomainError', ex?.data?.code === 'DNS_MICROSOFT_365' ? ex.data.error : errText(ex, 'Could not look that domain up.'));
    const input = document.getElementById('evDnsHost'); if (input) input.value = host;
  }
}
function setDnsNote(host, note) { ev.dnsNote = ev.dnsNote || {}; ev.dnsNote[host] = note || ''; }
async function dnsRecords(host) {
  ev.dnsRecs = ev.dnsRecs || {};
  if (ev.dnsRecs[host]) { delete ev.dnsRecs[host]; paintDomains(); return; }
  try { const r = await post(`${ENV_URL}/domains/dns/records`, { host }); ev.dnsRecs[host] = { records: r.records || [], counts: r.counts || {} }; paintDomains(); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not read the records.')); }
}
async function dnsAdd(host) {
  D.showError('evDomainError', '');
  const zoneFile = document.getElementById(`evDnsFile-${host}`)?.value || '';
  const names = (document.getElementById(`evDnsNames-${host}`)?.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!zoneFile.trim() && !names.length) { D.showError('evDomainError', 'Paste a zone file or type a name first.'); return; }
  ev.dnsBusy = host; paintDomains();
  try {
    const r = await post(`${ENV_URL}/domains/dns/add`, { host, zoneFile, names });
    ev.dnsRecs = ev.dnsRecs || {}; ev.dnsRecs[host] = { records: r.records || [], counts: r.counts || {} };
    setDnsNote(host, `Added ${(r.found?.file || 0) + (r.found?.lookups || 0)} record${(r.found?.file || 0) + (r.found?.lookups || 0) === 1 ? '' : 's'}. ${r.found?.total || 0} in all.`);
  } catch (ex) { D.showError('evDomainError', errText(ex, 'Could not add those records.')); }
  ev.dnsBusy = ''; await loadDomains();
}
async function dnsSwitch(host) {
  D.showError('evDomainError', '');
  ev.dnsBusy = host; paintDomains();
  try { const r = await post(`${ENV_URL}/domains/dns/switch`, { host }); setDnsNote(host, r.note || ''); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not switch the nameservers.')); }
  ev.dnsBusy = ''; await loadDomains();
}
async function dnsCheck(host) {
  D.showError('evDomainError', '');
  ev.dnsBusy = host; paintDomains();
  try { const r = await post(`${ENV_URL}/domains/dns/check`, { host }); setDnsNote(host, r.note || ''); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not check the domain.')); }
  ev.dnsBusy = ''; await loadDomains();
}
async function dnsCancel(host) {
  D.showError('evDomainError', '');
  if (ev.domArm !== `dns-cancel:${host}`) { ev.domArm = `dns-cancel:${host}`; paintDomains(); return; }
  ev.domArm = ''; ev.dnsBusy = host; paintDomains();
  try {
    const r = await post(`${ENV_URL}/domains/dns/cancel`, { host });
    ev.dnsBack = ev.dnsBack || {}; delete ev.dnsBack[host];
    if (ev.dnsRecs) delete ev.dnsRecs[host];
    setDnsNote(host, r.note || '');
  } catch (ex) {
    if (ex?.data?.code === 'STILL_POINTED_HERE') { ev.dnsBack = ev.dnsBack || {}; ev.dnsBack[host] = ex.data.originalNameServers || []; setDnsNote(host, ''); }
    else D.showError('evDomainError', errText(ex, 'Could not hand the domain back.'));
  }
  ev.dnsBusy = ''; await loadDomains();
}

async function unlinkDomain(host) {
  D.showError('evDomainError', '');
  try { const r = await post(`${ENV_URL}/domains/unlink`, { host }); ev.linkNote = r.note || ''; await loadDomains(); }
  catch (ex) { D.showError('evDomainError', errText(ex, 'Could not unlink that domain.')); }
}

// Open the software (2026-09-16): the studio lives on its own origin, so the
// session here does not exist there. The platform mints a one-time code (60
// seconds, one use) and the studio redeems it on load for a session of its
// own; the session token itself never rides in a URL. The tab is opened on
// the click (a later open is a blocked pop-up), then pointed at the address
// once the code exists; blocked, the same tab goes.
async function openSoftware(btn) {
  const plain = String(btn?.dataset?.url || '');
  if (!plain) return;
  let w = null;
  try { w = window.open('about:blank', '_blank'); if (w) w.opener = null; } catch { w = null; }
  btn.disabled = true;
  const base = plain.replace(/\/+$/, '');
  let target = base;
  try {
    const token = JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || '';
    const res = await fetch(`${PRAG_API_BASE}/auth/software/handoff`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const d = res.ok ? await res.json() : null;
    // The code plus this lane's API base and name: the studio redeems on the lane the person is signed in on.
    if (d?.code) target = `${base}/#handoff=${encodeURIComponent(d.code)}&api=${encodeURIComponent(PRAG_API_BASE)}&lane=${encodeURIComponent(LANE)}`;
  } catch { /* the plain address: the studio asks for a sign-in */ }
  btn.disabled = false;
  if (w) { try { w.location.replace(target); return; } catch { /* fall through */ } }
  location.assign(target);
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

/** What a row's own action answered, shown directly under that row: never a note at the top of the card for a click at the bottom of it. */
function rowNote(id, text, error = false) { ev.rowNote = text ? { id: String(id || ''), text: String(text), error: !!error } : null; }

async function testConnection(id) {
  if (!id || ev.connTesting) return;
  D.showError('evConnError', '');
  ev.connTesting = id; ev.connResult = ''; rowNote(id, ''); paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/test`, { id });
    rowNote(id, d.connection?.message || (d.connection?.checked ? 'The provider accepted the credential.' : 'The provider rejected the credential.'), d.connection?.checked === false);
  } catch (ex) { rowNote(id, errText(ex, 'Could not check that connection.'), true); }
  ev.connTesting = '';
  await loadConnections();
}

/** The platform opens the Stripe account and hands the customer to Stripe's setup. The single-use URL is used at once, never shown. */
async function startShippoConnect() {
  if (ev.connBusy) return;
  D.showError('evConnError', '');
  ev.connBusy = true; ev.connResult = ''; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/shippo/start`, {});
    if (!d?.url) throw new Error('Shippo did not answer with an authorization link.');
    try { sessionStorage.setItem('pragoptics_connect_return', JSON.stringify({ provider: 'shippo', id: String(d.connection?.id || '') })); } catch { /* the return still carries the id */ }
    window.location.assign(d.url);
    return;
  } catch (ex) {
    ev.connBusy = false; paintConnections();
    D.showError('evConnError', errText(ex, 'Could not start the Shippo authorization right now.'));
  }
}
async function refreshShippoConnect(id, quiet = false) {
  if (!id || ev.connTesting) return;
  if (!quiet) D.showError('evConnError', '');
  ev.connTesting = id; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/shippo/refresh`, { id });
    rowNote(id, d.connection?.message || 'Shippo answered for the account.');
  } catch (ex) { if (!quiet) rowNote(id, errText(ex, 'Could not check that Shippo account.'), true); }
  ev.connTesting = '';
  await loadConnections();
}

/** A Shopify supplier (2026-09-16): the platform opens a pending row for the supplier's store and hands back the invite link the customer sends them. */
async function startShopifyConnect(id = '', shopFromRow = '') {
  if (ev.connBusy) return;
  D.showError('evConnError', '');
  const shop = String(shopFromRow || document.getElementById('evShopifyShop')?.value || '').trim();
  if (!shop) { D.showError('evConnError', 'Type your supplier\'s Shopify store address first, like supplier-name.myshopify.com.'); return; }
  ev.shopifyShop = shop; ev.connBusy = true; ev.connResult = ''; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/shopify/start`, { shop });
    if (!d?.url) throw new Error('The platform did not answer with a link.');
    ev.shopifyLink = d.url; ev.shopifyLinkId = String(d.connection?.id || id || ''); ev.shopifyShop = ''; ev.connResult = ev.shopifyLinkId ? '' : (d.note || 'Send the link to your supplier.');
    ev.connBusy = false;
    await loadConnections();
  } catch (ex) {
    ev.connBusy = false; paintConnections();
    D.showError('evConnError', errText(ex, 'Could not make the link right now.'));
  }
}
async function refreshShopifyConnect(id, quiet = false) {
  if (!id || ev.connTesting) return;
  if (!quiet) D.showError('evConnError', '');
  ev.connTesting = id; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/shopify/refresh`, { id });
    rowNote(id, d.connection?.message || 'Shopify answered for the store.');
  } catch (ex) { if (!quiet) rowNote(id, errText(ex, 'Could not check that supplier.'), true); }
  ev.connTesting = '';
  await loadConnections();
}
async function syncShopifyProducts(id) {
  if (!id || ev.connSyncing) return;
  D.showError('evConnError', '');
  ev.connSyncing = id; ev.connResult = ''; rowNote(id, ''); paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/shopify/sync`, { id });
    rowNote(id, d.note || `${d.total} products copied.`);
  } catch (ex) { rowNote(id, errText(ex, 'Could not copy the products right now.'), true); }
  ev.connSyncing = '';
  await loadConnections();
}

async function startTwilioConnect() {
  if (ev.connBusy) return;
  D.showError('evConnError', '');
  ev.connBusy = true; ev.connResult = ''; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/twilio/start`, {});
    if (!d?.url) throw new Error('Twilio did not answer with an authorization link.');
    try { sessionStorage.setItem('pragoptics_connect_return', JSON.stringify({ provider: 'twilio', id: String(d.connection?.id || '') })); } catch { /* the return still carries the id */ }
    window.location.assign(d.url);
    return;
  } catch (ex) {
    ev.connBusy = false; paintConnections();
    D.showError('evConnError', errText(ex, 'Could not start the Twilio authorization right now.'));
  }
}
async function refreshTwilioConnect(id, quiet = false) {
  if (!id || ev.connTesting) return;
  if (!quiet) D.showError('evConnError', '');
  ev.connTesting = id; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/twilio/refresh`, { id });
    rowNote(id, d.connection?.message || 'Twilio answered for the account.');
  } catch (ex) { if (!quiet) rowNote(id, errText(ex, 'Could not check that Twilio account.'), true); }
  ev.connTesting = '';
  await loadConnections();
}

async function startStripeConnect(id = '') {
  if (ev.connBusy) return;
  D.showError('evConnError', '');
  const businessName = document.getElementById('evStripeBiz')?.value?.trim() || '';
  ev.connDraft = { ...(ev.connDraft || {}), stripeBusiness: businessName };
  ev.connBusy = true; ev.connResult = ''; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/stripe/start`, { ...(id ? { id } : {}), ...(businessName ? { businessName } : {}) });
    if (!d?.url) throw new Error('Stripe did not answer with a setup link.');
    try { sessionStorage.setItem('pragoptics_stripe_connect', String(d.connection?.id || id || '')); } catch { /* the return still carries the id */ }
    window.location.assign(d.url);
    return;
  } catch (ex) {
    ev.connBusy = false; paintConnections();
    D.showError('evConnError', errText(ex, 'Could not open a Stripe account right now.'));
  }
}

/** Stripe's latest word on a managed account, stamped on the row. */
async function refreshStripeConnect(id, quiet = false) {
  if (!id || ev.connTesting) return;
  if (!quiet) D.showError('evConnError', '');
  ev.connTesting = id; paintConnections();
  try {
    const d = await post(`${ENV_URL}/connections/stripe/refresh`, { id });
    rowNote(id, d.connection?.message || 'Stripe answered for the account.');
  } catch (ex) { if (!quiet) rowNote(id, errText(ex, 'Could not check that Stripe account.'), true); }
  ev.connTesting = '';
  await loadConnections();
}

/** Back from a provider (Stripe's hosted setup, Twilio's authorization): the return carries the provider and the connection id; the card re-reads the provider once and cleans the address bar. */
let providerReturnSeen = false;
async function handleProviderReturn() {
  if (providerReturnSeen) return;
  providerReturnSeen = true;
  let provider = '', id = '', outcome = '';
  try {
    // The return rides in the hash: /#account?connect=stripe|twilio&id=...&outcome=...; the hash is cleaned back to #account.
    const q = new URLSearchParams(String(window.location.hash || '').split('?')[1] || '');
    if (['stripe', 'twilio', 'shippo', 'shopify'].includes(q.get('connect'))) { provider = q.get('connect'); id = q.get('id') || ''; outcome = q.get('outcome') || 'return'; history.replaceState(null, '', window.location.pathname + '#account'); }
  } catch { /* no query to read */ }
  if (!id) {
    try {
      const kept = JSON.parse(sessionStorage.getItem('pragoptics_connect_return') || 'null');
      if (kept?.id) { provider = kept.provider || provider; id = kept.id; outcome = kept.outcome || outcome || 'return'; }
      else { id = sessionStorage.getItem('pragoptics_stripe_connect') || ''; provider = id ? 'stripe' : provider; }
    } catch { /* nothing kept */ }
    if (!id) return; outcome = outcome || 'return';
  }
  try { sessionStorage.removeItem('pragoptics_connect_return'); sessionStorage.removeItem('pragoptics_stripe_connect'); } catch { /* nothing to clear */ }
  if (!(ev.connections || []).some(c => c.id === id)) return;
  if (provider === 'twilio') {
    ev.connResult = outcome === 'declined' ? 'You declined the authorization at Twilio. Nothing was connected.' : outcome === 'failed' ? 'Twilio named an account the platform could not read. Try connecting again.' : 'Back from Twilio. Checking the account…';
    paintConnections();
    await refreshTwilioConnect(id, true);
    return;
  }
  if (provider === 'shopify') {
    ev.connResult = 'Back from Shopify. Checking the supplier…';
    paintConnections();
    await refreshShopifyConnect(id, true);
    return;
  }
  if (provider === 'shippo') {
    ev.connResult = outcome === 'declined' ? 'You declined the authorization at Shippo. Nothing was connected.' : outcome === 'failed' ? 'Shippo did not hand the platform a working authorization. Try connecting again.' : 'Back from Shippo. Checking the account…';
    paintConnections();
    await refreshShippoConnect(id, true);
    return;
  }
  ev.connResult = outcome === 'refresh' ? 'The Stripe setup link had expired. Press Continue setup for a fresh one.' : 'Back from Stripe. Checking the account…';
  paintConnections();
  await refreshStripeConnect(id, true);
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
  const managed = (ev.connections || []).some(c => c.id === id && isManaged(c));
  try { await post(`${ENV_URL}/connections/remove`, { id }); ev.connResult = managed ? `${label} removed from this environment. The Stripe account is still yours at dashboard.stripe.com.` : `${label} removed.`; await loadConnections(); }
  catch (ex) { D.showError('evConnError', errText(ex, 'Could not remove that connection.')); }
}

async function setRenewal(host, autoRenew, input) {
  D.showError('evDomainError', '');
  input.disabled = true;
  try { await post(`${ENV_URL}/domains/renewal`, { host, autoRenew }); await loadDomains(); }
  catch (ex) { input.disabled = false; input.checked = !autoRenew; D.showError('evDomainError', errText(ex, 'Could not change the renewal choice.')); }
}

async function copyText(text, btn, onFail) {
  const iconOnly = btn.classList.contains('btn-ico');
  const orig = btn.innerHTML, origLabel = btn.getAttribute('aria-label') || '';
  const show = (ok) => { if (iconOnly) { btn.innerHTML = ico(ok ? 'check' : 'x'); btn.setAttribute('aria-label', ok ? 'Copied' : 'Select the text and copy it'); } else btn.textContent = ok ? 'Copied' : 'Select the text'; };
  try { await writeClipboard(text); show(true); }
  catch { show(false); if (onFail) onFail(); }
  setTimeout(() => { btn.innerHTML = orig; if (iconOnly) btn.setAttribute('aria-label', origLabel); }, 1600);
}

export function bindEnvironmentActions(deps) {
  if (bindEnvironmentActions._bound) return;
  bindEnvironmentActions._bound = true;
  D = D || deps;

  document.addEventListener('change', (e) => {
    const sw = e.target.closest?.('[data-env-switch="ai"]');
    if (sw) setAi(!!sw.checked);
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-env-action]');
    if (!btn) return;
    e.preventDefault();
    const a = btn.dataset.envAction;
    if (a === 'dom-tab') { ev.domTab = btn.dataset.tab || 'connect'; paintDomains(); return; }
    if (a === 'refresh') return void refreshAll();
    if (a === 'lane-live') return void setLane('live');
    if (a === 'lane-sandbox') return void setLane('sandbox');
    if (a === 'sandbox-setup') return void setupSandbox(btn);
    if (a === 'export') return void exportEnvironment(btn);
    if (a === 'open-software') return void openSoftware(btn);
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
    if (a === 'data-open' || a === 'data-reload') return void loadRows(btn.dataset.table || '');
    if (a === 'data-close') return void closeTable();
    if (a === 'data-more') return void loadRows(ev.table, true);
    if (a === 'data-row') { const k = btn.dataset.key || ''; ev.openRow = ev.openRow === k ? '' : k; paintData(); return; }
    if (a === 'open-url') { const u = String(btn.dataset.url || ''); if (/^https:\/\//.test(u)) window.open(u, '_blank', 'noopener'); return; }
    if (a === 'domain-link') return void linkDomain(btn);
    if (a === 'domain-unlink') return void unlinkDomain(btn.dataset.host || '');
    if (a === 'domain-dns-start') return void startDnsDoor(btn);
    if (a === 'domain-dns-records') return void dnsRecords(btn.dataset.host || '');
    if (a === 'domain-dns-add') return void dnsAdd(btn.dataset.host || '');
    if (a === 'domain-dns-switch') return void dnsSwitch(btn.dataset.host || '');
    if (a === 'domain-dns-check') return void dnsCheck(btn.dataset.host || '');
    if (a === 'domain-dns-cancel') return void dnsCancel(btn.dataset.host || '');
    if (a === 'domain-arm-cancel') { disarmDomain(); paintDomains(); return; }
    if (a === 'domain-reg-check') return void regCheck();
    if (a === 'domain-reg-continue') { ev.reg.step = 'contact'; ev.reg.error = ''; paintDomains(); document.getElementById('evRegFirst')?.focus(); return; }
    if (a === 'domain-reg-pay') return void regPay();
    if (a === 'domain-reg-confirm') return void regConfirm();
    if (a === 'domain-reg-retry') return void retryRegistration(btn.dataset.order || '', btn.dataset.host || 'the name');
    if (a === 'domain-reg-fix') return void fixRegistrationContact(btn.dataset.order || '', btn.dataset.host || '');
    if (a === 'domain-reg-suggest') { const r = ev.reg; r.host = btn.dataset.host || ''; r.step = 'idle'; r.quote = null; r.error = ''; paintDomains(); const i = document.getElementById('evRegHost'); if (i) i.value = r.host; regCheck(); return; }
    if (a === 'domain-reg-edit-contact') { ev.reg.contact = readContact(); ev.reg.editContact = true; paintDomains(); document.getElementById('evRegFirst')?.focus(); return; }
    if (a === 'domain-reg-cancel') { ev.reg = freshReg(); paintDomains(); return; }
    if (a === 'conn-add') return void addConnection(btn);
    if (a === 'conn-test') return void testConnection(btn.dataset.id || '');
    if (a === 'conn-remove') return void removeConnection(btn.dataset.id || '', btn.dataset.label || 'this connection');
    if (a === 'conn-remove-cancel') { clearTimeout(connArmTimer); ev.connArm = ''; paintConnections(); return; }
    if (a === 'conn-stripe-start') return void startStripeConnect('');
    if (a === 'conn-stripe-continue') return void startStripeConnect(btn.dataset.id || '');
    if (a === 'conn-stripe-refresh') return void refreshStripeConnect(btn.dataset.id || '');
    if (a === 'conn-twilio-start') return void startTwilioConnect();
    if (a === 'conn-twilio-refresh') return void refreshTwilioConnect(btn.dataset.id || '');
    if (a === 'conn-shippo-start') return void startShippoConnect();
    if (a === 'conn-shippo-refresh') return void refreshShippoConnect(btn.dataset.id || '');
    if (a === 'conn-shopify-start') return void startShopifyConnect();
    if (a === 'conn-shopify-link') return void startShopifyConnect(btn.dataset.id || '', btn.dataset.shop || '');
    if (a === 'conn-shopify-refresh') return void refreshShopifyConnect(btn.dataset.id || '');
    if (a === 'conn-shopify-sync') return void syncShopifyProducts(btn.dataset.id || '');
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
