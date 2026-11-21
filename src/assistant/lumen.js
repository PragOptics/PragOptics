// src/assistant/lumen.js
//
// LUMEN — the platform's front-end assistant (2026-11-21).
//
// What it is: one assistant the person just talks to. On the HOME page it is a chat, front and
// centre. On every other page it is an orb in the corner that opens the same chat. It knows the
// platform because it reads the platform's own self-description (GET v1/assistant/knowledge, the
// awareness endpoint), it holds the order a launch actually happens in, it does the machine parts
// (it navigates you to the exact place), and it tells you only the clicks that are yours.
//
// The goal is Shopify-grade ease on a platform that does far more: fewer decisions, plainer words,
// one next thing at a time, and never a step you cannot do yet or a wall you did not know was coming.
//
// The brain: today Lumen answers from the capability knowledge and a built-in guided launch flow —
// deterministic, so it works with no model wired in and nothing can go wrong. When a platform
// assistant model is connected, `ask()` is the one place it plugs in (see the note there); the UI,
// the knowledge, the navigation and the instructions (src/assistant/lumen.instructions.md) all stay.
//
// No secrets live here. Knowledge is public platform description; the session is read the same way
// the rest of the app reads it (sessionStorage), never written.

import { PRAG_API_BASE } from '../runtime/config.js';

const KNOWLEDGE_URL = `${PRAG_API_BASE}/assistant/knowledge`;
const SETUP_URL = `${PRAG_API_BASE}/environment/setup`;
const NAME = 'Lumen';

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

// The signed-in person's real place in setup, when the lane and session allow it.
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

// The order a human launch actually happens in. Each step: the outcome in plain words, one line of
// why, the button label, and where Lumen takes you. `to` is a destination go() understands.
const LAUNCH = [
  { key: 'address', label: 'Claim your web address', why: 'Your site needs a name people can type. Pick one and I set it up.', cta: 'Find my address', to: 'environment' },
  { key: 'verify',  label: 'Prove the address is yours', why: 'A quick ownership check so your mail and your live site can use the name.', cta: 'Start the check', to: 'environment' },
  { key: 'build',   label: 'Build your pages', why: 'Describe your site or pick a starting point. This can run while the check finishes.', cta: 'Open the studio', to: 'studio' },
  { key: 'pay',     label: 'Turn on payments and email', why: 'Take card payments and send mail from your own address. I wire the plumbing; you connect your accounts.', cta: 'Set these up', to: 'environment' },
  { key: 'publish', label: 'Go live', why: 'Everything ready. One step puts your site on the web at your address.', cta: 'Publish', to: 'studio' },
  { key: 'found',   label: 'Help people find you', why: 'Add your site to search and turn on alerts for new orders and messages.', cta: 'Finish up', to: 'environment' },
];

/* ----------------------------------------------------------------- navigation (the machine parts) */

function go(dest) {
  const top = ['shop', 'software', 'warranty', 'builds', 'console'];
  closeDrawer();
  if (dest === 'studio') { try { (window.pragOpenStudio || (() => {}))(); } catch { /* ignore */ } return; }
  if (top.includes(dest)) { try { window.setAppMode?.(dest); } catch { /* ignore */ } return; }
  // account sections: profile, subscription, environment, licensing, team, orders, builds
  if (signedIn()) {
    try { window.presetAccountSection?.(dest); window.setAppMode?.('account'); } catch { /* ignore */ }
  } else {
    try { sessionStorage.setItem('pragoptics_return_to', dest === 'subscription' ? 'subscription' : dest); } catch { /* falls back to Profile */ }
    try { (window.openLoginModal || window.startPragOpticsLogin || (() => {}))('login'); } catch { /* ignore */ }
  }
}

/* ----------------------------------------------------------------- DOM */

