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
import { explainLink } from '../components/explainer.js';
import { cardHtml, iconBtn, leadBtn, ico, armed, busy, hold, stateLead, copyButton, initCards } from './cards.js';

const TENANT_URL = `${PRAG_API_BASE}/tenant`;
const SCOPES_URL = `${TENANT_URL}/scopes`;
const ADMIN_TENANTS_URL = `${PRAG_API_BASE}/admin/tenants`;
const PROVISION_URL = `${PRAG_API_BASE}/environment/provision`;
const REAL_ORDERS_URL = `${PRAG_API_BASE}/admin/real-orders`;
const TEAM_KEY = 'pragoptics_team_id';

const ROLE_HELP = {
  owner: 'Pays for the account. Final say on everything.',
  admin: 'Manages developers and members: invites, roles, seats. No billing.',
  developer: 'Publishes routes, builds and automations. Reads logs.',
  member: 'A seat: signs in and uses the apps and APIs.',
  viewer: 'Read only. No seat.'
};
const ROLE_RANK = { owner: 5, admin: 4, developer: 3, member: 2, viewer: 1, guest: 0 };

/* THE TEAM'S HISTORY IN WORDS (2026-09-23). The trail holds the team's own changes and, since Part 1, licensing, the
 * requests people send the owner, and the operator's work on the team's stuck items. Every action the backend writes
 * has its words here; an unknown one is spelled out rather than shown as its code. The platform's own entries and
 * the operator's name PragOptics, never an operator's address, and nothing here repeats a provider's own text. */
const ACTION_LABEL = {
  'invite.create': 'Invited', 'invite.accept': 'Joined', 'invite.revoke': 'Invite withdrawn',
  'member.patch': 'Changed', 'member.remove': 'Removed', 'member.leave': 'Left', 'tenant.rename': 'Renamed',
  'team.scopes.set': 'Changed what roles can do',
  'requests.create': 'Asked the owner',
  'licensing.account.open': 'Opened the licensing account',
  'licensing.account.rename': 'Renamed the licensing account',
  'licensing.microsoft.set': 'Saved the Microsoft details',
  'licensing.tenant.found': 'Microsoft tenant found',
  'licensing.order': 'Ordered a license',
  'licensing.order.unanswered': 'License ordered, no answer yet',
  'licensing.order.refused': 'License order refused',
  'licensing.order.landed': 'License order confirmed',
  'licensing.marked.refused': 'License order marked refused',
  'licensing.attach': 'License confirmed',
  'licensing.enroll': 'Ordered the included mailboxes',
  'licensing.enroll.unanswered': 'Included mailboxes ordered, no answer yet',
  'licensing.enroll.refused': 'Included mailboxes refused',
  'licensing.mailbox.give': 'Gave a mailbox',
  'licensing.mailbox.release': 'Took back a mailbox',
  'licensing.license.assign': 'Assigned a license',
  'licensing.license.unassign': 'Took back a license',
  'licensing.license.sku': 'Learned whether a license has its own mailbox',
  'licensing.license.mailbox': 'Moved mailboxes for a license',
  'licensing.order.checked': 'A license order was checked with Microsoft',
  'licensing.included.quantity': 'Changed the included mailboxes',
  'licensing.quantity': 'Changed license seats',
  'licensing.quantity.refused': 'Seat change refused',
  'licensing.quantity.sent': 'Seat change sent to Microsoft',
  'licensing.quantity.applied': 'Seat change in effect',
  'licensing.quantity.moved': 'Fewer license seats moved to the next renewal',
  'licensing.raise.credited': 'Added license seats kept as a credit',
  'licensing.bill.lowered': 'Bill brought down to the license seats held',
  'licensing.bill.removed': 'License taken off the bill',
  'licensing.cancel': 'Set a license to end',
  'licensing.cancel.sent': 'License ending sent to Microsoft',
  'licensing.cancel.by-hand': 'License ending confirmed at Microsoft',
  'licensing.keep': 'Kept a license that was ending',
  'licensing.cancelled.provider': 'License cancelled',
  'licensing.ended.unpaid': 'Licenses ended: a payment failed',
  'licensing.ended.closed': 'Licenses ended with the account',
  'licensing.close.charged': 'Final bill charged for license commitments',
  'licensing.close.charge.failed': 'Final bill for license commitments not charged',
  'licensing.close.credited': 'Final bill kept as a credit',
  'licensing.tenant.handover': 'Microsoft tenant handed over',
  'licensing.plan.ended': 'Licenses ended with the plan',
  'licensing.plan.resumed': 'Licensing back with the plan',
  'licensing.billing.stop': 'Stopped a license charge',
  // the money plan (2026-09-24): nothing is credited any more (decision 37(9)); what a failed payment leaves owed
  // (decision 21); Microsoft price changes (37(11)); Education and Nonprofit approval (37(7))
  'licensing.raise.not-delivered': 'License seats charged and not added',
  'licensing.close.kept': 'Final bill kept toward closing',
  'licensing.close.charge.refused': 'Final bill not charged: the amount or the address changed',
  'licensing.refund': 'Refunded to the card',
  'licensing.reorder': 'Ordered again on the money already paid',
  'licensing.reorder.seats': 'License seats sent again on the money already paid',
  'licensing.debt.charged': 'Charged the rest of a license term',
  'licensing.debt.owed': 'The rest of a license term is owed',
  'licensing.debt.paid': 'Paid what was owed for a license',
  'licensing.debt.pay': 'Paid what was owed for licenses',
  'licensing.gap.billed': 'Dropped license seats billed for the days until Microsoft took the change',
  'licensing.quantity.amount-differs': 'A license seat charge differed from its quote',
  'licensing.invoice.not-finalized': 'A license charge waits for the billing address',
  'licensing.price.pending': 'Microsoft changed a license price',
  'licensing.price.withdrawn': 'A license price change was withdrawn',
  'licensing.price.moved': 'A license moved to its new price',
  'licensing.qualification.ask': 'Asked for Microsoft approval',
  'licensing.qualification.answer': 'Microsoft answered the approval',
  'domain.add': 'Added a domain', 'domain.verify': 'Verified a domain', 'domain.remove': 'Removed a domain',
  'domain.renewal': 'Changed a domain renewal', 'domain.bind': 'Served the software at a domain', 'domain.unbind': 'Stopped serving at a domain',
  'domain.link': 'Linked a domain', 'domain.unlink': 'Unlinked a domain', 'domain.register.retry': 'Tried a domain registration again',
  'connection.add': 'Added a connection', 'connection.remove': 'Removed a connection', 'connection.test': 'Tested a connection',
  'connection.authorize': 'Connection authorized', 'connection.webhook': 'Connection event',
  'environment.export': 'Exported the environment',
  'apikey.create': 'Made an API key', 'apikey.revoke': 'Revoked an API key', 'ai.budget': 'Changed the AI budget',
  'project.remove': 'Removed a project', 'site.import': 'Imported a site', 'site.publish': 'Published a site', 'site.remove': 'Took a site down',
  'supplier.sync': 'Synced supplier products', 'build.publish': 'Published a build', 'build.remove': 'Removed a build', 'build.done': 'A build finished'
};
// What a request to the owner was for (requests.create, requests.decide).
const REQUEST_KIND = { 'license.add': 'a new license', 'license.seats': 'a change of license seats', 'license.end': 'ending a license', 'mailbox.request': 'a mailbox' };
// What the operator worked on (needs-attention.<action>), in the customer's words.
const ATTENTION_KIND = {
  'order.stuck-paid': 'a paid license order', 'order.delayed': 'a license order', 'order.cancelled': 'a cancelled license order',
  'company.inactive': 'your licensing account', 'tenant.not-created': 'your Microsoft tenant', 'subscription.orphan': 'a license bill',
  'sweep.refused': 'a license change', 'plan.ended': 'licensing after the plan ended', 'pause.failed': 'pausing your environment',
  'license.mail-unknown': 'which license carries a mailbox',
  'order.refused': 'a license order', 'billing.failed': 'a license bill', 'sweep.failed': 'a license', 'kiosk.unlisted': 'the included mailboxes',
  'decrease.moved': 'fewer license seats', 'close.credit-failed': 'your final bill', 'tenant.handover': 'your Microsoft tenant',
  'microsoft.approval': 'your Microsoft 365 approval'
};
// Who acted, when it was not a person: the platform itself, or a connected service answering.
const ACTOR_NAME = { system: 'PragOptics', stripe: 'Stripe', shippo: 'Shippo', shopify: 'Shopify', twilio: 'Twilio', microsoft: 'Microsoft' };
// A provider's answer is written as connection.authorize whatever it was (Twilio, Shippo, Shopify, Microsoft 365): the
// entry's outcome picks the words, so a decline or a sign-in that ran out of time never reads "Connection authorized".
const AUTHORIZE_LABEL = {
  authorized: 'Connection authorized', declined: 'Connection declined', failed: 'Connection did not finish',
  expired: 'Connection not finished in time', 'approval-needed': "Connection waiting for an administrator's approval",
  'signed-in': 'Signed in, connection not finished yet', refused: 'Connection not kept: not the person who pressed Connect',
  approved: 'Approved for the organization'
};

// The roles the owner gives permissions to (2026-09-23). The owner holds every one and is never a row; a viewer holds none.
const SCOPE_ROLES = ['admin', 'developer', 'member'];
const ROLE_PLURAL = { admin: 'Admins', developer: 'Developers', member: 'Members' };
// Permissions the server's catalog carries that grant nothing yet: none since Pax8 Part 2 (2026-09-27), when "Manage
// domains and mail" gained its controls on the Licensing tab (connect the tenant, add domains, switch mail). A switch
// listed here stays off the card; what the server stores for it is sent back untouched on every save.
const LATER_SCOPES = new Set([]);

