// Quark's public chat shell. Its interpreter and workflows execute privately.
import { createQuarkClient, scopeKey } from './quarkClient.js';
const NAME = 'Quark';

/* ----------------------------------------------------------------- session (read-only) */

function tokens() { try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null'); } catch { return null; } }
function ping() { try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); } catch { return null; } }
function signedIn() { return !!tokens()?.access_token; }
function firstName() {
  const p = ping(); const n = String(p?.user?.firstName || p?.user?.name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

function applyNavigation(destination) {
  if (!destination || typeof destination !== 'object') return;
  closeDrawer();
  if (destination.mode === 'studio') { window.pragOpenStudio?.(); return; }
  if (destination.mode) { window.setAppMode?.(destination.mode); return; }
  if (!destination.section) return;
  if (destination.card) {
    try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify(destination)); } catch { /* navigation still opens */ }
  }
  window.presetAccountSection?.(destination.section);
  window.setAppMode?.('account');
}

/* ----------------------------------------------------------------- Quark's mark = the character */

// Quark wears his own rendered character (images/quark.png, the alien): a free-standing figure, no
// tile and no frame. The corner presence is that character; the chat header and the message avatars
// show the same figure. Styled in css/components/quark.css.

/* ----------------------------------------------------------------- DOM */

const el = {};
let built = false;
let docked = false;
let drawerOpen = false;
let greeted = false;
let curMode = 'landing';
let logPosition = { top: 0, atEnd: true };

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function build() {
  if (built) return;
  built = true;

  const char = document.createElement('button');
  char.type = 'button';
  char.id = 'quarkChar';
  char.className = 'quark-char quark-hidden';   // starts hidden; placeQuark reveals it only when signed in, off Home
  char.setAttribute('aria-label', `Ask ${NAME}`);
  char.title = `Ask ${NAME}`;
  char.addEventListener('click', () => toggleDrawer());
  document.body.appendChild(char);
  el.char = char;

  const chat = document.createElement('div');
  chat.id = 'quarkChat';
  chat.className = 'quark-chat';
  chat.setAttribute('aria-label', `${NAME}, the PragOptics assistant`);
  chat.innerHTML = `
    <div class="quark-head">
      <span class="quark-mark" aria-hidden="true"></span>
      <span class="quark-id"><span class="quark-name">${NAME}</span><span class="quark-sub">your guide to the platform</span></span>
      <button type="button" class="quark-close" aria-label="Close ${NAME}" data-quark="close">&times;</button>
    </div>
    <div class="quark-log" id="quarkLog" role="log" aria-live="polite"></div>
    <form class="quark-ask" id="quarkForm" autocomplete="off">
      <input class="quark-input" id="quarkInput" type="text" placeholder="Tell me what you want to do" aria-label="Ask ${NAME}">
      <button class="quark-send" type="submit" aria-label="Send"><span aria-hidden="true">&#8593;</span></button>
    </form>`;
  el.chat = chat;
  el.log = chat.querySelector('#quarkLog');
  el.input = chat.querySelector('#quarkInput');

  chat.querySelector('#quarkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (el.input.value || '').trim();
    if (!v) return;
    el.input.value = '';
    sayYou(v);
    respond(v);
  });
  chat.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quark]');
    if (!b) return;
    const act = b.dataset.quark;
    if (act === 'close') { closeDrawer(); return; }
    if (act === 'chip') { const t = b.dataset.text || b.textContent; sayYou(t); respond(t); return; }
    if (act === 'remote') { respond(null, b.dataset.ticket || '', b); return; }
  });

  const drawer = document.createElement('div');
  drawer.id = 'quarkDrawer';
  drawer.className = 'quark-drawer';
  drawer.hidden = true;
  document.body.appendChild(drawer);
  el.drawer = drawer;

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen) closeDrawer(); });
}

/* ----------------------------------------------------------------- rendering messages */

function scrollLog() {
  logPosition = { top: 0, atEnd: true };
  try { el.log.scrollTop = el.log.scrollHeight; } catch { /* ignore */ }
}
function rememberLogPosition() {
  if (!el.log?.clientHeight) return;
  logPosition = { top: el.log.scrollTop, atEnd: el.log.scrollHeight - el.log.clientHeight - el.log.scrollTop < 16 };
}
function restoreLogPosition() {
  requestAnimationFrame(() => {
    if (el.log?.clientHeight) el.log.scrollTop = logPosition.atEnd ? el.log.scrollHeight : logPosition.top;
  });
}

function bubble(role, html) {
  const row = document.createElement('div');
  row.className = `quark-msg quark-${role}`;
  row.innerHTML = role === 'quark'
    ? `<span class="quark-avatar" aria-hidden="true"></span><div class="quark-body">${html}</div>`
    : `<div class="quark-body">${html}</div>`;
  el.log.appendChild(row);
  scrollLog();
  return row;
}
function sayYou(text) { bubble('you', esc(text)); }
function sayQuark(html) { return bubble('quark', html); }

