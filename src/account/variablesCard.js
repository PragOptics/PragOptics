// src/account/variablesCard.js
//
// THE ENVIRONMENT VARIABLES CARD (2026-11-14, Cameron: "i want to paste a key and name it ... but i want it keyvaulted";
// "they should be able to call it up by name being basically an env var"; the owner alone sees and uses one until the
// owner allows a role or a person; nothing used without the owner knowing; an owner-ticked approval on use). One list,
// one form, the same list the studio reads. Backend: functions/environmentVariables.js over auth/variables.js.
//
// The card never holds a key in its state: the Value box is read at the press and sent once.

import { PRAG_API_BASE } from '../runtime/config.js';
import { ico, cardHtml, stateLead } from './cards.js';
import { explainLink } from '../components/explainer.js';
import { nameOf, suggestedName, providerChoices, allowWords, useWords, pendingWords, migrationWords, formBody, ALLOW_ROLES } from './variablesWords.js';

const ENV_URL = `${PRAG_API_BASE}/environment`;
let D = null;   // apiFetch, escapeHtml, fmtDate, friendlyError, showError
let X = null;   // url, body, myRole, lane, connections() (the Connected accounts card's provider catalog)
let st = fresh();
function fresh() { return { data: null, note: '', noteCode: '', plan: null, planNote: '', form: { provider: '', name: '', roles: [], approval: false, host: '', header: '' }, busy: false, result: '', rowNote: null, arm: '', renaming: '' }; }

export function setVariablesContext(deps, ctx) { D = deps; X = ctx; }
export function resetVariables() { st = fresh(); }
const errText = (ex, fallback) => (ex?.sessionInvalidated ? '' : (ex?.data?.error || D.friendlyError(ex, fallback)));
const manage = () => ['owner', 'admin', 'agent'].includes(X.myRole());
const owner = () => X.myRole() === 'owner';
const post = (path, payload, method = 'POST') => D.apiFetch(X.url(path, {}, X.lane()), { method, body: X.body(payload, X.lane()) });

export async function loadVariables() {
  try {
    st.data = await D.apiFetch(X.url(`${ENV_URL}/variables`, {}, X.lane()));
    st.note = '';
  } catch (ex) {
    st.data = null;
    st.noteCode = ex?.status === 404 ? 'NOT_ON_LANE' : String(ex?.data?.code || '');
    st.note = ex?.status === 404 ? 'Environment variables are not on this lane yet.'
      : ex?.data?.code === 'UPGRADE_REQUIRED' ? ex.data.error
      : ex?.data?.code === 'VAULT_NOT_CONFIGURED' ? 'The vault is not switched on for this lane yet.'
      : errText(ex, 'Could not read the environment variables.');
  }
  if (st.data && st.data.owner) {
    try { const p = await D.apiFetch(X.url(`${ENV_URL}/variables-migration`, {}, X.lane())); st.plan = p.plan || []; st.planNote = ''; }
    catch (ex) { st.plan = null; st.planNote = errText(ex, ''); }
  } else { st.plan = null; }
  paintVariables();
}
export function paintVariables() { const h = document.getElementById('evVariables'); if (h) h.innerHTML = variablesHtml(); }

export function variablesHtml() {
  const e = D.escapeHtml, d = st.data;
  const explain = explainLink('variables', 'How environment variables work');
  if (!d) {
    // the summary says why in two words: a plan, a lane without the routes, a vault not switched on, or still loading
    const summary = !st.note ? 'loading' : st.noteCode === 'UPGRADE_REQUIRED' ? 'with a plan' : st.noteCode === 'VAULT_NOT_CONFIGURED' ? 'not switched on' : 'not on this lane';
    return cardHtml({ key: 'variables', icon: 'key', title: 'Environment variables', summary, explain,
      body: st.note ? `<p class="acct-card-note">${e(st.note)}</p>` : '<p class="acct-loading">Loading your variables…</p>' });
  }
  const vars = d.variables || [], isOwner = !!d.owner;
  const summary = vars.length ? `${vars.length} ${vars.length === 1 ? 'name' : 'names'}` : (isOwner ? 'none yet' : 'none shared with you');
  const plan = isOwner && Array.isArray(st.plan) && st.plan.length ? `
      <div class="ev-var-migrate">
        <p class="acct-card-note">${e(migrationWords(st.plan))}</p>
        <div class="ev-key-row">${stateLead('var-migrate', 'key', 'Name them', { out: st.busy, busyWord: 'Naming…' }, '', 'btn-primary')}</div>
      </div>` : '';
  const list = vars.length ? `<ul class="ev-var-list">${vars.map(v => rowHtml(v, isOwner, e)).join('')}</ul>`
    : `<p class="acct-card-note ev-note">${isOwner ? 'No variables yet. Paste a key below and it is kept in your vault under the name you give it.' : 'The owner has not shared a variable with your role yet.'}</p>`;
  return cardHtml({
    key: 'variables', icon: 'key', title: 'Environment variables', summary, explain,
    body: `
      <p class="acct-card-note ev-note">A key you paste gets a name, lives in your environment's own vault, and your assistants, modules and site calls use it by that name. Only you see and use a name until you allow a role or a person.</p>
      ${plan}
      ${list}
      ${manage() ? formHtml(e) : '<p class="acct-card-note ev-note">Admins and the owner add variables; the owner decides who may use each.</p>'}
      <p class="acct-error" id="evVarError" hidden></p>
      ${st.result ? `<p class="acct-card-note ev-note ev-conn-result" aria-live="polite">${e(st.result)}</p>` : ''}`
  });
}