// Section state. The remembered team survives a panel re-entry within the tab.
// scopes: what each role can do, as GET v1/tenant/scopes answered: { catalog (the switches shown), all (every id the
// server knows), labels (id -> label, for the history), roles, canEdit }, or null. scopesFor: the team and role it was read for.
// scopesState: '' (not for this reader) | 'loading' | 'ready' | 'error' | 'absent' (the lane has no such route: no card).
// scopesBusy: 'role|scopeId' while that switch's save is out; scopesTarget: the state it is being saved to.
// scopesSaveError: { key, team, text, seen } for a save that failed, kept until the owner has seen it on that team.
// acting: { sel, word, status } while a Team request other than a switch is out (one change at a time).
const tm = {
  teamId: '', view: null, members: [], invites: [], roles: ['admin', 'developer', 'member', 'viewer'], audit: [], lastInvite: null, editing: null, renaming: false,
  scopes: null, scopesFor: '', scopesState: '', scopesError: '', scopesBusy: '', scopesTarget: false, scopesSaved: '', scopesSaveError: null,
  acting: null,
  // licensing L5d (2026-09-24): a change that ends someone's seat asks first, in words, in a row under them (or under the
  // team's head for Leave): { kind: 'viewer' | 'remove' | 'leave', userId, email }
  confirm: null
};
try { tm.teamId = sessionStorage.getItem(TEAM_KEY) || ''; } catch { /* fine */ }

let D = null;   // deps from account.js: apiFetch, escapeHtml, friendlyError, showError, fmtDate, cachedPing, teamPicked

/** Keep the team in view for the tab, and tell the panel (its Licensing entry follows the role on this team). */
function remember() {
  try { tm.teamId ? sessionStorage.setItem(TEAM_KEY, tm.teamId) : sessionStorage.removeItem(TEAM_KEY); } catch { /* fine */ }
  try { D?.teamPicked?.(); } catch { /* the entry catches up on the next read */ }
}
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
/**
 * The roles this person may invite into or move someone into (decision 25, 2026-09-24): the owner every one; an admin
 * developer and member only, since making an admin or a viewer is the owner's. The server answers it with the member
 * list (GET v1/tenant/members `assignable`); a lane without it falls back to the same rule.
 */