function chips(list) {
  return `<div class="quark-chips">${list.map((c) => `<button type="button" class="quark-chip" data-quark="chip" data-text="${esc(c.text || c)}">${esc(c.label || c)}</button>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- platform guidance and scoped operations */

let platformAccess = null, client = null, replyGeneration = 0, conversationOwner = '';
async function accessPlatform() {
  if (!platformAccess) {
    const account = await import('../account/account.js');
    platformAccess = account.quarkPlatformAccess();
    client = createQuarkClient({ context: platformAccess.context, send: platformAccess.send });
  }
  return client;
}
function resetConversationIfChanged() {
  let team = '';
  try { team = sessionStorage.getItem('pragoptics_team_id') || ''; } catch { /* own environment */ }
  const key = signedIn() ? JSON.stringify([ping()?.user?.userId || '', platformAccess?.context().tenant || team, platformAccess?.context().lane || 'live']) : '';
  if (key === conversationOwner) return;
  conversationOwner = key; replyGeneration++;
  if (el.log) el.log.replaceChildren();
  greeted = false;
}
async function respond(text, ticket = '', button = null) {
  if (!signedIn() || button?.disabled) return;
  if (button) button.disabled = true;
  const generation = ++replyGeneration;
  const row = sayQuark('Reading the platform…');
  try {
    const transport = await accessPlatform(), key = scopeKey(platformAccess.context());
    const result = await transport.request(ticket ? { ticket } : { text });
    if (generation !== replyGeneration || !signedIn() || scopeKey(platformAccess.context()) !== key) { row.remove(); return; }
    row.querySelector('.quark-body').innerHTML = result.html;
    if (result.navigation) applyNavigation(result.navigation);
    scrollLog();
  } catch (error) {
    if (generation !== replyGeneration || !signedIn()) { row.remove(); return; }
    row.querySelector('.quark-body').textContent = error?.message || 'Quark could not confirm a result.';
  } finally { if (button?.isConnected) button.disabled = false; }
}

function greetingHtml() {
  const who = firstName();
  const hi = who ? `Welcome back, ${esc(who)}.` : `Hi, I'm ${NAME}.`;
  const lead = signedIn()
    ? `What would you like to do in the platform or the environment you have open?`
    : `Tell me what you want to launch and I take you there step by step. I handle the technical parts; you just make the calls.`;
  return `${hi} ${lead}${chips([{ label: 'My setup', text: 'Show my setup' }, { label: 'Find a workflow', text: 'Show platform capabilities' }, { label: 'What can this do', text: 'What can this platform do' }])}`;
}

function greetOnce() {
  if (greeted) return;
  greeted = true;
  sayQuark(greetingHtml());
  // Show the greeting from its top, never scrolled up behind the header.
  requestAnimationFrame(() => { try { if (el.log) el.log.scrollTop = 0; } catch { /* ignore */ } });
}

/* ----------------------------------------------------------------- placement: docked on Home, else the corner character */

function sectionIsHome() {
  try { const q = new URLSearchParams(String(location.hash || '').split('?')[1] || ''); return (q.get('section') || '') === 'home'; } catch { return false; }
}
// Derive the live surface from the DOM (which view is shown), not from the onEnterMode hook, which
// fires several times during boot in a racing order. The visible view is the settled, authoritative state.
function visibleView() {
  for (const id of ['landing', 'account', 'shop', 'software', 'checkout', 'warranty', 'builds', 'admin', 'console', 'wizard', 'join']) {
    const v = document.getElementById(id + 'View');
    if (v && !v.classList.contains('hidden')) return id;
  }
  return 'landing';
}
function isHomeSurface() {
  // Only the signed-in account Home tab docks the chat. Never the landing / pre-sign-in screen.
  return signedIn() && visibleView() === 'account' && sectionIsHome();
}

// The element to dock the chat into on the account Home tab, created/placed as needed.
function homeHost() {
  // account Home: a host directly above the section content (#acctMain), inside the stable panel main.
  const am = document.getElementById('acctMain');
  if (!am || !am.parentElement) return null;
  let h = document.getElementById('quarkHome');
  if (!h || h.dataset.home !== 'acct') {
    if (h && h.parentElement) h.parentElement.removeChild(h);
    h = document.createElement('div'); h.id = 'quarkHome'; h.className = 'quark-home quark-home-acct'; h.dataset.home = 'acct';
  }
  if (h.parentElement !== am.parentElement || h.nextElementSibling !== am) am.parentElement.insertBefore(h, am);
  return h;
}

function dockHome() {
  const host = homeHost();
  if (!host) return false;
  const moving = el.chat.parentElement !== host;
  if (moving) rememberLogPosition();
  // Docking owns the chat now: the floating shell must stop painting and taking clicks.
  drawerOpen = false;
  el.drawer.classList.remove('is-open');
  el.drawer.hidden = true;
  el.chat.classList.add('quark-docked');
  el.chat.classList.remove('quark-in-drawer');
  if (moving) {
    host.appendChild(el.chat);
    restoreLogPosition();
    requestAnimationFrame(() => el.chat.scrollIntoView({ block: 'nearest' }));
  }
  docked = true;
  el.char?.classList.add('quark-hidden');
  greetOnce();
  return true;
}

function undockToDrawer() {
  rememberLogPosition();
  el.chat.classList.remove('quark-docked');
  el.chat.classList.add('quark-in-drawer');
  if (el.chat.parentElement !== el.drawer) el.drawer.appendChild(el.chat);
  restoreLogPosition();
  docked = false;
  const h = document.getElementById('quarkHome');
  if (h && h.parentElement && el.chat.parentElement !== h) h.parentElement.removeChild(h);
}

let homeRetry = 0;
function placeQuark() {
  if (!built) return;
  resetConversationIfChanged();
  // Quark only exists signed in, and never on the landing / pre-sign-in screen.
  if (!signedIn() || visibleView() === 'landing') {
    homeRetry = 0;
    if (drawerOpen) closeDrawer();
    el.drawer.hidden = true;
    el.drawer.classList.remove('is-open');
    if (el.chat.parentElement !== el.drawer) undockToDrawer();
    el.char?.classList.add('quark-hidden');
    return;
  }
  if (isHomeSurface()) {
    if (dockHome()) { homeRetry = 0; return; }
    if (homeRetry++ < 20) setTimeout(placeQuark, 150);   // the account Home content may still be rendering
    return;
  }
  homeRetry = 0;
  if (docked || el.chat.parentElement !== el.drawer) undockToDrawer();
  // Keep an open chat open across re-checks (a section change must not close it); otherwise show the character.
  if (drawerOpen) el.char?.classList.add('quark-hidden');
  else el.char?.classList.remove('quark-hidden');
}

/* ----------------------------------------------------------------- drawer */

function openDrawer() {
  if (isHomeSurface()) {
    dockHome();
    el.input?.focus({ preventScroll: true });
    return;
  }
  if (el.chat.parentElement !== el.drawer) undockToDrawer();
  el.drawer.hidden = false;
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  drawerOpen = true;
  el.char?.classList.add('quark-hidden');
  greetOnce();
  restoreLogPosition();
  setTimeout(() => el.input?.focus({ preventScroll: true }), 140);
}
function closeDrawer() {
  if (!drawerOpen) return;
  rememberLogPosition();
  el.drawer.classList.remove('is-open');
  drawerOpen = false;
  setTimeout(() => { if (!drawerOpen) el.drawer.hidden = true; }, 240);
  if (signedIn() && visibleView() !== 'landing' && !isHomeSurface()) el.char?.classList.remove('quark-hidden');
}
function toggleDrawer() { drawerOpen ? closeDrawer() : openDrawer(); }

/* ----------------------------------------------------------------- init */

export function initQuark() {
  if (built) return;
  build();

  // Place now and again once the view/section has settled (boot fires several mode changes in a row,
  // and the account section content renders a beat later).
  const replace = () => { try { placeQuark(); } catch { /* isolate */ } setTimeout(() => { try { placeQuark(); } catch { /* isolate */ } }, 180); };
  const prev = (typeof window.onEnterMode === 'function') ? window.onEnterMode : null;
  window.onEnterMode = (m) => {
    try { prev && prev(m); } catch { /* isolate the app's own hook */ }
    replace();
  };
  // Account section changes rewrite the hash (#account?section=home); re-place on those too.
  window.addEventListener('hashchange', replace);
  // The account Home content (#acctMain) renders asynchronously after sign-in and re-renders on every
  // section change. Watch it so the chat docks the moment that content appears, instead of being left
  // as the corner character when the first placement runs before the content exists (the timed retry
  // alone can lapse during a slow sign-in).
  try {
    const acctView = document.getElementById('accountView');
    if (acctView && 'MutationObserver' in window) {
      let moT = 0;
      new MutationObserver(() => { clearTimeout(moT); moT = setTimeout(() => { try { placeQuark(); } catch { /* isolate */ } }, 80); }).observe(acctView, { childList: true, subtree: true });
    }
  } catch { /* no observer: the timed retry still covers the common case */ }
  replace();

  window.pragQuark = { open: () => { if (signedIn() && visibleView() !== 'landing') openDrawer(); }, ask: (t) => { if (signedIn() && visibleView() !== 'landing') { sayYou(t); respond(t); } } };
}

export default initQuark;
