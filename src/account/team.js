// src/account/team.js
//
// The Team section of the account panel, and the operator's Tenants desk.
//
// Everything here talks to the tenant spine (v1/tenant/*): one login, many
// memberships. Team is membership metadata, and it renders on the public site
// by design; tenant DATA never does. The panel's shared helpers (the fetch
// that carries the session token and tears the session down on revocation,
// the error wording, escaping) arrive through `deps` from account.js, so this
// module carries no second copy of any of them.
//
// Every call names the team it means: `tenant=` on GETs and `tenant` in POST
// bodies when the person is looking at a team other than their own. The
// server decides what they may do; the controls here only hide what the
// server would refuse anyway.

import { PRAG_API_BASE } from '../runtime/config.js';
import { tierName } from '../components/tierCopy.js';

const TENANT_URL = `${PRAG_API_BASE}/tenant`;
const ADMIN_TENANTS_URL = `${PRAG_API_BASE}/admin/tenants`;
const TEAM_KEY = 'pragoptics_team_id';

const ROLE_HELP = {
  owner: 'Pays for the account. Final say on everything.',
  admin: 'Manages the team: invites, roles, seats. No billing.',
  developer: 'Publishes routes, builds and automations. Reads logs.',
  member: 'A seat: signs in and uses the apps and APIs.',
  viewer: 'Read only. No seat.'
};
const ROLE_RANK = { owner: 5, admin: 4, developer: 3, member: 2, viewer: 1 };
const ACTION_LABEL = {
  'invite.create': 'Invited', 'invite.accept': 'Joined', 'invite.revoke': 'Invite withdrawn',
  'member.patch': 'Changed', 'member.remove': 'Removed', 'member.leave': 'Left', 'tenant.rename': 'Renamed'
};

// Section state. The remembered team survives a panel re-entry within the tab.
const tm = { teamId: '', view: null, members: [], invites: [], roles: ['admin', 'developer', 'member', 'viewer'], audit: [], lastInvite: null, editing: null, renaming: false };
try { tm.teamId = sessionStorage.getItem(TEAM_KEY) || ''; } catch { /* fine */ }

let D = null;   // deps from account.js: apiFetch, escapeHtml, friendlyError, showError, fmtDate

