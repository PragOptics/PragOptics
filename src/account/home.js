// src/account/home.js
//
// THE ENVIRONMENT HOME (2026-10-12, Cameron: "projects or what the studio is capable of opening and working on, so
// users have an organized space"). One page per environment, the first thing the panel and the switch land on: what
// this environment holds, each with the way in. Its projects, with Open in the studio; its published sites; its
// domains; its connected accounts; its team. Every list is a read the sections already make (the backend holds them
// all); this page gathers them and sends you to the section that works on each. It follows the team in view like the
// Environment and Licensing tabs (the tenant pick), so a switch changes everything here at once.
//
// Reads: GET v1/environment/projects, GET v1/environment/publish, GET v1/environment/domains, GET v1/environment/connections
// (a paid-plan feature: Free answers 403 UPGRADE_REQUIRED and the card says so), GET v1/tenant/members (member and above;
// a viewer's card says the list is for members). Each card stands on its own read: one that fails says so on its card
// and the others paint.

import { connectionAccessMode } from './connectionAccess.js';
import { PRAG_API_BASE } from '../runtime/config.js';
import { cardHtml as sharedCard, ico, leadBtn, initCards } from './cards.js';
import { explainLink } from '../components/explainer.js';
import { groupsOf, countsLine } from './approvalGroups.js';
import { renderWaitingCard } from './envArrivalsBlock.js';   // Waiting on you: the decisions and the submissions nobody acted on, one card (2026-11-15)
import { accountSelection } from '../runtime/accountContext.js';
import { sessionVersion } from './sessionPrivacy.js';

let D = null;
let loadGeneration = 0;
const hm = { projectsComplete: false, projects: null, sites: null, domains: null, connections: null, connectionAccess: null, members: null, data: null, files: null, errs: {} };

const TEAM_KEY = 'pragoptics_team_id';
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
/** A URL that names the team in view, as the Environment and Licensing reads do. */
function tq(path) {
  const params = new URLSearchParams();
  const team = teamId(); if (team) params.set('tenant', team);
  if (/^\/environment\/(projects|publish|data|files|connections|approvals)(?:[/?]|$)/.test(path)) params.set('lane', accountSelection(sessionStorage).workLane);
  return `${PRAG_API_BASE}${path}${params.size ? (path.includes('?') ? '&' : '?') + params : ''}`;
}
function card(o) { return sharedCard({ ...o, key: 'home:' + o.key }); }
function when(s) { try { return s && D.fmtDate ? D.fmtDate(s) : (s ? new Date(s).toLocaleDateString() : ''); } catch { return ''; } }
function count(n, one, many) { const k = Number(n) || 0; return `${k} ${k === 1 ? one : many}`; }
function sizeWord(bytes) { const b = Number(bytes) || 0; return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`; }
function hostOnly(u) { return String(u || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''); }
function kindWord(k) { return ({ website: 'website', webapp: 'web app', notebook: 'notebook', table: 'table', gallery: 'gallery', board: 'board' }[String(k || '').toLowerCase()]) || (k || 'project'); }

/** The button that opens a section (the panel's nav handler reads data-acct-section anywhere). */
function goBtn(section, label, cardKey = '') {
  return `<button class="btn btn-sm btn-lead" type="button" data-acct-section="${section}" ${cardKey ? `data-acct-card="${cardKey}"` : ''}>${ico('external')}<span>${D.escapeHtml(label)}</span></button>`;
}
function errLine(key) { const m = hm.errs[key]; return m ? `<p class="acct-error">${D.escapeHtml(m)}</p>` : ''; }

/* ---------- the page ---------- */

export async function renderHome(main, deps) {
  D = deps;
  initCards();
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Home ${explainLink('home', 'How the Home page works')}</h2></header>
    <div id="hmBody"><p class="acct-loading">Loading…</p></div>`;
  await load();
}

