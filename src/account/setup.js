// src/account/setup.js
//
// SETTING UP (2026-09-28): the account's setup checklist at the top of every customer section of the panel. One read,
// GET v1/environment/setup, answers every step of setting the account up, in order (profile, billing, environment,
// team, site, connections, licensing), each with its state and a sentence: what it is when done, what it waits on,
// which plan it needs. Folded, the block is one line: a ring of done over total, the count, and the next step as a
// link that opens its section and card; the chevron opens the whole list as a vertical stepper, group by group. Whether
// it is open is remembered per person (localStorage). Once every step is done the line reads "Your account is set up"
// and offers nothing to open.
//
// The answer is kept for thirty seconds, so moving between sections does not read it again; a lane without the route
// (404), or a read that fails, shows nothing at all (that answer is kept the same thirty seconds).
//
//   GET v1/environment/setup -> { ok, environmentId, done, total, next: { id, title, link } | null,
//                                 groups: [{ id, title, steps: [{ id, title, state, why, optional, needs, link }] }] }
//   state: done | next | open | waiting | off
//   link: { section, card }: a panel section and a card name; account.js CARD_IDS maps the name to the card
//
// account.js mounts it (showSection) after a section's first paint; every section writes only inside its own hosts
// after that, so the block stays. A step's link is a button carrying data-acct-section and data-acct-card: the panel's
// one click handler (account.js) opens the section and then the card.

import { PRAG_API_BASE } from '../runtime/config.js';
import { ico } from './cards.js';

const SETUP_URL = `${PRAG_API_BASE}/environment/setup`;
const FRESH_MS = 30000;
const OPEN_KEY = 'pragoptics_setup_open';
const TEAM_KEY = 'pragoptics_team_id';
const ID = 'acctSetup';
const STATES = new Set(['done', 'next', 'open', 'waiting', 'off']);
// the state in words for a screen reader (the dot says it to the eye)
// "Not on this plan" was wrong for a step the lane gates rather than the plan (setupSteps.js site.publish), and it read
// as never to a free account whose fifteen off steps all say they come with a paid plan (Cameron, 2026-10-02)
const STATE_WORDS = { done: 'Done', next: 'Next', open: 'Can be done now', waiting: 'Waiting', off: 'Not available yet' };
// the sections a step may open; the billing group's steps say "billing", which the panel calls subscription
const SECTIONS = new Set(['profile', 'products', 'subscription', 'team', 'environment', 'licensing', 'orders', 'builds']);
const SECTION_ALIAS = { billing: 'subscription' };

let D = null;   // the panel's deps: apiFetch, escapeHtml, cachedPing, friendlyError
// the last answer (null after a failed read), when it landed and for whom, the read that is out, and the render in view
const su = { data: null, at: 0, key: '', read: null, seq: 0 };
const stale = { timer: 0 };   // several writes in a row coalesce into one read

function userId() { try { return String(D.cachedPing?.()?.user?.userId || ''); } catch { return ''; } }
function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
/** The read's address: the team in view is named, as the Environment and Licensing reads name it. */
function readUrl() {
  const t = teamId();
  return t ? `${SETUP_URL}?tenant=${encodeURIComponent(t)}` : SETUP_URL;
}

/* ---------- open or folded, remembered per person ---------- */

function openKey(uid) { return `${OPEN_KEY}:${uid}`; }
function isOpen(uid) { try { return localStorage.getItem(openKey(uid)) === '1'; } catch { return false; } }
function setOpen(uid, on) { try { localStorage.setItem(openKey(uid), on ? '1' : '0'); } catch { /* the fold is not remembered; the page still works */ } }

/* ---------- the read, once per thirty seconds ---------- */

/** The setup as last read for this person and team, read again after thirty seconds; null when the lane has no answer. */
function readSetup(key) {
  if (su.key === key && su.read) return su.read;
  if (su.key === key && Date.now() - su.at < FRESH_MS) return Promise.resolve(su.data);
  su.key = key;
  const read = (async () => {
    let data = null;
    try {
      const d = await D.apiFetch(readUrl());
      data = d && d.ok !== false && Array.isArray(d.groups) ? d : null;
    } catch { data = null; }   // 404 (the lane has no route yet), a lost connection, a session that ended: nothing is shown
    if (su.key === key) { su.data = data; su.at = Date.now(); su.read = null; }
    return data;
  })();
  su.read = read;
  return read;
}

/**
 * A WRITE SOMEWHERE ELSE JUST FINISHED A STEP (2026-10-02). Keeping the answer thirty seconds is right for moving
 * between sections and wrong the moment a card saves: Cameron saved his name on the first step and the list went on
 * reading "Next: Your name", because nothing ever told it the answer was stale. account.js calls this after every
 * successful write, so one hook covers every card that can finish a step (your name, your mobile, billing, a
 * connection, a licensing step) instead of a call added to each save.
 */
export function markSetupStale() {
  su.key = ''; su.at = 0; su.data = null; su.read = null;
  if (stale.timer || !D) return;
  stale.timer = setTimeout(() => {
    stale.timer = 0;
    const host = document.getElementById(ID);
    const main = host?.isConnected ? host.parentElement : null;
    if (main) renderSetup(main, D);
  }, 250);
}

