// src/team/join.js
//
// The landing for a team invite link: /#join/<token>.
//
// The page first asks the API what the link is for (a public, masked peek:
// team, role, the address it was sent to, whether it still stands), then
// offers exactly one thing. Signed in: Accept. A visitor: Sign in or Create
// account, and the page comes back to itself afterwards through the same
// return-to hook the warranty page uses. Accepting is always an explicit click,
// never a side effect of signing in.
//
// The token lives in sessionStorage until it is redeemed or refused, so a
// sign-in round trip (login modal, 2FA, the wizard's post-login routing) cannot
// lose it. It is never sent anywhere but the accept and peek routes.

import { PRAG_API_BASE, LANE, TEAM_LIVE } from '../runtime/config.js';
import { openLoginModal } from '../ui/login.modal.js';

// The join page follows the same live gate as Team: off on the live lane
// until the lanes carry the tenant routes and TEAM_LIVE is flipped.
const TEAM_ON = (LANE !== 'live') || TEAM_LIVE;

const TOKEN_KEY = 'pragoptics_join_token';
const RETURN_KEY = 'pragoptics_return_to';
const PEEK_URL = `${PRAG_API_BASE}/tenant/invites/peek`;
const ACCEPT_URL = `${PRAG_API_BASE}/tenant/invites/accept`;

const ROLE_HELP = {
  admin: 'Admin: manages the team, invites and roles. No billing.',
  developer: 'Developer: publishes routes, builds and automations.',
  member: 'Member: a seat on the team, with the apps and APIs.',
  viewer: 'Viewer: read only, no seat.'
};

