// src/account/conductDesk.js
//
// COMMUNITY STANDARDS (2026-09-24, decision 27): the operator's one window for an environment or an account, opened from
// the Tenants desk (a tenant's row) and the Users desk (Manage account). It reads GET v1/admin/conduct/{environmentId}
// or v1/admin/conduct/user/{userId} (functions/adminConduct.js) and shows the account and its hold, every published
// site on each lane, and the three actions of decision 27 with their lifts:
//   Take down (one site), Take every site down (live and sandbox), Allow publishing again (a site, or a held lane);
//   Suspend for the community standards / Lift the suspension;
//   Close for cause (the account email typed to enable it; a closure with Microsoft license commitments answers the
//   amount first, and the next press confirms it: "Charge $X and close?").
// Every button asks once before it acts (cards.js armed), is disabled while its request is out and holds the others
// (cards.js busy), and a refusal shows the server's own sentence. What it breaks (the category) and a note for the
// record sit above the buttons and go with each press. The operator's own account is never offered an action.

import { PRAG_API_BASE } from '../runtime/config.js';
import { armed, busy, leadBtn, openModal } from './cards.js';
import { categoryOptionsHtml, conductWords } from './conductWords.js';
import { cents } from '../ui/words.js';
import { closeBillOf, closeChargeWord } from './closeBill.js';

const URL_BASE = `${PRAG_API_BASE}/admin/conduct`;

let D = null;   // deps: apiFetch, escapeHtml, friendlyError, fmtDate, cachedPing
const e = (s) => D.escapeHtml(String(s ?? ''));

/** Either GET's answer as one shape: { user, env, holds, sites }. */
function normalize(d) {
  if (d && d.user) {
    const v = d.environment || null;
    return { user: d.user, env: v ? v.environment : null, holds: v ? v.holds : null, sites: v ? v.sites || [] : [] };
  }
  const o = d?.owner || null;
  return { user: o ? { ...o, hold: d?.holds?.conduct || null } : null, env: d?.environment || null, holds: d?.holds || null, sites: d?.sites || [] };
}

function pill(text, cls = '') { return `<span class="acct-tag ${cls}">${e(text)}</span>`; }

function sitesHtml(s, locked) {
  if (!s.env) return '<p class="acct-modal-note">This account owns no environment, so it has no published sites.</p>';
  const held = s.holds?.sites || {};
  const lanes = ['live', ...(s.env.sandbox ? ['sandbox'] : [])];
  const rows = lanes.map((lane) => {
    const mine = s.sites.filter((x) => x.lane === lane);
    const laneHeld = !!held[lane];
    const list = mine.length ? mine.map((x) => {
      if (x.error) return `<li class="cd-site"><span class="adm-muted">${e(x.error)}</span></li>`;
      const down = !!x.takenDownAt;
      return `
        <li class="cd-site">
          <div class="cd-site-main">
            <span class="cd-site-name">${e(x.slug === 'root' ? 'Root site' : x.slug)}</span>
            ${down ? '<span class="acct-tag is-pending">taken down</span>' : ''}
            ${x.address ? `<a class="cd-site-addr" href="${e(x.address)}" target="_blank" rel="noopener noreferrer">${e(x.address)}</a>` : ''}
            <span class="adm-muted">${e(String(x.files ?? 0))} file${Number(x.files) === 1 ? '' : 's'}</span>
          </div>
          <div class="um-actions">
            ${down
              ? leadBtn({ cd: 'sites-back' }, 'play', 'Allow publishing again', `data-lane="${e(lane)}" data-slug="${e(x.slug)}" ${locked}`)
              : leadBtn({ cd: 'takedown-one' }, 'stop', 'Take down', `data-lane="${e(lane)}" data-slug="${e(x.slug)}" ${locked}`, 'is-danger')}
          </div>
        </li>`;
    }).join('') : '<li class="cd-site"><span class="adm-muted">No published sites.</span></li>';
    return `
      <div class="cd-lane">
        <div class="cd-lane-head"><span class="um-sec-h">${lane === 'live' ? 'Live' : 'Sandbox'}</span>${laneHeld ? '<span class="acct-tag is-pending">held: nothing can be published</span>' : ''}</div>
        <ul class="cd-sites">${list}</ul>
        ${laneHeld ? `<div class="um-actions">${leadBtn({ cd: 'sites-back-lane' }, 'play', `Allow publishing again on ${lane}`, `data-lane="${e(lane)}" ${locked}`)}</div>` : ''}
      </div>`;
  }).join('');
  const everyHeld = !!held.live && (!s.env.sandbox || !!held.sandbox);
  return `${rows}${everyHeld ? '' : `<div class="um-actions">${leadBtn({ cd: 'takedown-every' }, 'stop', 'Take every site down (live and sandbox)', locked, 'is-danger')}</div>`}`;
}

