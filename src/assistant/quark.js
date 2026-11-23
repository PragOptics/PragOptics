// src/assistant/quark.js
//
// QUARK — the platform's front-end assistant (2026-11-21).
//
// What it is: one assistant the person just talks to, and it only exists once you are signed in.
// On the signed-in Profile Home tab it is a docked side-chat. On every other surface inside the
// platform it is Quark himself in the corner — the rendered character — who opens the same chat.
// It never appears before sign-in or on the landing screen, and it knows nothing about the user
// until they are signed in. When the chat opens the corner character steps aside, so the two never
// sit misaligned at any size.
//
// It knows the platform because it reads the platform's own self-description
// (GET v1/assistant/knowledge, the awareness endpoint), it holds the order a launch actually
// happens in, it does the machine parts (it navigates you to the exact place), and it hands you only
// the clicks that are yours.
//
// The deterministic controller uses capability knowledge, actual setup state and bounded actions.
// It works without a model and reports unconfirmed state explicitly. A future model proposes intents
// through respond(); src/assistant/quark.instructions.md describes the boundaries. No secrets live here.

import { PRAG_API_BASE } from '../runtime/config.js';
import { createPlatformGuide, capabilityDestination, scopeKey } from './quarkPlatform.js';
import { answerPlatform, supplierResult } from './quarkPlatformView.js';

const KNOWLEDGE_URL = `${PRAG_API_BASE}/assistant/knowledge`;
const NAME = 'Quark';

/* ----------------------------------------------------------------- session (read-only) */

function tokens() { try { return JSON.parse(sessionStorage.getItem('pragoptics_tokens') || 'null'); } catch { return null; } }
function ping() { try { return JSON.parse(sessionStorage.getItem('pragoptics_ping') || 'null'); } catch { return null; } }
function signedIn() { return !!tokens()?.access_token; }
function firstName() {
  const p = ping(); const n = String(p?.user?.firstName || p?.user?.name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

/* ----------------------------------------------------------------- the platform's own knowledge */

let _knowledge = null, _knowledgeRead = null;
async function knowledge() {
  if (_knowledge) return _knowledge;
  if (_knowledgeRead) return _knowledgeRead;
  _knowledgeRead = (async () => {
    try {
      const headers = {}; const t = tokens()?.access_token;
      if (t) headers.Authorization = `Bearer ${t}`;
      const res = await fetch(KNOWLEDGE_URL, { headers });
      if (!res.ok) return null;
      const d = await res.json();
      _knowledge = Array.isArray(d?.capabilities) ? d.capabilities : null;
      return _knowledge;
    } catch { return null; }
    finally { _knowledgeRead = null; }
  })();
  return _knowledgeRead;
}

/* ----------------------------------------------------------------- the platform's engines */

// The platform is built on engines (runtimes), not just website features. Quark names them so it is
// aware of the whole platform. These descriptions do not imply fresh deployment verification.
const ENGINES = [
  { label: 'Public frontend', what: 'the account panel, public pages and the separate PragOptics Hardware Shop.' },
  { label: 'Core platform', what: 'accounts, environment scope, connections, billing, data and operator workflows.' },
  { label: 'Studio', what: 'designs, reconstructs, builds and publishes sites and reusable modules.' },
  { label: 'Python Data Engine', what: 'decodes supported data formats and reports incomplete recovery explicitly.' },
  { label: 'PowerShell Exchange runtime', what: 'executes authorized Microsoft tenant operations decided by the core platform.' },
  { label: 'FNM', what: 'the independent foundation runtime; separate from the web storefront and site assistants.' },
  { label: 'Site serving edge', what: 'serves published environment sites at their assigned domains.' },
];

/* ----------------------------------------------------------------- navigation (the machine parts) */

function go(dest, query = '', card = '', row = '') {
  const shopifyDestination = ['shopify-discovery','shopify-connection','shopify-review'].includes(dest);
  const top = ['shop', 'software', 'warranty', 'builds', 'console'];
  closeDrawer();
  if (dest === 'shopify-discovery' || dest === 'shopify-connection' || dest === 'shopify-review') {
    const shopify = dest === 'shopify-discovery' ? 'discovery' : dest === 'shopify-review' ? 'review' : 'connection';
    try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section: 'environment', card: 'connections', shopify, query, row })); } catch { /* the section still opens */ }
    dest = 'environment';
  }
  if (card && !shopifyDestination) { try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section: dest, card, row })); } catch { /* navigation still works */ } }
  if (dest === 'studio') { try { (window.pragOpenStudio || (() => {}))(); } catch { /* ignore */ } return; }
  if (top.includes(dest)) { try { window.setAppMode?.(dest); } catch { /* ignore */ } return; }
  if (signedIn()) {
    try { window.presetAccountSection?.(dest); window.setAppMode?.('account'); } catch { /* ignore */ }
  } else {
    try { sessionStorage.setItem('pragoptics_return_to', dest === 'subscription' ? 'subscription' : dest); } catch { /* falls back to Profile */ }
    try { (window.openLoginModal || window.startPragOpticsLogin || (() => {}))('login'); } catch { /* ignore */ }
  }
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
    if (act === 'go') { go(b.dataset.to || '', b.dataset.query || '', b.dataset.card || '', b.dataset.row || ''); return; }
    if (act === 'family' || act === 'capability') { respond(act + ':' + (b.dataset.id || '')); return; }
    if (act === 'open-capability') { openCapability(b.dataset.id || ''); return; }
    if (act === 'supplier-action') { runSupplierAction(b, b.dataset.action || '', b.dataset.id || '', b.dataset.order || ''); return; }
    if (act === 'step') { respond('Show my setup'); return; }
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

