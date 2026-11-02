// src/account/approvals.js
//
// THE APPROVALS SECTION (2026-11-02; the definition _local/APPROVALS-MAIL-DEFINITION-2026-11-02.md). Cameron: "there
// is no approval process, or spot in the ui for an owner or team who would approve, to see pending approvals ... a
// general lump pool doesnt fix that. it needs to be something that scales and stays organized".
//
// One section, grouped and never pooled: a card per module whose rows wait (its name, its table, how many), newest
// first, each item drawn from its own fields (the install's labels, approvalGroups.js), with Approve, Reject and Open
// (the row on the Data card). Shown to the owner and to members whose role holds "Approve what shows on your site"
// (account.js hides it by scope); the server checks the scope again on every decision.
//
//   GET  v1/environment/approvals                       the groups, the owner's licensing-request count, canDecide
//   POST v1/environment/approvals/{installId}/{key}     { decision }  -> the decided row
//
// Nothing here names a customer's forms: an environment with ten moderating modules gets ten cards, one with none gets
// one line. Backend auth/approvals.js.

import { PRAG_API_BASE } from '../runtime/config.js';
import { explainLink } from '../components/explainer.js';
import { ico, leadBtn, iconBtn, cardHtml as sharedCard, initCards, stateLead } from './cards.js';
import { groupsOf, totals, itemLines, groupSummary } from './approvalGroups.js';
import { countWord } from '../ui/words.js';

const URL_BASE = `${PRAG_API_BASE}/environment/approvals`;
const TEAM_KEY = 'pragoptics_team_id';
const OPEN_TABLE_KEY = 'pragoptics_open_table';

let D = null;
const ap = { groups: null, requests: 0, canDecide: false, err: '', note: '', busy: '', busyTo: '', loading: false };

function teamId() { try { return sessionStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } }
function url(path) { const u = new URL(path); const t = teamId(); if (t) u.searchParams.set('tenant', t); return u.toString(); }
function body(obj) { const t = teamId(); return JSON.stringify({ ...(t ? { tenant: t } : {}), ...obj }); }
function card(o) { return sharedCard({ ...o, key: `approvals:${o.key}` }); }

export async function renderApprovals(main, deps) {
  D = deps;
  initCards();
  Object.assign(ap, { groups: null, requests: 0, canDecide: false, err: '', note: '', busy: '', busyTo: '', loading: false });
  main.innerHTML = `
    <header class="acct-sec-head has-explain"><h2 class="acct-sec-title">Approvals</h2>${explainLink('environment', 'What waits for a decision')}</header>
    <div id="apBody"><p class="acct-loading">Loading…</p></div>`;
  await load();
}

async function load() {
  if (!document.getElementById('apBody')) return;
  ap.loading = true; ap.err = '';
  try {
    const d = await D.apiFetch(url(URL_BASE));
    ap.groups = groupsOf(d); ap.requests = Number(d && d.requests) || 0; ap.canDecide = !!(d && d.canDecide);
  } catch (ex) {
    if (!ap.groups) ap.groups = [];
    ap.err = ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, 'The approvals could not be read.'));
  }
  ap.loading = false;
  paint();
}

function paint() {
  const host = document.getElementById('apBody');
  if (!host) return;
  const e = D.escapeHtml;
  const groups = ap.groups || [];
  const t = totals(groups);
  const head = `
    <section class="acct-card ev-summary ap-head">
      <div class="ev-head">
        <div class="ev-id">
          <div class="ev-tags">${t.waiting ? `<span class="acct-tag is-pending">${e(`${t.waiting}${t.more ? '+' : ''} waiting`)}</span>` : '<span class="acct-tag is-verified">nothing waiting</span>'}${ap.canDecide ? '' : '<span class="acct-tag">read only</span>'}</div>
          <h3 class="acct-card-h ev-name">What waits for your decision</h3>
          <p class="ev-owner adm-muted">${ap.canDecide ? 'A review or another submission that must be approved before it shows on your site. Approve shows it; Reject keeps it off.' : 'You can see what waits. The owner can give your role "Approve what shows on your site" on the Team tab.'}</p>
        </div>
        <div class="ev-actions">${stateLead({ ap: 'refresh' }, 'refresh', 'Refresh', { out: ap.loading, busyWord: 'Reading…' })}</div>
      </div>
    </section>`;
  const err = ap.err ? `<p class="acct-error" role="alert">${e(ap.err)}</p>` : '';
  const note = ap.note ? `<p class="acct-card-note ev-note" role="status">${e(ap.note)}</p>` : '';
  const requests = ap.requests ? `<p class="acct-card-note ap-link">${e(countWord(ap.requests, 'licensing request waits', 'licensing requests wait'))} for you too: <a class="acct-inline-link" href="#account?section=licensing" data-acct-section="licensing">Licensing, Requests for you</a>.</p>` : '';
  let cards;
  if (!groups.length) cards = `<p class="acct-empty">Nothing is waiting for you. A module that holds its submissions for approval lists them here the moment one arrives.</p>`;
  else cards = groups.map(groupCard).join('');
  host.innerHTML = `${head}${err}${note}${requests}<div class="ev-cards">${cards}</div>`;
}