function assignableFor(role) {
  if (Array.isArray(tm.assignable)) return tm.assignable;
  if (role === 'owner') return ['admin', 'developer', 'member', 'viewer'];
  if (role === 'admin') return ['developer', 'member'];
  return [];
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
  // The team in view is the tab's pragoptics_team_id as it is now: the studio's door sets it after this module loaded
  // (runtime/bootstrap.js captureAccountReturn), and Environment and Licensing read it on every call. The copy read at
  // load would show the old team here. Storage that refuses keeps the one in memory.
  try { tm.teamId = sessionStorage.getItem(TEAM_KEY) || ''; } catch { /* the one in memory */ }
  tm.editing = null; tm.renaming = false; tm.scopesSaved = '';
  // a failed permission save the owner has already seen goes; one that failed while they were away waits for them
  if (tm.scopesSaveError?.seen) tm.scopesSaveError = null;
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Team</h2>${explainLink('team', 'How teams, seats and roles work')}</header>
    <p class="acct-error" id="tmError" hidden></p>
    <p class="tm-status" id="tmStatus" role="status" aria-live="polite" hidden></p>
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

/** The team and role the permissions card was read for: a change to either reads it again. */
function scopesKey(view = tm.view) { return `${view?.tenant?.environmentId || ''}|${view?.membership?.role || ''}`; }

/**
 * Read the team in view and paint it. `keepScopes`: after a change on this tab (a role, a cap, an invite), the
 * permissions already on the card are kept when they were read for the same team and the same role of the reader;
 * nothing a member action does changes them, so they are not read again.
 */
async function loadTeam({ keepScopes = false } = {}) {
  const host = document.getElementById('tmBody');
  if (!host) return;
  D.showError('tmError', '');
  try {
    const view = await fetchView();
    tm.view = view;
    if (!view.tenant) { host.innerHTML = emptyHtml(view); applyLocks(); return; }
    // What each role can do: read by a member and above (the route's own floor); a viewer never gets the card.
    const readsScopes = (ROLE_RANK[view.membership?.role] || 0) >= ROLE_RANK.member;
    if (!readsScopes) { tm.scopes = null; tm.scopesFor = ''; tm.scopesState = ''; tm.scopesError = ''; }
    const reuse = keepScopes && tm.scopesState === 'ready' && !!tm.scopes && tm.scopesFor === scopesKey(view);
    const [mem, audit] = await Promise.all([
      view.canReadTeam ? D.apiFetch(url(`${TENANT_URL}/members`)) : Promise.resolve(null),
      view.canManage ? D.apiFetch(url(`${TENANT_URL}/audit`, { limit: 20 })).catch(() => null) : Promise.resolve(null),
      readsScopes && !reuse ? fetchScopes() : Promise.resolve()
    ]);
    tm.members = mem?.members || [];
    tm.invites = mem?.invites || [];
    if (Array.isArray(mem?.roles) && mem.roles.length) tm.roles = mem.roles;
    tm.assignable = Array.isArray(mem?.assignable) ? mem.assignable : null;
    tm.audit = audit?.events || [];
    paint();
  } catch (ex) {
    host.innerHTML = '';
    if (ex?.status === 404 && !ex?.data?.needsTenant) {
      host.innerHTML = `<p class="acct-empty">The team routes are not on this lane yet. Deploy the backend that carries them, then reload.</p>`;
      return;
    }
    // A refusal here is written for the customer on the server ("You are not a member of that team",
    // "Your membership in this team is suspended"), so it is shown as is (2026-09-20, live: the
    // generic 403 sentence hid the reason).
    D.showError('tmError', (ex?.status === 403 && ex?.data?.error) || D.friendlyError(ex, 'Could not load your team.'));
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
    <div id="tmScopes" class="tm-scopes-host">${scopesHtml()}</div>
    ${v.canManage ? inviteHtml(v) : ''}
    ${v.canManage ? activityHtml() : ''}
  `;
  // a change still out (this paint may be a return to the tab while it is) keeps its control turning and the rest waiting
  applyLocks();
}

function emptyHtml(view) {
  const e = D.escapeHtml;
  if (view.provisioning) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Your environment is being set up.</h3>
        <p class="acct-card-note">Your team shows here the moment it exists, usually within a moment of signing in. Press Refresh.</p>
        <div class="acct-actions-row"><button class="btn btn-sm btn-lead" type="button" data-acct-section="team">${ico('refresh')}<span>Refresh</span></button></div>
      </section>`;
  }
  if (view.needsSubscription) {
    return `
      <section class="acct-card">
        <h3 class="acct-card-h">Your team starts with a plan.</h3>
        <p class="acct-card-note">User is one seat, yours. Partner includes five seats and Super forty-five, with more available. Add the platform and your team comes with it; the people you invite sign in with their own login and see only your team.</p>
        <div class="acct-actions-row"><button class="btn btn-sm btn-lead btn-primary" type="button" data-acct-action="subscribe">${ico('layers')}<span>See plans</span></button></div>
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
          <div class="tm-tags"><span class="acct-tag is-primary">${e(tierName(t.tier))}</span><span class="acct-tag">${e(cap(me.role))}</span>${t.provisioned ? '' : '<span class="acct-tag is-pending" title="No storage has been provisioned for this team yet. The software does that.">no storage yet</span>'}</div>
          <h3 class="acct-card-h tm-name">${e(name || (isOwner ? 'Your team' : 'Unnamed team'))}</h3>
          <p class="acct-card-note tm-owner">Owner ${e(t.ownerEmail || '')}. ${e(ROLE_HELP[me.role] || '')}</p>
        </div>
        <div class="tm-summary-actions act-row">
          ${isOwner ? (() => { const tip = ['partner', 'super'].includes(t.tier) ? 'Add seats on Billing, per seat per month' : 'More seats come with Partner and Super, on Billing'; return `<button class="btn btn-sm btn-ico" type="button" data-acct-section="subscription" aria-label="${e(tip)}" data-tip="${e(tip)}">${ico('userPlus')}</button>`; })() : ''}
          ${isOwner ? iconBtn({ team: 'rename' }, 'edit', name ? 'Rename the team' : 'Name the team') : iconBtn({ team: 'leave' }, 'logOut', 'Leave this team', '', 'is-risky')}
        </div>
      </div>
      ${tm.confirm?.kind === 'leave' && !isOwner ? leaveConfirmHtml(t, me) : ''}
      <div class="tm-rename ${tm.renaming ? '' : 'hidden'}" id="tmRename">
        <div class="acct-add-row tm-inline-edit">
          <input class="acct-input" type="text" id="tmNameInput" maxlength="80" value="${e(name)}" placeholder="Team name" autocomplete="organization" aria-label="Team name" />
          <span class="act-row">${iconBtn({ team: 'rename-save' }, 'check', 'Save the name', '', 'btn-primary')}${iconBtn({ team: 'rename-cancel' }, 'x', 'Cancel')}</span>
        </div>
      </div>
      <div class="tm-seats">
        <div class="tm-bar" role="img" aria-label="${e(`${s.used || 0} of ${limit} seats used`)}">
          <span class="tm-bar-used" style="width:${usedPct}%"></span><span class="tm-bar-pending" style="width:${pendPct}%"></span>
        </div>
        <p class="tm-seats-line">${e(String(s.used || 0))} of ${e(String(limit))} seat${limit === 1 ? '' : 's'} used${Number(s.pending) ? `, ${e(String(s.pending))} reserved by pending invite${s.pending === 1 ? '' : 's'}` : ''}. Viewers never use a seat.</p>
        ${Number(s.over) > 0 ? `<p class="acct-error tm-over">${e(String(s.over))} ${s.over === 1 ? 'person is' : 'people are'} in seats beyond what the plan carries. Nobody is removed, but no new seat can be filled until ${s.over === 1 ? 'one person moves to viewer or leaves the team' : `${e(String(s.over))} people move to viewer or leave the team`}${isOwner ? ', or you add seats on Billing' : ''}.</p>` : ''}
      </div>
      <dl class="tm-limits">
        <div><dt>Your API calls</dt><dd>${e(num(lim.apiCalls))} <span class="adm-muted">per month</span></dd></div>
        <div><dt>Your storage</dt><dd>${e(gb(lim.storageBytes))}</dd></div>
      </dl>
    </section>`;
}

/*
 * LICENSING L5d (2026-09-24): a seat's included mailbox belongs to the seat. Moving someone to viewer, removing them or
 * leaving ends the seat, and with it the mailbox and any license given to them; Microsoft keeps a mailbox's mail for 30
 * days after it ends, then deletes it ("Assign or unassign licenses for users", learn.microsoft.com). So each of the
 * three asks first in words, and sends nothing until its own button is pressed.
 */
const MAIL_KEPT = 'Once a mailbox ends, Microsoft keeps its mail for 30 days, then deletes it.';
function seatEndsHtml(m) {
  const e = D.escapeHtml, viewer = tm.confirm?.kind === 'viewer';
  // a viewer holds no seat, so removing one ends no mailbox and no license (the server's isSeatRole, the row's m.seat)
  const text = viewer
    ? `Move ${m.email} to viewer? A viewer has no seat, so the included mailbox and any license given to them end with the seat. ${MAIL_KEPT}`
    : m.seat
      ? `Remove ${m.email} from the team? Their seat ends, and with it their included mailbox and any license given to them. ${MAIL_KEPT}`
      : `Remove ${m.email} from the team? They hold no seat, so nothing else changes.`;
  const who = `data-user="${e(m.userId)}" data-email="${e(m.email)}"`;
  return `
    <div class="tm-confirm-row" role="group" aria-label="${e(viewer ? `Move ${m.email} to viewer` : `Remove ${m.email} from the team`)}">
      <p class="acct-card-note">${e(text)}</p>
      <span class="act-row">
        ${viewer ? leadBtn({ team: 'confirm-viewer' }, 'userMinus', 'Move to viewer', who, 'is-danger') : leadBtn({ team: 'confirm-remove' }, 'userMinus', 'Remove from the team', who, 'is-danger')}
        ${leadBtn({ team: 'confirm-cancel' }, 'undo', viewer ? 'Keep the role' : 'Keep them')}
      </span>
    </div>`;
}
function leaveConfirmHtml(t, me = {}) {
  const e = D.escapeHtml, name = t.organizationName || 'this team';
  const seated = me.role !== 'viewer' && me.seat !== false;
  return `
    <div class="tm-confirm-row" role="group" aria-label="${e(`Leave ${name}`)}">
      <p class="acct-card-note">${e(seated ? `Leave ${name}? Your seat ends, and with it your included mailbox and any license given to you. ${MAIL_KEPT}` : `Leave ${name}?`)}</p>
      <span class="act-row">
        ${leadBtn({ team: 'confirm-leave' }, 'logOut', 'Leave the team', '', 'is-danger')}
        ${leadBtn({ team: 'confirm-cancel' }, 'undo', 'Stay')}
      </span>
    </div>`;
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
    const give = assignableFor(me.role);
    const choices = tm.roles.filter(r => give.includes(r) || r === m.role);
    const roleCell = act
      ? `<select class="adm-select tm-role" data-team-role="${e(m.userId)}" aria-label="Role for ${e(m.email)}">
           ${choices.map(r => `<option value="${e(r)}" ${r === m.role ? 'selected' : ''}${give.includes(r) ? '' : ' disabled'}>${e(cap(r))}</option>`).join('')}
         </select>`
      : `<span class="acct-tag ${m.role === 'owner' ? 'is-primary' : ''}">${e(cap(m.role))}</span>`;
    const suspended = String(m.status).toUpperCase() === 'SUSPENDED';
    return `
      <tr>
        <td class="cell-ellip" data-th="Person" title="${e(m.email)}">${e(m.email)}${self ? ' <span class="adm-muted">(you)</span>' : ''}</td>
        <td class="cell-tight" data-th="Role">${roleCell}</td>
        <td class="cell-tight" data-th="Status">${statusTag(m.status)}${m.seat ? '' : ' <span class="adm-muted">no seat</span>'}</td>
        <td class="cell-tight" data-th="Allowance"><span class="tm-allow">${e(allowanceText(m))}</span></td>
        <td class="cell-tight tm-actions" data-th="">${act ? `<span class="act-row">
          ${m.role !== 'owner' ? iconBtn({ team: 'allow-edit' }, 'sliders', `Cap ${m.email} under the plan`, `data-user="${e(m.userId)}"`) : ''}
          ${suspended
            ? (m.suspendedByOwner && me.role !== 'owner'
              ? `<span class="adm-muted">Only the owner restores</span>`
              : iconBtn({ team: 'restore' }, 'play', `Restore ${m.email}`, `data-user="${e(m.userId)}" data-email="${e(m.email)}"`))
            : iconBtn({ team: 'suspend' }, 'pause', `Suspend ${m.email}: they stay on the team but cannot use it until restored`, `data-user="${e(m.userId)}" data-email="${e(m.email)}"`, 'is-risky')}
          ${iconBtn({ team: 'remove' }, 'userMinus', `Remove ${m.email} from the team`, `data-user="${e(m.userId)}" data-email="${e(m.email)}"`, 'is-risky')}
        </span>` : ''}</td>
      </tr>
      ${tm.editing === m.userId ? `
      <tr class="tm-edit"><td colspan="5">
        <div class="tm-edit-row">
          <label class="tm-field"><span class="acct-label">API calls per month</span>
            <input class="acct-input" type="number" id="tmAllowCalls" min="1" step="1" max="${e(String(ceiling.apiCalls || ''))}" value="${e(String(m.allowance?.apiCalls || ''))}" placeholder="${e(num(ceiling.apiCalls))}" /></label>
          <label class="tm-field"><span class="acct-label">Storage, GB</span>
            <input class="acct-input" type="number" id="tmAllowGb" min="0.1" step="0.1" value="${e(m.allowance?.storageBytes ? String(Math.round(m.allowance.storageBytes / 1024 ** 3 * 10) / 10) : '')}" placeholder="${e(gb(ceiling.storageBytes).replace(' GB', ''))}" /></label>
          <span class="act-row tm-edit-acts">
            ${iconBtn({ team: 'allow-save' }, 'check', 'Save the cap', `data-user="${e(m.userId)}"`, 'btn-primary')}
            ${iconBtn({ team: 'allow-clear' }, 'undo', 'Back to the plan limit', `data-user="${e(m.userId)}"`)}
            ${iconBtn({ team: 'allow-cancel' }, 'x', 'Cancel')}
          </span>
        </div>
        <p class="acct-card-note tm-edit-note">A cap sits under the plan: up to ${e(num(ceiling.apiCalls))} calls and ${e(gb(ceiling.storageBytes))}. Blank means the plan limit.</p>
      </td></tr>` : ''}
      ${tm.confirm && tm.confirm.userId === m.userId && tm.confirm.kind !== 'leave' ? `<tr class="tm-edit"><td colspan="5">${seatEndsHtml(m)}</td></tr>` : ''}`;
  };
  return cardHtml({ key: 'team:members', icon: 'users', title: 'Members', summary: e(`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`), open: true, body: `
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap tm-table">
          <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Allowance</th><th></th></tr></thead>
          <tbody>${rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>
      ${manage ? `<p class="acct-card-note ev-dom-door">Change a role from the list, cap a member under the plan, suspend or remove. The owner is never changed here.${me.role === 'owner' ? '' : ' Only the owner makes someone an admin or a viewer, and changes, suspends or removes an admin.'}</p>` : ''}` });
}

function inviteHtml(v) {
  const e = D.escapeHtml;
  const s = v.tenant.seats || {};
  const open = Math.max(0, Number(s.available) || 0);
  const pending = tm.invites.filter(i => i.status === 'PENDING');
  const recent = tm.invites.filter(i => i.status !== 'PENDING').slice(0, 5);
  const myRole = v.membership?.role || '';
  const give = assignableFor(myRole);
  const isOwner = myRole === 'owner';
  return cardHtml({ key: 'team:invite', icon: 'userPlus', title: 'Invite someone', summary: e(open ? `${open} seat${open === 1 ? '' : 's'} open${pending.length ? ` · ${pending.length} pending` : ''}` : (pending.length ? `no seats open · ${pending.length} pending` : 'no seats open')), body: `
    <section class="tm-invite-card">
      <p class="acct-card-note">They get an email with a one-time link that works for seven days, and they must sign in with the address you invite. ${open ? `${e(String(open))} seat${open === 1 ? '' : 's'} open.` : (isOwner ? 'No seats open: invite as a viewer, free a seat, or add seats.' : 'No seats open: free a seat, or ask the owner for more seats.')}${isOwner ? '' : ' Only the owner invites admins and viewers.'}</p>
      <div class="tm-invite-row">
        <input class="acct-input tm-invite-email" type="email" id="tmInviteEmail" placeholder="name@company.com" autocomplete="off" spellcheck="false" aria-label="Email to invite" />
        <select class="adm-select tm-invite-role" id="tmInviteRole" aria-label="Role for the invite">
          ${tm.roles.filter(r => give.includes(r)).map(r => `<option value="${e(r)}" ${r === 'member' ? 'selected' : ''}>${e(cap(r))}</option>`).join('')}
        </select>
        ${leadBtn({ team: 'invite' }, 'send', 'Invite', '', 'btn-primary tm-invite-send')}
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
              <span class="adm-muted tm-inv-when">expires ${e(D.fmtDate(i.expiresAt))}</span>
              ${give.includes(i.role)
                ? `<span class="act-row">${iconBtn({ team: 'revoke' }, 'xCircle', `Withdraw the invite to ${i.email}`, `data-invite="${e(i.inviteId)}" data-email="${e(i.email)}"`, 'is-risky')}</span>`
                : `<span class="adm-muted">Only the owner withdraws it</span>`}
            </li>`).join('')}
        </ul>` : `<p class="acct-empty">No pending invites.</p>`}
      ${recent.length ? `<p class="acct-card-note tm-recent">Recent: ${recent.map(i => `${e(i.email)} (${e(i.status.toLowerCase())})`).join(', ')}.</p>` : ''}
    </section>` });
}