async function load() {
  const generation = ++loadGeneration, session = sessionVersion(), selection = accountSelection(sessionStorage);
  const deps = D, errs = {};
  hm.removeArm = '';
  const read = async (key, path) => {
    try { return await deps.apiFetch(tq(path)); }
    catch (ex) {
      // the one paid-plan refusal reads as what it is, every other failure in the desk's words
      if (ex?.status === 403 && (ex?.data?.code === 'UPGRADE_REQUIRED' || /paid plan/i.test(ex?.message || ''))) { errs[key] = 'upgrade'; return null; }
      if (ex?.status === 403 && key === 'members') { errs[key] = 'members'; return null; }
      errs[key] = deps.friendlyError(ex, 'This could not be read.');
      return null;
    }
  };
  const [p, s, d, c, m, dt, fl, ap] = await Promise.all([
    read('projects', '/environment/projects'),
    read('sites', '/environment/publish'),
    read('domains', '/environment/domains'),
    read('connections', '/environment/connections'),
    read('members', '/tenant/members'),
    read('data', '/environment/data'),
    read('files', '/environment/files?limit=200'),
    // what waits for a decision (2026-11-02, approvals): a line on Home only when something does
    read('approvals', '/environment/approvals')
  ]);
  const current = accountSelection(sessionStorage);
  if (generation !== loadGeneration || session !== sessionVersion() || current.team !== selection.team || current.workLane !== selection.workLane) return;
  hm.errs = errs;
  hm.projects = Array.isArray(p?.projects) ? p.projects : null; hm.projectsComplete = Array.isArray(p?.projects) && p.truncated !== true && !p.nextCursor && (p.truncated === false || p.projects.length < 500); hm.sites = s?.sites || null; hm.domains = d?.domains || null;
  hm.connections = c?.connections || null; hm.connectionAccess = connectionAccessMode(c); hm.members = m?.members || null;
  hm.data = dt?.tables || null; hm.files = fl?.items || null;
  hm.approvals = ap ? groupsOf(ap) : null;
  paint();
}

function paint() {
  const body = document.getElementById('hmBody');
  if (!body) return;
  // ONE CARD for what waits on the team (2026-11-15, Cameron: clean, not a hodge podge): the Approvals line and the submissions to acknowledge, together; nothing when nothing waits
  body.innerHTML = `<p class="acct-card-note">Environment work area: <strong>${accountSelection(sessionStorage).workLane === 'sandbox' ? 'Sandbox' : 'Live'}</strong>. <button class="btn btn-sm" type="button" data-acct-section="environment">Manage environment</button></p><div id="hmWaiting"></div>${projectsCard()}${glanceRow()}${cleanupSection()}`;
  renderWaitingCard(document.getElementById('hmWaiting'), D, { url: (p) => tq(p), decisionsHtml: approvalsLine() });
}

/** "2 waiting in Reviews" with the way to the Approvals section; nothing at all when nothing waits (the definition's decision 6). */
function approvalsLine() {
  const line = countsLine(hm.approvals || []);
  if (!line) return '';
  const e = D.escapeHtml;
  return `<button class="hm-approvals" type="button" data-acct-section="approvals">${ico('bell')}<span class="hm-approvals-t">Approvals</span><span class="hm-approvals-s">${e(line)}</span><span class="hm-approvals-go">Decide</span></button>`;
}