function rowHtml(v, isOwner, e) {
  const where = v.provider && v.provider !== 'other' ? v.provider : (v.host || '');
  const note = st.rowNote && st.rowNote.name === v.name ? `<p class="acct-card-note ${st.rowNote.error ? 'acct-error-text' : ''}" aria-live="polite">${e(st.rowNote.text)}</p>` : '';
  const pending = isOwner ? pendingWords(v) : '';
  const arm = st.arm === v.name;
  const controls = !isOwner ? '' : `
      <div class="ev-var-controls">
        <span class="ev-var-allow" role="group" aria-label="Who may use ${e(v.name)}">${ALLOW_ROLES.map(([id, label]) => `<label class="acct-chip" data-tip="${e(label)} may use this name"><input type="checkbox" data-var-allow="${e(v.name)}" value="${e(id)}" ${(v.allow?.roles || []).includes(id) ? 'checked' : ''} />${e(label)}</label>`).join('')}</span>
        <label class="acct-chip" data-tip="A member's first use in any one place waits for your yes"><input type="checkbox" data-var-approval="${e(v.name)}" ${v.requireApproval ? 'checked' : ''} />Approval on use</label>
        ${st.renaming === v.name
          ? `<span class="ev-key-row ev-var-rename"><input class="acct-input" type="text" data-var-rename-input="${e(v.name)}" maxlength="64" value="${e(v.name)}" aria-label="New name" /><button type="button" class="btn btn-primary" data-env-action="var-rename-save" data-name="${e(v.name)}">Save</button><button type="button" class="btn" data-env-action="var-rename-cancel">Cancel</button></span>`
          : `<button type="button" class="btn" data-env-action="var-rename" data-name="${e(v.name)}">${ico('edit', 12)} Rename</button>`}
        ${arm
          ? `<span class="ev-key-row ev-var-del"><input class="acct-input ev-del-in" type="text" data-var-delete-input="${e(v.name)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type DELETE" aria-label="Type DELETE to remove ${e(v.name)}" /><button type="button" class="btn btn-danger" data-env-action="var-remove-go" data-name="${e(v.name)}">Remove</button><button type="button" class="btn" data-env-action="var-remove-cancel">Cancel</button></span>`
          : `<button type="button" class="btn" data-env-action="var-remove" data-name="${e(v.name)}">${ico('trash', 12)} Remove</button>`}
      </div>`;
  return `<li class="ev-var-row" data-var="${e(v.name)}">
      <div class="ev-var-head"><code class="ev-code">${e(v.name)}</code><span class="ev-var-meta">${e(where)}${v.hint ? ` · …${e(v.hint)}` : ''}${v.requireApproval ? ' · approval on use' : ''}</span></div>
      <p class="acct-card-note">${e(allowWords(v.allow))}. ${e(useWords(v, D.fmtDate))}${pending ? ` ${e(pending)}` : ''}</p>
      ${controls}${note}
    </li>`;
}