function inviteResultHtml(r) {
  const e = D.escapeHtml;
  const mail = r.emailed === true ? 'Emailed.' : r.emailed === 'suppressed' ? 'Email suppressed on this lane; share the link yourself.' : 'The email did not go out; share the link yourself.';
  return `
    <div class="tm-invite-result">
      <p><b>Invite sent to ${e(r.invite?.email || '')}</b> as ${e(r.invite?.role || '')}. ${e(mail)} The link works once and expires ${e(D.fmtDate(r.invite?.expiresAt))}.</p>
      <div class="acct-add-row tm-inline-edit">
        <input class="acct-input tm-link" type="text" readonly value="${e(r.link || '')}" aria-label="Invite link" />
        ${iconBtn({ team: 'copy-link' }, 'copy', 'Copy the link', `data-link="${e(r.link || '')}"`)}
      </div>
    </div>`;
}

/** A permission's label for the history: the catalog the card read, else its id spelled out. */
function scopeWord(id) { return tm.scopes?.labels?.[id] || cap(String(id || '').replace(/[_-]+/g, ' ')); }
function countWord(n) { const v = Number(n); return Number.isFinite(v) ? num(v) : ''; }

/** The words for one history entry: { label, actor, detail }. Only fields known to be safe for the team are read. */
function describeEvent(ev) {
  const d = ev.detail && typeof ev.detail === 'object' ? ev.detail : {};
  const a = String(ev.action || '');
  const actorRaw = String(ev.actor || '');
  const out = { label: ACTION_LABEL[a] || cap(a.replace(/[._-]+/g, ' ').trim()) || 'Changed', actor: ACTOR_NAME[actorRaw.toLowerCase()] || actorRaw, detail: '' };
  if (a.startsWith('needs-attention.')) {
    // the operator settled (or worked on) one of this team's stuck items; the operator's note stays on the operator's desk
    out.label = d.resolved === true ? 'Settled by PragOptics' : 'Worked on by PragOptics';
    out.actor = '';
    out.detail = ATTENTION_KIND[d.kind] || 'a licensing issue';
    return out;
  }
  if (a === 'requests.create') { out.detail = `for ${REQUEST_KIND[d.kind] || 'a change'}`; return out; }
  if (a === 'requests.decide') {
    const st = String(d.status || '').toUpperCase();
    out.label = st === 'APPROVED' ? 'Approved a request' : st === 'DECLINED' ? 'Declined a request' : st === 'FAILED' ? 'Approved a request that did not go through' : 'Answered a request';
    out.detail = `for ${REQUEST_KIND[d.kind] || 'a change'}`;
    return out;
  }
  if (a === 'team.scopes.set') {
    const parts = [];
    for (const r of SCOPE_ROLES) {
      const c = d.changed?.[r];
      if (!c) continue;
      if (Array.isArray(c.gave) && c.gave.length) parts.push(`gave ${ROLE_PLURAL[r]}: ${c.gave.map(scopeWord).join(', ')}`);
      if (Array.isArray(c.took) && c.took.length) parts.push(`took from ${ROLE_PLURAL[r]}: ${c.took.map(scopeWord).join(', ')}`);
    }
    out.detail = parts.join('; ');
    return out;
  }
  if (a.startsWith('licensing.')) {
    // a lower count that missed Microsoft's window: dates, not counts (older rows carried them as from and to)
    if (a === 'licensing.quantity.moved') {
      const at = d.toDate || (typeof d.to === 'string' ? d.to : '');
      const n = Number(d.quantity);
      out.detail = [Number.isFinite(n) && n > 0 ? `to ${countWord(n)} license seat${n === 1 ? '' : 's'}` : '', at ? `on ${D.fmtDate(at)}` : ''].filter(Boolean).join(' ');
      return out;
    }
    if (d.from != null && d.to != null && /quantity/.test(a) && Number.isFinite(Number(d.from)) && Number.isFinite(Number(d.to))) out.detail = `from ${countWord(d.from)} to ${countWord(d.to)}`;
    else if (d.quantity != null && /quantity/.test(a)) out.detail = `to ${countWord(d.quantity)}`;
    else if (a === 'licensing.cancel' && d.cancelAt) out.detail = `on ${D.fmtDate(d.cancelAt)}`;
    return out;
  }
  if (a.startsWith('domain.')) { out.detail = String(d.host || ''); return out; }
  if (a === 'connection.authorize') {
    const o = String(d.outcome || 'authorized');
    // a sign-in past its ten minutes: outcome expired, or failed with why expired (the Microsoft 365 door writes the latter)
    const expired = o === 'expired' || d.why === 'expired';
    // the Microsoft administrator's approval page (step approve) is an approval, not the connection itself
    out.label = expired ? (d.step === 'approve' ? 'Approval not finished in time' : AUTHORIZE_LABEL.expired)
      : d.step === 'approve' && o === 'declined' ? 'Approval declined'
        : d.step === 'approve' && o === 'failed' ? 'Approval did not finish'
          : o === 'approved' && d.by === 'platform' ? 'Approved by PragOptics'
            : AUTHORIZE_LABEL[o] || ACTION_LABEL[a];
    out.detail = d.provider ? cap(String(d.provider)) : '';
    // the provider answering for itself is named once, as the detail ("Connection declined Microsoft", not "... Microsoft Microsoft")
    if (out.actor && out.actor === out.detail) out.actor = '';
    return out;
  }
  if (a.startsWith('connection.')) { out.detail = d.provider ? cap(String(d.provider)) : ''; return out; }
  if (d.role && typeof d.role === 'object') out.detail = `role ${d.role.from} to ${d.role.to}`;
  else if (d.status && typeof d.status === 'object') out.detail = `${String(d.status.from).toLowerCase()} to ${String(d.status.to).toLowerCase()}`;
  else if (d.allowance) { const al = d.allowance; const p = []; if (al.apiCalls) p.push(`${num(al.apiCalls)} calls`); if (al.storageBytes) p.push(gb(al.storageBytes)); out.detail = p.length ? `cap ${p.join(', ')}` : 'cap cleared'; }
  else if (a === 'tenant.rename') out.detail = `"${d.from || ''}" to "${d.to || ''}"`;
  else if (typeof d.role === 'string') out.detail = `as ${d.role}`;
  return out;
}

function activityHtml() {
  const e = D.escapeHtml;
  if (!tm.audit.length) return '';
  return cardHtml({ key: 'team:activity', icon: 'activity', title: 'Activity', summary: e(`${tm.audit.length} recent`), body: `
    <section class="tm-activity-card">
      <ul class="tm-activity">
        ${tm.audit.map(ev => {
          const w = describeEvent(ev);
          const target = String(ev.target || '');
          return `
          <li>
            <span class="adm-muted tm-act-when">${e(D.fmtDate(ev.at))}</span>
            <span class="tm-act-what"><b>${e(w.label)}</b>${w.actor ? ` ${e(w.actor)}` : ''}${target && target !== String(ev.actor || '') ? ` <span class="adm-muted">to</span> ${e(target)}` : ''}${w.detail ? ` <span class="adm-muted">${e(w.detail)}</span>` : ''}</span>
          </li>`;
        }).join('')}
      </ul>
    </section>` });
}

/* ---------- what each role can do (2026-09-23) ----------
 * The owner gives each role (Admin, Developer, Member) the permissions the server's catalog names. The owner holds every
 * one of them and is never a row; a viewer holds none and never sees this card. GET v1/tenant/scopes answers
 * { roles, catalog, canEdit }; PUT v1/tenant/scopes { roles } (owner only) answers { roles }. Turning a switch ON asks
 * once, naming what it gives (the panel's armed confirm); turning one OFF saves at once. Everyone else who reads Team
 * sees the same card read-only, with their own role marked. */

const A_ROLE = { admin: 'an Admin', developer: 'a Developer', member: 'a Member' };