/* ---------- the block ---------- */

/** The section a step's link opens, or '' when the link names none the panel has. */
function sectionOf(link) {
  const s = String(link?.section || '');
  const id = SECTION_ALIAS[s] || s;
  return SECTIONS.has(id) ? id : '';
}
/** A step's title as a link into its section and card; plain words when it links nowhere. */
function linkHtml(step) {
  const e = D.escapeHtml, title = e(step?.title || '');
  const section = sectionOf(step?.link);
  if (!section) return `<span class="su-step-title">${title}</span>`;
  const card = String(step?.link?.card || '');
  return `<button class="su-link su-step-title" type="button" data-acct-section="${e(section)}" ${card ? `data-acct-card="${e(card)}"` : ''}>${title}</button>`;
}

function ringHtml(done, total, complete) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<span class="su-ring ${complete ? 'is-done' : ''}" aria-hidden="true"><svg viewBox="0 0 36 36" focusable="false"><circle class="su-ring-track" cx="18" cy="18" r="15"/><circle class="su-ring-fill" cx="18" cy="18" r="15" pathLength="100" style="stroke-dashoffset:${100 - pct}"/></svg>${complete ? ico('check', 11) : ''}</span>`;
}

/**
 * Required and optional counted APART (2026-10-02, Cameron: "we should not put the optional in the count, however we
 * should account for them"). One ring of 21 was the first thing a new account saw, and most of that 21 was work nobody
 * has to do. A step the plan does not offer (state "off") belongs to neither side: it is not something to finish. Each
 * side carries its own next step, taken from the steps themselves rather than the server's single `next`, which only
 * ever named one of the two.
 */
function tally(d) {
  const steps = (d.groups || []).flatMap(g => (Array.isArray(g?.steps) ? g.steps : []));
  const live = steps.filter(s => String(s?.state || '') !== 'off');
  const shut = steps.filter(s => String(s?.state || '') === 'off');
  const side = (list, locked) => ({
    total: list.length,
    done: list.filter(s => String(s?.state || '') === 'done').length,
    next: list.find(s => String(s?.state || '') === 'next') || list.find(s => String(s?.state || '') === 'open') || null,
    locked: locked.length
  });
  return {
    required: side(live.filter(s => !s?.optional), shut.filter(s => !s?.optional)),
    optional: side(live.filter(s => !!s?.optional), shut.filter(s => !!s?.optional)),
    // ACCOUNTED FOR ON ITS OWN SIDE, NEVER COUNTED (2026-10-02, Cameron: "we have more steps than what the counts
    // say", then "that's because it's not obvious"). The stepper rendered twenty-one rows while the rings counted six.
    // A step the plan does not offer stays out of the rings, because it is not work anyone can finish, and the
    // arithmetic matches the server, which counts `state !== "off"` too (setupSteps.js). What was missing was telling
    // anyone, so each side now carries its OWN locked count: a free account gains five required steps and ten
    // optional ones on subscribing, and a single footnote of fifteen hid which ring they landed on. Without that the
    // denominator appears to jump backwards the moment someone makes progress.
    off: steps.length - live.length,
    // WHY they are off decides the sentence. Most are gated on `!paid` in setupSteps.js, but site.publish is gated on
    // the lane instead, so the copy is driven by whether the plan step is still outstanding rather than assumed.
    planWaits: (() => { const p = steps.find(s => String(s?.id || '') === 'billing.plan'); return !!p && String(p.state || '') !== 'done'; })(),
    counted: steps.length > 0
  };
}

/** One category: its ring, its name, its own count and its own next step. */
function catHtml(title, c, planWaits) {
  const e = D.escapeHtml;
  const complete = c.total > 0 && c.done >= c.total;
  const next = c.next && (c.next.title || c.next.id)
    ? `Next: ${linkHtml(c.next)}`
    : (complete ? 'All done' : 'Nothing waits on you');
  // the locked steps on THIS side, said next to this side's own count, so the denominator growing later is expected
  const n = Number(c.locked) || 0;
  const more = n > 0
    ? `<span class="su-more">${e(planWaits ? `${n} more with a plan` : `${n} more not on your plan`)}</span>`
    : '';
  return `<div class="su-cat ${complete ? 'is-done' : ''}">
      ${ringHtml(c.done, c.total, complete)}
      <span class="su-cat-main">
        <span class="su-cat-title">${e(title)}</span>
        <span class="su-line"><span class="su-count">${e(`${c.done} of ${c.total} done`)}</span>${more}<span class="su-sep" aria-hidden="true">·</span><span class="su-next">${next}</span></span>
      </span>
    </div>`;
}

/** The header: the title and the chevron, then the two rings side by side. */
function rowHtml(d, open, t, reqComplete, allComplete) {
  const e = D.escapeHtml;
  // "Setting up" read as something the platform was doing for them; it is their list (Cameron, 2026-10-02)
  const title = reqComplete ? 'Your account is set up' : 'Finish setting up your account';
  const tip = open ? 'Fold the steps away' : 'Show every step';
  const toggle = allComplete ? '' : `<button class="ev-card-toggle su-toggle" type="button" data-setup-toggle aria-expanded="${open}" aria-controls="${ID}Body" aria-label="${tip}" data-tip="${tip}">${ico('chevron')}</button>`;
  const rings = `<div class="su-rings">${catHtml('Required', t.required, t.planWaits)}${t.optional.total || t.optional.locked ? catHtml('Optional', t.optional, t.planWaits) : ''}</div>`;
  return `<div class="su-head ${reqComplete ? 'is-done' : ''}"><span class="su-title">${e(title)}</span>${toggle}</div>${rings}`;
}

/** One step of the stepper: its dot, its title as a link, Optional when it is, and its sentence. */
function stepHtml(s) {
  const e = D.escapeHtml;
  const state = STATES.has(s?.state) ? s.state : 'open';
  // what is said under the title: the fact or the wait (why), and what an optional step is needed for
  const why = String(s?.why || '').trim(), needs = s?.optional ? String(s?.needs || '').trim() : '';
  const note = [why, needs && needs !== why ? needs : ''].filter(Boolean).join(' ');
  return `<li class="su-step is-${state}">
      <span class="su-dot" aria-hidden="true">${state === 'done' ? ico('check', 10) : ''}</span>
      <div class="su-main">
        <span class="su-sr">${e(STATE_WORDS[state])}: </span>
        <span class="su-step-head">${linkHtml(s)}${s?.optional ? '<span class="acct-tag is-quiet su-opt">Optional</span>' : ''}</span>
        ${note ? `<p class="su-why">${e(note)}</p>` : ''}
      </div>
    </li>`;
}

/** The groups in the server's order, each a kicker and its steps as a vertical stepper. */
function bodyHtml(d, open) {
  const e = D.escapeHtml;
  const groups = (d.groups || []).filter(g => Array.isArray(g?.steps) && g.steps.length).map(g => `
    <div class="su-group">
      <p class="su-kicker">${e(g.title || g.id || '')}</p>
      <ol class="su-steps">${g.steps.map(stepHtml).join('')}</ol>
    </div>`).join('');
  return `<div class="su-body" id="${ID}Body" ${open ? '' : 'hidden'}><div class="su-groups">${groups}</div></div>`;
}

function paint(host, d, uid) {
  const t = tally(d);
  // a server that sends no steps to count still gets a ring: its own done/total, as the single ring always used
  if (!t.counted) {
    const total = Math.max(0, Number(d.total) || 0);
    t.required = { total, done: Math.min(total, Math.max(0, Number(d.done) || 0)), next: d.next || null, locked: 0 };
    t.optional = { total: 0, done: 0, next: null, locked: 0 };
    t.off = 0; t.planWaits = false;
  }
  // the account is SET UP once the required steps are done; optional ones are tracked, never a gate
  const reqComplete = t.required.total > 0 && t.required.done >= t.required.total;
  const allComplete = reqComplete && t.optional.done >= t.optional.total;
  // everything done, the card stays folded whatever was remembered
  const open = !allComplete && isOpen(uid);
  host.className = `acct-card su-card ${open ? 'is-open' : ''}`;
  host.setAttribute('aria-label', reqComplete ? 'Your account is set up' : 'Finish setting up your account');
  host.innerHTML = `${rowHtml(d, open, t, reqComplete, allComplete)}${allComplete ? '' : bodyHtml(d, open)}`;
  host.hidden = false;
}

/* ---------- the fold ---------- */

function bindOnce() {
  if (bindOnce._bound) return;
  bindOnce._bound = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-setup-toggle]');
    if (!t) return;
    e.preventDefault();
    const card = t.closest('.su-card'), body = card?.querySelector('.su-body');
    if (!body) return;
    const on = body.hidden;
    body.hidden = !on;
    card.classList.toggle('is-open', on);
    const tip = on ? 'Fold the steps away' : 'Show every step';
    t.setAttribute('aria-expanded', String(on)); t.setAttribute('aria-label', tip); t.setAttribute('data-tip', tip);
    setOpen(userId(), on);
  });
}

/**
 * Mount the checklist at the top of `main`, which the section has just painted. The block is added at once, hidden,
 * and shown when the answer lands (a kept answer lands at once); a lane with no answer leaves nothing behind. A newer
 * render, or a section that moved on, drops an answer that arrives late.
 */
export function renderSetup(main, deps) {
  D = deps;
  bindOnce();
  const uid = userId();
  if (!main || !uid) return;
  let host = document.getElementById(ID);
  if (!host || !main.contains(host)) {
    host = document.createElement('section');
    host.id = ID; host.className = 'acct-card su-card'; host.hidden = true;
    main.prepend(host);
  }
  const seq = ++su.seq;
  readSetup(`${uid}|${teamId()}`).then((d) => {
    if (seq !== su.seq || !host.isConnected) return;
    if (!d) { host.remove(); return; }
    paint(host, d, uid);
  });
}
