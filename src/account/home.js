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
const hm = { projects: null, sites: null, domains: null, connections: null, members: null, errs: {} };

const TEAM_KEY = 'pragoptics_team_id';
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
/** A URL that names the team in view, as the Environment and Licensing reads do. */
function tq(path) { const t = teamId(); return t ? `${PRAG_API_BASE}${path}${path.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(t)}` : `${PRAG_API_BASE}${path}`; }
function card(o) { return sharedCard({ ...o, key: 'home:' + o.key }); }
function when(s) { try { return s && D.fmtDate ? D.fmtDate(s) : (s ? new Date(s).toLocaleDateString() : ''); } catch { return ''; } }
function count(n, one, many) { const k = Number(n) || 0; return `${k} ${k === 1 ? one : many}`; }
function sizeWord(bytes) { const b = Number(bytes) || 0; return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`; }

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
  const [p, s, d, c, m] = await Promise.all([
    read('projects', '/environment/projects'),
    read('sites', '/environment/publish'),
    read('domains', '/environment/domains'),
    read('connections', '/environment/connections'),
    read('members', '/tenant/members')
  ]);
  hm.projects = p?.projects || null; hm.sites = s?.sites || null; hm.domains = d?.domains || null;
  hm.connections = c?.connections || null; hm.members = m?.members || null;
  paint();
}

function paint() {
  const body = document.getElementById('hmBody');
  if (!body) return;
  body.innerHTML = `<div class="ev-cards">${projectsCard()}${sitesCard()}${domainsCard()}${connectionsCard()}${teamCard()}</div>`;
}

/* ---------- the cards ---------- */

function projectsCard() {
  const e = D.escapeHtml, list = hm.projects || [];
  const rows = list.map(p => `
    <div class="hm-row">
      <div class="hm-row-main">
        <p class="hm-row-t">${e(p.name || p.id)}</p>
        <p class="hm-row-s">${e([p.kind, p.version != null ? `v${p.version}` : '', p.size != null ? sizeWord(p.size) : '', p.updatedAt ? `updated ${when(p.updatedAt)}` : ''].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="hm-row-act">${leadBtn({ home: 'open-project' }, 'external', 'Open in the studio', `data-id="${e(p.id)}"`, 'btn-primary')}</div>
    </div>`).join('');
  const body = `
    <p class="acct-card-note">What the studio can open and work on in this environment. A project has one home; this is it.</p>
    ${errLine('projects')}
    ${hm.projects === null && !hm.errs.projects ? '' : (list.length ? `<div class="hm-list">${rows}</div>` : '<p class="acct-empty">No projects yet. Open the studio and the first one you save lands here.</p>')}
    <div class="acct-actions-row act-row">${leadBtn({ home: 'open-studio' }, 'external', 'Open the studio', '', list.length ? '' : 'btn-primary')}</div>`;
  return card({ key: 'projects', icon: 'box', title: 'Projects', summary: hm.projects ? count(list.length, 'project', 'projects') : (hm.errs.projects ? 'not read' : ''), body });
}

function sitesCard() {
  const e = D.escapeHtml, list = hm.sites || [];
  const rows = list.map(s => `
    <div class="hm-row">
      <div class="hm-row-main">
        <p class="hm-row-t">${e(s.slug || 'site')}</p>
        <p class="hm-row-s">${s.address ? `<a href="${e(s.address)}" target="_blank" rel="noopener">${e(s.address)}</a>` : ''}${s.publishedAt ? ` · published ${e(when(s.publishedAt))}` : ''}${s.files != null ? ` · ${e(count(s.files, 'file', 'files'))}` : ''}</p>
      </div>
    </div>`).join('');
  const body = `
    <p class="acct-card-note">What this environment has published, at its own address.</p>
    ${errLine('sites')}
    ${hm.sites === null && !hm.errs.sites ? '' : (list.length ? `<div class="hm-list">${rows}</div>` : '<p class="acct-empty">Nothing published yet. Publish from the studio and it appears here.</p>')}
    <div class="acct-actions-row act-row">${goBtn('environment', 'Open Environment', 'files')}</div>`;
  return card({ key: 'sites', icon: 'globe', title: 'Published sites', summary: hm.sites ? count(list.length, 'site', 'sites') : (hm.errs.sites ? 'not read' : ''), body });
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