// A compact "at a glance" row: the environment's data, files, domain, team and connections as small
// tiles that lead into their section -- the OVERVIEW, not the detail. The detail lives on the
// Environment tab, so Home stops repeating it as a stack of equal cards.
function glanceRow() {
  const e = D.escapeHtml;
  const tile = (icon, label, value, sub, section, cardKey) => `<button class="hm-tile" type="button" data-acct-section="${e(section)}"${cardKey ? ` data-acct-card="${e(cardKey)}"` : ''}><span class="hm-tile-h">${ico(icon, 15)} ${e(label)}</span><span class="hm-tile-v">${value}</span><span class="hm-tile-s">${e(sub)}</span></button>`;
  const dataN = hm.data ? hm.data.length : null;
  const filesN = hm.files ? hm.files.length : null;
  const dom = (hm.domains || [])[0];
  const teamN = hm.members ? hm.members.length : null;
  const connUp = hm.errs.connections === 'upgrade';
  const connN = hm.connections ? hm.connections.length : null;
  const tiles = [
    tile('database', 'Data', dataN != null ? String(dataN) : '–', dataN != null ? (dataN === 1 ? 'table' : 'tables') : (hm.errs.data ? 'not read' : ''), 'environment', 'data'),
    tile('folder', 'Files', filesN != null ? String(filesN) : '–', filesN != null ? (filesN === 1 ? 'file' : 'files') : (hm.errs.files ? 'not read' : ''), 'environment', 'files'),
    tile('globe', accountSelection(sessionStorage).workLane === 'sandbox' ? 'Live domain' : 'Domain', dom ? e(dom.host) : (hm.domains ? 'none yet' : '–'), dom ? (String(dom.status || '').toUpperCase() === 'VERIFIED' ? 'verified' : String(dom.status || '').toLowerCase()) : '', 'environment', 'domains'),
    tile('users', 'Team', teamN != null ? String(teamN) : '–', teamN != null ? (teamN === 1 ? 'person' : 'people') : (hm.errs.members === 'members' ? 'members only' : ''), 'team'),
    tile('plug', 'Connected', connUp ? 'paid' : (connN != null ? String(connN) : '–'), connUp ? 'plans' : hm.connectionAccess ? 'Shopify review · expires ' + when(hm.connectionAccess.expiresAt) : (connN != null ? (connN === 1 ? 'account' : 'accounts') : ''), connUp ? 'subscription' : 'environment', connUp ? '' : 'connections')
  ].join('');
  return `<p class="hm-glance-h">At a glance</p><div class="hm-glance">${tiles}</div>`;
}

// A missing project link is a review item, never evidence that a public site is disposable.
function cleanupSection() {
  const e = D.escapeHtml;
  if (!hm.sites?.length) return '';
  if (!hm.projectsComplete) return '<p class="adm-note">Published-site project links could not be fully verified. Review them in Studio before removing anything.</p>';
  const projIds = new Set(hm.projects.map(p => p.id));
  const orphans = (hm.sites || []).filter(s => !s.project || !projIds.has(s.project));
  if (!orphans.length) return '';
  const rows = orphans.map(s => {
    const armed = hm.removeArm === s.slug;
    const act = armed
      ? `<button class="btn btn-sm is-risky" type="button" data-home-action="remove-site" data-slug="${e(s.slug)}">${ico('trash')}<span>Remove for good?</span></button><button class="btn btn-sm" type="button" data-home-action="remove-cancel">${ico('x')}<span>Keep</span></button>`
      : `<button class="btn btn-sm is-risky" type="button" data-home-action="remove-arm" data-slug="${e(s.slug)}">${ico('trash')}<span>Remove</span></button>`;
    const address = /^https?:\/\//i.test(String(s.address || '')) ? `<a class="btn btn-sm" href="${e(s.address)}" target="_blank" rel="noopener">Open site</a>` : '';
    return `<div class="hm-row hm-row-sub"><div class="hm-row-main"><p class="hm-row-t">${e(s.slug || 'site')} <span class="acct-tag">${s.project ? 'project link unavailable' : 'published independently'}</span></p><p class="hm-row-s adm-muted">Public site${s.publishedAt ? ` · ${e(when(s.publishedAt))}` : ''}${s.files != null ? ` · ${e(count(s.files, 'file', 'files'))}` : ''}.</p></div><div class="hm-row-act act-row">${address}${act}</div></div>`;
  }).join('');
  return `<p class="hm-glance-h">Published sites to review</p><p class="adm-note">A site can be valid without a linked Studio project. Check its address and purpose before choosing Remove.</p><div class="hm-list">${rows}</div>`;
}