function windowHtml(s, st) {
  const u = s.user;
  const status = String(u?.status || '').toUpperCase();
  const closed = status === 'CLOSED';
  const held = !!u?.hold || !!s.holds?.conduct;
  const own = !!st.own;
  // the operator's own account: nothing; an operator account or a closed one: its sites only (a closed account's sites
  // can still be taken down), never its sign-in
  const ownWhy = own ? 'You cannot act on your own account.' : '';
  const acctWhy = ownWhy || (u?.isAdmin ? 'This is an operator account. Remove its admin flag first.' : closed ? 'This account is closed.' : '');
  const lockWhy = ownWhy || acctWhy;
  const siteLock = ownWhy ? `disabled data-tip="${e(ownWhy)}"` : '';
  const locked = acctWhy ? `disabled data-tip="${e(acctWhy)}"` : '';
  const heading = s.env?.name || u?.email || 'Community standards';
  return `
    <div class="acct-modal-mask" data-cd-close></div>
    <div class="acct-modal is-wide um cd" role="dialog" aria-modal="true" aria-label="Community standards">
      <header class="um-head">
        <div class="um-head-main">
          <h3 class="acct-modal-h">Community standards</h3>
          <p class="um-email"><strong>${e(heading)}</strong>${s.env && u?.email ? ` <span class="adm-muted">owner ${e(u.email)}</span>` : ''}</p>
        </div>
        <div class="um-pills">
          ${u ? pill(status.toLowerCase() || 'active', status === 'ACTIVE' ? 'is-verified' : 'is-bad') : ''}
          ${held ? pill('suspended for the standards', 'is-bad') : ''}
          ${s.holds?.closedForCauseAt ? pill('closed for cause', 'is-bad') : ''}
        </div>
      </header>
      ${lockWhy ? `<p class="acct-modal-note">${e(lockWhy)}</p>` : ''}
      <section class="um-sec">
        <div class="um-sec-h">What it breaks</div>
        <div class="um-grid2">
          <label class="um-field">
            <span class="adm-label">Category</span>
            <select class="adm-select" id="cdCategory" ${siteLock}>${categoryOptionsHtml(e, st.category, { placeholder: 'Choose one' })}</select>
          </label>
          <label class="um-field">
            <span class="adm-label">Note for the record (optional)</span>
            <input class="adm-input" id="cdNote" type="text" maxlength="500" value="${e(st.note)}" placeholder="A report reference, what you checked" ${siteLock}>
          </label>
        </div>
        <p class="acct-modal-note">Every action is recorded with the category and the note, and the owner is emailed what was done and why, in plain words. Nothing is sent to a reporter.</p>
      </section>
      <section class="um-sec">
        <div class="um-sec-h">Published sites</div>
        <p class="acct-modal-note">Take down deletes the site's public files and keeps its name, so it cannot be published again until you allow it. Every site switches off both lanes' websites and holds them, so nothing can be published.</p>
        ${sitesHtml(s, siteLock)}
      </section>
      ${u && !closed ? `
        <section class="um-sec">
          <div class="um-sec-h">Account</div>
          <p class="acct-modal-note">${held
            ? `Suspended for the community standards${u.hold?.category ? ` (${e(conductWords(u.hold.category) || u.hold.category)})` : ''}. The account cannot sign in, and its team cannot use its environment. Billing continues.`
            : 'Suspending for the community standards blocks sign-in, ends every session and holds the environment for its whole team. Billing continues.'}</p>
          <div class="um-actions">
            ${held
              ? leadBtn({ cd: 'reinstate' }, 'play', 'Lift the suspension', locked)
              : leadBtn({ cd: 'suspend' }, 'pause', 'Suspend for the community standards', locked, 'is-danger')}
          </div>
        </section>
        <section class="um-sec um-sec--danger">
          <div class="um-sec-h">Close for cause</div>
          <p class="acct-modal-note">Takes every site down, suspends the account, then closes it now with no refund. An account still holding Microsoft license commitments is shown what is left of them first; that amount is charged on its final bill, and if the charge does not go through the account closes all the same and the amount stays owed, on the Needs attention desk. Type the account email to enable the button.</p>
          <input class="adm-input" id="cdCloseEmail" type="email" autocomplete="off" spellcheck="false" placeholder="${e(u.email || '')}" value="${e(st.typedEmail)}" ${locked} aria-label="Type the account email to confirm">
          ${st.bill ? `<div class="um-close-bill" role="status"><p class="acct-modal-note">${e(st.bill.sentence)}</p><p class="acct-modal-note">Press <strong>${e(closeChargeWord(st.bill))}</strong> to charge it on the final bill and close the account. If the card is declined, the account closes all the same and the amount stays owed: it goes on the Needs attention desk to collect.</p></div>` : ''}
          <div class="um-actions">
            ${leadBtn({ cd: 'close' }, 'power', st.bill ? closeChargeWord(st.bill) : 'Close for cause', locked || (matches(u, st.typedEmail) ? '' : 'disabled data-tip="Enabled once the email above matches this account"'), 'is-danger')}
          </div>
        </section>` : ''}
      <p class="acct-error" id="cdError" role="alert" ${st.error ? '' : 'hidden'}>${e(st.error)}</p>
      <p class="na-flash" id="cdFlash" role="status" aria-live="polite" ${st.flash ? '' : 'hidden'}>${e(st.flash)}</p>
      <div class="acct-modal-actions">
        <button class="btn btn-ghost" type="button" data-cd-close>Done</button>
      </div>
    </div>`;
}
function matches(u, typed) { return !!typed && String(typed).trim().toLowerCase() === String(u?.email || '').trim().toLowerCase(); }

