/* THE AI AGENTS CARD (2026-11-10, Cameron: "lets say they want to create an agent that reviews their needs attention, or
 * support cases ... have AI run inference against reports, automatically have a traceid of etag"). An environment names
 * up to ten AI Agents. Each watches one data table, reviews what changed on a press or on its schedule, writes its report
 * to the table ai-agent-reports with a trace of every record it read, and mails the roles it names through the
 * environment's own mailer. Painted into #evAiAgents under the AI card (environment.js renderAi) and handed that tab's
 * helpers (setAgentsContext). Reads GET v1/environment/ai/agents; saves PUT; runs POST v1/environment/ai/agents/run. */
import { PRAG_API_BASE } from '../runtime/config.js';
import { ico, iconBtn, leadBtn, cardHtml, busy } from './cards.js';
import { explainLink } from '../components/explainer.js';
import { countWord } from '../ui/words.js';

const ENV_URL = `${PRAG_API_BASE}/environment`;
let D = null;   // the account's shared helpers: apiFetch, escapeHtml, fmtDate, friendlyError, showError
let X = null;   // this tab's: url(path, extra, lane), body(obj, lane), myRole(), lane(), view()
let st = fresh();
function fresh() { return { data: null, note: '', tables: null, edit: null, arm: '', status: '', running: '' }; }

export function setAgentsContext(deps, ctx) { D = deps; X = ctx; }
export function resetAgents() { st = fresh(); }
const errText = (ex, fallback) => (ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)));
const manage = () => ['owner', 'admin', 'agent'].includes(X.myRole());

export async function loadAgents() {
  try {
    st.data = await D.apiFetch(X.url(`${ENV_URL}/ai/agents`, {}, X.lane()));
    st.note = '';
  } catch (ex) {
    st.data = null;
    st.note = ex?.status === 404 ? 'AI Agents are not on this lane yet.' : errText(ex, 'Could not read the AI Agents.');
  }
  // the tables an agent may watch: one read of the listing, kept for the form
  if (st.data && st.tables == null) { try { const d = await D.apiFetch(X.url(`${ENV_URL}/data`, {}, X.lane())); st.tables = (d.tables || []).map(t => t.table).filter(t => t !== st.data.table); } catch { st.tables = []; } }
  paintAgents();
}
export function paintAgents() { const h = document.getElementById('evAiAgents'); if (h) h.innerHTML = agentsHtml(); }

const SCHEDULE_WORDS = { off: 'only when pressed', hourly: 'every hour', daily: 'every day' };
function runWords(run, e) {
  if (!run || !run.at) return 'never run';
  if (!run.ok) return `failed ${e(D.fmtDate(run.at))}: ${e(run.error || 'no reason given')}`;
  if (!run.reviewed) return `ran ${e(D.fmtDate(run.at))}: nothing new`;
  return `${e(D.fmtDate(run.at))}: ${e(run.headline || 'reviewed')} (${e(countWord(Number(run.reviewed || 0), 'record', 'records'))}${run.mailed ? `, mailed ${run.mailed}` : run.mailNote ? `, ${e(run.mailNote)}` : ''})`;
}