function remember() { try { tm.teamId ? sessionStorage.setItem(TEAM_KEY, tm.teamId) : sessionStorage.removeItem(TEAM_KEY); } catch { /* fine */ } }
function url(path, extra = {}) {
  const u = new URL(path);
  if (tm.teamId) u.searchParams.set('tenant', tm.teamId);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
function body(obj) { return JSON.stringify(tm.teamId ? { tenant: tm.teamId, ...obj } : obj); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function num(n) { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('en-US') : ''; }
function gb(bytes) {
  const v = Number(bytes);
  if (!Number.isFinite(v) || v <= 0) return '';
  const g = v / (1024 ** 3);
  return `${g >= 10 ? Math.round(g) : Math.round(g * 10) / 10} GB`;
}
function gbToBytes(g) { const v = Number(g); return Number.isFinite(v) && v > 0 ? Math.round(v * 1024 ** 3) : ''; }
function statusTag(s) {
  const st = String(s || 'ACTIVE').toUpperCase();
  return `<span class="acct-tag ${st === 'ACTIVE' ? 'is-verified' : 'is-pending'}">${D.escapeHtml(st.toLowerCase())}</span>`;
}
/** May a manager with `actor` role act on a member holding `target` role? Mirrors the server's ladder. */
function canActOn(actor, target) {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'admin') return (ROLE_RANK[target] || 0) < ROLE_RANK.admin;
  return false;
}

/* ================================================================
   TEAM (every signed-in customer)
   ================================================================ */

export async function renderTeam(main, deps) {
  D = deps;
  tm.editing = null; tm.renaming = false;
  main.innerHTML = `
    <header class="acct-sec-head"><h2 class="acct-sec-title">Team</h2></header>
    <p class="acct-error" id="tmError" hidden></p>
    <div id="tmBody"><p class="acct-loading">Loading…</p></div>
  `;
  await loadTeam();
}

async function fetchView() {
  try {
    return await D.apiFetch(url(TENANT_URL));
  } catch (ex) {
    // A remembered team this account can no longer open (left, removed):
    // forget it and fall back to the default team.
    if (tm.teamId && (ex?.status === 403 || ex?.status === 404)) { tm.teamId = ''; remember(); return D.apiFetch(url(TENANT_URL)); }
    throw ex;
  }
}

async function loadTeam() {
  const host = document.getElementById('tmBody');
  if (!host) return;
  D.showError('tmError', '');
  try {
    const view = await fetchView();
    tm.view = view;
    if (!view.tenant) { host.innerHTML = emptyHtml(view); return; }
    const [mem, audit] = await Promise.all([
      view.canReadTeam ? D.apiFetch(url(`${TENANT_URL}/members`)) : Promise.resolve(null),
      view.canManage ? D.apiFetch(url(`${TENANT_URL}/audit`, { limit: 20 })).catch(() => null) : Promise.resolve(null)
    ]);
    tm.members = mem?.members || [];
    tm.invites = mem?.invites || [];
    if (Array.isArray(mem?.roles) && mem.roles.length) tm.roles = mem.roles;
    tm.audit = audit?.events || [];
    paint();
  } catch (ex) {
    host.innerHTML = '';
    if (ex?.status === 404 && !ex?.data?.needsTenant) {
      host.innerHTML = `<p class="acct-empty">The team routes are not on this lane yet. Deploy the backend that carries them, then reload.</p>`;
      return;
    }
    D.showError('tmError', D.friendlyError(ex, 'Could not load your team.'));
  }
}

function paint() {
  const host = document.getElementById('tmBody');
  if (!host || !tm.view?.tenant) return;
  const v = tm.view;
  host.innerHTML = `
    ${switcherHtml(v)}
    ${summaryHtml(v)}
    ${v.canReadTeam ? membersHtml(v) : viewerNoteHtml()}
    ${v.canManage ? inviteHtml(v) : ''}
    ${v.canManage ? activityHtml() : ''}
  `;
}

function emptyHtml(view) {
  const e = D.escapeHtml;
  if (view.needsSubscription) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Your team starts with a plan.</h3>
        <p class="acct-card-note">User is one seat, yours. Partner includes five seats and Super forty-five, with more available. Add the platform and your team comes with it; the people you invite sign in with their own login and see only your team.</p>
        <div class="acct-actions-row"><button class="btn" type="button" data-acct-action="subscribe">See plans</button></div>
      </section>`;
  }
  const teams = view.teams || [];
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">No team yet.</h3>
      <p class="acct-card-note">${teams.length ? 'Pick a team above.' : 'When a team owner invites you, the link in that email brings you here. Your own team comes with a plan.'}</p>
      ${e('')}
    </section>`;
}

function switcherHtml(v) {
  const teams = v.teams || [];
  if (teams.length < 2) return '';
  const current = tm.teamId || v.tenant.environmentId;
  return `
    <div class="tm-switch">
      <label class="acct-label" for="tmSwitch">Team</label>
      <select class="adm-select" id="tmSwitch" aria-label="Which team to show">
        ${teams.map(t => `<option value="${D.escapeHtml(t.environmentId)}" ${t.environmentId === current ? 'selected' : ''}>${D.escapeHtml(t.organizationName || (t.own ? 'Your team' : 'Unnamed team'))} (${D.escapeHtml(t.role)}${t.own ? ', yours' : ''})</option>`).join('')}
      </select>
    </div>`;
}

function summaryHtml(v) {
  const e = D.escapeHtml;
  const t = v.tenant, me = v.membership || {};
  const s = t.seats || {};
  const limit = Math.max(1, Number(s.limit) || 1);
  const usedPct = Math.min(100, Math.round(100 * (Number(s.used) || 0) / limit));
  const pendPct = Math.min(100 - usedPct, Math.round(100 * (Number(s.pending) || 0) / limit));
  const isOwner = me.role === 'owner';
  const name = t.organizationName || '';
  const lim = me.limits || t.limits || {};
  return `
    <section class="acct-card tm-summary">
      <div class="tm-summary-head">
        <div class="tm-summary-id">
          <div class="tm-tags"><span class="acct-tag is-primary">${e(tierName(t.tier))}</span><span class="acct-tag">${e(cap(me.role))}</span>${t.provisioned ? '' : '<span class="acct-tag is-pending" title="The software has not provisioned storage for this team yet">team only</span>'}</div>
          <h3 class="acct-card-h tm-name">${e(name || (isOwner ? 'Your team' : 'Unnamed team'))}</h3>
          <p class="acct-card-note tm-owner">Owner ${e(t.ownerEmail || '')}. ${e(ROLE_HELP[me.role] || '')}</p>
        </div>
        <div class="tm-summary-actions">
          ${isOwner ? `<button class="btn btn-sm" type="button" data-team-action="rename">${name ? 'Rename' : 'Name the team'}</button>` : `<button class="btn btn-sm" type="button" data-team-action="leave">Leave team</button>`}
        </div>
      </div>
      <div class="tm-rename ${tm.renaming ? '' : 'hidden'}" id="tmRename">
        <div class="acct-add-row">
          <input class="acct-input" type="text" id="tmNameInput" maxlength="80" value="${e(name)}" placeholder="Team name" autocomplete="organization" />
          <button class="btn" type="button" data-team-action="rename-save">Save</button>
          <button class="btn btn-sm" type="button" data-team-action="rename-cancel">Cancel</button>
        </div>
      </div>
      <div class="tm-seats">
        <div class="tm-bar" role="img" aria-label="${e(`${s.used || 0} of ${limit} seats used`)}">
          <span class="tm-bar-used" style="width:${usedPct}%"></span><span class="tm-bar-pending" style="width:${pendPct}%"></span>
        </div>
        <p class="tm-seats-line">${e(String(s.used || 0))} of ${e(String(limit))} seat${limit === 1 ? '' : 's'} used${Number(s.pending) ? `, ${e(String(s.pending))} reserved by pending invite${s.pending === 1 ? '' : 's'}` : ''}. Viewers never use a seat.</p>
      </div>
      <dl class="tm-limits">
        <div><dt>Your API calls</dt><dd>${e(num(lim.apiCalls))} <span class="adm-muted">per month</span></dd></div>
        <div><dt>Your storage</dt><dd>${e(gb(lim.storageBytes))}</dd></div>
      </dl>
    </section>`;
}

function viewerNoteHtml() {
  return `<section class="acct-card"><p class="acct-card-note">You are a viewer on this team: the summary above and what the team publishes are yours to use. The member list is for the team itself.</p></section>`;
}

function allowanceText(m) {
  const a = m.allowance || {};
  const parts = [];
  if (a.apiCalls) parts.push(`${num(a.apiCalls)} calls`);
  if (a.storageBytes) parts.push(gb(a.storageBytes));
  return parts.length ? parts.join(', ') : 'Plan limit';
}

function membersHtml(v) {
  const e = D.escapeHtml;
  const me = v.membership || {};
  const manage = v.canManage;
  const ceiling = v.tenant.limits || {};
  const rows = [...tm.members].sort((a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0) || String(a.email).localeCompare(String(b.email)));
  const rowHtml = (m) => {
    const self = m.userId === me.userId;
    const act = manage && !self && canActOn(me.role, m.role);
    const roleCell = act
      ? `<select class="adm-select tm-role" data-team-role="${e(m.userId)}" aria-label="Role for ${e(m.email)}">
           ${tm.roles.map(r => `<option value="${e(r)}" ${r === m.role ? 'selected' : ''}>${e(cap(r))}</option>`).join('')}
         </select>`
      : `<span class="acct-tag ${m.role === 'owner' ? 'is-primary' : ''}">${e(cap(m.role))}</span>`;
    const suspended = String(m.status).toUpperCase() === 'SUSPENDED';
    return `
      <tr>
        <td class="cell-ellip" title="${e(m.email)}">${e(m.email)}${self ? ' <span class="adm-muted">(you)</span>' : ''}</td>
        <td class="cell-tight">${roleCell}</td>
        <td class="cell-tight">${statusTag(m.status)}${m.seat ? '' : ' <span class="adm-muted">no seat</span>'}</td>
        <td class="cell-tight">${e(allowanceText(m))}${act && m.role !== 'owner' ? ` <button class="btn btn-sm" type="button" data-team-action="allow-edit" data-user="${e(m.userId)}">Edit</button>` : ''}</td>
        <td class="cell-tight tm-actions">${act ? `
          <button class="btn btn-sm" type="button" data-team-action="${suspended ? 'restore' : 'suspend'}" data-user="${e(m.userId)}" data-email="${e(m.email)}">${suspended ? 'Restore' : 'Suspend'}</button>
          <button class="btn btn-sm" type="button" data-team-action="remove" data-user="${e(m.userId)}" data-email="${e(m.email)}">Remove</button>` : ''}</td>
      </tr>
      ${tm.editing === m.userId ? `
      <tr class="tm-edit"><td colspan="5">
        <div class="tm-edit-row">
          <label class="acct-label" for="tmAllowCalls">API calls per month</label>
          <input class="acct-input" type="number" id="tmAllowCalls" min="1" step="1" max="${e(String(ceiling.apiCalls || ''))}" value="${e(String(m.allowance?.apiCalls || ''))}" placeholder="${e(num(ceiling.apiCalls))}" />
          <label class="acct-label" for="tmAllowGb">Storage, GB</label>
          <input class="acct-input" type="number" id="tmAllowGb" min="0.1" step="0.1" value="${e(m.allowance?.storageBytes ? String(Math.round(m.allowance.storageBytes / 1024 ** 3 * 10) / 10) : '')}" placeholder="${e(gb(ceiling.storageBytes).replace(' GB', ''))}" />
          <button class="btn" type="button" data-team-action="allow-save" data-user="${e(m.userId)}">Save</button>
          <button class="btn btn-sm" type="button" data-team-action="allow-clear" data-user="${e(m.userId)}">Use plan limit</button>
          <button class="btn btn-sm" type="button" data-team-action="allow-cancel">Cancel</button>
        </div>
        <p class="acct-card-note tm-edit-note">A cap sits under the plan: up to ${e(num(ceiling.apiCalls))} calls and ${e(gb(ceiling.storageBytes))}. Blank means the plan limit.</p>
      </td></tr>` : ''}`;
  };
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Members</h3>
      <p class="acct-card-note">${manage ? 'Change a role from the list, cap a member under the plan, suspend or remove. The owner is never changed here.' : 'Everyone on the team and what they do.'}</p>
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap tm-table">
          <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Allowance</th><th></th></tr></thead>
          <tbody>${rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>
    </section>`;
}

function inviteHtml(v) {
  const e = D.escapeHtml;
  const s = v.tenant.seats || {};
  const open = Math.max(0, Number(s.available) || 0);
  const pending = tm.invites.filter(i => i.status === 'PENDING');
  const recent = tm.invites.filter(i => i.status !== 'PENDING').slice(0, 5);
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Invite someone</h3>
      <p class="acct-card-note">They get an email with a one-time link that works for seven days, and they must sign in with the address you invite. ${open ? `${e(String(open))} seat${open === 1 ? '' : 's'} open.` : 'No seats open: invite as a viewer, free a seat, or add seats.'}</p>
      <div class="acct-add-row tm-invite-row">
        <input class="acct-input" type="email" id="tmInviteEmail" placeholder="name@company.com" autocomplete="off" spellcheck="false" />
        <select class="adm-select" id="tmInviteRole" aria-label="Role for the invite">
          ${tm.roles.map(r => `<option value="${e(r)}" ${r === 'member' ? 'selected' : ''}>${e(cap(r))}</option>`).join('')}
        </select>
        <button class="btn" type="button" data-team-action="invite">Send invite</button>
      </div>
      <p class="acct-error" id="tmInviteError" hidden></p>
      ${tm.lastInvite ? inviteResultHtml(tm.lastInvite) : ''}
      <h4 class="tm-sub-h">Pending</h4>
      ${pending.length ? `
        <ul class="tm-invites">
          ${pending.map(i => `
            <li>
              <span class="tm-inv-who">${e(i.email)}</span>
              <span class="acct-tag">${e(cap(i.role))}</span>
              <span class="adm-muted">expires ${e(D.fmtDate(i.expiresAt))}</span>
              <button class="btn btn-sm" type="button" data-team-action="revoke" data-invite="${e(i.inviteId)}" data-email="${e(i.email)}">Revoke</button>
            </li>`).join('')}
        </ul>` : `<p class="acct-empty">No pending invites.</p>`}
      ${recent.length ? `<p class="acct-card-note tm-recent">Recent: ${recent.map(i => `${e(i.email)} (${e(i.status.toLowerCase())})`).join(', ')}.</p>` : ''}
    </section>`;
}

function inviteResultHtml(r) {
  const e = D.escapeHtml;
  const mail = r.emailed === true ? 'Emailed.' : r.emailed === 'suppressed' ? 'Email suppressed on this lane; share the link yourself.' : 'The email did not go out; share the link yourself.';
  return `
    <div class="tm-invite-result">
      <p><b>Invite sent to ${e(r.invite?.email || '')}</b> as ${e(r.invite?.role || '')}. ${e(mail)} The link works once and expires ${e(D.fmtDate(r.invite?.expiresAt))}.</p>
      <div class="acct-add-row">
        <input class="acct-input tm-link" type="text" readonly value="${e(r.link || '')}" aria-label="Invite link" />
        <button class="btn btn-sm" type="button" data-team-action="copy-link" data-link="${e(r.link || '')}">Copy</button>
      </div>
    </div>`;
}

function detailLabel(ev) {
  const d = ev.detail || {};
  if (d.role && typeof d.role === 'object') return `role ${d.role.from} to ${d.role.to}`;
  if (d.status && typeof d.status === 'object') return `${String(d.status.from).toLowerCase()} to ${String(d.status.to).toLowerCase()}`;
  if (d.allowance) { const a = d.allowance; const p = []; if (a.apiCalls) p.push(`${num(a.apiCalls)} calls`); if (a.storageBytes) p.push(gb(a.storageBytes)); return p.length ? `cap ${p.join(', ')}` : 'cap cleared'; }
  if (ev.action === 'tenant.rename') return `"${d.from || ''}" to "${d.to || ''}"`;
  if (typeof d.role === 'string') return `as ${d.role}`;
  return '';
}

function activityHtml() {
  const e = D.escapeHtml;
  if (!tm.audit.length) return '';
  return `
    <section class="acct-card">
      <h3 class="acct-card-h">Activity</h3>
      <ul class="tm-activity">
        ${tm.audit.map(ev => `
          <li>
            <span class="adm-muted tm-act-when">${e(D.fmtDate(ev.at))}</span>
            <span class="tm-act-what"><b>${e(ACTION_LABEL[ev.action] || ev.action)}</b> ${e(ev.actor || '')}${ev.target && ev.target !== ev.actor ? ` <span class="adm-muted">to</span> ${e(ev.target)}` : ''} <span class="adm-muted">${e(detailLabel(ev))}</span></span>
          </li>`).join('')}
      </ul>
    </section>`;
}

/* ---------- actions ---------- */

async function post(path, payload, errorId = 'tmError') {
  D.showError(errorId, '');
  return D.apiFetch(url(path), { method: 'POST', body: body(payload) });
}

async function act(fn, errorId = 'tmError', fallback = 'That change did not go through.') {
  try { await fn(); await loadTeam(); }
  catch (ex) {
    // The server's sentences here are written for the team manager (seats,
    // the ladder, a bad address); they win over the generic wording.
    const msg = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback));
    if (errorId === 'tmInviteError') { D.showError(errorId, msg); }
    else { await loadTeam(); D.showError(errorId, msg); }
  }
}