/**
 * What a close for cause did, for the operator (POST close answers result: { steps, owedCents }). Its first step takes
 * every site down; when that failed the account still closed (steps.takedown "failed: <why>"), so the line says the
 * sites may still be up and which button takes them down, as the Needs attention desk's note does (auth/conduct.js
 * harmWords). A final charge that failed stays owed (decision 37(1)).
 */
function closedWords(r) {
  const t = String(r?.steps?.takedown || '');
  const why = t.replace(/^failed:\s*/, '').replace(/[.\s]+$/, '');
  const sites = t.startsWith('failed') ? ` Its sites may still be up: taking them down failed${why ? ` (${why})` : ''}. Press Take every site down.` : '';
  const owed = Number(r?.owedCents) > 0 ? ` The final charge of ${cents(r.owedCents)} did not go through, so it stays owed: it is on the Needs attention desk.` : '';
  return `Closed the account for cause.${sites}${owed} The owner is emailed.`;
}

/**
 * Open the window for an environment (`environmentId`) or an account (`userId`). `deps` are the panel's (account.js):
 * apiFetch, escapeHtml, friendlyError, fmtDate, cachedPing. `onChange` runs after an action went through (a desk that
 * lists holds reloads).
 */
export async function openConduct({ environmentId = '', userId = '', deps, onChange = null }) {
  D = deps;
  const st = { category: '', note: '', typedEmail: '', bill: null, error: '', flash: '', working: false, own: false };
  let s = null;
  const getUrl = () => (s?.env?.id ? `${URL_BASE}/${encodeURIComponent(s.env.id)}` : environmentId ? `${URL_BASE}/${encodeURIComponent(environmentId)}` : `${URL_BASE}/user/${encodeURIComponent(s?.user?.userId || userId)}`);
  const me = (() => { try { return D.cachedPing?.()?.user || {}; } catch { return {}; } })();
  let shown = true;   // false once closed: a read that answers after Done paints nothing (the host may be another window's by then)
  function paint() {
    if (!s || !shown) return;
    st.own = !!(me.userId && s.user?.userId && me.userId === s.user.userId);
    const open = document.activeElement?.id;
    host.innerHTML = windowHtml(s, st);
    if (open) host.querySelector(`#${CSS.escape(open)}`)?.focus?.();
  }
  // the window opens at once, reading; Done closes it even while the read is out
  const { host, close: closeHost } = openModal('admConduct', `<div class="acct-modal-mask" data-cd-close></div><div class="acct-modal is-wide um cd" role="dialog" aria-modal="true" aria-label="Community standards"><h3 class="acct-modal-h">Community standards</h3><p class="acct-modal-note" role="status">Loading…</p><div class="acct-modal-actions"><button class="btn btn-ghost" type="button" data-cd-close>Done</button></div></div>`,
    { onClick, onInput, onChange: onInput });
  const close = () => { shown = false; closeHost(); };
  try { s = normalize(await D.apiFetch(getUrl())); paint(); }
  catch (ex) {
    const msg = ex?.status === 404 && !ex?.data?.code ? 'Community standards is not on this lane yet. Deploy the backend that carries it, then reload.' : (ex?.data?.error || D.friendlyError(ex, 'Could not read this account.'));
    const say = shown ? host.querySelector('[role="status"]') : null;
    if (say) say.textContent = msg;
  }

  async function act(btn, what) {
    if (st.working || !s) return;
    st.error = ''; st.flash = '';
    const needsCategory = ['takedown-one', 'takedown-every', 'suspend', 'close'].includes(what);
    if (needsCategory && !st.category) { st.error = 'Choose what it breaks first.'; paint(); return; }
    const envId = s.env?.id || '';
    const uid = s.user?.userId || '';
    const common = { category: st.category, note: st.note };
    const req = {
      'takedown-one': ['takedown', { environmentId: envId, scope: 'one', lane: btn.dataset.lane, slug: btn.dataset.slug, ...common }, 'Taking it down…', 'Take it down?'],
      'takedown-every': ['takedown', { environmentId: envId, scope: 'every', ...common }, 'Taking every site down…', 'Take every site down?'],
      'sites-back': ['sites-back', { environmentId: envId, lane: btn.dataset.lane, slug: btn.dataset.slug }, 'Allowing it…', 'Allow publishing again?'],
      'sites-back-lane': ['sites-back', { environmentId: envId, lane: btn.dataset.lane }, 'Allowing it…', `Allow publishing on ${btn.dataset.lane}?`],
      suspend: ['suspend', { userId: uid, ...common }, 'Suspending…', 'Suspend the account?'],
      reinstate: ['reinstate', { userId: uid }, 'Lifting it…', 'Lift the suspension?'],
      close: ['close', { userId: uid, expectEmail: s.user?.email || '', ...common, ...(st.bill ? { acceptRemainingCents: st.bill.totalCents } : {}) }, st.bill ? 'Charging and closing…' : 'Closing…', st.bill ? `Charge ${st.bill.totalText} and close?` : 'Close for cause?']
    }[what];
    if (!req) return;
    const [route, body, word, ask] = req;
    if (!armed(btn, ask)) return;
    st.working = true;
    const others = [...host.querySelectorAll('button[data-cd-action], #cdCategory, #cdNote, #cdCloseEmail')].filter((x) => x !== btn);
    const done = busy(btn, word, { hold: others, why: `Wait: ${word.replace(/…$/, '')}` });
    try {
      const d = await D.apiFetch(`${URL_BASE}/${route}`, { method: 'POST', body: JSON.stringify(body) });
      st.working = false; done();
      if (route === 'close') st.bill = null;
      if (d?.view) s = normalize(d.view);
      else { try { s = normalize(await D.apiFetch(getUrl())); } catch { /* the last view stays */ } }
      st.flash = {
        takedown: body.scope === 'one' ? `Took down ${body.slug}. The owner is emailed.` : 'Took every site down on both lanes. The owner is emailed.',
        'sites-back': 'Publishing is allowed again. The owner is emailed.',
        suspend: 'Suspended the account and held its environment. The owner is emailed.',
        reinstate: 'Lifted the suspension. The owner is emailed.',
        close: closedWords(d?.result)
      }[route] || 'Done.';
      paint();
      try { onChange?.(); } catch { /* the desk reloads on its own next visit */ }
    } catch (ex) {
      st.working = false; done();
      const bill = route === 'close' ? closeBillOf(ex) : null;
      if (bill) {
        st.bill = bill;
        try { s = normalize(await D.apiFetch(getUrl())); } catch { /* the suspension and takedown show on the next read */ }
      } else if (!ex?.sessionInvalidated) st.error = ex?.data?.error || D.friendlyError(ex, 'That did not go through.');
      paint();
    }
  }

  function onClick(ev) {
    if (ev.target.closest('[data-cd-close]')) { if (!st.working) close(); return; }
    const btn = ev.target.closest('button[data-cd-action]');
    if (btn && !btn.disabled) { ev.preventDefault(); act(btn, btn.dataset.cdAction); }
  }
  function onInput(ev) {
    const t = ev.target;
    if (t.id === 'cdCategory') st.category = String(t.value || '');
    else if (t.id === 'cdNote') st.note = String(t.value || '');
    else if (t.id === 'cdCloseEmail') {
      st.typedEmail = String(t.value || '');
      const b = host.querySelector('button[data-cd-action="close"]');
      if (b && !b.hasAttribute('aria-busy') && !st.working && !st.own && !s?.user?.isAdmin) {
        b.disabled = !matches(s?.user, st.typedEmail);
        if (b.disabled) b.setAttribute('data-tip', 'Enabled once the email above matches this account'); else b.removeAttribute('data-tip');
      }
    }
  }
}