async function removeSite(slug) {
  if (!slug) return;
  try { await D.apiFetch(tq(`/environment/publish/${encodeURIComponent(slug)}`), { method: 'DELETE' }); hm.errs.sites = ''; }
  catch (ex) { hm.errs.sites = D.friendlyError(ex, 'Could not remove it.'); }
  await load();
}

/* ---------- the cards ---------- */

function projectsCard() {
  const e = D.escapeHtml, list = hm.projects || [];
  // Join each project to its published site (site.project === project.id) and to a serving domain.
  const siteOf = {};
  for (const s of (hm.sites || [])) { if (s && s.project && !siteOf[s.project]) siteOf[s.project] = s; }
  const liveHostOf = {};
  for (const d of (hm.domains || [])) { const sv = d && d.serve; if (sv && sv.status === 'SERVING' && sv.site) liveHostOf[sv.site] = d.host; }
  // Names are labels, not identities. Distinct projects remain visible even
  // when they share a name; actual version history belongs to each project.
  const names = new Map();
  for (const project of list) { const key=String(project.name || '').trim().toLowerCase(); names.set(key,(names.get(key)||0)+1); }
  const identity = project => names.get(String(project.name || '').trim().toLowerCase()) > 1 ? ` · ${String(project.id || '').slice(0,8)}` : '';
  const isSite = p => String(p.kind || '').toLowerCase() === 'website';
  const stateLine = (p) => {
    const site = siteOf[p.id], host = site ? liveHostOf[site.slug] : '';
    if (site && host) return `${ico('globe', 13)} Public at <a href="https://${e(host)}" target="_blank" rel="noopener">${e(host)}</a>`;
    if (site) return `${ico('globe', 13)} Public site <span class="adm-muted">· no connected domain</span>`;
    return `<span class="adm-muted">In the Studio</span>`;
  };
  const openIcon = (p) => `<button class="btn btn-sm btn-ico" type="button" data-home-action="open-project" data-id="${e(p.id)}" data-tip="Open in the studio" aria-label="Open ${e(p.name || p.id)} in the studio">${ico('external')}</button>`;
  const partRow = (p) => `<div class="hm-part"><span class="hm-part-n">${ico(isSite(p) ? 'globe' : 'box', 14)} ${e(p.name || p.id)} <span class="adm-muted">${e(kindWord(p.kind))}${e(identity(p))}</span></span>${openIcon(p)}</div>`;
  const primarySites = list.filter(isSite);
  const parts = list.filter(p => !isSite(p));
  const newest = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  primarySites.sort(newest); parts.sort(newest);
  // Keep projects separate unless Studio has an actual connection between them.
  hm.openWs = hm.openWs || new Set();
  const wsRow = (w) => {
    const meta = [kindWord(w.kind), w.version != null ? `v${w.version}` : '', w.updatedAt ? `updated ${when(w.updatedAt)}` : ''].filter(Boolean).join(' · ');
    return `
    <div class="hm-ws">
      <div class="hm-ws-head">
        <div class="hm-row-main">
          <p class="hm-row-t">${e(w.name || w.id)}${e(identity(w))} <span class="acct-tag is-primary">website project</span></p>
          <p class="hm-row-s">${e(meta)} · ${stateLine(w)}</p>
        </div>
        <div class="hm-row-act">${leadBtn({ home: 'open-project' }, 'external', 'Open in the studio', `data-id="${e(w.id)}"`, 'btn-primary')}</div>
      </div>
    </div>`;
  };
  const partsDrawer = (id, label, sub, arr) => {
    const open = hm.openWs.has(id);
    return `
    <div class="hm-ws${open ? ' is-open' : ''}">
      <div class="hm-ws-head">
        <button class="hm-ws-toggle" type="button" data-home-action="toggle-ws" data-id="${e(id)}" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Collapse' : 'Expand'} ${e(label)}">${ico('chevron', 16)}</button>
        <div class="hm-row-main"><p class="hm-row-t">${e(label)} <span class="adm-muted">${arr.length}</span></p><p class="hm-row-s adm-muted">${e(sub)}</p></div>
      </div>
      ${open ? `<div class="hm-parts">${arr.map(partRow).join('')}</div>` : ''}
    </div>`;
  };
  const tree = primarySites.map(w => wsRow(w)).join('') + (parts.length
    ? partsDrawer('__parts__', 'Other projects', 'Apps, notebooks and data projects. Open Studio to inspect their connections.', parts) : '');
  const body = `
    ${errLine('projects')}
    ${hm.projects === null ? '' : (list.length ? `${tree}` : '<p class="acct-empty">No projects yet. Open the studio and the first one you save lands here.</p>')}
    ${hm.projects && !hm.projectsComplete ? '<p class="acct-card-note">Showing the available projects. This is not the full inventory.</p>' : ''}
    <p class="acct-card-note hm-start">Start a website: open the Studio to build from scratch, from a template, or import a site you already have.</p>
    <div class="acct-actions-row act-row">${leadBtn({ home: 'open-studio' }, 'external', 'Open the studio', '', list.length ? '' : 'btn-primary')}</div>`;
  const summary = hm.projects ? `${hm.projectsComplete ? '' : 'Showing '}${count(primarySites.length, 'website', 'websites')}${parts.length ? ` · ${count(parts.length, 'other project', 'other projects')}` : ''}` : (hm.errs.projects ? 'not read' : '');
  return card({ key: 'projects', icon: 'box', title: 'Projects', summary, body });
}