const el = {};           // orb, drawer, dock(home host), chat, log, input
let built = false;
let docked = false;      // chat currently inline on the home page
let drawerOpen = false;
let greeted = false;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function build() {
  if (built) return;
  built = true;

  // The orb: present on every page but the home page, bottom-right, opens the chat.
  const orb = document.createElement('button');
  orb.type = 'button';
  orb.id = 'lumenOrb';
  orb.className = 'lumen-orb';
  orb.setAttribute('aria-label', `Ask ${NAME}`);
  orb.innerHTML = `<span class="lumen-orb-core" aria-hidden="true"></span><span class="lumen-orb-ring" aria-hidden="true"></span>`;
  orb.addEventListener('click', () => toggleDrawer());
  document.body.appendChild(orb);
  el.orb = orb;

  // The chat itself — one element, re-parented between the home dock and the corner drawer.
  const chat = document.createElement('section');
  chat.id = 'lumenChat';
  chat.className = 'lumen-chat';
  chat.setAttribute('aria-label', `${NAME}, the PragOptics assistant`);
  chat.innerHTML = `
    <header class="lumen-head">
      <span class="lumen-id"><span class="lumen-mark" aria-hidden="true"></span><span class="lumen-name">${NAME}</span><span class="lumen-sub">your guide to the platform</span></span>
      <button type="button" class="lumen-close" aria-label="Close ${NAME}" data-lumen="close">&times;</button>
    </header>
    <div class="lumen-log" id="lumenLog" role="log" aria-live="polite"></div>
    <form class="lumen-ask" id="lumenForm" autocomplete="off">
      <input class="lumen-input" id="lumenInput" type="text" placeholder="Tell me what you want to do" aria-label="Ask ${NAME}">
      <button class="lumen-send" type="submit" aria-label="Send"><span aria-hidden="true">&#8593;</span></button>
    </form>`;
  el.chat = chat;
  el.log = chat.querySelector('#lumenLog');
  el.input = chat.querySelector('#lumenInput');

  chat.querySelector('#lumenForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (el.input.value || '').trim();
    if (!v) return;
    el.input.value = '';
    sayYou(v);
    respond(v);
  });
  chat.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lumen]');
    if (!b) return;
    const act = b.dataset.lumen;
    if (act === 'close') { closeDrawer(); return; }
    if (act === 'chip') { const t = b.dataset.text || b.textContent; sayYou(t); respond(t); return; }
    if (act === 'go') { go(b.dataset.to || ''); return; }
    if (act === 'step') { guideStep(Number(b.dataset.i) || 0); return; }
  });

  // A hidden corner drawer that the chat lives in when it is not docked on the home page.
  const drawer = document.createElement('div');
  drawer.id = 'lumenDrawer';
  drawer.className = 'lumen-drawer';
  drawer.hidden = true;
  document.body.appendChild(drawer);
  el.drawer = drawer;

  // Keyboard: Escape closes the drawer.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen) closeDrawer(); });
}

/* ----------------------------------------------------------------- rendering messages */

function scrollLog() { try { el.log.scrollTop = el.log.scrollHeight; } catch { /* ignore */ } }

function bubble(role, html) {
  const row = document.createElement('div');
  row.className = `lumen-msg lumen-${role}`;
  row.innerHTML = role === 'lumen'
    ? `<span class="lumen-avatar" aria-hidden="true"></span><div class="lumen-body">${html}</div>`
    : `<div class="lumen-body">${html}</div>`;
  el.log.appendChild(row);
  scrollLog();
  return row;
}
function sayYou(text) { bubble('you', esc(text)); }
function sayLumen(html) { return bubble('lumen', html); }

// A short "thinking" beat, then the real reply — so it reads like someone answering, not a form.
function think(render) {
  const row = sayLumen('<span class="lumen-typing"><i></i><i></i><i></i></span>');
  setTimeout(() => { row.querySelector('.lumen-body').innerHTML = render(); scrollLog(); }, 380);
}

