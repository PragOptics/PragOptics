// src/assistant/lumen.js
//
// LUMEN — the platform's front-end assistant (2026-11-21).
//
// What it is: one assistant the person just talks to. On a HOME surface it is a chat, front and
// centre (the site landing, and the account's own Home section). On every other surface it is a
// living orb in the corner that opens the same chat. The orb is a small galaxy: a nebula core with
// tilted orbit rings and points of light going round it, on-theme with the site's starfield and
// helix. When the chat opens the orb steps aside, so the two never sit misaligned at any size.
//
// It knows the platform because it reads the platform's own self-description
// (GET v1/assistant/knowledge, the awareness endpoint), it holds the order a launch actually
// happens in, it does the machine parts (it navigates you to the exact place), and it hands you only
// the clicks that are yours.
//
// The brain is deterministic today — the capability knowledge plus a built-in guided launch — so it
// works and cannot go wrong with no model wired in. `ask()` is the one place a model plugs in (see
// the note there); src/assistant/lumen.instructions.md is its brief. No secrets live here.

import { PRAG_API_BASE } from '../runtime/config.js';
import { mountDnaSwirl } from '../components/dna_swirl.js';

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

/* ----------------------------------------------------------------- Lumen's mark = the brand engine */

// Lumen wears PragOptics' own living mark instead of an invented orb: the DNA-swirl engine
// (src/components/dna_swirl.js) that builds the helix and settles into the logo with a heartbeat. A
// compact instance is the corner presence; the chat header and the message avatars use the logo.

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

  const orb = document.createElement('button');
  orb.type = 'button';
  orb.id = 'lumenOrb';
  orb.className = 'lumen-orb';
  orb.setAttribute('aria-label', `Ask ${NAME}`);
  orb.title = `Ask ${NAME}`;
  const orbMark = document.createElement('div');
  orbMark.className = 'lumen-mark-host';
  orb.appendChild(orbMark);
  orb.addEventListener('click', () => toggleDrawer());
  document.body.appendChild(orb);
  el.orb = orb;
  // Lumen's living presence is the platform's own DNA-swirl mark.
  try { mountDnaSwirl(orbMark, { height: 52 }); } catch { /* CSS keeps a static logo fallback */ }

  const chat = document.createElement('section');
  chat.id = 'lumenChat';
  chat.className = 'lumen-chat';
  chat.setAttribute('aria-label', `${NAME}, the PragOptics assistant`);
  chat.innerHTML = `
    <header class="lumen-head">
      <span class="lumen-mark" aria-hidden="true"></span>
      <span class="lumen-id"><span class="lumen-name">${NAME}</span><span class="lumen-sub">your guide to the platform</span></span>
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

  const drawer = document.createElement('div');
  drawer.id = 'lumenDrawer';
  drawer.className = 'lumen-drawer';
  drawer.hidden = true;
  document.body.appendChild(drawer);
  el.drawer = drawer;

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

function think(render) {
  const row = sayLumen('<span class="lumen-typing"><i></i><i></i><i></i></span>');
  setTimeout(() => { row.querySelector('.lumen-body').innerHTML = render(); scrollLog(); }, 380);
}

function chips(list) {
  return `<div class="lumen-chips">${list.map((c) => `<button type="button" class="lumen-chip" data-lumen="chip" data-text="${esc(c.text || c)}">${esc(c.label || c)}</button>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- the launch guide */

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
  return label.replace(/^Claim your web address/, 'Address').replace(/^Prove the address is yours/, 'Verify').replace(/^Build your pages/, 'Build').replace(/^Turn on payments and email/, 'Pay + email').replace(/^Go live/, 'Publish').replace(/^Help people find you/, 'Be found');
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
// (src/assistant/lumen.instructions.md) as the system prompt and the knowledge() list as grounding,
// and render the streamed reply through sayLumen(). Until then Lumen answers from the knowledge and
// the guided launch below, so it is useful and correct with no model at all.
async function respond(text) {
  const t = text.toLowerCase();

  if (/\b(launch|website|web site|site|store|shop|sell|online|landing|page|get started|set up|setup|go live)\b/.test(t)) {
    const thing = text.replace(/.*\b(for|a|an)\b/i, '').trim();
    startLaunch(thing && thing.length < 40 ? thing : '');
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
    return `In short: claim and verify a web address, build and publish a site in the studio, connect your own tools (Shopify, Stripe, Shippo, email and more), take payments, send mail from your address, publish your own API, and manage your team and data in one environment. Want me to launch you through it?${chips([{ label: 'Launch me through it', text: 'I want to launch a website' }])}`;
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
    return `<div class="lumen-cap"><b>${esc(titleOf(k))}</b><ul>${items}</ul></div>`;
  }).join('');
  return `Read straight from the platform's own record of itself — ${caps.length} capabilities in all:${rows}<div class="lumen-note">Tell me which one you want and I will take you there.</div>${chips([{ label: 'Launch a website', text: 'I want to launch a website' }, { label: 'Connect Shopify', text: 'How do I connect Shopify' }])}`;
}
function plain(what) { return String(what || '').replace(/\s+/g, ' ').trim(); }

function howToHtml(caps, t) {
  const want = ['shopify', 'stripe', 'shippo', 'twilio', 'github', 'microsoft', 'google', 'domain', 'mail', 'payment'].find((w) => t.includes(w)) || 'shopify';
  let cap = null;
  if (caps && caps.length) cap = caps.find((c) => (String(c.id || '') + ' ' + String(c.what || '')).toLowerCase().includes(want));
  const steps = cap && Array.isArray(cap.how) && cap.how.length
    ? `<ol class="lumen-steps">${cap.how.slice(0, 4).map((h) => `<li>${esc(plain(h))}</li>`).join('')}</ol>`
    : `<ol class="lumen-steps"><li>Open your environment and its Connected accounts.</li><li>Pick ${esc(cap0(want))} and follow the one short flow.</li><li>Approve it on the provider, and it connects straight back.</li></ol>`;
  const note = cap?.doneState ? `<div class="lumen-note">Done when: ${esc(plain(cap.doneState))}</div>` : '';
  return `Here is how to connect ${esc(cap0(want))}:${steps}${note}<div class="lumen-card-actions"><button type="button" class="lumen-btn lumen-primary" data-lumen="go" data-to="environment">Take me there</button></div>`;
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

/* ----------------------------------------------------------------- placement: home vs orb */

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
  const v = visibleView();
  if (v === 'landing') return true;
  if (v === 'account' && sectionIsHome()) return true;
  return false;
}

// The element to dock the chat into on the current home surface, created/placed as needed.
function homeHost() {
  if (visibleView() === 'landing') {
    const landing = document.getElementById('landingView');
    if (!landing) return null;
    let h = document.getElementById('lumenHome');
    if (!h || h.dataset.home !== 'landing') {
      if (h && h.parentElement) h.parentElement.removeChild(h);
      h = document.createElement('div'); h.id = 'lumenHome'; h.className = 'lumen-home'; h.dataset.home = 'landing';
      landing.insertBefore(h, landing.firstChild);
    }
    return h;
  }
  // account Home: a host directly above the section content (#acctMain), inside the stable panel main.
  const am = document.getElementById('acctMain');
  if (!am || !am.parentElement) return null;
  let h = document.getElementById('lumenHome');
  if (!h || h.dataset.home !== 'acct') {
    if (h && h.parentElement) h.parentElement.removeChild(h);
    h = document.createElement('div'); h.id = 'lumenHome'; h.className = 'lumen-home lumen-home-acct'; h.dataset.home = 'acct';
  }
  if (h.parentElement !== am.parentElement || h.nextElementSibling !== am) am.parentElement.insertBefore(h, am);
  return h;
}

function dockHome() {
  const host = homeHost();
  if (!host) return false;
  el.chat.classList.add('lumen-docked');
  el.chat.classList.remove('lumen-in-drawer');
  if (el.chat.parentElement !== host) host.appendChild(el.chat);
  docked = true;
  el.orb?.classList.add('lumen-hidden');
  greetOnce();
  return true;
}

function undockToDrawer() {
  el.chat.classList.remove('lumen-docked');
  el.chat.classList.add('lumen-in-drawer');
  if (el.chat.parentElement !== el.drawer) el.drawer.appendChild(el.chat);
  docked = false;
  const h = document.getElementById('lumenHome');
  if (h && h.parentElement && el.chat.parentElement !== h) h.parentElement.removeChild(h);
}

let homeRetry = 0;
function placeLumen() {
  if (!built) return;
  if (isHomeSurface()) {
    if (dockHome()) { homeRetry = 0; return; }
    if (homeRetry++ < 20) setTimeout(placeLumen, 150);   // the account Home content may still be rendering
    return;
  }
  homeRetry = 0;
  if (docked || el.chat.parentElement !== el.drawer) undockToDrawer();
  if (drawerOpen) closeDrawer();
  else el.orb?.classList.remove('lumen-hidden');
}

/* ----------------------------------------------------------------- drawer */

function openDrawer() {
  if (docked) return;
  el.drawer.hidden = false;
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  drawerOpen = true;
  el.orb?.classList.add('lumen-hidden');
  greetOnce();
  setTimeout(() => el.input?.focus(), 140);
}
function closeDrawer() {
  if (!drawerOpen) return;
  el.drawer.classList.remove('is-open');
  drawerOpen = false;
  setTimeout(() => { if (!drawerOpen) el.drawer.hidden = true; }, 240);
  if (!isHomeSurface()) el.orb?.classList.remove('lumen-hidden');
}
function toggleDrawer() { drawerOpen ? closeDrawer() : openDrawer(); }

/* ----------------------------------------------------------------- init */

export function initLumen() {
  if (built) return;
  build();
  knowledge();   // warm the read; never blocks

  // Place now and again once the view/section has settled (boot fires several mode changes in a row,
  // and the account section content renders a beat later).
  const replace = () => { try { placeLumen(); } catch { /* isolate */ } setTimeout(() => { try { placeLumen(); } catch { /* isolate */ } }, 180); };
  const prev = (typeof window.onEnterMode === 'function') ? window.onEnterMode : null;
  window.onEnterMode = (m) => {
    try { prev && prev(m); } catch { /* isolate the app's own hook */ }
    replace();
  };
  // Account section changes rewrite the hash (#account?section=home); re-place on those too.
  window.addEventListener('hashchange', replace);
  replace();

  window.pragLumen = { open: openDrawer, ask: (t) => { sayYou(t); respond(t); } };
}

export default initLumen;
