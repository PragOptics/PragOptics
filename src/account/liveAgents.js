// src/account/liveAgents.js
//
// LIVE AGENTS, NOT AI (2026-10-10). A real person from the PragOptics team builds a customer's environment with them.
// This section has two faces, drawn from what the viewer is:
//   - the customer (owner of the environment in view): request support, their prepaid balance and spend throttle, and
//     the ledger of what agents have charged. The first contact is free.
//   - an agent (the platform owner, or anyone holding the owner-only agent grant): the queue of requests to take, and,
//     when they are viewing a customer's environment they are an agent on, their live work session and their own price
//     for that customer (discount, free minutes, or a full waive).
// The switcher is the existing team picker: an agent's agent-memberships show there, so they pick a customer's
// environment and this section follows the team in view.
//
// Backend: GET/POST v1/support/requests (the queue, auth/agentSupport.js; POST on the plural collection to raise); GET v1/environment/agent-support and
// POST .../throttle /pricing /session /topup (the balance and sessions, auth/agentBilling.js).

import { PRAG_API_BASE } from '../runtime/config.js';
import { cardHtml as sharedCard, ico, leadBtn, iconBtn, openModal, initCards } from './cards.js';
import { explainLink } from '../components/explainer.js';

let D = null;
const la = { mode: 'customer', reqs: null, canSupport: false, mine: null, support: null, agents: null, busy: '', err: '', note: '', amount: '' };

const TEAM_KEY = 'pragoptics_team_id';
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
function base() { return PRAG_API_BASE; }
/** A URL that names the team in view, as the Environment and Licensing reads do. */
function tq(path) { const t = teamId(); return t ? `${base()}${path}${path.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(t)}` : `${base()}${path}`; }

function cents(n) { return Math.max(0, Math.round(Number(n) || 0)); }
function money(c) { return `$${(cents(c) / 100).toFixed(2)}`; }
function rateWord(c) { return `${money(c)}/hr`; }
function when(s) { try { return D.fmtDate ? D.fmtDate(s) : new Date(s).toLocaleString(); } catch { return ''; } }
function card(o) { return sharedCard({ ...o, key: 'liveagents:' + o.key }); }

/** A ring: filled to `pct` (0..100), the balance remaining as a slice of what was loaded. */
function ringHtml(pct, done) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `<span class="su-ring la-ring ${done ? 'is-done' : ''}" aria-hidden="true"><svg viewBox="0 0 36 36" focusable="false"><circle class="su-ring-track" cx="18" cy="18" r="15"/><circle class="su-ring-fill" cx="18" cy="18" r="15" pathLength="100" style="stroke-dashoffset:${100 - p}"/></svg></span>`;
}

/* ---------- reads ---------- */

// The CUSTOMER side (a subscriber's own account): request a live hand, the balance, the ledger.
export async function renderLiveAgents(main, deps) { return mount(main, deps, 'customer', 'Live Agents'); }
// The AGENT DESK (internal, the roster): the queue of requests to take, and the work on a customer's environment.
export async function renderAgentDesk(main, deps) { return mount(main, deps, 'desk', 'Agents'); }