function scopeCatalog(list) {
  return (Array.isArray(list) ? list : [])
    .filter(s => s && typeof s.id === 'string' && s.id)
    .map(s => ({ id: s.id, label: String(s.label || s.id), description: String(s.description || '') }));
}
function scopeRoles(roles, catalog) {
  const ids = new Set(catalog.map(s => s.id));
  const out = {};
  for (const r of SCOPE_ROLES) out[r] = [...new Set(Array.isArray(roles?.[r]) ? roles[r] : [])].filter(id => ids.has(id));
  return out;
}
/** The one-time question a switch asks before it gives a role a permission: "Let Admins: Can ask you to buy a license, ...?" */
function scopeAsk(role, s) {
  const d = s.description.trim();
  const first = (d.match(/^(.*?[^.\s])\.(?:\s|$)/)?.[1] || d.replace(/\.+$/, '') || s.label).trim();
  return `Let ${ROLE_PLURAL[role]}: ${first}?`;
}
function scopeDomId(role, id) { return `tmSc-${role}-${id}`.replace(/[^a-z0-9_-]/gi, '-'); }
function scopeBtn(role, id) { return document.querySelector(`[data-team-action="scope"][data-role="${CSS.escape(role)}"][data-scope="${CSS.escape(id)}"]`); }

/** The permissions a role holds that the card shows (a later one the server stores is left out of the counts). */
function shownOf(sc, role) {
  const ids = new Set(sc.catalog.map(s => s.id));
  return (sc.roles[role] || []).filter(id => ids.has(id));
}

/** Read what each role can do. Never throws: the card carries its own error and Try again, and the rest of Team loads. */
async function fetchScopes() {
  try {
    const r = await D.apiFetch(url(SCOPES_URL));
    const all = scopeCatalog(r?.catalog);
    const catalog = all.filter(s => !LATER_SCOPES.has(s.id));
    const role = tm.view?.membership?.role;
    tm.scopes = {
      catalog, all, labels: Object.fromEntries(all.map(s => [s.id, s.label])),
      // every id the server stores is kept (a later permission included), so a save sends back what it did not change
      roles: scopeRoles(r?.roles, all),
      canEdit: typeof r?.canEdit === 'boolean' ? r.canEdit : role === 'owner'
    };
    tm.scopesFor = scopesKey();
    tm.scopesState = catalog.length ? 'ready' : 'absent';
    tm.scopesError = '';
  } catch (ex) {
    tm.scopes = null; tm.scopesFor = '';
    // a lane without the route: the card stays away until the backend that carries it is deployed
    if (ex?.status === 404) { tm.scopesState = 'absent'; tm.scopesError = ''; return; }
    tm.scopesState = 'error';
    tm.scopesError = ex?.sessionInvalidated ? '' : ((ex?.status === 403 && ex?.data?.error) || D.friendlyError(ex, 'Could not read what each role can do.'));
  }
}

function paintScopes() {
  const host = document.getElementById('tmScopes');
  if (host) host.innerHTML = scopesHtml();
}

/** One permission's switch for one role: a real switch for the owner, a marked state for everyone else. */
function scopeSwitchHtml(role, s, on, edit) {
  const e = D.escapeHtml;
  const plural = ROLE_PLURAL[role];
  const track = '<span class="tm-sw-track" aria-hidden="true"><span class="tm-sw-thumb"></span></span>';
  if (!edit) {
    return `<span class="tm-sw is-static ${on ? 'is-on' : ''}" role="img" aria-label="${e(on ? `${plural} can do this` : `${plural} cannot do this`)}" data-tip="${e(on ? `On: ${plural} can do this. Only the owner changes it.` : `Off: ${plural} cannot do this. Only the owner changes it.`)}"><span class="tm-sw-word">${on ? 'On' : 'Off'}</span>${track}</span>`;
  }
  const key = `${role}|${s.id}`;
  const saving = tm.scopesBusy === key;
  // one change at a time on the tab: another switch's save, or a member change, holds this one
  const waiting = teamBusy() && !saving;
  const shown = saving ? tm.scopesTarget : on;
  const word = saving ? 'Saving…' : tm.scopesSaved === key ? 'Saved' : (on ? 'On' : 'Off');
  const tip = saving ? 'Saving…'
    : waiting ? WAIT_TIP
    : on ? `On: ${plural} can do this. Press to turn it off; it saves at once.`
    : `Off: ${plural} cannot do this. Press to give it to them; it asks you first.`;
  return `<button class="btn tm-sw ${shown ? 'is-on' : ''} ${saving ? 'is-saving' : ''}" type="button" role="switch" aria-checked="${shown ? 'true' : 'false'}" data-team-action="scope" data-role="${e(role)}" data-scope="${e(s.id)}" aria-label="${e(`${plural}: ${s.label}${saving ? '. Saving…' : ''}`)}" aria-describedby="${e(scopeDomId(role, s.id))}-d" data-tip="${e(tip)}" ${saving ? 'aria-busy="true"' : ''} ${teamBusy() ? 'disabled' : ''}><span class="tm-sw-word">${e(word)}</span>${track}</button>`;
}

function scopeRoleHtml(role, sc, mine) {
  const e = D.escapeHtml;
  const have = shownOf(sc, role);
  const isMine = role === mine;
  // a failed save shows on the team it was made for; once painted it counts as seen (renderTeam lets it go then)
  const err = tm.scopesSaveError && tm.scopesSaveError.team === tm.teamId ? tm.scopesSaveError : null;
  return `
    <div class="tm-scope-role ${isMine ? 'is-mine' : ''}" role="group" aria-labelledby="tmScRole-${role}">
      <div class="tm-scope-role-head">
        <h4 class="tm-scope-role-h" id="tmScRole-${role}">${e(cap(role))}</h4>
        ${isMine ? '<span class="acct-tag is-primary">Your role</span>' : ''}
        <span class="adm-muted tm-scope-count">${e(String(have.length))} of ${e(String(sc.catalog.length))} on</span>
      </div>
      <p class="tm-scope-role-note">${e(ROLE_HELP[role] || '')}</p>
      <ul class="tm-scope-list">
        ${sc.catalog.map(s => {
          const on = have.includes(s.id);
          const id = scopeDomId(role, s.id);
          return `
          <li class="tm-scope ${on ? 'is-on' : ''}">
            <span class="tm-scope-label" id="${e(id)}-l">${e(s.label)}${isMine && on ? ' <span class="acct-tag is-verified">You can</span>' : ''}</span>
            <div class="tm-scope-ctl">${scopeSwitchHtml(role, s, on, sc.canEdit)}</div>
            <span class="tm-scope-desc" id="${e(id)}-d">${e(s.description)}</span>
            ${err && err.key === `${role}|${s.id}` ? ((err.seen = true), `<p class="acct-error tm-scope-err" role="alert">${e(err.text)}</p>`) : ''}
          </li>`;
        }).join('')}
      </ul>
    </div>`;
}

function scopesHtml() {
  const e = D.escapeHtml;
  const st = tm.scopesState;
  if (!st || st === 'absent') return '';
  const title = 'What each role can do';
  if (st !== 'ready' || !tm.scopes) {
    if (st === 'error' && !tm.scopesError) return '';   // the session ended; the panel has already said why
    const reading = st === 'loading';
    return cardHtml({ key: 'team:scopes', icon: 'shield', title, summary: reading ? 'reading' : 'not read', body: `
      ${reading ? '' : `<p class="acct-error tm-scopes-error">${e(tm.scopesError)}</p>`}
      <div class="acct-actions-row tm-scopes-retry">${stateLead({ team: 'scopes-retry' }, 'refresh', 'Try again', { out: reading, busyWord: 'Reading…' }, '', reading ? '' : 'btn-primary')}</div>` });
  }
  const sc = tm.scopes;
  const me = tm.view?.membership?.role || '';
  const mine = SCOPE_ROLES.includes(me) ? me : '';
  const total = SCOPE_ROLES.reduce((n, r) => n + shownOf(sc, r).length, 0);
  const summary = sc.canEdit
    ? (total ? `${total} turned on` : 'all off: only you')
    : mine ? `your role: ${shownOf(sc, mine).length} of ${sc.catalog.length}` : '';
  const lead = me === 'owner'
    ? (sc.canEdit
      ? 'You are the owner and can always do all of this. Each switch gives one role one permission. Viewers never get any.'
      : 'You are the owner and can always do all of this. The switches cannot be changed on this account right now.')
    : 'The owner can always do all of this and decides what each role can do. Viewers never get any.';
  let yours = '';
  if (mine) {
    const labels = sc.catalog.filter(s => sc.roles[mine].includes(s.id)).map(s => s.label);
    yours = labels.length
      ? `As ${A_ROLE[mine]} you can: ${labels.join('; ')}.`
      : `As ${A_ROLE[mine]} you have none of these. Ask the owner if you need one.`;
  }
  return cardHtml({ key: 'team:scopes', icon: 'shield', title, summary: e(summary), body: `
    <p class="acct-card-note tm-scopes-lead">${e(lead)}</p>
    ${yours ? `<p class="tm-scopes-yours">${ico(shownOf(sc, mine).length ? 'checkCircle' : 'info')}<span>${e(yours)}</span></p>` : ''}
    <div class="tm-scopes">${SCOPE_ROLES.map(r => scopeRoleHtml(r, sc, mine)).join('')}</div>` });
}