export function agentsHtml() {
  const e = D.escapeHtml, d = st.data;
  const explain = explainLink('ai', 'How AI Agents work');
  if (!d) {
    return cardHtml({ key: 'ai-agents', icon: 'activity', title: 'AI Agents', summary: st.note ? 'not on this lane' : 'loading', explain,
      body: st.note ? `<p class="acct-card-note">${e(st.note)}</p>` : '<p class="acct-loading">Loading the AI Agents…</p>' });
  }
  const agents = d.agents || [], runs = d.runs || {}, can = manage();
  const lastAt = Object.values(runs).map(r => r.at || '').sort().pop() || '';
  const summary = !agents.length ? 'none yet' : `${countWord(agents.length, 'agent', 'agents')}${lastAt ? ` · last ${e(D.fmtDate(lastAt))}` : ''}`;
  const list = !agents.length ? `<p class="acct-empty">${can ? 'No AI Agents yet. One watches a table and tells the team what changed and what needs a person.' : 'No AI Agents yet. The owner or an admin makes them.'}</p>`
    : `<div class="ev-agents">${agents.map(a => {
      const run = runs[a.id] || null, editing = st.edit && st.edit.id === a.id, armed = st.arm === a.id, running = st.running === a.id;
      return `
      <div class="ev-agent ${a.enabled === false ? 'ev-muted-row' : ''}" data-agent="${e(a.id)}">
        <div class="ev-agent-head">
          <span class="ev-agent-name">${ico('activity', 14)} ${e(a.name)}</span>
          <span class="acct-tag">${e(a.table)}</span>
          <span class="adm-muted">${e(SCHEDULE_WORDS[a.schedule] || a.schedule)} · ${e(a.lane || 'mid')}${a.roles && a.roles.length ? ` · mails ${e(a.roles.join(', '))}` : ' · mails no one'}${a.enabled === false ? ' · paused' : ''}</span>
        </div>
        <p class="acct-card-note ev-agent-run">${runWords(run, e)}${run && run.ok && run.reportKey ? ` ${iconBtn('agents-open-report', 'external', 'Open the report in the Data card', `data-table="${e(d.table)}" data-row="${e(run.reportKey)}"`)}` : ''}</p>
        ${can ? `<div class="act-row ev-agent-actions">
          ${leadBtn('agents-run', 'play', running ? 'Reviewing…' : 'Run now', `data-id="${e(a.id)}" ${running || !d.enabled ? 'disabled' : ''} data-tip="${d.enabled ? 'Reviews what changed in the table now' : 'Turn AI on above first'}"`)}
          ${iconBtn('agents-edit', 'edit', 'Edit this agent', `data-id="${e(a.id)}" ${editing ? 'disabled' : ''}`)}
          ${armed ? `<span class="act-row"><button class="btn btn-sm btn-ico is-armed" type="button" data-env-action="agents-remove" data-id="${e(a.id)}" aria-label="Remove? Its reports stay in the Data card. Press again to confirm.">${ico('trash')}<span>Remove?</span></button>${iconBtn('agents-arm-cancel', 'x', 'Keep it', '', 'btn-arm-cancel')}</span>` : iconBtn('agents-remove', 'trash', 'Remove this agent', `data-id="${e(a.id)}"`, 'is-risky')}
        </div>` : ''}
      </div>`; }).join('')}</div>`;
  const form = st.edit && can ? formHtml(st.edit, d, e) : '';
  const note = !d.enabled ? '<p class="acct-card-note">AI is off for this environment. Turn it on above and the agents run.</p>'
    : d.mailer ? `<p class="acct-card-note">Reports mail from <b>${e(d.mailer)}</b> to the roles each agent names, and land in the Data card as rows of <code>${e(d.table)}</code> with a trace of every record read.</p>`
    : `<p class="acct-card-note">No mailer yet, so reports land in the Data card only, as rows of <code>${e(d.table)}</code>. Make a mailer under Licensing and the agents mail the roles they name.</p>`;
  return cardHtml({
    key: 'ai-agents', icon: 'activity', title: 'AI Agents', summary, explain,
    body: `
      ${note}
      ${list}
      ${form}
      ${can && !st.edit ? `<div class="ev-key-row">${agents.length < Number(d.caps?.agents || 10) ? leadBtn('agents-new', 'plus', 'New AI Agent', '', 'btn-primary') : `<span class="adm-muted">At most ${e(String(d.caps?.agents || 10))} agents.</span>`}</div>` : ''}
      <p class="acct-error" id="evAgentsError" hidden></p>
      ${st.status ? `<p class="acct-card-note" id="evAgentsStatus">${e(st.status)}</p>` : ''}`
  });
}