function scrollLog() { try { el.log.scrollTop = el.log.scrollHeight; } catch { /* ignore */ } }

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

let platformAccess = null, platformGuide = null, replyGeneration = 0, conversationOwner = '';

async function accessPlatform() {
  if (!platformAccess) {
    const account = await import('../account/account.js');
    platformAccess = account.quarkPlatformAccess();
    platformGuide = createPlatformGuide({ apiBase: PRAG_API_BASE, context: platformAccess.context, request: platformAccess.request });
  }
  return { guide: platformGuide, context: platformAccess.context };
}

function resetConversationIfChanged() {
  let team = '';
  try { team = sessionStorage.getItem('pragoptics_team_id') || ''; } catch { /* own environment */ }
  const key = signedIn() ? JSON.stringify([ping()?.user?.userId || '', platformAccess?.context().tenant || team, platformAccess?.context().lane || 'live']) : '';
  if (key === conversationOwner) return;
  conversationOwner = key;
  replyGeneration++;
  if (el.log) el.log.replaceChildren();
  greeted = false;
}

async function respond(text) {
  if (!signedIn()) return;
  const generation = ++replyGeneration;
  const row = sayQuark('Reading the platform…');
  try {
    const { guide, context } = await accessPlatform();
    const key = scopeKey(context());
    const caps = await knowledge();
    let html;
    if (/\b(engine|engines|powershell|power shell|python|fnm|runtime|compute)\b/i.test(text) && !String(text).startsWith('capability:')) {
      html = enginesHtml();
    } else {
      html = await answerPlatform(text, { capabilities: caps, guide, context });
    }
    if (generation !== replyGeneration || !signedIn() || scopeKey(context()) !== key) { row.remove(); return; }
    row.querySelector('.quark-body').innerHTML = html;
    scrollLog();
  } catch (error) {
    if (generation !== replyGeneration || !signedIn()) { row.remove(); return; }
    row.querySelector('.quark-body').textContent = error?.code === 'SCOPE_CHANGED' ? error.message : (error?.message || 'I could not read the current platform state. No action was reported complete.');
  }
}

async function openCapability(id) {
  const { context } = await accessPlatform();
  const capability = (await knowledge() || []).find(c => c.id === id);
  const destination = capabilityDestination(capability, context());
  if (!destination) { sayQuark('That workflow is not available in the current account view.'); return; }
  go(destination.mode || destination.section, '', destination.card || '');
}

async function runSupplierAction(button, action, id, supplierOrderId) {
  if (button.disabled) return;
  button.disabled = true;
  const generation = ++replyGeneration;
  const row = sayQuark(action === 'sync' ? 'Syncing this supplier’s products…' : 'Checking the supplier…');
  try {
    const { guide, context } = await accessPlatform();
    const key = scopeKey(context());
    const result = await guide.supplierAction(action, id, supplierOrderId);
    if (generation !== replyGeneration || !signedIn() || scopeKey(context()) !== key) { row.remove(); return; }
    row.querySelector('.quark-body').innerHTML = supplierResult(action, result);
  } catch (error) {
    if (generation !== replyGeneration || !signedIn()) { row.remove(); return; }
    row.querySelector('.quark-body').textContent = error?.message || 'The supplier action was not confirmed. Check its status before trying again.';
  } finally { if (button.isConnected) button.disabled = false; scrollLog(); }
}

function enginesHtml() {
  return `The platform uses these engines: ${ENGINES.map(engine => `<div class="quark-cap"><b>${esc(engine.label)}</b><p>${esc(engine.what)}</p></div>`).join('')}<p>The core platform decides scope and authority. The engines execute their own bounded work.</p>`;
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
  el.chat.classList.add('quark-docked');
  el.chat.classList.remove('quark-in-drawer');
  if (el.chat.parentElement !== host) host.appendChild(el.chat);
  docked = true;
  el.char?.classList.add('quark-hidden');
  greetOnce();
  return true;
}

function undockToDrawer() {
  el.chat.classList.remove('quark-docked');
  el.chat.classList.add('quark-in-drawer');
  if (el.chat.parentElement !== el.drawer) el.drawer.appendChild(el.chat);
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
  // The corner character only shows off the Home tab, so opening always means the corner drawer. Make
  // sure the chat is actually in the drawer (never left docked), whatever the placement state was.
  if (el.chat.parentElement !== el.drawer) {
    el.chat.classList.remove('quark-docked');
    el.chat.classList.add('quark-in-drawer');
    el.drawer.appendChild(el.chat);
  }
  docked = false;
  el.drawer.hidden = false;
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  drawerOpen = true;
  el.char?.classList.add('quark-hidden');
  greetOnce();
  setTimeout(() => el.input?.focus(), 140);
}
function closeDrawer() {
  if (!drawerOpen) return;
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
  if (signedIn()) knowledge();   // no unauthenticated knowledge requests

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