/** The owner pressed a switch. On: asks once, then saves. Off: saves at once. One save at a time; every switch waits for it. */
async function saveScope(btn) {
  const sc = tm.scopes;
  if (!sc?.canEdit || teamBusy() || btn.disabled) return;
  const role = btn.dataset.role, id = btn.dataset.scope;
  const s = sc.catalog.find(x => x.id === id);
  if (!SCOPE_ROLES.includes(role) || !s) return;
  const on = sc.roles[role].includes(id);
  if (!on && !armed(btn, scopeAsk(role, s), { keep: 'Leave it off', ms: 12000 })) return;
  const roles = {};
  for (const r of SCOPE_ROLES) roles[r] = sc.roles[r].filter(x => !(r === role && x === id));
  if (!on) roles[role].push(id);
  const key = `${role}|${id}`, team = tm.teamId;
  tm.scopesBusy = key; tm.scopesTarget = !on; tm.scopesSaved = ''; tm.scopesSaveError = null;
  // the switch says Saving…; the other switches, the member controls and the team picker wait until the answer
  paintScopes(); applyLocks();
  try {
    const r = await D.apiFetch(url(SCOPES_URL), { method: 'PUT', body: body({ roles }) });
    // the team may have been re-read while the save was out: the answer lands on what the card shows now, and only
    // when the card still shows the team it was saved for
    if (tm.scopes && tm.teamId === team) {
      tm.scopes.roles = scopeRoles(r?.roles && typeof r.roles === 'object' ? r.roles : roles, tm.scopes.all || tm.scopes.catalog);
      tm.scopesSaved = key;
    }
  } catch (ex) {
    // the server's sentence names the reason (only the owner, an unknown permission); a dropped session says nothing
    // here. The error is kept for the team it was made on: an owner who left the tab before the answer sees it on return.
    if (!ex?.sessionInvalidated) tm.scopesSaveError = { key, team, seen: false, text: ex?.data?.error || D.friendlyError(ex, on ? 'It was not turned off. Nothing changed.' : 'It was not turned on. Nothing changed.') };
  } finally {
    tm.scopesBusy = '';
  }
  paintScopes(); applyLocks();
  // the switch was redrawn under the keyboard: give its focus back, unless the person has moved on
  if (!document.activeElement || document.activeElement === document.body) scopeBtn(role, id)?.focus({ preventScroll: true });
  if (tm.scopesSaved === key) {
    setTimeout(() => {
      if (tm.scopesSaved !== key) return;
      tm.scopesSaved = '';
      const b = scopeBtn(role, id), w = b?.querySelector(':scope > .tm-sw-word');
      if (w && b.dataset.armed !== '1' && !tm.scopesBusy) w.textContent = tm.scopes?.roles?.[role]?.includes(id) ? 'On' : 'Off';
    }, 1600);
  }
}

async function retryScopes() {
  if (tm.scopesState === 'loading') return;
  tm.scopesState = 'loading'; tm.scopesError = '';
  paintScopes();
  await fetchScopes();
  paintScopes();
}

/* ---------- actions ---------- */

async function post(path, payload, errorId = 'tmError') {
  D.showError(errorId, '');
  return D.apiFetch(url(path), { method: 'POST', body: body(payload) });
}

/* ---------- one change at a time, and every request says what it is doing (2026-09-23) ----------
 * A Team request (a member's role, status, cap or removal, an invite or its withdrawal, the team's name, leaving, a
 * permission switch) holds the tab until its answer. The control that sent it is disabled, its icon turns into the
 * refresh and spins, and its word (on an icon button, its tip and its label for screen readers) says what it is
 * doing; a role picker gets a turning "Saving…" beside it. Every other control that sends a request, and the team
 * picker, is disabled with the tip "Wait for the change being saved". The line under the heading says it in words,
 * for a phone that has no hover. When the answer comes the team is read again and painted, or, for an invite that
 * failed, the button comes back as it was with the reason under it. */
const REQUEST_ACTIONS = new Set(['rename-save', 'leave', 'invite', 'revoke', 'suspend', 'restore', 'remove', 'allow-clear', 'allow-save', 'confirm-leave', 'confirm-remove', 'confirm-viewer']);
const WAIT_TIP = 'Wait for the change being saved';

function teamBusy() { return !!(tm.acting || tm.scopesBusy); }
function emailOf(userId) { return tm.members.find(m => m.userId === userId)?.email || 'this person'; }
/** A selector that finds the same control again after the tab is painted anew. */
function selectorOf(el) {
  if (!el) return '';
  if (el.dataset.teamRole) return `[data-team-role="${CSS.escape(el.dataset.teamRole)}"]`;
  let s = `[data-team-action="${CSS.escape(el.dataset.teamAction || '')}"]`;
  if (el.dataset.user) s += `[data-user="${CSS.escape(el.dataset.user)}"]`;
  if (el.dataset.invite) s += `[data-invite="${CSS.escape(el.dataset.invite)}"]`;
  return s;
}
// The panel's one busy helper does the marking (cards.js busy() and hold()); the tab only remembers, per control,
// what to call to put it back, so a repaint while a change is out marks the fresh controls again.
/** The control whose request is out: disabled, turning, saying what it is doing. */
function markBusy(el, word) {
  if (el._tmDone) return;
  release(el);
  el._tmDone = busy(el, word);
}
/** A control that sends a request, while another request is out: disabled, the tip saying why. */
function lockEl(el) {
  if (el._tmDone || el._tmRelease) return;
  el._tmRelease = hold([el], WAIT_TIP);
}
/** Back as it was: its icon, its word, enabled unless it was disabled before. */
function release(el) {
  if (el._tmDone) { el._tmDone(); el._tmDone = null; }
  if (el._tmRelease) { el._tmRelease(); el._tmRelease = null; }
}
/** Put every request control of the tab in the state the requests out call for, and say it under the heading. */
function applyLocks() {
  const waiting = teamBusy();
  const status = document.getElementById('tmStatus');
  if (status) {
    const text = tm.acting?.status || (tm.scopesBusy ? `Saving what ${ROLE_PLURAL[tm.scopesBusy.split('|')[0]] || 'that role'} can do…` : '');
    if (text) { status.innerHTML = `${ico('refresh')}<span></span>`; status.lastElementChild.textContent = text; }
    else status.textContent = '';
    status.hidden = !text;
  }
  const root = document.getElementById('tmBody');
  if (!root) return;
  const active = tm.acting?.sel ? root.querySelector(tm.acting.sel) : null;
  for (const el of root.querySelectorAll('[data-team-action], [data-team-role], #tmSwitch')) {
    const a = el.dataset.teamAction;
    if (a !== undefined && !REQUEST_ACTIONS.has(a)) continue;   // the switches paint their own state; editors open and close freely
    if (el === active) markBusy(el, tm.acting.word);
    else if (waiting) lockEl(el);
    else release(el);
  }
}

/**
 * Send one Team change and read the team again. `el` is the control that sent it and `word` what it says while the
 * request is out ("Removing…"); `status` is the sentence under the heading. The server's sentences on a refusal are
 * written for the team manager (seats, the ladder, a bad address) and win over the generic wording.
 */
async function act(fn, { errorId = 'tmError', fallback = 'That change did not go through.', el = null, word = 'Saving…', status = '' } = {}) {
  if (teamBusy()) return;
  tm.acting = { sel: selectorOf(el), word, status: status || word };
  applyLocks(); paintScopes();
  try { await fn(); await loadTeam({ keepScopes: true }); }
  catch (ex) {
    const msg = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback));
    if (errorId === 'tmInviteError') { D.showError(errorId, msg); }
    else { await loadTeam({ keepScopes: true }); D.showError(errorId, msg); }
  } finally {
    tm.acting = null;
    applyLocks(); paintScopes();
  }
}

/** The invite link to the clipboard (cards.js copyButton); where the browser refuses, its field is selected for the keyboard. */
function copyLink(btn) {
  return copyButton(btn, btn.dataset.link || '', { select: () => btn.closest('.acct-add-row')?.querySelector('input') });
}

// Confirms: the shared armed() in cards.js (the icon opens into its question; a second press acts).

/* THE TEAM TAB'S ACTIONS (2026-09-24): one handler per data-team-action, each given the control pressed and the person
 * its row names ({ userId, who }), looked up by the one click listener in bindTeamActions. A request control's handler
 * goes through act() (one change at a time; the control busy and the others held, THE BUTTON RULE in cards.js). */