async function mount(main, deps, mode, title) {
  D = deps;
  la.mode = mode;
  initCards();
  la.err = '';
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">${title}</h2>${explain()}</header>
    <p class="acct-error" id="laError" hidden></p>
    <div id="laBody"><p class="acct-loading">Loading…</p></div>`;
  await load();
}

// Three levels, three deliberately different explainers:
//   user  (live-agents):  what bringing a live person in means, and the relationship you control.
//   agent (agent-desk):   what being an agent is, taking cases, and getting paid.
//   owner (agent-admin):  running the whole program, the roster and every case across the platform.
function explainKey() { return la.mode === 'desk' ? (isPlatformOwner() ? 'agent-admin' : 'agent-desk') : 'live-agents'; }
function explainLabel() {
  if (la.mode !== 'desk') return 'How it works';
  return isPlatformOwner() ? 'Running live agents' : 'How being an agent works';
}
function explain(label, key) { try { return explainLink(key || explainKey(), label || explainLabel()); } catch { return ''; } }

async function load() {
  try {
    const ownerDesk = la.mode === 'desk' && isPlatformOwner();
    const [reqs, support, agents] = await Promise.all([
      D.apiFetch(`${base()}/support/requests`).catch(() => null),
      D.apiFetch(tq('/environment/agent-support')).catch(() => null),
      ownerDesk ? D.apiFetch(`${base()}/support/agents`).catch(() => null) : Promise.resolve(null)
    ]);
    la.reqs = reqs || null;
    la.mine = reqs && reqs.mine !== undefined ? reqs.mine : null;
    la.canSupport = !!(reqs && reqs.canSupport);
    la.support = support && support.ok !== false ? support : null;   // null when the viewer cannot read billing here
    la.agents = agents && agents.ok !== false && Array.isArray(agents.agents) ? agents.agents : null;   // owner only
  } catch (e) { la.err = D.friendlyError ? D.friendlyError(e) : 'Could not load Live Agents.'; }
  paint();
}

/* ---------- paint ---------- */

function paint() {
  const host = document.getElementById('laBody');
  if (!host) return;
  const cards = [];
  let lead;
  if (la.mode === 'desk') {
    // the internal agent page, gated by the agent flag (isOwner or isAgent). Two faces:
    //   - the platform owner (isOwner): manages it all, every request across the platform.
    //   - an agent: their own work, scoped to them by their flag.
    const owner = isPlatformOwner();
    if (la.support && la.support.me) {
      // on a customer's environment you are an agent on: the session, the price, the ledger
      lead = 'You are an agent on this environment. Start a session to log your time, set your price for this customer, and your work shows in the ledger below.';
      cards.push(myWorkCard());
      cards.push(ledgerCard());
    } else if (owner) {
      // the OWNER'S ADMIN PANEL: the whole program. Every agent on the roster, and every request across the platform.
      lead = 'Your live agents, end to end. Every agent you have put on the roster, and every request across the platform. Take a request yourself, or hand it to an agent.';
      cards.push(agentsCard());
      cards.push(queueCard());
    } else {
      // an agent's own desk: the open cases they may answer, scoped to them; plus how they get paid
      lead = 'Your agent desk. These are the open cases you can answer. Take one to join that environment, then switch to it at the top of the panel to work.';
      cards.push(queueCard());
    }
  } else if (la.support && (la.support.youOwn !== undefined ? la.support.youOwn : !teamId())) {
    // the OWNER of the environment in view (their own, however it was selected): ask for a live hand, balance, ledger
    // (youOwn comes from the backend; the !teamId() fallback keeps it working before that deploy lands)
    lead = 'A real person, not an AI. Bring a live human from the PragOptics team into your environment to build it with you.';
    cards.push(requestCard());
    cards.push(balanceCard());
    cards.push(ledgerCard());
  } else {
    // a member viewing a team they are part of: agent support for that team is its OWNER's to request, not theirs
    lead = 'Agent support for this team is the owner\'s to request. Switch to your own team at the top of the panel to ask for a live hand on your environment.';
  }
  host.innerHTML = `<p class="acct-card-note la-lead">${lead}</p><div class="ev-cards">${cards.join('')}</div>`;
  initCards();
}

/** The viewer is looking at their OWN environment (no team override), so the balance is theirs to manage. */
function isEnvOwnerView() { return !teamId(); }

/* ---------- the customer's own request ---------- */

function requestCard() {
  const e = D.escapeHtml;
  const m = la.mine;
  const status = m && m.status ? String(m.status) : 'NONE';
  const taken = status === 'TAKEN';
  const open = status === 'OPEN';
  const body = `
    ${status === 'NONE' || status === 'CLOSED' ? `
      <p class="acct-card-note">Need a hand building or fixing your environment? Ask a live agent to come in and work on it with you. Your first contact is free.</p>
      <div class="la-req-row">
        <input class="acct-input" id="laNote" maxlength="500" placeholder="What do you need help with? (optional)" value="${e(la.note || '')}" />
        ${leadBtn({ la: 'request' }, 'message', 'Request agent support', la.busy === 'request' ? 'disabled' : '', 'btn-primary')}
      </div>` : ''}
    ${open ? `
      <p class="la-status"><span class="la-dot is-open"></span> Your request is in. The owner and the agent roster can see it; someone will pick it up.</p>
      ${m.note ? `<p class="acct-card-note">"${e(m.note)}"</p>` : ''}
      <div class="ev-dom-actions">${iconBtn({ la: 'withdraw' }, 'x', 'Withdraw the request', '', '')}</div>` : ''}
    ${taken ? `
      <p class="la-status"><span class="la-dot is-live"></span> ${e(m.takenByEmail || 'An agent')} is helping with your environment.</p>
      <p class="acct-card-note">You can remove them from your Team tab at any time. What they do shows in the ledger below.</p>
      <div class="ev-dom-actions">${iconBtn({ la: 'withdraw' }, 'check', 'Mark it done', '', '')}</div>` : ''}`;
  return card({ key: 'request', icon: 'message', title: 'Agent support', summary: open ? 'requested' : taken ? 'an agent is helping' : 'ready', body });
}

/* ---------- the balance ---------- */

function balanceCard() {
  const e = D.escapeHtml;
  const s = la.support || {};
  const bal = cents(s.balanceCents);
  const entries = Array.isArray(s.entries) ? s.entries : [];
  const loaded = entries.filter(x => x.kind === 'topup').reduce((a, x) => a + cents(x.amountCents), 0);
  const spent = Math.max(0, loaded - bal);
  const pct = loaded > 0 ? (bal / loaded) * 100 : 0;
  const throttle = cents(s.throttleCents);
  const body = `
    <div class="la-bal">
      ${ringHtml(pct, bal > 0 && spent === 0)}
      <div class="la-bal-main">
        <p class="la-bal-fig">${money(bal)} <span class="la-bal-sub">available</span></p>
        <p class="acct-card-note">${loaded > 0 ? `${money(spent)} of ${money(loaded)} used.` : 'No funds added yet. Your first contact is free; add a balance when you want paid help beyond that.'}</p>
      </div>
    </div>
    <p class="acct-card-note">An agent's time draws from this balance at their rate. It can never go below zero, so you are never surprised by a bill. The owner is ${rateWord(15000)}, an agent is ${rateWord(7500)}. Whoever takes your request shows you their rate before any billable time.</p>
    <div class="la-throttle">
      <label class="acct-label" for="laThrottle">Spend cap (optional)</label>
      <div class="la-req-row">
        <input class="acct-input" id="laThrottle" inputmode="numeric" placeholder="No cap" value="${throttle ? (throttle / 100).toFixed(2) : ''}" />
        ${iconBtn({ la: 'throttle' }, 'sliders', 'Set the spend cap', '', '')}
      </div>
      <p class="acct-card-note">The most you want drawn toward agents. Leave blank for no cap beyond the balance itself.</p>
    </div>
    <div class="ev-dom-actions act-row">${leadBtn({ la: 'topup' }, 'plus', 'Add to balance', '', 'btn-primary')}</div>`;
  return card({ key: 'balance', icon: 'dollar', title: 'Your support balance', summary: money(bal), body });
}

/* ---------- the ledger ---------- */

function ledgerCard() {
  const e = D.escapeHtml;
  const entries = Array.isArray(la.support?.entries) ? la.support.entries : [];
  const rows = entries.map(x => {
    const topup = x.kind === 'topup';
    const amt = cents(x.amountCents);
    const sign = topup ? '+' : (amt ? '-' : '');
    const who = topup ? 'Top-up' : (x.agentEmail || 'Agent');
    const detail = topup ? (x.source ? 'Card' : 'Added') : lineDetail(x);
    return `<tr>
      <td data-th="When">${e(when(x.at))}</td>
      <td data-th="Who">${e(who)}</td>
      <td data-th="Detail">${e(detail)}</td>
      <td data-th="Amount" class="la-amt ${topup ? 'is-plus' : amt ? 'is-minus' : 'is-free'}">${sign}${money(amt)}</td>
    </tr>`;
  }).join('');
  const body = `
    <div class="adm-table-scroll">
      <table class="adm-table adm-table--wrap">
        <thead><tr><th>When</th><th>Who</th><th>Detail</th><th>Amount</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">Nothing yet.</td></tr>'}</tbody>
      </table>
    </div>`;
  return card({ key: 'ledger', icon: 'list', title: 'Ledger', summary: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`, body });
}
function lineDetail(x) {
  if (x.firstContact) return 'First contact, free';
  if (x.waived) return `${x.minutes} min, waived`;
  const bits = [`${x.minutes} min`];
  if (x.reason === 'free-minutes') bits.push('free');
  else bits.push(`at ${rateWord(x.effectiveRateCents)}`);
  if (x.discountPercent) bits.push(`${x.discountPercent}% off`);
  if (x.freeMinutesApplied) bits.push(`${x.freeMinutesApplied} free min`);
  if (x.reason === 'charged-capped') bits.push('capped at balance');
  return bits.join(', ');
}