function formHtml(a, d, e) {
  const tables = st.tables || [];
  const roles = d.roles || ['owner', 'admin', 'member'];
  const lanes = d.lanes || ['fast', 'mid', 'pro', 'best'];
  return `
    <div class="ev-agent-form">
      <div class="ev-conn-fields">
        <label class="ev-conn-field"><span class="ev-conn-field-label">Name</span><input class="acct-input" type="text" id="evAgName" maxlength="60" value="${e(a.name || '')}" placeholder="Support watch" autocomplete="off" /></label>
        <label class="ev-conn-field"><span class="ev-conn-field-label">Table it watches</span>
          <select class="acct-input acct-select" id="evAgTable">${tables.length ? tables.map(t => `<option value="${e(t)}" ${t === a.table ? 'selected' : ''}>${e(t)}</option>`).join('') : '<option value="">No tables yet</option>'}</select></label>
        <label class="ev-conn-field"><span class="ev-conn-field-label">Schedule</span>
          <select class="acct-input acct-select" id="evAgSchedule">${[['off', 'Only when I press Run now'], ['hourly', 'Every hour, and when I press'], ['daily', 'Every day, and when I press']].map(([v, w]) => `<option value="${v}" ${(a.schedule || 'off') === v ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
        <label class="ev-conn-field"><span class="ev-conn-field-label">Model</span>
          <select class="acct-input acct-select" id="evAgLane">${lanes.map(l => `<option value="${e(l)}" ${(a.lane || 'mid') === l ? 'selected' : ''}>${e(l)}</option>`).join('')}</select></label>
      </div>
      <label class="ev-conn-field" style="margin-top:10px"><span class="ev-conn-field-label">What to look for</span><textarea class="acct-input" id="evAgInstructions" rows="3" maxlength="2000" placeholder="Flag anyone angry or waiting on a refund. Say which need a person today.">${e(a.instructions || '')}</textarea></label>
      <div class="ev-scopes" role="group" aria-label="Who gets the report by mail" style="margin-top:10px">
        <span class="ev-conn-field-label">Mail the report to</span>
        ${roles.map(r => `<label class="acct-chip" data-tip="${e(r === 'owner' ? 'The owner of this environment' : `Every ${r} on the team`)}"><input type="checkbox" data-ag-role="${e(r)}" ${(a.roles || []).includes(r) ? 'checked' : ''} />${ico('mail', 14)}<span>${e(r)}</span></label>`).join('')}
        <label class="acct-chip" data-tip="A paused agent keeps its settings and runs nothing"><input type="checkbox" id="evAgEnabled" ${a.enabled === false ? '' : 'checked'} />${ico('play', 14)}<span>Active</span></label>
      </div>
      <div class="act-row ev-key-row">
        ${leadBtn('agents-save', 'save', a.id ? 'Save' : 'Make the agent', '', 'btn-primary')}
        ${iconBtn('agents-cancel', 'x', 'Cancel', '')}
      </div>
    </div>`;
}

function readForm() {
  const roles = [...document.querySelectorAll('[data-ag-role]')].filter(c => c.checked).map(c => c.dataset.agRole);
  return {
    name: (document.getElementById('evAgName')?.value || '').trim(),
    table: document.getElementById('evAgTable')?.value || '',
    schedule: document.getElementById('evAgSchedule')?.value || 'off',
    lane: document.getElementById('evAgLane')?.value || 'mid',
    instructions: (document.getElementById('evAgInstructions')?.value || '').trim(),
    roles, enabled: !!document.getElementById('evAgEnabled')?.checked
  };
}

async function putAgents(list, btn, word) {
  D.showError('evAgentsError', '');
  if (btn && btn.disabled) return false;
  const done = btn ? busy(btn, word) : () => {};
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/ai/agents`, {}, X.lane()), { method: 'PUT', body: X.body({ agents: list }, X.lane()) });
    st.data.agents = r.agents || list; st.data.runs = r.runs || st.data.runs; st.edit = null; st.arm = '';
    paintAgents();
    return true;
  } catch (ex) {
    D.showError('evAgentsError', errText(ex, 'The agents could not be saved.'));
    return false;
  } finally { done(); }
}

