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
// The brain is deterministic today — the capability knowledge plus a built-in guided launch — so it
// works and cannot go wrong with no model wired in. `ask()` is the one place a model plugs in (see
// the note there); src/assistant/quark.instructions.md is its brief. No secrets live here.

import { PRAG_API_BASE } from '../runtime/config.js';

const KNOWLEDGE_URL = `${PRAG_API_BASE}/assistant/knowledge`;
const SETUP_URL = `${PRAG_API_BASE}/environment/setup`;
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

async function setupState() {
  if (!signedIn()) return null;
  try {
    const t = tokens()?.access_token;
    let url = SETUP_URL;
    try { const team = sessionStorage.getItem('pragoptics_team_id'); if (team) url += `?tenant=${encodeURIComponent(team)}`; } catch { /* own env */ }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return null;
    const d = await res.json();
    return (d && Array.isArray(d.groups)) ? d : null;
  } catch { return null; }
}

/* ----------------------------------------------------------------- the launch path (plain words) */

const LAUNCH = [
  { key: 'address', label: 'Claim your web address', why: 'Your site needs a name people can type. Pick one and I set it up.', cta: 'Find my address', to: 'environment' },
  { key: 'verify',  label: 'Prove the address is yours', why: 'A quick ownership check so your mail and your live site can use the name.', cta: 'Start the check', to: 'environment' },
  { key: 'build',   label: 'Build your pages', why: 'Describe your site or pick a starting point. This can run while the check finishes.', cta: 'Open the studio', to: 'studio' },
  { key: 'pay',     label: 'Turn on payments and email', why: 'Take card payments and send mail from your own address. I wire the plumbing; you connect your accounts.', cta: 'Set these up', to: 'environment' },
  { key: 'publish', label: 'Go live', why: 'Everything ready. One step puts your site on the web at your address.', cta: 'Publish', to: 'studio' },
  { key: 'found',   label: 'Help people find you', why: 'Add your site to search and turn on alerts for new orders and messages.', cta: 'Finish up', to: 'environment' },
];

/* ----------------------------------------------------------------- the platform's engines */

// The platform is built on engines (runtimes), not just website features. Quark names them so it is
// aware of the whole platform. fnm_demo keeps its name for now; the path drops "demo" later.
const ENGINES = [
  { label: 'The front end', what: 'the app and its API: accounts, environments, connections, billing and the operator desks.' },
  { label: 'The studio', what: 'the builder where a site or app is designed, built and published.' },
  { label: 'The PowerShell engine', what: 'runs PowerShell automation on the platform.' },
  { label: 'The Python engine', what: 'runs Python automation on the platform.' },
  { label: 'fnm_demo', what: 'the FNM engine, the foundation runtime. The name drops "demo" later.' },
];

/* ----------------------------------------------------------------- navigation (the machine parts) */