function formHtml(e) {
  const choices = providerChoices(X.connections() || []);
  const f = st.form;
  const picked = choices.find(c => c.id === f.provider) || null;
  const extra = picked && picked.id !== 'other' ? picked.fields.map(fl => `<input class="acct-input" type="text" data-var-extra="${e(fl.key)}" placeholder="${e(fl.label || fl.key)}" autocomplete="off" spellcheck="false" aria-label="${e(fl.label || fl.key)}" />`).join('') : '';
  const other = picked && picked.id === 'other' ? `
        <input class="acct-input" type="text" id="evVarHost" placeholder="Where it may be sent, e.g. api.example.com" autocomplete="off" spellcheck="false" value="${e(f.host)}" aria-label="Where it may be sent" />
        <input class="acct-input" type="text" id="evVarHeader" placeholder="Header it travels in (Authorization if empty)" autocomplete="off" spellcheck="false" value="${e(f.header)}" aria-label="The header it travels in" />` : '';
  const preview = nameOf(f.name);
  const receives = picked && picked.receivesData && !owner() ? `<p class="acct-card-note ev-note">${e(picked.label)} receives your business's data, so only the owner connects it.</p>` : '';
  return `
      <div class="ev-var-add">
        <div class="ev-key-row">
          <select class="acct-input acct-select" id="evVarProvider" aria-label="Which service the key is for">
            <option value="">Add a key for…</option>
            ${choices.map(c => `<option value="${e(c.id)}" ${f.provider === c.id ? 'selected' : ''}>${e(c.label)}</option>`).join('')}
          </select>
        </div>
        ${picked ? `
        <div class="ev-key-row">
          <input class="acct-input" type="text" id="evVarName" maxlength="64" placeholder="Name, e.g. ${e(suggestedName(picked.id) || 'WEATHER_API_KEY')}" autocomplete="off" spellcheck="false" value="${e(f.name)}" aria-label="The variable's name" />
          <input class="acct-input" type="password" id="evVarValue" placeholder="${e(picked.secret ? (picked.secret.hint || picked.secret.label || 'The key') : 'The key')}" autocomplete="new-password" spellcheck="false" aria-label="The key" />
        </div>
        ${extra ? `<div class="ev-key-row">${extra}</div>` : ''}
        ${other ? `<div class="ev-key-row">${other}</div>` : ''}
        <div class="ev-key-row ev-var-opts">
          <span class="ev-var-allow" role="group" aria-label="Who may use it">${ALLOW_ROLES.map(([id, label]) => `<label class="acct-chip" data-tip="${e(label)} may use this name"><input type="checkbox" data-var-form-role="${e(id)}" ${f.roles.includes(id) ? 'checked' : ''} />${e(label)}</label>`).join('')}</span>
          <label class="acct-chip" data-tip="A member's first use in any one place waits for your yes"><input type="checkbox" id="evVarApproval" ${f.approval ? 'checked' : ''} />Require approval on use</label>
        </div>
        ${receives}
        <div class="ev-key-row">
          ${stateLead('var-save', 'key', 'Save to your vault', { out: st.busy, busyWord: picked.id === 'other' ? 'Saving…' : `Checking with ${picked.label}…` }, '', 'btn-primary')}
          <span class="acct-card-note">${preview ? `Saved as <code class="ev-code">${e(preview)}</code>. ${f.roles.length ? '' : 'Only you until you allow a role.'}` : 'A name is letters, digits and underscores, like GEMINI_API_KEY.'}</span>
        </div>` : ''}
      </div>`;
}

/** The one save: the form read once, the key sent once, never kept. */
async function saveVariable() {
  if (st.busy) return;
  D.showError('evVarError', '');
  const picked = providerChoices(X.connections() || []).find(c => c.id === st.form.provider);
  if (!picked) { D.showError('evVarError', 'Pick the service the key is for.'); return; }
  const extra = {}; for (const fl of picked.fields) extra[fl.key] = document.querySelector(`[data-var-extra="${fl.key}"]`)?.value || '';
  const checked = formBody({
    name: document.getElementById('evVarName')?.value || '', value: document.getElementById('evVarValue')?.value || '', provider: picked.id,
    host: document.getElementById('evVarHost')?.value || '', header: document.getElementById('evVarHeader')?.value || '', extra: picked.id === 'other' ? null : extra,
    allowRoles: [...document.querySelectorAll('[data-var-form-role]:checked')].map(i => i.dataset.varFormRole), requireApproval: !!document.getElementById('evVarApproval')?.checked
  });
  if (!checked.ok) { D.showError('evVarError', checked.error); const el = checked.field === 'name' ? document.getElementById('evVarName') : checked.field === 'value' ? document.getElementById('evVarValue') : checked.field === 'host' ? document.getElementById('evVarHost') : document.querySelector(`[data-var-extra="${checked.field}"]`); el?.focus(); return; }
  st.form.name = checked.body.name; st.form.host = checked.body.host || ''; st.form.header = checked.body.header || ''; st.form.roles = checked.body.allow.roles; st.form.approval = checked.body.requireApproval;
  st.busy = true; st.result = ''; paintVariables();
  try {
    const d = await post(`${ENV_URL}/variables`, checked.body);
    st.result = d.note || `Moved to your vault as ${d.variable?.name || checked.body.name}.`;
    st.form = { provider: '', name: '', roles: [], approval: false, host: '', header: '' };
    st.busy = false;
    await loadVariables();
  } catch (ex) {
    st.busy = false; paintVariables();
    D.showError('evVarError', errText(ex, 'Could not save the variable.'));
    if (ex?.data?.field) document.querySelector(`[data-var-extra="${ex.data.field}"]`)?.focus();
  }
}
function rowNote(name, text, error = false) { st.rowNote = text ? { name, text, error } : null; }
async function patchVariable(name, payload, done) {
  D.showError('evVarError', '');
  try { const d = await post(`${ENV_URL}/variables/${encodeURIComponent(name)}`, payload, 'PATCH'); rowNote(d.variable?.name || name, done(d.variable)); await loadVariables(); }
  catch (ex) { rowNote(name, errText(ex, 'Could not change that variable.'), true); paintVariables(); }
}