async function runAgent(id, btn) {
  D.showError('evAgentsError', '');
  if (btn.disabled || st.running) return;
  st.running = id; st.status = ''; paintAgents();
  try {
    const r = await D.apiFetch(X.url(`${ENV_URL}/ai/agents/run`, {}, X.lane()), { method: 'POST', body: X.body({ id }, X.lane()) });
    const res = r.result || {};
    st.status = !res.reviewed ? 'Nothing changed since the last review.'
      : `${res.headline || 'Reviewed.'} ${countWord(Number(res.reviewed || 0), 'record', 'records')} read${res.high ? `, ${res.high} high` : ''}${res.human ? `, ${res.human} for a person` : ''}${res.mailed ? `, mailed to ${res.mailed}` : res.mailNote ? `, ${res.mailNote}` : ''}${res.own ? ` (your ${res.own} account)` : res.priceCents ? ` (${res.priceCents} cents of credit)` : ''}.`;
  } catch (ex) {
    D.showError('evAgentsError', errText(ex, 'The agent did not run.'));
  }
  st.running = '';
  await loadAgents();   // the stamp on the row is the record either way
  if (st.status) { const s = document.getElementById('evAgentsStatus'); if (!s) paintAgents(); }
}

let armTimer = null;
/** The card's presses; true when one was this card's. */
export function agentsAction(a, btn) {
  if (!a || !a.startsWith('agents-')) return false;
  const d = st.data; if (!d) return true;
  const id = btn?.dataset?.id || '';
  if (a === 'agents-new') { st.edit = { id: '', name: '', table: (st.tables || [])[0] || '', instructions: '', schedule: 'off', lane: 'mid', roles: ['owner'], enabled: true }; st.arm = ''; paintAgents(); document.getElementById('evAgName')?.focus(); return true; }
  if (a === 'agents-edit') { st.edit = { ...((d.agents || []).find(x => x.id === id) || {}) }; st.arm = ''; paintAgents(); return true; }
  if (a === 'agents-cancel') { st.edit = null; paintAgents(); return true; }
  if (a === 'agents-save') {
    const f = readForm();
    if (!f.name) { D.showError('evAgentsError', 'Give the agent a name.'); return true; }
    if (!f.table) { D.showError('evAgentsError', 'Pick the table it watches. Make a table first if there is none.'); return true; }
    if (!f.instructions) { D.showError('evAgentsError', 'Say what to look for.'); return true; }
    const cur = d.agents || [];
    const next = st.edit && st.edit.id ? cur.map(x => (x.id === st.edit.id ? { ...x, ...f } : x)) : [...cur, f];
    void putAgents(next, btn, 'Saving…');
    return true;
  }
  if (a === 'agents-remove') {
    if (st.arm !== id) { st.arm = id; paintAgents(); clearTimeout(armTimer); armTimer = setTimeout(() => { if (st.arm === id) { st.arm = ''; paintAgents(); } }, 6000); return true; }
    clearTimeout(armTimer);
    void putAgents((d.agents || []).filter(x => x.id !== id), btn, 'Removing…');
    return true;
  }
  if (a === 'agents-arm-cancel') { clearTimeout(armTimer); st.arm = ''; paintAgents(); return true; }
  if (a === 'agents-run') { void runAgent(id, btn); return true; }
  if (a === 'agents-open-report') {
    // the report row in the Data card: the note the Mail card leaves, then the Environment section with the Data card open
    try { sessionStorage.setItem('pragoptics_open_table', JSON.stringify({ table: btn.dataset.table || '', row: btn.dataset.row || '' })); } catch { /* the card still opens */ }
    try { sessionStorage.setItem('pragoptics_open_card', JSON.stringify({ section: 'environment', card: 'data', row: '' })); } catch { /* fine */ }
    location.hash = '#account?section=environment';
    return true;
  }
  return false;
}