async function copyText(text, btn) {
  const orig = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch {
    const input = btn.closest('.acct-add-row')?.querySelector('input');
    if (input) { input.focus(); input.select(); }
    btn.textContent = 'Select and copy';
  }
  setTimeout(() => { btn.textContent = orig; }, 1600);
}

export function bindTeamActions(deps) {
  if (bindTeamActions._bound) return;
  bindTeamActions._bound = true;
  D = D || deps;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-team-action]');
    if (!btn) return;
    e.preventDefault();
    const a = btn.dataset.teamAction;
    const userId = btn.dataset.user || '';
    const who = btn.dataset.email || 'this person';

    if (a === 'rename') { tm.renaming = true; document.getElementById('tmRename')?.classList.remove('hidden'); document.getElementById('tmNameInput')?.focus(); return; }
    if (a === 'rename-cancel') { tm.renaming = false; document.getElementById('tmRename')?.classList.add('hidden'); return; }
    if (a === 'rename-save') {
      const name = (document.getElementById('tmNameInput')?.value || '').trim();
      return void act(async () => { await post(`${TENANT_URL}/rename`, { organizationName: name }); tm.renaming = false; });
    }
    if (a === 'leave') {
      const name = tm.view?.tenant?.organizationName || 'this team';
      if (!window.confirm(`Leave ${name}? You will need a new invite to come back.`)) return;
      return void act(async () => { await post(`${TENANT_URL}/leave`, {}); tm.teamId = ''; remember(); });
    }
    if (a === 'invite') {
      const email = (document.getElementById('tmInviteEmail')?.value || '').trim();
      const role = document.getElementById('tmInviteRole')?.value || 'member';
      if (!email) { D.showError('tmInviteError', 'Enter an email address.'); return; }
      btn.disabled = true;
      return void act(async () => {
        const res = await post(`${TENANT_URL}/invites`, { email, role }, 'tmInviteError');
        tm.lastInvite = res;
      }, 'tmInviteError', 'The invite could not be sent.').finally(() => { btn.disabled = false; });
    }
    if (a === 'copy-link') return void copyText(btn.dataset.link || '', btn);
    if (a === 'revoke') {
      if (!window.confirm(`Withdraw the invite to ${who}? The link stops working.`)) return;
      return void act(async () => { await post(`${TENANT_URL}/invites/revoke`, { inviteId: btn.dataset.invite }); if (tm.lastInvite?.invite?.inviteId === btn.dataset.invite) tm.lastInvite = null; });
    }
    if (a === 'suspend') {
      if (!window.confirm(`Suspend ${who}? They keep their seat and cannot get in until restored.`)) return;
      return void act(() => post(`${TENANT_URL}/members/patch`, { userId, status: 'SUSPENDED' }));
    }
    if (a === 'restore') return void act(() => post(`${TENANT_URL}/members/patch`, { userId, status: 'ACTIVE' }));
    if (a === 'remove') {
      if (!window.confirm(`Remove ${who} from the team? Their seat frees up. They can be invited again later.`)) return;
      return void act(() => post(`${TENANT_URL}/members/remove`, { userId }));
    }
    if (a === 'allow-edit') { tm.editing = userId; paint(); document.getElementById('tmAllowCalls')?.focus(); return; }
    if (a === 'allow-cancel') { tm.editing = null; paint(); return; }
    if (a === 'allow-clear') { return void act(async () => { await post(`${TENANT_URL}/members/patch`, { userId, allowance: {} }); tm.editing = null; }); }
    if (a === 'allow-save') {
      const calls = (document.getElementById('tmAllowCalls')?.value || '').trim();
      const gbv = (document.getElementById('tmAllowGb')?.value || '').trim();
      const allowance = {};
      if (calls) allowance.apiCalls = Number(calls);
      if (gbv) allowance.storageBytes = gbToBytes(gbv);
      return void act(async () => { await post(`${TENANT_URL}/members/patch`, { userId, allowance }); tm.editing = null; });
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'tmSwitch') {
      tm.teamId = e.target.value || '';
      tm.lastInvite = null; tm.editing = null;
      remember();
      loadTeam();
      return;
    }
    const sel = e.target.closest?.('[data-team-role]');
    if (sel) {
      const userId = sel.dataset.teamRole;
      const role = sel.value;
      sel.disabled = true;
      act(() => post(`${TENANT_URL}/members/patch`, { userId, role }));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'tmInviteEmail') { e.preventDefault(); document.querySelector('[data-team-action="invite"]')?.click(); }
    if (e.target.id === 'tmNameInput') { e.preventDefault(); document.querySelector('[data-team-action="rename-save"]')?.click(); }
  });
}