const TEAM_ACTIONS = {
  scope: (btn) => saveScope(btn),
  'scopes-retry': () => retryScopes(),
  rename: () => { tm.renaming = true; document.getElementById('tmRename')?.classList.remove('hidden'); document.getElementById('tmNameInput')?.focus(); },
  'rename-cancel': () => { tm.renaming = false; document.getElementById('tmRename')?.classList.add('hidden'); },
  'rename-save': (btn) => {
    const name = (document.getElementById('tmNameInput')?.value || '').trim();
    return act(async () => { await post(`${TENANT_URL}/rename`, { organizationName: name }); tm.renaming = false; },
      { el: btn, word: 'Saving the name…', status: 'Saving the team name…' });
  },
  // licensing L5d: Leave, Remove and a move to viewer end a seat and its mailbox, so each opens its question first
  leave: () => { tm.confirm = { kind: 'leave' }; paint(); document.querySelector('[data-team-action="confirm-leave"]')?.focus(); },
  'confirm-cancel': () => { tm.confirm = null; paint(); },
  'confirm-leave': (btn) => {
    const name = tm.view?.tenant?.organizationName || 'this team';
    return act(async () => { await post(`${TENANT_URL}/leave`, {}); tm.confirm = null; tm.teamId = ''; remember(); },
      { el: btn, word: 'Leaving…', status: `Leaving ${name}…` });
  },
  'confirm-remove': (btn, { userId, who }) => act(async () => { await post(`${TENANT_URL}/members/remove`, { userId }); tm.confirm = null; },
    { el: btn, word: 'Removing…', status: `Removing ${who} from the team…` }),
  'confirm-viewer': (btn, { userId, who }) => act(async () => { await post(`${TENANT_URL}/members/patch`, { userId, role: 'viewer' }); tm.confirm = null; },
    { el: btn, word: 'Moving…', status: `Changing the role of ${who} to Viewer…` }),
  invite: (btn) => {
    const email = (document.getElementById('tmInviteEmail')?.value || '').trim();
    const role = document.getElementById('tmInviteRole')?.value || 'member';
    if (!email) { D.showError('tmInviteError', 'Enter an email address.'); return; }
    return act(async () => {
      const res = await post(`${TENANT_URL}/invites`, { email, role }, 'tmInviteError');
      tm.lastInvite = res;
    }, { errorId: 'tmInviteError', fallback: 'The invite could not be sent.', el: btn, word: 'Sending…', status: `Sending the invite to ${email}…` });
  },
  'copy-link': (btn) => copyLink(btn),
  revoke: (btn, { who }) => {
    if (!armed(btn, 'Withdraw?')) return;
    return act(async () => { await post(`${TENANT_URL}/invites/revoke`, { inviteId: btn.dataset.invite }); if (tm.lastInvite?.invite?.inviteId === btn.dataset.invite) tm.lastInvite = null; },
      { el: btn, word: 'Withdrawing…', status: `Withdrawing the invite to ${who}…` });
  },
  suspend: (btn, { userId, who }) => {
    if (!armed(btn, 'Suspend?', { keep: 'Leave them as they are' })) return;
    return act(() => post(`${TENANT_URL}/members/patch`, { userId, status: 'SUSPENDED' }),
      { el: btn, word: 'Suspending…', status: `Suspending ${who}…` });
  },
  restore: (btn, { userId, who }) => act(() => post(`${TENANT_URL}/members/patch`, { userId, status: 'ACTIVE' }),
    { el: btn, word: 'Restoring…', status: `Restoring ${who}…` }),
  remove: (btn, { userId, who }) => {
    tm.confirm = { kind: 'remove', userId, email: who }; tm.editing = null; paint();
    document.querySelector(`[data-team-action="confirm-remove"][data-user="${CSS.escape(userId)}"]`)?.focus();
  },
  'allow-edit': (btn, { userId }) => { tm.editing = userId; paint(); document.getElementById('tmAllowCalls')?.focus(); },
  'allow-cancel': () => { tm.editing = null; paint(); },
  'allow-clear': (btn, { userId }) => act(async () => { await post(`${TENANT_URL}/members/patch`, { userId, allowance: {} }); tm.editing = null; },
    { el: btn, word: 'Clearing the cap…', status: `Putting ${emailOf(userId)} back on the plan limit…` }),
  'allow-save': (btn, { userId }) => {
    const calls = (document.getElementById('tmAllowCalls')?.value || '').trim();
    const gbv = (document.getElementById('tmAllowGb')?.value || '').trim();
    const allowance = {};
    if (calls) allowance.apiCalls = Number(calls);
    if (gbv) allowance.storageBytes = gbToBytes(gbv);
    return act(async () => { await post(`${TENANT_URL}/members/patch`, { userId, allowance }); tm.editing = null; },
      { el: btn, word: 'Saving the cap…', status: `Saving the cap for ${emailOf(userId)}…` });
  }
};

/* The Tenants desk's row actions (operators): Repair, and the community standards (2026-09-24), the operator's window for
 * this environment, which reloads the desk after an action; the row's button waits while the window's code loads. */
const TENANT_ACTIONS = {
  repair: (tb) => repairTenant(tb),
  'real-orders': (tb) => toggleRealOrders(tb),
  conduct: (tb) => {
    const done = busy(tb, 'Opening…');
    import('./conductDesk.js')
      .then(m => m.openConduct({ environmentId: tb.dataset.env, deps: D, onChange: () => { const main = document.getElementById('acctMain'); if (main && document.getElementById('tnBody')) renderTenants(main, D); } }))
      .catch(() => D.showError('tnError', 'Could not open Community standards. Reload and try again.'))
      .finally(() => done());
  }
};
const handlerOf = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null);

export function bindTeamActions(deps) {
  if (bindTeamActions._bound) return;
  bindTeamActions._bound = true;
  D = D || deps;

  document.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tenant-action]');
    if (tb) {
      e.preventDefault();
      if (!tb.disabled) handlerOf(TENANT_ACTIONS, tb.dataset.tenantAction)?.(tb);
      return;
    }
    const btn = e.target.closest('[data-team-action]');
    if (!btn) return;
    e.preventDefault();
    const a = btn.dataset.teamAction;
    const run = handlerOf(TEAM_ACTIONS, a);
    if (!run) return;
    // one change at a time: a request control pressed while another is out does nothing (it is disabled, saying why)
    if (REQUEST_ACTIONS.has(a) && (teamBusy() || btn.disabled)) return;
    run(btn, { userId: btn.dataset.user || '', who: btn.dataset.email || 'this person' });
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'tmSwitch') {
      // the picker is disabled while a change is out; should a change still arrive, the team in view stays
      if (teamBusy()) { e.target.value = tm.teamId || tm.view?.tenant?.environmentId || e.target.value; return; }
      tm.teamId = e.target.value || '';
      tm.lastInvite = null; tm.editing = null; tm.scopesSaved = ''; tm.confirm = null;
      if (tm.scopesSaveError?.seen) tm.scopesSaveError = null;
      remember();
      // the picker waits for the team it names, saying so (the tab paints the team anew on the answer)
      const done = busy(e.target, 'Loading the team…');
      loadTeam().finally(done);
      return;
    }
    const sel = e.target.closest?.('[data-team-role]');
    if (sel) {
      const userId = sel.dataset.teamRole;
      const role = sel.value;
      const was = sel.querySelector('option[selected]')?.value || role;
      if (teamBusy()) { sel.value = was; return; }
      // licensing L5d: a seat role moved to viewer loses its seat and mailbox; the select goes back and the row asks first
      if (role === 'viewer' && ['admin', 'developer', 'member'].includes(was)) {
        sel.value = was;
        tm.confirm = { kind: 'viewer', userId, email: emailOf(userId) }; tm.editing = null; paint();
        document.querySelector(`[data-team-action="confirm-viewer"][data-user="${CSS.escape(userId)}"]`)?.focus();
        return;
      }
      act(() => post(`${TENANT_URL}/members/patch`, { userId, role }),
        { el: sel, word: 'Saving…', status: `Changing the role of ${emailOf(userId)} to ${cap(role)}…` });
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

/** The desk's storage cell: used against the allowance when provisioned, else the phase. */
function storageCell(t) {
  const e = D.escapeHtml;
  const phase = String(t.phase || (t.provisioned ? 'READY' : '')).toUpperCase();
  const s = t.storage || {};
  if (phase === 'READY') {
    const dn = Number(t.domains?.count || 0);
    return `<span class="adm-num">${e(gb(s.usedBytes) || '0 GB')} / ${e(gb(s.limitBytes) || gb(t.limits?.storageBytes) || '')}</span><div class="adm-muted">provisioned${dn ? `, ${e(String(dn))} domain${dn === 1 ? '' : 's'}` : ''}</div>`;
  }
  if (phase === 'PROVISIONING') return `<span class="acct-tag is-pending">provisioning</span>${t.provisionNote ? `<div class="adm-muted cell-ellip" title="${e(t.provisionNote)}">${e(t.provisionNote)}</div>` : ''}`;
  if (phase === 'SUSPENDED') return `<span class="acct-tag is-bad">suspended</span><div class="adm-muted">${e(gb(s.usedBytes) || '0 GB')} held</div>`;
  return '<span class="acct-tag">team only</span>';
}
/** Repair makes sense for a paid, active owner whose environment is not READY. */
function repairable(t) {
  return String(t.tier || 'free') !== 'free'
    && String(t.phase || (t.provisioned ? 'READY' : '')).toUpperCase() !== 'READY'
    && String(t.ownerStatus || 'ACTIVE').toUpperCase() === 'ACTIVE'
    && !!t.ownerUserId;
}
async function repairTenant(btn) {
  const name = btn.dataset.name || 'this team';
  if (!armed(btn, 'Run it?', { keep: 'Do not run it' })) return;
  D.showError('tnError', '');
  const done = busy(btn, `Running provisioning for ${name}…`);
  try {
    const r = await D.apiFetch(PROVISION_URL, { method: 'POST', body: JSON.stringify({ userId: btn.dataset.user }) });
    const main = document.getElementById('acctMain');
    if (main) await renderTenants(main, D);
    if (r.status !== 'READY') D.showError('tnError', `${name}: ${r.note || r.nextAction?.message || r.status}`);
  } catch (ex) {
    D.showError('tnError', ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'Provisioning did not run.')));
  } finally { done(); }
}

/* THE REAL ORDERS SWITCH (Part 1 close-out, 2026-09-24; backend auth/realOrders.js, v1/admin/real-orders). The dev lane
 * runs Pax8 in test mode: every order is validated and nothing is placed at Microsoft. To prove the first real order
 * without flipping the whole lane, the operator arms ONE environment from this desk: its orders are placed and charged at
 * Microsoft, every other environment stays in test mode, and the live lane is untouched (there every order is already
 * real, so the desk shows no switch). The button asks in words, naming the environment and that Pax8 bills PragOptics,
 * and acts on the second press (cards.js armed()); the server takes the environment id twice and refuses a mismatch, a
 * second armed environment, and any lane but dev. Off asks its own question. A subscriber never sees any of this. */