function sitesCard() {
  const e = D.escapeHtml, list = hm.sites || [];
  const projIds = new Set((hm.projects || []).map(p => p.id));
  // a site from a current project now shows on that project above; here, only the ones that do NOT
  // (an imported site, the root site, a project since deleted), so nothing is hidden and nothing doubles
  const orphans = list.filter(s => !s.project || !projIds.has(s.project));
  const rows = orphans.map(s => `
    <div class="hm-row hm-row-sub">
      <div class="hm-row-main">
        <p class="hm-row-t">${e(s.slug || 'site')} <span class="acct-tag">not from a project</span></p>
        <p class="hm-row-s">${s.address ? `<a href="${e(s.address)}" target="_blank" rel="noopener">${e(hostOnly(s.address))}</a>` : ''}${s.publishedAt ? ` · published ${e(when(s.publishedAt))}` : ''}${s.files != null ? ` · ${e(count(s.files, 'file', 'files'))}` : ''}</p>
        <p class="hm-row-s adm-muted">This public site has no matching project in the available list. Review its address and purpose in Studio.</p>
      </div>
    </div>`).join('');
  const body = `
    ${errLine('sites')}
    ${hm.sites === null && !hm.errs.sites
      ? ''
      : (orphans.length
        ? `<div class="hm-list">${rows}</div>`
        : (list.length
          ? `<p class="acct-empty">All ${count(list.length, 'published site', 'published sites')} ${list.length === 1 ? 'is' : 'are'} shown on ${list.length === 1 ? 'its project' : 'their projects'} above.</p>`
          : '<p class="acct-empty">Nothing published yet. Publish from the studio and it appears here.</p>'))}
    <div class="acct-actions-row act-row">${goBtn('environment', 'Open Environment', 'files')}</div>`;
  return card({ key: 'sites', icon: 'globe', title: 'Published sites', summary: hm.sites ? count(list.length, 'site', 'sites') : (hm.errs.sites ? 'not read' : ''), body });
}