function chips(list) {
  return `<div class="lumen-chips">${list.map((c) => `<button type="button" class="lumen-chip" data-lumen="chip" data-text="${esc(c.text || c)}">${esc(c.label || c)}</button>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- the launch guide (rich cards) */

let launchStarted = false;
// Steps the person's account has ACTUALLY completed (from their setup state). Never the preview
// position: clicking "Next step" to read ahead must never mark a step done that isn't.
let doneSteps = 0;

function trackerHtml(cur) {
  return `<div class="lumen-track">${LAUNCH.map((s, i) => {
    const state = i === cur ? 'now' : i < doneSteps ? 'done' : 'next';
    return `<span class="lumen-trk is-${state}"><b>${i < doneSteps ? '&#10003;' : (i + 1)}</b>${esc(short(s.label))}</span>`;
  }).join('')}</div>`;
}
function short(label) {
  return label.replace(/^Claim your /, '').replace(/^Prove the address is yours/, 'Verify').replace(/^Build your /, 'Build ').replace(/^Turn on /, 'Pay + email').replace(/^Go live/, 'Publish').replace(/^Help people find you/, 'Be found').replace(/^web address/, 'Address').replace(/^pages/, 'Build');
}

function stepCardHtml(i) {
  const s = LAUNCH[i];
  const last = i >= LAUNCH.length - 1;
  return `
    ${trackerHtml(i)}
    <div class="lumen-card">
      <div class="lumen-card-k">Step ${i + 1} of ${LAUNCH.length}</div>
      <div class="lumen-card-t">${esc(s.label)}</div>
      <div class="lumen-card-b">${esc(s.why)}</div>
      <div class="lumen-card-actions">
        <button type="button" class="lumen-btn lumen-primary" data-lumen="go" data-to="${esc(s.to)}">${esc(s.cta)}</button>
        ${!last ? `<button type="button" class="lumen-btn lumen-ghost" data-lumen="step" data-i="${i + 1}">Next step</button>` : ''}
      </div>
    </div>`;
}

function guideStep(i) {
  if (i >= LAUNCH.length) { sayLumen(`That is the whole path. When each one is done your site is live, and you can change anything just by asking me.`); return; }
  launchStarted = true;
  think(() => stepCardHtml(i));
}

async function startLaunch(thing) {
  launchStarted = true;
  const name = thing ? ` for ${esc(thing)}` : '';
  // If signed in, meet them where they actually are.
  const st = await setupState();
  if (st) {
    const steps = (st.groups || []).flatMap((g) => g.steps || []);
    const next = steps.find((s) => s.state === 'next') || steps.find((s) => s.state === 'open');
    // Everything before the next thing that is actually theirs to do is done; that step is "now".
    doneSteps = Math.max(0, Math.min(mapSetupToLaunch(next), LAUNCH.length - 1));
    think(() => `Here is the whole path, and I start you on the next thing that is actually yours.${stepCardHtml(doneSteps)}`);
    return;
  }
  doneSteps = 0;
  think(() => `Good${name}. Here is the whole path, start to finish. One thing at a time, in the right order, and I take you to each place.${stepCardHtml(0)}`);
}

// Best-effort map from the server's setup step id to our plain launch index, so a signed-in person
// lands on the right card. Falls back to the start.
function mapSetupToLaunch(step) {
  const id = String(step?.id || step?.link?.card || '').toLowerCase();
  if (/domain|address/.test(id)) return 0;
  if (/verif/.test(id)) return 1;
  if (/site|build|studio|publish/.test(id)) return 2;
  if (/stripe|pay|mail|licens/.test(id)) return 3;
  if (/live|publish/.test(id)) return 4;
  return 0;
}

/* ----------------------------------------------------------------- the brain (deterministic today) */

// WHERE A MODEL PLUGS IN. When a platform assistant model is connected, this is the only change:
// POST { text, history } to a platform assistant endpoint with the instructions
// (src/assistant/lumen.instructions.md) as the system prompt and the knowledge() list as grounding,
// and render the streamed reply through sayLumen(). Until then Lumen answers from the knowledge and
// the guided launch flow below, so it is useful and correct with no model at all.
async function respond(text) {
  const t = text.toLowerCase();

  // Launch intent — the thing most people are here for.
  if (/\b(launch|website|web site|site|store|shop|sell|online|landing|page|get started|set up|setup|go live)\b/.test(t)) {
    const thing = text.replace(/.*\b(for|a|an)\b/i, '').trim();
    startLaunch(thing && thing.length < 40 ? thing : '');
    return;
  }

  // "What can it do" — read the platform's own description back in plain words.
  if (/\b(what|which|everything|capab|can (you|this|it)|do here|features?)\b/.test(t)) {
    const caps = await knowledge();
    think(() => capabilitiesHtml(caps));
    return;
  }

  // "How do I connect / set up X" — look the capability up in the knowledge, give the plain steps.
  if (/\b(connect|hook up|integrat|shopify|stripe|shippo|twilio|github|microsoft|google|supplier|payment|mail|domain)\b/.test(t)) {
    const caps = await knowledge();
    think(() => howToHtml(caps, t));
    return;
  }

  if (/\b(hi|hey|hello|yo|sup)\b/.test(t) && t.length < 12) { think(() => greetingHtml()); return; }

  // Fallback: offer the real doors.
  think(() => `I can take you the whole way to a live site, connect your tools like Shopify or Stripe, or explain anything on the platform. What do you want to do?${chips([{ label: 'Launch a website', text: 'I want to launch a website' }, { label: 'What can this do', text: 'What can this platform do' }, { label: 'Connect a tool', text: 'How do I connect a tool' }])}`);
}

function capabilitiesHtml(caps) {
  if (!caps || !caps.length) {
    return `Here is what the platform does, in short: claim and verify a web address, build and publish a site in the studio, connect your own tools (Shopify, Stripe, Shippo, email and more), take payments, send mail from your address, publish your own API, and manage your team and data in one environment. Want me to launch you through it?${chips([{ label: 'Launch me through it', text: 'I want to launch a website' }])}`;
  }
  // Group by the family in the capability id (connections.*, domains-licensing.*, ...).
  const fam = {};
  for (const c of caps) {
    const key = String(c.id || '').split('.')[0] || 'platform';
    (fam[key] = fam[key] || []).push(c);
  }
  const titleOf = (k) => ({
    connections: 'Connect your own tools', 'domains-licensing': 'Web address, mail and licensing', 'auth-identity': 'Accounts and sign-in',
    'billing-commerce': 'Payments and billing', 'studio-projects': 'Build and publish', 'imports-data': 'Your data and imports',
    'shipping-ai-metering': 'Shipping, AI and usage', 'admin-desks': 'Operator desks', 'env-lifecycle': 'Your environment', assistant: 'This assistant',
  }[k] || k);
  const rows = Object.keys(fam).slice(0, 9).map((k) => {
    const items = fam[k].slice(0, 3).map((c) => `<li>${esc(plain(c.what))}</li>`).join('');
    return `<div class="lumen-cap"><b>${esc(titleOf(k))}</b><ul>${items}</ul></div>`;
  }).join('');
  return `Here is what the platform can do, read straight from its own record of itself — ${caps.length} capabilities in all:${rows}<div class="lumen-note">Tell me which one you want and I will take you there.</div>${chips([{ label: 'Launch a website', text: 'I want to launch a website' }, { label: 'Connect Shopify', text: 'How do I connect Shopify' }])}`;
}
function plain(what) { return String(what || '').replace(/\s+/g, ' ').trim(); }

function howToHtml(caps, t) {
  const want = ['shopify', 'stripe', 'shippo', 'twilio', 'github', 'microsoft', 'google', 'domain', 'mail', 'payment'].find((w) => t.includes(w)) || 'shopify';
  let cap = null;
  if (caps && caps.length) cap = caps.find((c) => (String(c.id || '') + ' ' + String(c.what || '')).toLowerCase().includes(want));
  const dest = /domain|mail|address/.test(want) ? 'environment' : /payment|stripe|shippo|twilio|github|microsoft|google|shopify/.test(want) ? 'environment' : 'environment';
  const steps = cap && Array.isArray(cap.how) && cap.how.length
    ? `<ol class="lumen-steps">${cap.how.slice(0, 4).map((h) => `<li>${esc(plain(h))}</li>`).join('')}</ol>`
    : `<ol class="lumen-steps"><li>Open your environment and its Connected accounts.</li><li>Pick ${esc(cap0(want))} and follow the one short flow.</li><li>Approve it on the provider, and it connects straight back.</li></ol>`;
  const note = cap?.doneState ? `<div class="lumen-note">Done when: ${esc(plain(cap.doneState))}</div>` : '';
  return `Here is how to connect ${esc(cap0(want))}:${steps}${note}I can take you right to it.${`<div class="lumen-card-actions"><button type="button" class="lumen-btn lumen-primary" data-lumen="go" data-to="${esc(dest)}">Take me there</button></div>`}`;
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
  sayLumen(greetingHtml());
}

/* ----------------------------------------------------------------- docking + drawer + modes */

function dockHome() {
  const host = document.getElementById('lumenHome');
  if (!host) return false;
  el.chat.classList.add('lumen-docked');
  el.chat.classList.remove('lumen-in-drawer');
  if (el.chat.parentElement !== host) host.appendChild(el.chat);
  docked = true;
  el.orb?.classList.add('lumen-hidden');
  greetOnce();
  return true;
}

function ensureHomeHost() {
  // The home page is the landing view. Put a host at the very top of it so the chat is the first
  // thing on the page. Built once; re-dock if the landing view was re-rendered.
  const landing = document.getElementById('landingView');
  if (!landing) return false;
  let host = document.getElementById('lumenHome');
  if (!host) {
    host = document.createElement('div');
    host.id = 'lumenHome';
    host.className = 'lumen-home';
    landing.insertBefore(host, landing.firstChild);
  }
  return true;
}

function undockToDrawer() {
  el.chat.classList.remove('lumen-docked');
  el.chat.classList.add('lumen-in-drawer');
  if (el.chat.parentElement !== el.drawer) el.drawer.appendChild(el.chat);
  docked = false;
  el.orb?.classList.remove('lumen-hidden');
}

function openDrawer() {
  if (docked) return;
  el.drawer.hidden = false;
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  drawerOpen = true;
  el.orb?.classList.add('is-open');
  greetOnce();
  setTimeout(() => el.input?.focus(), 120);
}
function closeDrawer() {
  if (!drawerOpen) return;
  el.drawer.classList.remove('is-open');
  drawerOpen = false;
  el.orb?.classList.remove('is-open');
  setTimeout(() => { if (!drawerOpen) el.drawer.hidden = true; }, 220);
}
function toggleDrawer() { drawerOpen ? closeDrawer() : openDrawer(); }

// Called on every app mode change. Home → docked chat, no orb. Elsewhere → orb, chat in the drawer.
function onMode(mode) {
  if (mode === 'landing') {
    if (ensureHomeHost()) dockHome();
  } else {
    if (docked || el.chat.parentElement !== el.drawer) undockToDrawer();
    if (drawerOpen) closeDrawer();
  }
}

/* ----------------------------------------------------------------- init */

export function initLumen() {
  if (built) return;
  build();

  // Warm the knowledge read so the first "what can this do" is instant; never blocks boot.
  knowledge();

  // Chain onto the app's mode hook without clobbering it.
  const prev = (typeof window.onEnterMode === 'function') ? window.onEnterMode : null;
  window.onEnterMode = (m) => {
    try { prev && prev(m); } catch { /* isolate the app's own hook */ }
    try { onMode(m); } catch { /* isolate Lumen */ }
  };

  // The app sets landing at boot before this hook is attached, so place Lumen for the current view now.
  const current = !document.getElementById('landingView')?.classList.contains('hidden') ? 'landing' : 'other';
  onMode(current === 'landing' ? 'landing' : 'account');

  window.pragLumen = { open: openDrawer, ask: (t) => { sayYou(t); respond(t); } };
}

export default initLumen;