/* ---------- the owner's roster of agents (admin) ---------- */

function agentsCard() {
  const e = D.escapeHtml;
  const list = Array.isArray(la.agents) ? la.agents : [];
  const rowOf = (a) => {
    const owed = cents(a.earnings?.owedCents);
    const earned = cents(a.earnings?.earnedCents);
    return `<tr>
      <td data-th="Agent"><span class="la-agent-id"><span class="la-agent-av" aria-hidden="true">${e((a.email || '?').slice(0, 1).toUpperCase())}</span>${e(a.email || a.userId)}</span></td>
      <td data-th="Earned">${money(earned)}</td>
      <td data-th="Owed" class="la-amt ${owed ? 'is-minus' : 'is-free'}">${money(owed)}</td>
      <td data-th="" class="la-agent-act">${iconBtn({ la: 'revoke-agent' }, 'x', 'Remove the agent badge', `data-user="${e(a.userId)}" data-email="${e(a.email || '')}"`, '')}</td>
    </tr>`;
  };
  const body = list.length
    ? `<p class="acct-card-note">The people you have put on the agent roster. The badge is yours to grant or remove; an agent keeps no seat.</p>
       <div class="adm-table-scroll"><table class="adm-table adm-table--wrap">
         <thead><tr><th>Agent</th><th>Earned</th><th>Owed</th><th></th></tr></thead>
         <tbody>${list.map(rowOf).join('')}</tbody>
       </table></div>`
    : '<p class="acct-empty">No agents yet. Grant the agent badge from a person\'s row on the Team tab or the Users desk, and they appear here.</p>';
  return card({ key: 'roster', icon: 'users', title: 'Your agents', summary: `${list.length} on roster`, body });
}