function dataCard() {
  const e = D.escapeHtml, list = hm.data || [];
  const nameOf = t => (typeof t === 'string' ? t : (t && (t.name || t.table)) || '');
  const rows = list.map(t => `
    <div class="hm-row"><div class="hm-row-main"><p class="hm-row-t">${e(nameOf(t))}</p>${t && t.count != null ? `<p class="hm-row-s">${e(count(t.count, 'row', 'rows'))}</p>` : ''}</div></div>`).join('');
  const body = `
    ${errLine('data')}
    ${hm.data === null && !hm.errs.data ? '' : (list.length ? `<div class="hm-list">${rows}</div>` : '<p class="acct-empty">No tables yet. A table you build in the Studio, or a connected supplier’s products, lands here.</p>')}
    <div class="acct-actions-row act-row">${goBtn('environment', 'Open Data', 'data')}</div>`;
  return card({ key: 'data', icon: 'database', title: 'Data', summary: hm.data ? count(list.length, 'table', 'tables') : (hm.errs.data ? 'not read' : ''), body });
}

function filesCard() {
  const e = D.escapeHtml, list = hm.files || [];
  const baseName = n => { const s = String(n || '').replace(/\/+$/, ''); const i = s.lastIndexOf('/'); return i >= 0 ? s.slice(i + 1) : s; };
  const rows = list.slice(0, 8).map(f => `
    <div class="hm-row"><div class="hm-row-main"><p class="hm-row-t" title="${e(f.name || '')}">${e(baseName(f.name))}</p><p class="hm-row-s">${f.size != null ? e(sizeWord(f.size)) : ''}${f.lastModified ? ` · ${e(when(f.lastModified))}` : ''}</p></div></div>`).join('');
  const body = `
    <p class="acct-card-note">The files this environment holds: what your projects read, and what you have uploaded.</p>
    ${errLine('files')}
    ${hm.files === null && !hm.errs.files ? '' : (list.length ? `<div class="hm-list">${rows}${list.length > 8 ? `<p class="acct-card-note">and ${list.length - 8} more</p>` : ''}</div>` : '<p class="acct-empty">No files yet.</p>')}
    <div class="acct-actions-row act-row">${goBtn('environment', 'Open Files', 'files')}</div>`;
  return card({ key: 'files', icon: 'folder', title: 'Files', summary: hm.files ? count(list.length, 'file', 'files') : (hm.errs.files ? 'not read' : ''), body });
}

function domainsCard() {
  const e = D.escapeHtml, list = hm.domains || [];
  const word = (d) => d.binding?.status === 'BOUND' ? 'serving' : (String(d.status || '').toUpperCase() === 'VERIFIED' ? 'verified' : String(d.status || 'pending').toLowerCase());
  const rows = list.map(d => `
    <div class="hm-row">
      <div class="hm-row-main"><p class="hm-row-t">${e(d.host || '')}</p><p class="hm-row-s">${e(word(d))}${d.managed || d.dnsManaged ? ' · DNS run by PragOptics' : ''}</p></div>
    </div>`).join('');
  const body = `
    <p class="acct-card-note">The names this environment owns or has connected.</p>
    ${errLine('domains')}
    ${hm.domains === null && !hm.errs.domains ? '' : (list.length ? `<div class="hm-list">${rows}</div>` : '<p class="acct-empty">No domain yet. Your own domain comes before licensing and mail.</p>')}
    <div class="acct-actions-row act-row">${goBtn('environment', 'Open Domains', 'domains')}</div>`;
  return card({ key: 'domains', icon: 'globe', title: 'Domains', summary: hm.domains ? count(list.length, 'domain', 'domains') : (hm.errs.domains ? 'not read' : ''), body });
}