function tnFlash(text) {
  const el = document.getElementById('tnFlash');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
}
/** The line above the desk on the dev lane: the lane's note, and which environment is armed now, if any. */
function tenantLineHtml(t) {
  const m = t.microsoft;
  if (!m) return '';
  const e = D.escapeHtml;
  const state = m.connected ? 'connected' : m.madeByPlatform ? (m.tenantId ? 'made; waiting for the owner to connect' : 'ordered; waiting for Microsoft') : (m.tenantId ? 'not connected' : 'named');
  const cls = m.connected ? 'is-verified' : 'is-pending';
  const mode = m.connected && m.accessMode ? ` <span class="acct-tag ${m.accessMode === 'app' ? 'is-verified' : 'is-bad'}" title="${m.accessMode === 'app' ? "App consent: an app-only token on the customer's permanent consent; it does not expire with GDAP" : 'On-behalf-of: the removed partner path; reconnect this tenant through the wizard'}">access: ${e(m.accessMode)}</span>` : '';
  return `<div class="adm-muted tn-ms"><span class="acct-tag ${cls}">tenant: ${e(state)}</span>${mode} <span class="ev-code">${e(m.name)}</span></div>`;
}

function realOrdersLineHtml(d, rows) {
  const ro = d?.realOrders;
  if (!ro?.available) return '';
  const e = D.escapeHtml;
  const on = rows.find(t => t.realOrders?.armed);
  // the panel's own card (2026-09-28): the armed environment in the summary, the lane's note and the facts in the body
  const body = `
    <p class="acct-card-note">${e(ro.note || '')}</p>
    ${on ? `
    <div class="lic-facts">
      <div class="lic-fact"><span class="lic-k">Armed now</span><span class="lic-v">${e(on.organizationName || on.ownerEmail || 'Unnamed')} <span class="ev-code">${e(String(on.environmentId).slice(0, 8))}</span></span></div>
      ${on.realOrders.armedBy ? `<div class="lic-fact"><span class="lic-k">By</span><span class="lic-v">${e(on.realOrders.armedBy)}</span></div>` : ''}
      ${on.realOrders.armedAt ? `<div class="lic-fact"><span class="lic-k">Since</span><span class="lic-v">${e(D.fmtDate(on.realOrders.armedAt))}</span></div>` : ''}
    </div>
    <p class="lic-hint">Turn it off from its row when the proof is done.</p>` : '<p class="lic-hint">No environment is armed. The dollar switch on a row arms it.</p>'}`;
  return `<div class="ev-cards tn-desk-cards">${cardHtml({ key: 'tenants:real-orders', icon: 'dollar', title: 'Real orders', summary: e(on ? `armed: ${on.organizationName || on.ownerEmail || 'Unnamed'}` : 'no environment armed'), body, open: false })}</div>`;
}
/** The row's switch, on the dev lane only: the button that turns real orders on for this environment, or off again. */
function realOrdersBtnHtml(t, available) {
  if (!available) return '';
  const e = D.escapeHtml;
  const on = !!t.realOrders?.armed;
  const name = t.organizationName || t.ownerEmail || 'this environment';
  // money, so a dollar sign, on and off (Cameron, 2026-09-28); the armed state is told by the red is-danger look and the row's tag
  return iconBtn({ tenant: 'real-orders' }, 'dollar',
    on ? `Real orders are on for ${name}: turn them off` : `Turn on real orders for ${name}: its orders are placed at Pax8 and billed to PragOptics`,
    `data-env="${e(t.environmentId)}" data-name="${e(name)}" data-real="${on ? '1' : '0'}"`, on ? 'is-danger' : '');
}
async function toggleRealOrders(btn) {
  const id = String(btn.dataset.env || ''), name = btn.dataset.name || 'this environment';
  // data-real is the switch's own state: cards.js armed() uses data-armed for its press-again state, and the two clashed
  // (every confirmed press read "already on" and turned real orders OFF; seen on the pane 2026-09-28)
  const on = btn.dataset.real !== '1';
  // two presses: the first opens the question, naming the environment and the charge; the second acts
  if (!armed(btn, on ? `Real orders for ${name}? Pax8 bills PragOptics for what it orders.` : `Turn off real orders for ${name}?`)) return;
  D.showError('tnError', ''); tnFlash('');
  const others = [...document.querySelectorAll('#tnBody button')].filter(b => b !== btn);
  const done = busy(btn, on ? `Turning on real orders for ${name}…` : `Turning off real orders for ${name}…`, { hold: others, why: 'Wait for the real orders change to finish' });
  try {
    // the environment is named twice on purpose: the server refuses an id that does not match itself
    const d = await D.apiFetch(`${REAL_ORDERS_URL}/${on ? 'on' : 'off'}`, { method: 'POST', body: JSON.stringify(on ? { environmentId: id, expectEnvironmentId: id } : { environmentId: id }) });
    const nowOn = !!d?.view?.armed;
    const main = document.getElementById('acctMain');
    if (main && document.getElementById('tnBody')) await renderTenants(main, D);
    tnFlash(nowOn
      ? `${name} now places real orders through Pax8, and Pax8 bills PragOptics for them. Every other environment stays in test mode. Turn it off when the proof is done.`
      : `${name} is back in test mode: nothing is ordered at Microsoft.`);
  } catch (ex) {
    D.showError('tnError', ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, on ? 'Real orders were not turned on. Nothing changed.' : 'Real orders were not turned off. Nothing changed.')));
  } finally { done(); }
}

export async function renderTenants(main, deps) {
  D = deps;
  const e = D.escapeHtml;
  main.innerHTML = `
    <header class="adm-sec-head"><h2 class="adm-sec-title">Tenants</h2></header>
    <p class="adm-note">Every team on the platform: who owns it, its plan, its storage against the allowance, seats in use. Counts and names only; tenant data never renders here. Repair runs the one-pass provisioning for an environment that stalled: it creates what is missing and changes nothing that exists.</p>
    <p class="adm-error" id="tnError" hidden></p>
    <p class="na-flash" id="tnFlash" role="status" aria-live="polite" hidden></p>
    <div id="tnBody"><p class="adm-note">Loading…</p></div>
  `;
  const host = document.getElementById('tnBody');
  try {
    const d = await D.apiFetch(ADMIN_TENANTS_URL);
    const rows = d.tenants || [];
    if (!rows.length) { host.innerHTML = `<p class="adm-empty">No tenants yet. The first paying owner to open Team creates one.</p>`; return; }
    const realOrdersOn = !!d.realOrders?.available;
    host.innerHTML = `
      ${realOrdersLineHtml(d, rows)}
      <div class="adm-table-scroll">
        <table class="adm-table adm-table--wrap">
          <thead><tr><th>Team</th><th>Owner</th><th>Plan</th><th>Storage</th><th class="adm-num">Seats</th><th class="adm-num">Members</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${rows.map(t => `
              <tr>
                <td class="cell-ellip" title="${e(t.environmentId)}">${e(t.organizationName || 'Unnamed')}<div class="adm-muted"><code>${e(String(t.environmentId).slice(0, 8))}</code></div>${t.realOrders?.armed ? '<div><span class="acct-tag is-bad" title="Real orders are on: this environment\'s orders are placed at Pax8 and billed to PragOptics">real orders</span></div>' : ''}${tenantLineHtml(t)}</td>
                <td class="cell-ellip adm-cell-email" title="${e(t.ownerEmail)}">${e(t.ownerEmail || '')}${t.ownerStatus && t.ownerStatus !== 'ACTIVE' ? ` <span class="acct-tag is-pending">${e(String(t.ownerStatus).toLowerCase())}</span>` : ''}</td>
                <td class="cell-tight"><span class="adm-tier adm-tier-${e(t.tier)}">${e(tierName(t.tier))}</span></td>
                <td class="cell-tight">${storageCell(t)}</td>
                <td class="adm-num cell-tight">${e(String(t.seats?.used ?? 0))} / ${e(String(t.seats?.limit ?? 0))}${Number(t.seats?.pending) ? `<div class="adm-muted">+${e(String(t.seats.pending))} pending</div>` : ''}</td>
                <td class="adm-num cell-tight">${e(String(t.members ?? 0))}${Number(t.viewers) ? `<div class="adm-muted">${e(String(t.viewers))} viewer${t.viewers === 1 ? '' : 's'}</div>` : ''}</td>
                <td class="adm-muted cell-tight">${e(D.fmtDate(t.createdAt))}</td>
                <td class="cell-tight tm-actions">${repairable(t) ? iconBtn({ tenant: 'repair' }, 'tool', 'Repair: run provisioning', `data-user="${e(t.ownerUserId)}" data-name="${e(t.organizationName || t.ownerEmail || 'this team')}"`) : ''}${iconBtn({ tenant: 'conduct' }, 'shield', 'Community standards', `data-env="${e(t.environmentId)}"`)}${realOrdersBtnHtml(t, realOrdersOn)}${t.conduct && (t.conduct.held || t.conduct.sitesHeld?.live || t.conduct.sitesHeld?.sandbox) ? `<div><span class="acct-tag is-bad" title="${e(t.conduct.held ? 'Suspended for the community standards' : 'Sites taken down for the community standards')}">held</span></div>` : ''}</td>
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