/* ---------- the agent's queue ---------- */

function queueCard() {
  const e = D.escapeHtml;
  const q = Array.isArray(la.reqs?.queue) ? la.reqs.queue : [];
  const open = q.filter(x => x.status === 'OPEN');
  const taken = q.filter(x => x.status === 'TAKEN');
  const rowOf = (x) => `
    <div class="la-qrow">
      <div class="la-qrow-main">
        <span class="la-dot ${x.status === 'TAKEN' ? 'is-live' : 'is-open'}"></span>
        <div>
          <p class="la-qrow-t">${e(x.environmentName || x.environmentId)}</p>
          <p class="acct-card-note">${e(x.requesterEmail || '')}${x.note ? ` , "${e(x.note)}"` : ''}${x.status === 'TAKEN' ? ` , taken by ${e(x.takenByEmail || 'an agent')}` : ''}</p>
        </div>
      </div>
      <div class="la-qrow-act">${x.status === 'OPEN'
        ? leadBtn({ la: 'take' }, 'check', 'Take it', `${la.busy === 'take:' + x.environmentId ? 'disabled' : ''} data-env="${e(x.environmentId)}"`, 'btn-primary')
        : iconBtn({ la: 'open-env' }, 'external', 'Open this environment', `data-env="${e(x.environmentId)}"`, '')}</div>
    </div>`;
  const owner = isPlatformOwner();
  const body = `
    <p class="acct-card-note">${owner ? 'Every request for a live hand across the platform. Take one to join that environment as an agent, then switch to it to work.' : 'Open cases you can answer. Take one to join that environment as an agent, then switch to it to work.'}</p>
    ${open.length ? open.map(rowOf).join('') : `<p class="acct-empty">${owner ? 'No open requests.' : 'No open cases right now.'}</p>`}
    ${taken.length ? `<p class="su-kicker" style="margin-top:14px">In progress</p>${taken.map(rowOf).join('')}` : ''}`;
  return card({ key: 'queue', icon: 'bell', title: owner ? 'Requests across the platform' : 'Open cases', summary: `${open.length} open`, body });
}

