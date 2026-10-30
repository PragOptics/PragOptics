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

import { PRAG_API_BASE } from '../runtime/config.js';
import { cardHtml as sharedCard, ico, leadBtn, initCards } from './cards.js';

let D = null;
const hm = { projects: null, sites: null, domains: null, connections: null, members: null, data: null, files: null, errs: {} };

const TEAM_KEY = 'pragoptics_team_id';
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
/** A URL that names the team in view, as the Environment and Licensing reads do. */
function tq(path) { const t = teamId(); return t ? `${PRAG_API_BASE}${path}${path.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(t)}` : `${PRAG_API_BASE}${path}`; }
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
    <header class="acct-sec-head"><h2 class="acct-sec-title">Home</h2></header>
    <p class="acct-card-note">Everything this environment holds, and the way into each. Switch environments above and this page follows.</p>
    <div id="hmBody"><p class="acct-loading">Loading…</p></div>`;
  await load();
}

async function load() {
  hm.errs = {};
  const read = async (key, path) => {
    try { return await D.apiFetch(tq(path)); }
    catch (ex) {
      // the one paid-plan refusal reads as what it is, every other failure in the desk's words
      if (ex?.status === 403 && (ex?.data?.code === 'UPGRADE_REQUIRED' || /paid plan/i.test(ex?.message || ''))) { hm.errs[key] = 'upgrade'; return null; }
      if (ex?.status === 403 && key === 'members') { hm.errs[key] = 'members'; return null; }
      hm.errs[key] = D.friendlyError(ex, 'This could not be read.');
      return null;
    }
  };
  const [p, s, d, c, m, dt, fl] = await Promise.all([
    read('projects', '/environment/projects'),
    read('sites', '/environment/publish'),
    read('domains', '/environment/domains'),
    read('connections', '/environment/connections'),
    read('members', '/tenant/members'),
    read('data', '/environment/data'),
    read('files', '/environment/files?limit=200')
  ]);
  hm.projects = p?.projects || null; hm.sites = s?.sites || null; hm.domains = d?.domains || null;
  hm.connections = c?.connections || null; hm.members = m?.members || null;
  hm.data = dt?.tables || null; hm.files = fl?.items || null;
  paint();
}

function paint() {
  const body = document.getElementById('hmBody');
  if (!body) return;
  body.innerHTML = `<div class="ev-cards">${projectsCard()}${dataCard()}${filesCard()}${sitesCard()}${domainsCard()}${connectionsCard()}${teamCard()}</div>`;
}

/* ---------- the cards ---------- */

function projectsCard() {
  const e = D.escapeHtml, list = hm.projects || [];
  // Join each project to its published site (site.project === project.id) and to a serving domain,
  // so a project reads as what is actually done with it: in the Studio, shared at an address, or live
  // on a domain.
  const siteOf = {};
  for (const s of (hm.sites || [])) { if (s && s.project && !siteOf[s.project]) siteOf[s.project] = s; }
  const liveHostOf = {};
  for (const d of (hm.domains || [])) { const sv = d && d.serve; if (sv && sv.status === 'SERVING' && sv.site) liveHostOf[sv.site] = d.host; }
  const sharedCount = list.filter(p => siteOf[p.id]).length;
  const liveCount = list.filter(p => siteOf[p.id] && liveHostOf[siteOf[p.id].slug]).length;
  // Same-named projects pile up from re-imports and saves. Within a name the PRIMARY is the published
  // one, else the newest by version then date; the rest read as "older copy" so the real one is
  // obvious and the leftovers can be opened or removed, not puzzled over.
  const nameKey = p => String(p.name || p.id).trim().toLowerCase();
  const byName = {};
  for (const p of list) { (byName[nameKey(p)] = byName[nameKey(p)] || []).push(p); }
  const primaryId = {};
  for (const n in byName) {
    primaryId[n] = byName[n].slice().sort((a, b) => {
      const pa = siteOf[a.id] ? 1 : 0, pb = siteOf[b.id] ? 1 : 0; if (pa !== pb) return pb - pa;
      if ((b.version || 0) !== (a.version || 0)) return (b.version || 0) - (a.version || 0);
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })[0].id;
  }
  const stateOf = (p) => {
    const site = siteOf[p.id], host = site ? liveHostOf[site.slug] : '';
    if (site && host) return `${ico('globe', 13)} Live at <a href="https://${e(host)}" target="_blank" rel="noopener">${e(host)}</a>${site.address ? ` <span class="adm-muted">· also shared at <a href="${e(site.address)}" target="_blank" rel="noopener">${e(hostOnly(site.address))}</a></span>` : ''}`;
    if (site) return `${ico('globe', 13)} Shared at <a href="${e(site.address)}" target="_blank" rel="noopener">${e(hostOnly(site.address))}</a> <span class="adm-muted">· not on a domain yet</span>`;
    return `<span class="adm-muted">In the Studio, not shared yet</span>`;
  };
  const rowOf = (p) => {
    const older = primaryId[nameKey(p)] !== p.id;
    const meta = [kindWord(p.kind), p.version != null ? `v${p.version}` : '', p.size != null ? sizeWord(p.size) : '', p.updatedAt ? `updated ${when(p.updatedAt)}` : ''].filter(Boolean).join(' · ');
    return `
    <div class="hm-row${older ? ' hm-row-sub' : ''}">
      <div class="hm-row-main">
        <p class="hm-row-t">${e(p.name || p.id)}${older ? ' <span class="acct-tag">older copy</span>' : ''}</p>
        <p class="hm-row-s">${e(meta)}</p>
        <p class="hm-row-s">${stateOf(p)}</p>
      </div>
      <div class="hm-row-act">${leadBtn({ home: 'open-project' }, 'external', 'Open in the studio', `data-id="${e(p.id)}"`, older ? '' : 'btn-primary')}</div>
    </div>`;
  };
  // Primary first within a group, older copies after, newest first otherwise.
  const order = (a, b) => {
    const oa = primaryId[nameKey(a)] === a.id ? 0 : 1, ob = primaryId[nameKey(b)] === b.id ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  };
  const isSite = p => String(p.kind || '').toLowerCase() === 'website';
  const sites = list.filter(isSite).sort(order);
  const apps = list.filter(p => !isSite(p)).sort(order);
  const group = (label, arr) => arr.length ? `<p class="hm-group">${e(label)}<span class="adm-muted"> ${arr.length}</span></p><div class="hm-list">${arr.map(rowOf).join('')}</div>` : '';
  const body = `
    <p class="acct-card-note">What the studio can open and work on here, grouped by what it is, and how each is shared or hosted. A project has one home; this is it.</p>
    ${errLine('projects')}
    ${hm.projects === null && !hm.errs.projects ? '' : (list.length ? `${group('Websites', sites)}${group('Forms and apps', apps)}` : '<p class="acct-empty">No projects yet. Open the studio and the first one you save lands here.</p>')}
    <p class="acct-card-note hm-start">Start a website: open the Studio to build from scratch, start from a template, or import a site you already have. Publish it, then put it live on your domain from Domains.</p>
    <div class="acct-actions-row act-row">${leadBtn({ home: 'open-studio' }, 'external', 'Open the studio', '', list.length ? '' : 'btn-primary')}</div>`;
  const summary = hm.projects ? `${count(list.length, 'project', 'projects')}${sharedCount ? ` · ${sharedCount} shared` : ''}${liveCount ? ` · ${liveCount} live` : ''}` : (hm.errs.projects ? 'not read' : '');
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
        <p class="hm-row-s adm-muted">A leftover publish not tied to any project. Remove it from the Studio's Publish dialog.</p>
      </div>
    </div>`).join('');
  const body = `
    <p class="acct-card-note">What this environment has published, at its own address. A site from one of your projects shows on that project above; anything here is published but has no project.</p>
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
    <p class="acct-card-note">The tables of data this environment holds. The Studio, your site and your API keys read and write them.</p>
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
    if (a === 'open-studio') { e.preventDefault(); window.pragOpenStudio?.(''); return; }
    if (a === 'open-project') { e.preventDefault(); const id = String(btn.dataset.id || ''); if (id) window.pragOpenStudio?.(`project=${encodeURIComponent(id)}`); }
  });
}