function go(dest) {
  const top = ['shop', 'software', 'warranty', 'builds', 'console'];
  closeDrawer();
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
    if (act === 'go') { go(b.dataset.to || ''); return; }
    if (act === 'step') { guideStep(Number(b.dataset.i) || 0); return; }
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

function think(render) {
  const row = sayQuark('<span class="quark-typing"><i></i><i></i><i></i></span>');
  setTimeout(() => { row.querySelector('.quark-body').innerHTML = render(); scrollLog(); }, 380);
}

function chips(list) {
  return `<div class="quark-chips">${list.map((c) => `<button type="button" class="quark-chip" data-quark="chip" data-text="${esc(c.text || c)}">${esc(c.label || c)}</button>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- the launch guide */

let launchStarted = false;
// Steps the person's account has ACTUALLY completed (from their setup state). Never the preview
// position: clicking "Next step" to read ahead must never mark a step done that isn't.
let doneSteps = 0;

function trackerHtml(cur) {
  return `<div class="quark-track">${LAUNCH.map((s, i) => {
    const state = i === cur ? 'now' : i < doneSteps ? 'done' : 'next';
    return `<span class="quark-trk is-${state}"><b>${i < doneSteps ? '&#10003;' : (i + 1)}</b>${esc(short(s.label))}</span>`;
  }).join('')}</div>`;
}
function short(label) {
  return label.replace(/^Claim your web address/, 'Address').replace(/^Prove the address is yours/, 'Verify').replace(/^Build your pages/, 'Build').replace(/^Turn on payments and email/, 'Pay + email').replace(/^Go live/, 'Publish').replace(/^Help people find you/, 'Be found');
}

function stepCardHtml(i) {
  const s = LAUNCH[i];
  const last = i >= LAUNCH.length - 1;
  return `
    ${trackerHtml(i)}
    <div class="quark-card">
      <div class="quark-card-k">Step ${i + 1} of ${LAUNCH.length}</div>
      <div class="quark-card-t">${esc(s.label)}</div>
      <div class="quark-card-b">${esc(s.why)}</div>
      <div class="quark-card-actions">
        <button type="button" class="quark-btn quark-primary" data-quark="go" data-to="${esc(s.to)}">${esc(s.cta)}</button>
        ${!last ? `<button type="button" class="quark-btn quark-ghost" data-quark="step" data-i="${i + 1}">Next step</button>` : ''}
      </div>
    </div>`;
}

function guideStep(i) {
  if (i >= LAUNCH.length) { sayQuark(`That is the whole path. When each one is done your site is live, and you can change anything just by asking me.`); return; }
  launchStarted = true;
  think(() => stepCardHtml(i));
}

async function startLaunch(thing) {
  launchStarted = true;
  const name = thing ? ` for ${esc(thing)}` : '';
  const st = await setupState();
  if (st) {
    const steps = (st.groups || []).flatMap((g) => g.steps || []);
    const next = steps.find((s) => s.state === 'next') || steps.find((s) => s.state === 'open');
    doneSteps = Math.max(0, Math.min(mapSetupToLaunch(next), LAUNCH.length - 1));
    think(() => `Here is the whole path, and I start you on the next thing that is actually yours.${stepCardHtml(doneSteps)}`);
    return;
  }
  doneSteps = 0;
  think(() => `Good${name}. Here is the whole path, start to finish. One thing at a time, in the right order, and I take you to each place.${stepCardHtml(0)}`);
}

function mapSetupToLaunch(step) {
  const id = String(step?.id || step?.link?.card || '').toLowerCase();
  if (/domain|address/.test(id)) return 0;
  if (/verif/.test(id)) return 1;
  if (/site|build|studio/.test(id)) return 2;
  if (/stripe|pay|mail|licens/.test(id)) return 3;
  if (/live|publish/.test(id)) return 4;
  return 0;
}

/* ----------------------------------------------------------------- the brain (deterministic today) */

// WHERE A MODEL PLUGS IN. When a platform assistant model is connected, this is the only change:
// POST { text, history } to a platform assistant endpoint with the instructions
// (src/assistant/quark.instructions.md) as the system prompt and the knowledge() list as grounding,
// and render the streamed reply through sayQuark(). Until then Quark answers from the knowledge and
// the guided launch below, so it is useful and correct with no model at all.
async function respond(text) {
  const t = text.toLowerCase();

  if (/\b(launch|website|web site|site|store|shop|sell|online|landing|page|get started|set up|setup|go live)\b/.test(t)) {
    const thing = text.replace(/.*\b(for|a|an)\b/i, '').trim();
    startLaunch(thing && thing.length < 40 ? thing : '');
    return;
  }
  if (/\b(engine|engines|powershell|power shell|python|fnm|runtime|compute|studio)\b/.test(t)) {
    think(() => enginesHtml());
    return;
  }
  if (/\b(what|which|everything|capab|can (you|this|it)|do here|features?)\b/.test(t)) {
    const caps = await knowledge();
    think(() => capabilitiesHtml(caps));
    return;
  }
  if (/\b(connect|hook up|integrat|shopify|stripe|shippo|twilio|github|microsoft|google|supplier|payment|mail|domain)\b/.test(t)) {
    const caps = await knowledge();
    think(() => howToHtml(caps, t));
    return;
  }
  if (/\b(hi|hey|hello|yo|sup)\b/.test(t) && t.length < 12) { think(() => greetingHtml()); return; }

  think(() => `I can take you the whole way to a live site, connect your tools like Shopify or Stripe, or explain anything on the platform. What do you want to do?${chips([{ label: 'Launch a website', text: 'I want to launch a website' }, { label: 'What can this do', text: 'What can this platform do' }, { label: 'Connect a tool', text: 'How do I connect a tool' }])}`);
}

function capabilitiesHtml(caps) {
  if (!caps || !caps.length) {
    return `In short: claim and verify a web address, build and publish a site in the studio, connect your own tools (Shopify, Stripe, Shippo, email and more), take payments, send mail from your address, publish your own API, and manage your team and data in one environment. It runs on its own engines: the front end, the studio, a PowerShell engine, a Python engine, and fnm_demo. Want me to launch you through it?${chips([{ label: 'Launch me through it', text: 'I want to launch a website' }])}`;
  }
  const fam = {};
  for (const c of caps) { const key = String(c.id || '').split('.')[0] || 'platform'; (fam[key] = fam[key] || []).push(c); }
  const titleOf = (k) => ({
    connections: 'Connect your own tools', 'domains-licensing': 'Web address, mail and licensing', 'auth-identity': 'Accounts and sign-in',
    'billing-commerce': 'Payments and billing', 'studio-projects': 'Build and publish', 'imports-data': 'Your data and imports',
    'shipping-ai-metering': 'Shipping, AI and usage', 'admin-desks': 'Operator desks', 'env-lifecycle': 'Your environment', assistant: 'This assistant',
  }[k] || k);
  const rows = Object.keys(fam).slice(0, 9).map((k) => {
    const items = fam[k].slice(0, 3).map((c) => `<li>${esc(plain(c.what))}</li>`).join('');
    return `<div class="quark-cap"><b>${esc(titleOf(k))}</b><ul>${items}</ul></div>`;
  }).join('');
  return `Read straight from the platform's own record of itself — ${caps.length} capabilities in all:${rows}<div class="quark-note">Tell me which one you want and I will take you there.</div>${chips([{ label: 'Launch a website', text: 'I want to launch a website' }, { label: 'Connect Shopify', text: 'How do I connect Shopify' }])}`;
}
function plain(what) { return String(what || '').replace(/\s+/g, ' ').trim(); }

function enginesHtml() {
  const rows = ENGINES.map((x) => `<div class="quark-cap"><b>${esc(x.label)}</b><ul><li>${esc(x.what)}</li></ul></div>`).join('');
  return `The platform runs on its own engines:${rows}<div class="quark-note">Tell me what you want to do and I take you to the right one.</div>`;
}

function howToHtml(caps, t) {
  const want = ['shopify', 'stripe', 'shippo', 'twilio', 'github', 'microsoft', 'google', 'domain', 'mail', 'payment'].find((w) => t.includes(w)) || 'shopify';
  let cap = null;
  if (caps && caps.length) cap = caps.find((c) => (String(c.id || '') + ' ' + String(c.what || '')).toLowerCase().includes(want));
  const steps = cap && Array.isArray(cap.how) && cap.how.length
    ? `<ol class="quark-steps">${cap.how.slice(0, 4).map((h) => `<li>${esc(plain(h))}</li>`).join('')}</ol>`
    : `<ol class="quark-steps"><li>Open your environment and its Connected accounts.</li><li>Pick ${esc(cap0(want))} and follow the one short flow.</li><li>Approve it on the provider, and it connects straight back.</li></ol>`;
  const note = cap?.doneState ? `<div class="quark-note">Done when: ${esc(plain(cap.doneState))}</div>` : '';
  return `Here is how to connect ${esc(cap0(want))}:${steps}${note}<div class="quark-card-actions"><button type="button" class="quark-btn quark-primary" data-quark="go" data-to="environment">Take me there</button></div>`;
}
function cap0(w) { return w.charAt(0).toUpperCase() + w.slice(1); }

function greetingHtml() {
  const who = firstName();
  const hi = who ? `Welcome back, ${esc(who)}.` : `Hi, I'm ${NAME}.`;
  const lead = signedIn()
    ? `Want me to pick up your launch where you left off, or take you somewhere specific?`
    : `Tell me what you want to launch and I take you there step by step. I handle the technical parts; you just make the calls.`;
  return `${hi} ${lead}${chips([{ label: 'Launch a website', text: 'I want to launch a website' }, { label: 'A store', text: 'I want to launch an online store' }, { label: 'What can this do', text: 'What can this platform do' }])}`;
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
  knowledge();   // warm the read; never blocks

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

  window.pragQuark = { open: openDrawer, ask: (t) => { sayYou(t); respond(t); } };
}

export default initQuark;