/** The card's own presses; true when handled. */
export function variablesAction(a, btn) {
  if (!a || !String(a).startsWith('var-')) return false;
  const name = btn?.dataset?.name || '';
  if (a === 'var-save') { void saveVariable(); return true; }
  if (a === 'var-migrate') { void (async () => { if (st.busy) return; st.busy = true; paintVariables(); try { const d = await post(`${ENV_URL}/variables-migration`, {}); st.result = d.note || 'Named.'; } catch (ex) { D.showError('evVarError', errText(ex, 'Could not name the existing keys.')); } st.busy = false; await loadVariables(); })(); return true; }
  if (a === 'var-rename') { st.renaming = name; st.arm = ''; paintVariables(); document.querySelector(`[data-var-rename-input="${CSS.escape(name)}"]`)?.focus(); return true; }
  if (a === 'var-rename-cancel') { st.renaming = ''; paintVariables(); return true; }
  if (a === 'var-rename-save') { const to = nameOf(document.querySelector(`[data-var-rename-input="${CSS.escape(name)}"]`)?.value || ''); if (!to) { rowNote(name, 'A name is letters, digits and underscores, starting with a letter.', true); paintVariables(); return true; } st.renaming = ''; void patchVariable(name, { rename: to }, v => `Renamed to ${v?.name || to}. Anything that named ${name} now has to name ${v?.name || to}.`); return true; }
  if (a === 'var-remove') { st.arm = name; st.renaming = ''; paintVariables(); document.querySelector(`[data-var-delete-input="${CSS.escape(name)}"]`)?.focus(); return true; }
  if (a === 'var-remove-cancel') { st.arm = ''; paintVariables(); return true; }
  if (a === 'var-remove-go') {
    const typed = (document.querySelector(`[data-var-delete-input="${CSS.escape(name)}"]`)?.value || '').trim();
    if (typed !== 'DELETE') { rowNote(name, 'Type DELETE to remove this name and the key beneath it.', true); paintVariables(); return true; }
    void (async () => { D.showError('evVarError', ''); try { await post(`${ENV_URL}/variables/${encodeURIComponent(name)}`, {}, 'DELETE'); st.arm = ''; st.result = `${name} is removed; the key beneath it left the vault.`; await loadVariables(); } catch (ex) { rowNote(name, errText(ex, 'Could not remove that variable.'), true); paintVariables(); } })();
    return true;
  }
  return false;
}

/** The card's own changes (the provider pick, the name preview, the owner's switches on a row); true when handled. */
export function variablesChange(e) {
  const t = e.target;
  if (!t) return false;
  if (t.id === 'evVarProvider') { st.form.provider = t.value; if (!st.form.name) st.form.name = suggestedName(t.value); paintVariables(); document.getElementById('evVarName')?.focus(); return true; }
  if (t.id === 'evVarName') { st.form.name = t.value; const s = t.closest('.ev-var-add')?.querySelector('.ev-key-row:last-child .acct-card-note'); if (s) { const p = nameOf(t.value); s.innerHTML = p ? `Saved as <code class="ev-code">${D.escapeHtml(p)}</code>. ${st.form.roles.length ? '' : 'Only you until you allow a role.'}` : 'A name is letters, digits and underscores, like GEMINI_API_KEY.'; } return true; }
  if (t.matches?.('[data-var-form-role]')) { st.form.roles = [...document.querySelectorAll('[data-var-form-role]:checked')].map(i => i.dataset.varFormRole); return true; }
  if (t.id === 'evVarApproval') { st.form.approval = !!t.checked; return true; }
  if (t.id === 'evVarHost') { st.form.host = t.value; return true; }
  if (t.id === 'evVarHeader') { st.form.header = t.value; return true; }
  if (t.matches?.('[data-var-allow]')) { const name = t.dataset.varAllow; const roles = [...document.querySelectorAll(`[data-var-allow="${CSS.escape(name)}"]:checked`)].map(i => i.value); void patchVariable(name, { allow: { roles, users: [] } }, v => `${allowWords(v?.allow)} may use ${name}.`); return true; }
  if (t.matches?.('[data-var-approval]')) { const name = t.dataset.varApproval; void patchVariable(name, { requireApproval: !!t.checked }, v => v?.requireApproval ? `A member's first use of ${name} in any one place now waits for your approval.` : `${name} no longer waits for your approval.`); return true; }
  return false;
}