function groupCard(g) {
  const e = D.escapeHtml;
  const items = g.items.length ? `<ul class="ap-list">${g.items.map(i => itemHtml(g, i)).join('')}</ul>` : '<p class="acct-empty">Nothing waiting here.</p>';
  const more = g.more ? '<p class="lic-hint">The newest 50 are shown; decide these and the next ones follow.</p>' : '';
  return card({ key: g.installId, icon: 'bell', title: g.name, summary: e(groupSummary(g)), open: g.pending > 0, body: `${items}${more}` });
}

function itemHtml(g, item) {
  const e = D.escapeHtml;
  const { lines, hidden } = itemLines(item, { max: 4 });
  const busy = ap.busy === `${g.installId}|${item.key}`;
  const decide = ap.canDecide ? `
      ${stateLead({ ap: 'approve' }, 'check', 'Approve', { out: busy && ap.busyTo === 'approved', busyWord: 'Approving…', waiting: ap.busy && !busy ? 'Waiting for the other decision' : (busy ? 'Waiting for this one' : '') }, `data-install="${e(g.installId)}" data-key="${e(item.key)}" data-tip="Show it on your site"`, 'btn-primary')}
      ${stateLead({ ap: 'reject' }, 'x', 'Reject', { out: busy && ap.busyTo === 'rejected', busyWord: 'Rejecting…', waiting: ap.busy && !busy ? 'Waiting for the other decision' : (busy ? 'Waiting for this one' : '') }, `data-install="${e(g.installId)}" data-key="${e(item.key)}" data-tip="Keep it off your site"`, 'is-risky')}` : '';
  const open = iconBtn({ ap: 'open' }, 'external', 'Open the row on the Data card', `data-table="${e(g.table)}" data-key="${e(item.key)}"`);
  const when = item.at ? `<span class="adm-muted">${e(D.fmtDate(item.at))}</span>` : '';
  const where = item.host ? `<span class="adm-muted">${e(item.host)}</span>` : '';
  return `
    <li class="ap-item" data-row="${e(item.key)}">
      <div class="ap-item-head"><p class="ap-item-t">${e(item.headline || `A ${g.name.toLowerCase()}`)}</p><p class="ap-item-meta">${when}${where}${item.via === 'assistant' ? '<span class="acct-tag">by the assistant</span>' : ''}</p></div>
      ${lines.length ? `<dl class="ap-fields">${lines.map(l => `<div><dt>${e(l.label)}</dt><dd>${e(l.text)}</dd></div>`).join('')}</dl>` : ''}
      ${hidden ? `<p class="lic-hint">${e(countWord(hidden, 'more field', 'more fields'))} on the row.</p>` : ''}
      <div class="act-row ap-acts">${decide}${open}</div>
    </li>`;
}

/** Approve or reject one item: the server decides under the scope and the row's version; the list reads again. */
async function decide(installId, key, decision) {
  if (!installId || !key || ap.busy) return;
  ap.busy = `${installId}|${key}`; ap.busyTo = decision; ap.err = ''; ap.note = ''; paint();
  try {
    const d = await D.apiFetch(url(`${URL_BASE}/${encodeURIComponent(installId)}/${encodeURIComponent(key)}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({ decision }) });
    const item = d && d.decided && d.decided.item;
    ap.note = `${item && item.headline ? item.headline : 'It'} is ${decision}${decision === 'approved' ? ' and shows on your site' : ' and stays off your site'}.`;
  } catch (ex) {
    const code = ex?.data?.code;
    ap.err = ex?.sessionInvalidated ? ''
      : code === 'ALREADY_DECIDED' ? `Already ${ex.data.state || 'decided'}${ex.data.decidedAt ? ` on ${D.fmtDate(ex.data.decidedAt)}` : ''}; the list reads again.`
      : code === 'SCOPE_REQUIRED' ? 'Your role cannot decide this. The owner can turn on "Approve what shows on your site" for your role on the Team tab.'
      : (ex?.data?.error || D.friendlyError(ex, `The row could not be ${decision}.`));
  }
  ap.busy = ''; ap.busyTo = '';
  await load();
}

/** Open the row on the Data card: the Environment section opens the table and the row (environment.js reads the note). */
function openRow(table, key) {
  try { sessionStorage.setItem(OPEN_TABLE_KEY, JSON.stringify({ table, row: key })); } catch { /* the Data card still opens */ }
  try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section: 'environment', card: 'data', row: '' })); } catch { /* fine */ }
  location.hash = '#account?section=environment&card=data';
}

export function bindApprovalsActions(deps) {
  if (bindApprovalsActions._bound) return;
  bindApprovalsActions._bound = true;
  D = D || deps;
  // any link that names a table (data-open-table, a row too with data-open-row) leaves the note the Data card reads, then goes on
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-open-table]');
    if (!a) return;
    try { sessionStorage.setItem(OPEN_TABLE_KEY, JSON.stringify({ table: String(a.dataset.openTable || ''), row: String(a.dataset.openRow || '') })); } catch { /* the card still opens */ }
  }, true);
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-ap-action]');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    const a = btn.dataset.apAction;
    if (a === 'refresh') return void load();
    if (a === 'approve') return void decide(btn.dataset.install || '', btn.dataset.key || '', 'approved');
    if (a === 'reject') return void decide(btn.dataset.install || '', btn.dataset.key || '', 'rejected');
    if (a === 'open') return void openRow(btn.dataset.table || '', btn.dataset.key || '');
  });
}