/* ================================================================
   TENANTS (operators only; the server re-checks every call)
   ================================================================ */

export async function renderTenants(main, deps) {
  D = deps;
  const e = D.escapeHtml;
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Tenants</h2></header>
    <p class="adm-note">Every team on the platform: who owns it, its plan, whether the software has provisioned storage, seats in use. Counts and names only. Tenant data never renders here.</p>
    <p class="adm-error" id="tnError" hidden></p>
    <div id="tnBody"><p class="adm-note">Loading…</p></div>
  `;
  const host = document.getElementById('tnBody');
  try {
    const d = await D.apiFetch(ADMIN_TENANTS_URL);
    const rows = d.tenants || [];
    if (!rows.length) { host.innerHTML = `<p class="adm-empty">No tenants yet. The first paying owner to open Team creates one.</p>`; return; }
    host.innerHTML = `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap">
          <thead><tr><th>Team</th><th>Owner</th><th>Plan</th><th>Storage</th><th class="adm-num">Seats</th><th class="adm-num">Members</th><th>Created</th></tr></thead>
          <tbody>
            ${rows.map(t => `
              <tr>
                <td class="cell-ellip" title="${e(t.environmentId)}">${e(t.organizationName || 'Unnamed')}<div class="adm-muted"><code>${e(String(t.environmentId).slice(0, 8))}</code></div></td>
                <td class="cell-ellip adm-cell-email" title="${e(t.ownerEmail)}">${e(t.ownerEmail || '')}${t.ownerStatus && t.ownerStatus !== 'ACTIVE' ? ` <span class="acct-tag is-pending">${e(String(t.ownerStatus).toLowerCase())}</span>` : ''}</td>
                <td class="cell-tight"><span class="adm-tier adm-tier-${e(t.tier)}">${e(tierName(t.tier))}</span></td>
                <td class="cell-tight">${t.provisioned ? '<span class="acct-tag is-verified">provisioned</span>' : '<span class="acct-tag">team only</span>'}</td>
                <td class="adm-num cell-tight">${e(String(t.seats?.used ?? 0))} / ${e(String(t.seats?.limit ?? 0))}${Number(t.seats?.pending) ? `<div class="adm-muted">+${e(String(t.seats.pending))} pending</div>` : ''}</td>
                <td class="adm-num cell-tight">${e(String(t.members ?? 0))}${Number(t.viewers) ? `<div class="adm-muted">${e(String(t.viewers))} viewer${t.viewers === 1 ? '' : 's'}</div>` : ''}</td>
                <td class="adm-muted cell-tight">${e(D.fmtDate(t.createdAt))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${d.truncated ? `<p class="adm-note">Showing the first ${rows.length}.</p>` : ''}
    `;
  } catch (ex) {
    host.innerHTML = '';
    if (ex?.status === 404) { host.innerHTML = `<p class="adm-empty">The tenant routes are not on this lane yet. Deploy the backend that carries them, then reload.</p>`; return; }
    D.showError('tnError', D.friendlyError(ex, 'Could not load tenants.'));
  }
}