/* ---------- the agent's own work on a customer's environment ---------- */

function myWorkCard() {
  const e = D.escapeHtml;
  const me = la.support.me || {};
  const p = me.pricing || {};
  const active = la.support.active;
  const working = active && String(active.agentUserId) === String(myId());
  const eff = effRate(me.baseRateCents, p);
  const fee = me.isOwner ? 100 : Number(me.feePercent || 20);
  const keepPerHr = me.isOwner ? 0 : Math.round(eff * (100 - fee) / 100);
  const earn = me.earnings || {};
  const body = `
    <p class="acct-card-note">You are an agent on this environment. Your rate here is ${rateWord(me.baseRateCents)}${p.waived ? ', currently waived (free)' : p.discountPercent ? `, with ${p.discountPercent}% off (${rateWord(eff)})` : ''}.</p>
    ${me.isOwner ? '' : `<p class="acct-card-note">You keep ${100 - fee}% of what you charge here; the platform's fee is ${fee}%. At ${rateWord(eff)} that is ${rateWord(keepPerHr)} to you. ${explain('How you get paid', 'agent-pay')}</p>`}
    ${!me.isOwner && earn.earnedCents !== undefined ? `<p class="acct-card-note">Across your customers: earned ${money(earn.earnedCents)}, owed to you ${money(earn.owedCents)}.</p>` : ''}
    <div class="la-session">
      ${working
        ? `<p class="la-status"><span class="la-dot is-live"></span> Working since ${e(when(active.startedAt))}.</p>${leadBtn({ la: 'session-stop' }, 'stop', 'Stop and log time', la.busy === 'session' ? 'disabled' : '', 'btn-primary')}`
        : leadBtn({ la: 'session-start' }, 'play', 'Start working', la.busy === 'session' ? 'disabled' : '', 'btn-primary')}
    </div>
    <div class="la-price">
      <p class="su-kicker">Your price for this customer</p>
      <div class="la-price-grid">
        <label class="acct-label">Discount %<input class="acct-input" id="laDiscount" inputmode="numeric" value="${Number(p.discountPercent) || ''}" placeholder="0" ${p.waived ? 'disabled' : ''} /></label>
        <label class="acct-label">Free minutes<input class="acct-input" id="laFree" inputmode="numeric" value="${Number(p.freeMinutes) || ''}" placeholder="0" /></label>
        <label class="acct-check"><input type="checkbox" id="laWaive" ${p.waived ? 'checked' : ''} /> Waive my fee (free)</label>
      </div>
      <div class="ev-dom-actions">${leadBtn({ la: 'pricing' }, 'check', 'Save my price', la.busy === 'pricing' ? 'disabled' : '', '')}</div>
      <p class="acct-card-note">A discount is up to 50%. To work free, waive the fee. The customer sees your rate before any billable time.</p>
    </div>`;
  return card({ key: 'mywork', icon: 'tool', title: 'Your work here', summary: working ? 'working' : 'ready', body });
}
function myId() { try { return String(D.cachedPing?.()?.user?.userId || ''); } catch { return ''; } }
function isPlatformOwner() { try { return D.cachedPing?.()?.user?.isOwner === true; } catch { return false; } }
function effRate(base, p) { return p.waived ? 0 : Math.round((Number(base) || 0) * (100 - (Number(p.discountPercent) || 0)) / 100); }

/* ---------- actions ---------- */

export function bindLiveAgentsActions(deps) {
  if (bindLiveAgentsActions._bound) return;
  bindLiveAgentsActions._bound = true;
  D = D || deps;
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-la-action]');
    if (!btn) return;
    const a = btn.dataset.laAction;
    const env = btn.dataset.env || '';
    e.preventDefault();
    try {
      if (a === 'request') return void await doRequest();
      if (a === 'withdraw') return void await doClose();
      if (a === 'take') return void await doTake(env, btn);
      if (a === 'revoke-agent') return void await doRevokeAgent(btn.dataset.user || '', btn.dataset.email || '');
      if (a === 'open-env') return void openEnv(env);
      if (a === 'throttle') return void await doThrottle();
      if (a === 'topup') return void await doTopup();
      if (a === 'session-start') return void await doSession('start');
      if (a === 'session-stop') return void await doSession('stop');
      if (a === 'pricing') return void await doPricing();
    } catch (err) { setErr(D.friendlyError ? D.friendlyError(err) : 'That did not work.'); }
  });
}

function setErr(m) { const el = document.getElementById('laError'); if (el) { el.textContent = m || ''; el.hidden = !m; } }
function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }

async function doRequest() {
  la.note = val('laNote'); la.busy = 'request'; paint();
  try { await D.apiFetch(`${base()}/support/requests`, { method: 'POST', body: JSON.stringify({ note: la.note }) }); la.note = ''; }
  finally { la.busy = ''; }
  await load();
}
async function doClose() {
  const envId = la.mine?.environmentId || teamId() || '';
  await D.apiFetch(`${base()}/support/requests/${encodeURIComponent(envId)}/close`, { method: 'POST', body: '{}' });
  await load();
}
async function doTake(env, btn) {
  la.busy = 'take:' + env; paint();
  try { await D.apiFetch(`${base()}/support/requests/${encodeURIComponent(env)}/take`, { method: 'POST', body: '{}' }); }
  finally { la.busy = ''; }
  await load();
}
async function doRevokeAgent(userId, email) {
  if (!userId || typeof D.grantAgent !== 'function') return;
  if (!confirm(`Remove the agent badge from ${email || 'this person'}? They keep their account and team role; they just stop being an agent.`)) return;
  await D.grantAgent(userId, email, false);
  await load();
}
async function doThrottle() {
  const raw = String(val('laThrottle') || '').trim();
  const dollars = raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(dollars) || dollars < 0) return setErr('Enter a dollar amount, or leave blank for no cap.');
  await D.apiFetch(tq('/environment/agent-support/throttle'), { method: 'POST', body: JSON.stringify({ throttleCents: Math.round(dollars * 100) }) });
  await load();
}
async function doSession(action) {
  la.busy = 'session'; paint();
  try { await D.apiFetch(tq('/environment/agent-support/session'), { method: 'POST', body: JSON.stringify({ action }) }); }
  finally { la.busy = ''; }
  await load();
}
async function doPricing() {
  const body = { waived: checked('laWaive') };
  const d = String(val('laDiscount') || '').trim(); if (d !== '') body.discountPercent = Number(d);
  const f = String(val('laFree') || '').trim(); if (f !== '') body.freeMinutes = Number(f);
  la.busy = 'pricing'; paint();
  try { await D.apiFetch(tq('/environment/agent-support/pricing'), { method: 'POST', body: JSON.stringify(body) }); }
  finally { la.busy = ''; }
  await load();
}
/** Switch the team in view to a customer's environment, then open this section for it. */
function openEnv(env) {
  if (!env) return;
  try { sessionStorage.setItem(TEAM_KEY, env); } catch { /* the pick is not remembered; the view still changes */ }
  const sec = la.mode === 'desk' ? 'agentdesk' : 'liveagents';
  try { document.querySelector(`[data-acct-section="${sec}"]`)?.click(); } catch { /* ignore */ }
  load();
}
/** Top up is finished with the site's card entry in the next pass; for now it explains the free path. */
function doTopup() {
  const m = openModal('laTopup', `
    <div class="acct-modal"><div class="acct-modal-card">
      <h3>Add to your balance</h3>
      <p class="acct-card-note">Card top-ups are being finished. Your first contact is free, and an agent can waive their fee, so you can start without a balance. Adding funds with your card arrives in the next update.</p>
      <div class="ev-dom-actions act-row"><button class="btn btn-sm btn-primary" type="button" data-close>Got it</button></div>
    </div></div>`, { onClick: (ev) => { if (ev.target.closest('[data-close]')) m.close(); } });
}