const state = { token: '', peek: null, loading: false, notFound: false, busy: false, error: '', accepted: null };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function signedIn() {
  try {
    if (typeof window.isAccessTokenValid === 'function') return !!window.isAccessTokenValid();
    return !!JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token;
  } catch { return false; }
}
function accessToken() {
  try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null')?.access_token || ''; } catch { return ''; }
}
function myEmail() {
  if (!signedIn()) return '';
  try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null')?.user?.email || ''; } catch { return ''; }
}
function tokenFromHash() {
  const m = String(location.hash || '').match(/^#join\/?([A-Za-z0-9_\-%]+)/i);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
function stash(token) { try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* fine */ } }
function stashed() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function fmtWhen(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ---------- API ---------- */

async function peek(token) {
  const res = await fetch(`${PEEK_URL}?token=${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } });
  let data = null;
  try { data = await res.json(); } catch { /* none */ }
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error(data?.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data?.invite || null;
}

async function accept(token) {
  const res = await fetch(ACCEPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${accessToken()}` },
    body: JSON.stringify({ token })
  });
  let data = null;
  try { data = await res.json(); } catch { /* none */ }
  if (!res.ok) { const e = new Error(data?.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
  return data;
}

/* ---------- view ---------- */

function html() {
  if (state.loading) return `<div class="join-card"><p class="join-hint">Checking your invite…</p></div>`;

  if (state.accepted) {
    const a = state.accepted;
    return `
      <div class="join-card is-done">
        <span class="join-kicker">Done</span>
        <h3 class="join-h">You are on the team.</h3>
        <p class="join-hint">${esc(a.tenant?.organizationName || 'The team')} now lists you as ${esc(a.membership?.role || 'a member')}.</p>
        <div class="join-actions">
          <button class="cta" type="button" data-join-action="open-team">Open Team</button>
          <button class="btn" type="button" data-join-action="go-home">Back to PragOptics</button>
        </div>
      </div>`;
  }

  if (state.notFound || !state.token) {
    return `
      <div class="join-card">
        <span class="join-kicker">Invite</span>
        <h3 class="join-h">This invite link is not valid.</h3>
        <p class="join-hint">It may have been used already, withdrawn, or copied incompletely. Ask the person who invited you for a new one.</p>
        <div class="join-actions"><button class="btn" type="button" data-join-action="go-home">Back to PragOptics</button></div>
      </div>`;
  }

  const p = state.peek || {};
  if (p.state === 'EXPIRED') {
    return `
      <div class="join-card">
        <span class="join-kicker">Invite</span>
        <h3 class="join-h">This invite has expired.</h3>
        <p class="join-hint">Invites work for seven days. Ask ${esc(p.inviter || 'the team')} to send a new one to ${esc(p.emailMasked || 'your address')}.</p>
        <div class="join-actions"><button class="btn" type="button" data-join-action="go-home">Back to PragOptics</button></div>
      </div>`;
  }

  const me = myEmail();
  const actions = signedIn()
    ? `<div class="join-actions">
         <button class="cta" type="button" data-join-action="accept" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Joining…' : 'Accept invite'}</button>
       </div>
       <p class="join-note">Signed in as <b>${esc(me || 'you')}</b>. The invite was sent to ${esc(p.emailMasked || '')}; the address must be one on your account. <button class="join-link" type="button" data-join-action="switch">Not you? Sign out</button></p>`
    : `<div class="join-actions">
         <button class="cta" type="button" data-join-action="sign-in">Sign in</button>
         <button class="btn" type="button" data-join-action="create-account">Create account</button>
       </div>
       <p class="join-note">Sign in with the address the invite was sent to, or create a PragOptics account with it. You come straight back here.</p>`;

  return `
    <div class="join-card">
      <span class="join-kicker">Invitation</span>
      <h3 class="join-h">Join ${esc(p.teamLabel || p.organizationName || 'the team')}</h3>
      <p class="join-hint"><b>${esc(p.inviter || 'A team owner')}</b> invited <b>${esc(p.emailMasked || 'you')}</b> to join as <b>${esc(cap(p.role))}</b>.</p>
      <p class="join-role">${esc(ROLE_HELP[p.role] || '')}${p.expiresAt ? ` Valid until ${esc(fmtWhen(p.expiresAt))}.` : ''}</p>
      ${actions}
      <p class="acct-error join-error" ${state.error ? '' : 'hidden'}>${esc(state.error)}</p>
    </div>`;
}

function render() {
  const host = document.getElementById('joinBody');
  if (host) host.innerHTML = html();
}

async function load() {
  state.accepted = null; state.error = ''; state.notFound = false;
  if (!state.token) { render(); return; }
  state.loading = true; render();
  try {
    state.peek = await peek(state.token);
    state.notFound = !state.peek;
    if (state.notFound) stash('');
  } catch (ex) {
    state.peek = null;
    state.error = ex?.status === 429 ? ex.message : 'Could not check the invite right now. Try again in a moment.';
  } finally {
    state.loading = false;
    render();
  }
}

async function doAccept() {
  if (state.busy || !state.token) return;
  state.busy = true; state.error = ''; render();
  try {
    state.accepted = await accept(state.token);
    stash('');
    // The account panel's Team section reads fresh on entry; nothing to sync.
  } catch (ex) {
    // The server's sentences are written for this person (wrong address, used,
    // expired, withdrawn, no seat); a dead session gets the sign-in door back.
    if (ex?.status === 401) { state.error = 'Your session ended. Sign in again to accept.'; }
    else state.error = ex?.message || 'Could not accept the invite.';
  } finally {
    state.busy = false;
    render();
  }
}

function bind() {
  const view = document.getElementById('joinView');
  if (!view || view._joinBound) return;
  view._joinBound = true;
  view.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-join-action]');
    if (!btn) return;
    const a = btn.dataset.joinAction;
    if (a === 'accept') return void doAccept();
    if (a === 'sign-in') {
      stash(state.token);
      try { sessionStorage.setItem(RETURN_KEY, 'join'); } catch { /* fine */ }
      openLoginModal('login');
      return;
    }
    if (a === 'create-account') {
      // The agreement gates account creation, then signup. Both are overlay
      // modals, so they open OVER the invitation page; we do NOT bounce to the
      // landing page. The masked address cannot prefill the form; the person
      // types the address the invite names, and accept checks it is theirs.
      // After signup the return-to=join hook brings them back here to Accept.
      stash(state.token);
      try { sessionStorage.setItem(RETURN_KEY, 'join'); } catch { /* fine */ }
      window.openAgreementModal?.();
      return;
    }
    if (a === 'switch') {
      stash(state.token);
      try { sessionStorage.setItem(RETURN_KEY, 'join'); } catch { /* fine */ }
      window.logout?.();
      setTimeout(() => { window.setAppMode?.('join'); load(); }, 300);
      return;
    }
    if (a === 'open-team') { window.openTeamFromMenu?.(); return; }
    if (a === 'go-home') { window.setAppMode?.('landing'); return; }
  });
}

/** Wire the view once. Also the hook the runtime calls for /#join/<token>. */
export function initJoinView() {
  bind();
  window.pragJoin = (token) => {
    if (!TEAM_ON) { window.setAppMode?.('landing'); return; }
    state.token = token || tokenFromHash() || stashed();
    if (state.token) stash(state.token);
    load();
  };
  // Back from a sign-in that started here: same token, now with a session.
  window.addEventListener('pragoptics:join-resume', () => {
    state.token = stashed() || state.token;
    load();
  });
}

/** Entering the view by any route: pick up the token from the hash or the stash. */
export function onJoinEnter() {
  if (!TEAM_ON) { window.setAppMode?.('landing'); return; }
  bind();
  const t = tokenFromHash() || state.token || stashed();
  if (t !== state.token || !state.peek) { state.token = t; if (t) stash(t); load(); }
  else render();
}