function connectionsCard() {
  const e = D.escapeHtml, list = hm.connections || [];
  const upgrade = hm.errs.connections === 'upgrade';
  const rows = list.map(c => `
    <div class="hm-row">
      <div class="hm-row-main"><p class="hm-row-t">${e(c.label || c.provider || '')}</p><p class="hm-row-s">${e([c.provider, c.status].filter(Boolean).join(' · '))}</p></div>
    </div>`).join('');
  const body = `
    <p class="acct-card-note">The accounts this environment is connected to: payments, shipping, messaging, Microsoft 365, a registrar.</p>
    ${upgrade ? '<p class="acct-card-note">Connected accounts are part of a paid plan.</p>' : errLine('connections')}
    ${hm.connections === null ? '' : (list.length ? `<div class="hm-list">${rows}</div>` : '<p class="acct-empty">Nothing connected yet.</p>')}
    <div class="acct-actions-row act-row">${upgrade ? goBtn('subscription', 'See the plans') : goBtn('environment', 'Open Connected accounts', 'connections')}</div>`;
  return card({ key: 'connections', icon: 'plug', title: 'Connected accounts', summary: hm.connections ? count(list.length, 'connection', 'connections') : (upgrade ? 'paid plans' : (hm.errs.connections ? 'not read' : '')), body });
}

function teamCard() {
  const e = D.escapeHtml, list = hm.members || [];
  const forMembers = hm.errs.members === 'members';
  const rows = list.slice(0, 8).map(m => `
    <div class="hm-row">
      <div class="hm-row-main"><p class="hm-row-t">${e(m.email || '')}</p><p class="hm-row-s">${e(String(m.role || '').replace(/^\w/, ch => ch.toUpperCase()))}${m.status && String(m.status).toUpperCase() !== 'ACTIVE' ? ` · ${e(String(m.status).toLowerCase())}` : ''}</p></div>
    </div>`).join('');
  const body = `
    <p class="acct-card-note">Who works in this environment and what each may do.</p>
    ${forMembers ? '<p class="acct-card-note">The member list is for members and above.</p>' : errLine('members')}
    ${hm.members === null ? '' : (list.length ? `<div class="hm-list">${rows}${list.length > 8 ? `<p class="acct-card-note">and ${list.length - 8} more</p>` : ''}</div>` : '<p class="acct-empty">Just you so far.</p>')}
    <div class="acct-actions-row act-row">${goBtn('team', 'Open Team')}</div>`;
  return card({ key: 'team', icon: 'users', title: 'Team', summary: hm.members ? count(list.length, 'person', 'people') : (forMembers ? 'members only' : (hm.errs.members ? 'not read' : '')), body });
}

/* ---------- actions ---------- */

export function bindHomeActions(deps) {
  D = deps;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-home-action]');
    if (!btn) return;
    const a = btn.dataset.homeAction;
    // the studio, through the one-time handoff the site already makes (runtime/bootstrap.js goToSoftware); a project id
    // rides along as project=<id> for the studio to open that project (the studio reads it from the same fragment)
    if (a === 'toggle-older') { e.preventDefault(); hm.showOlder = !hm.showOlder; paint(); return; }
    if (a === 'toggle-ws') { e.preventDefault(); const id = String(btn.dataset.id || ''); hm.openWs = hm.openWs || new Set(); hm.openWs.has(id) ? hm.openWs.delete(id) : hm.openWs.add(id); paint(); return; }
    if (a === 'remove-arm') { e.preventDefault(); hm.removeArm = String(btn.dataset.slug || ''); paint(); return; }
    if (a === 'remove-cancel') { e.preventDefault(); hm.removeArm = ''; paint(); return; }
    if (a === 'remove-site') { e.preventDefault(); const slug = String(btn.dataset.slug || ''); hm.removeArm = ''; removeSite(slug); return; }
    if (a === 'open-studio') { e.preventDefault(); window.pragOpenStudio?.(''); return; }
    if (a === 'open-project') { e.preventDefault(); const id = String(btn.dataset.id || ''); if (id) window.pragOpenStudio?.(`project=${encodeURIComponent(id)}`); }
  });
}
